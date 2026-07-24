import React, { useState, useRef } from 'react';
import { PatientRecord, InsurancePolicyDetails, EntryPath, WizardDocument } from '../PreAuthWizard/types';
import { INSURER_LIST, INDIAN_STATES, TPA_NAMES } from '../../config/tpaRegistry';
import { calculateAge, isPolicyActive, isPolicyExpiringSoon, todayISO } from '../../utils/formatters';
import { extractFromDocument, ExtractedPatientData } from '../../services/documentExtractionService';
import { classifyDocument, CLASSIFICATION_CONFIDENCE_THRESHOLD } from '../../services/documentClassificationService';
import { searchPatients } from '../../services/masterPatientRecord';
import { splitPdfIntoPages, getPdfPageCount, renderPdfPageThumbnails, SplitPage } from '../../utils/pdfSplitter';
import { classifyGeminiError, geminiErrorUserMessage, GeminiErrorKind } from '../../utils/geminiErrorClassifier';

interface PatientInsuranceStepProps {
    patient: Partial<PatientRecord>;
    insurance: Partial<InsurancePolicyDetails>;
    clinical?: Partial<ClinicalDetails>;
    onPatientChange: (p: Partial<PatientRecord>) => void;
    onInsuranceChange: (ins: Partial<InsurancePolicyDetails>) => void;
    onClinicalChange?: (c: Partial<ClinicalDetails>) => void;
    onNext: () => void;
    uploadedDocuments?: WizardDocument[];
    onDocumentsChange?: (docs: WizardDocument[]) => void;
    onExtractionComplete?: (
        patient: Partial<PatientRecord>,
        insurance: Partial<InsurancePolicyDetails>,
        docs: WizardDocument[],
        clinical?: Partial<ClinicalDetails>
    ) => void;
    onExtractingChange?: (isExtracting: boolean) => void;
    onOcrDoneChange?: (isDone: boolean) => void;
}

export const PatientInsuranceStep: React.FC<PatientInsuranceStepProps> = ({
    patient, insurance, clinical = {}, onPatientChange, onInsuranceChange, onClinicalChange, onNext, uploadedDocuments = [], onDocumentsChange,
    onExtractionComplete, onExtractingChange, onOcrDoneChange
}) => {
    const [entryPath, setEntryPath] = useState<EntryPath | null>(insurance.policyNumber ? 'manual' : null);
    const [isExtractingState, setIsExtractingState] = useState(false);
    const setIsExtracting = (loading: boolean) => {
        setIsExtractingState(loading);
        if (onExtractingChange) onExtractingChange(loading);
    };
    const [ocrDone, setOcrDone] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const toggleListening = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition is not supported in this browser. Please use Chrome.");
            return;
        }

        if (isListening) {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
            setIsListening(false);
            return;
        }

        try {
            const rec = new SpeechRecognition();
            rec.lang = 'en-IN';
            rec.continuous = true;
            rec.interimResults = true;

            let initialNote = clinical.additionalClinicalNotes || '';
            if (initialNote && !initialNote.endsWith(' ')) {
                initialNote += ' ';
            }

            rec.onresult = (e: any) => {
                let transcriptText = '';
                for (let i = e.resultIndex; i < e.results.length; i++) {
                    if (e.results[i].isFinal) {
                        transcriptText += e.results[i][0].transcript + ' ';
                    }
                }
                if (transcriptText) {
                    const updated = initialNote + transcriptText;
                    if (onClinicalChange) {
                        onClinicalChange({ ...clinical, additionalClinicalNotes: updated });
                    }
                }
            };

            rec.onerror = (err: any) => {
                console.warn('[InlineMic] Speech error:', err);
                if (err.error !== 'no-speech' && err.error !== 'aborted') {
                    setIsListening(false);
                }
            };

            rec.onend = () => {
                setIsListening(false);
                recognitionRef.current = null;
            };

            rec.start();
            recognitionRef.current = rec;
            setIsListening(true);
        } catch (err) {
            console.error('[InlineMic] Failed to start recognition:', err);
            setIsListening(false);
        }
    };
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PatientRecord[]>([]);
    const [searching, setSearching] = useState(false);
    const [policyDateWarning, setPolicyDateWarning] = useState('');
    const [extractionException, setExtractionException] = useState('');
    const [extractionResult, setExtractionResult] = useState<{ filled: string[], pending: string[] } | null>(null);
    const [lastExtractedData, setLastExtractedData] = useState<ExtractedPatientData | null>(null);
    const [pageClassifications, setPageClassifications] = useState<any[] | null>(null);

    const [extractionStage, setExtractionStage] = useState('');
    const [ocrLogs, setOcrLogs] = useState<string[]>([]);
    const [pagesCount, setPagesCount] = useState<number | null>(null);
    const [splitPages, setSplitPages] = useState<SplitPage[]>([]);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [pageStates, setPageStates] = useState<Record<number, { thumbnail: string | null; status: 'Queued' | 'Rendering' | 'OCR Processing' | 'Completed' | 'Failed' }>>({});
    // Distinct from extractionException: keeps the progress panel (thumbnails, page
    // count, terminal log) visible on failure instead of it vanishing back to a plain
    // dropzone — reuses the same Gemini-error classification Screen 3 uses.
    const [extractionFailedKind, setExtractionFailedKind] = useState<GeminiErrorKind | null>(null);
    const [previewPage, setPreviewPage] = useState<{ index: number; thumbnail: string } | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.trim().length > 1) {
            setSearching(true);
            try {
                const results = await searchPatients(query);
                setSearchResults(results);
            } catch (err) {
                console.error("Error searching patients:", err);
            } finally {
                setSearching(false);
            }
        } else {
            setSearchResults([]);
        }
    };

    const handleSelectPatient = (p: PatientRecord) => {
        const updatedPatient = {
            ...patient,
            patientName: p.patientName,
            dateOfBirth: p.dateOfBirth,
            age: p.age,
            gender: p.gender,
            maritalStatus: p.maritalStatus,
            mobileNumber: p.mobileNumber,
            email: p.email,
            city: p.city,
            state: p.state,
            uhid: p.uhid
        };
        const updatedInsurance = p.lastKnownPolicyNumber
            ? {
                ...insurance,
                policyNumber: p.lastKnownPolicyNumber,
                insurerName: p.lastKnownInsurer || '',
                tpaName: (p.lastKnownTPA as any) || ''
            }
            : insurance;

        if (onExtractionComplete) {
            onExtractionComplete(updatedPatient, updatedInsurance, uploadedDocuments);
        } else {
            onPatientChange(updatedPatient);
            if (p.lastKnownPolicyNumber) onInsuranceChange(updatedInsurance);
        }
        setEntryPath('manual');
    };

    const escapeHtml = (v: any): string => {
        if (v === null || v === undefined || v === '') return '—';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const downloadClaimSummary = () => {
        const d = lastExtractedData;
        const readiness = d?.extraction_readiness_score ?? null;
        const missing = d?.missing_fields ?? [];
        const excerpts = d?.clinical_excerpts ?? [];

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Claim Summary</title>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; padding: 32px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  td.label { color: #666; width: 40%; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; }
  .disclaimer { font-size: 11px; color: #888; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; }
  ul { font-size: 13px; }
</style></head>
<body>
  <h1>Claim Summary <span style="font-weight:normal;font-size:12px;color:#888;">(not an official TPA form)</span></h1>
  <p style="font-size:11px;color:#888;">Generated ${new Date().toLocaleString()}</p>

  <h2>Patient Information</h2>
  <table>
    <tr><td class="label">Name</td><td>${escapeHtml(patient.patientName)}</td></tr>
    <tr><td class="label">Age / DOB</td><td>${escapeHtml(patient.age)} ${patient.dateOfBirth ? `/ ${escapeHtml(patient.dateOfBirth)}` : ''}</td></tr>
    <tr><td class="label">Gender</td><td>${escapeHtml(patient.gender)}</td></tr>
    <tr><td class="label">Contact Number</td><td>${escapeHtml(patient.mobileNumber)}</td></tr>
  </table>

  <h2>Insurance Information</h2>
  <table>
    <tr><td class="label">Insurer</td><td>${escapeHtml(insurance.insurerName)}</td></tr>
    <tr><td class="label">TPA</td><td>${escapeHtml(insurance.tpaName)}</td></tr>
    <tr><td class="label">Policy Number</td><td>${escapeHtml(insurance.policyNumber)}</td></tr>
    <tr><td class="label">Sum Insured</td><td>${escapeHtml(insurance.sumInsured)}</td></tr>
  </table>

  ${excerpts.length > 0 ? `
  <h2>Clinical Excerpts</h2>
  <ul>${excerpts.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
  ` : ''}

  <h2>Extraction Quality</h2>
  <table>
    <tr><td class="label">Extraction Readiness Score</td><td>${readiness !== null ? `${readiness} / 100` : '—'}</td></tr>
  </table>
  ${missing.length > 0 ? `
  <p style="font-size:12px;color:#a00;margin-top:8px;"><strong>Fields needing manual review:</strong> ${missing.map(escapeHtml).join(', ')}</p>
  ` : ''}

  ${(() => {
    const docsList = uploadedDocuments || [];
    if (docsList.length === 0) return '';
    let appendix = `
    <div style="page-break-before: always; margin-top: 30px;">
      <h2 style="border-bottom: 2px solid #333; padding-bottom: 8px; font-size: 16px;">Document OCR Appendix</h2>
    `;
    docsList.forEach(doc => {
      appendix += `
      <h3 style="font-size: 13px; margin-top: 20px; color: #1a365d; border-bottom: 1px dashed #cbd5e0; padding-bottom: 4px;">File: ${escapeHtml(doc.fileName)} (${doc.pageCount} page(s))</h3>
      `;
      doc.pages?.forEach(page => {
        const textEscaped = page.ocrText 
          ? escapeHtml(page.ocrText).replace(/\n/g, '<br/>')
          : '<span style="color: #a0aec0; font-style: italic;">No text extracted or bypassed</span>';
        appendix += `
        <div style="margin-top: 12px; background: #f7fafc; border: 1px solid #edf2f7; padding: 12px; border-radius: 6px;">
          <strong style="font-size: 11px; color: #4a5568; display: block; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">Page ${page.index}</strong>
          <div style="font-size: 11px; font-family: monospace; white-space: pre-wrap; color: #2d3748; line-height: 1.5;">${textEscaped}</div>
        </div>
        `;
      });
    });
    appendix += `</div>`;
    return appendix;
  })()}

  <div class="disclaimer">
    This is a Claim Summary generated by Aivana for internal review purposes only.
    It is not an official TPA submission form and should not be submitted as one.
  </div>
</body></html>`;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
            printWindow.print();
        };
    };

    const handleDOBChange = (dob: string) => {
        onPatientChange({ ...patient, dateOfBirth: dob, age: calculateAge(dob) });
    };

    const handlePolicyEndDate = (date: string) => {
        onInsuranceChange({ ...insurance, policyEndDate: date });
        if (!isPolicyActive(date)) {
            setPolicyDateWarning('This policy has expired. TPA will reject this pre-auth.');
        } else if (isPolicyExpiringSoon(date)) {
            setPolicyDateWarning('Policy is expiring within 7 days. Verify renewal status.');
        } else {
            setPolicyDateWarning('');
        }
    };

    const handleDocumentUpload = async (file: File) => {
        setIsExtracting(true);
        setExtractionException('');
        setExtractionFailedKind(null);
        setExtractionResult(null);
        setPageClassifications(null);
        setOcrLogs([]);
        setThumbnails([]);
        setSplitPages([]);
        setPagesCount(null);
        setPageStates({});

        const log = (msg: string) => {
            setOcrLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
        };

        log(`Uploaded File: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
        log("Initializing local PDF/Image reader...");
        setExtractionStage('reading');

        try {
            let pages: SplitPage[] = [];
            const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
            if (isPdf) {
                log("Pre-flight: Detecting page count...");
                const truePageCount = await getPdfPageCount(file);
                setPagesCount(truePageCount);

                log("Pre-flight: Splitting PDF into pages...");
                const splitResult = await splitPdfIntoPages(file);
                pages = splitResult;
                setSplitPages(splitResult);

                // Initialize pageStates map to 'Queued'
                const initialStates: Record<number, { thumbnail: string | null; status: 'Queued' | 'Rendering' | 'OCR Processing' | 'Completed' | 'Failed' }> = {};
                for (let i = 1; i <= truePageCount; i++) {
                    initialStates[i] = { thumbnail: null, status: 'Queued' };
                }
                setPageStates(initialStates);

                // Start rendering page thumbnails progressively in the background (asynchronous)
                renderPdfPageThumbnails(
                    file,
                    truePageCount,
                    200,
                    // onPageStart callback:
                    (pageIdx) => {
                        setPageStates(prev => ({
                            ...prev,
                            [pageIdx]: { ...prev[pageIdx], status: 'Rendering' }
                        }));
                    },
                    // onPageRendered callback:
                    (pageIdx, dataUrl) => {
                        setPageStates(prev => ({
                            ...prev,
                            [pageIdx]: {
                                thumbnail: dataUrl || '',
                                status: dataUrl ? 'OCR Processing' : 'Failed'
                            }
                        }));
                    }
                ).catch(err => {
                    console.error("Progressive rendering error:", err);
                });
            } else {
                log("Pre-flight: Reading image file as a single page...");
                const fileToBase64 = async (f: File): Promise<string> => {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(f);
                        reader.onload = () => {
                            const base64String = reader.result as string;
                            resolve(base64String.split(',')[1]);
                        };
                        reader.onerror = error => reject(error);
                    });
                };
                const base64 = await fileToBase64(file);
                pages = [{ index: 1, base64Data: base64, fileName: file.name }];
                setPagesCount(1);
                setSplitPages(pages);

                const objectUrl = URL.createObjectURL(file);
                setPageStates({
                    1: { thumbnail: objectUrl, status: 'OCR Processing' }
                });
            }

            setSplitPages(pages);
            log(`Pre-flight Complete: Pages detected: ${pages.length}`);

            // Real stage progress from the actual pipeline (documentExtractionService),
            // the same onProgress hook Screen 3 uses — not a simulated timer.
            const extracted = await extractFromDocument(file, pages, (stage, detail, pageIndex, pageStatus) => {
                setExtractionStage(stage);
                if (detail) {
                    log(detail);
                } else {
                    log(
                        stage === 'ocr' ? 'OCR Running — extracting text from each page...' :
                        stage === 'classifying' ? 'Classifying document type...' :
                        'Extracting patient & insurance information...'
                    );
                }
                if (pageIndex && pageStatus) {
                    setPageStates(prev => ({
                        ...prev,
                        [pageIndex]: {
                            ...prev[pageIndex],
                            status: pageStatus
                        }
                    }));
                }
            });

            log(`Google Vision & Gemini extraction completed.`);
            log(`Document Classified as: "${extracted.document_type.toUpperCase().replace('_', ' ')}"`);
            log(`Confidence: ${Math.round((extracted.confidence > 1 ? extracted.confidence / 100 : extracted.confidence) * 100)}%`);

            const normalizedConf = extracted.confidence > 1 ? extracted.confidence / 100 : extracted.confidence;
            
            // Only block if truly unreadable: very low confidence AND no useful data at all.
            const hasAnyUsefulData = extracted.patient?.name || extracted.patient?.age ||
                extracted.insurance?.policy_number || extracted.clinical_excerpts?.length;
            if (!hasAnyUsefulData && normalizedConf < 0.2) {
                 setExtractionException("Could not read document clearly or invalid type. Please enter details manually.");
                 setIsExtracting(false);
                 return;
            }

            if (normalizedConf < 0.7) {
                 setExtractionException(`AI extraction confidence is ${Math.round(normalizedConf * 100)}%. Extracted fields have been filled below for your verification. Please check for accuracy.`);
            }
            
            const dob = extracted.patient?.dob || patient.dateOfBirth;
            // Map according to requested mapping
            const updatedPatient = {
                ...patient,
                patientName: extracted.patient?.name || patient.patientName,
                dateOfBirth: dob,
                age: extracted.patient?.age || (dob ? calculateAge(dob) : patient.age),
                ageUnit: extracted.patient?.ageUnit || 'years',
                gender: (extracted.patient?.gender as any) || patient.gender,
                mobileNumber: extracted.patient?.phone || patient.mobileNumber,
                city: patient.city,
                state: patient.state
            };

            const endDate = extracted.insurance?.valid_till || insurance.policyEndDate;
            const updatedInsurance = {
                ...insurance,
                insurerName: extracted.insurance?.insurance_company || insurance.insurerName,
                tpaName: extracted.insurance?.tpa_name || insurance.tpaName,
                policyNumber: extracted.insurance?.policy_number || insurance.policyNumber,
                sumInsured: extracted.insurance?.sum_insured || insurance.sumInsured,
                policyEndDate: endDate,
                dataSource: 'ocr',
                ocrConfidence: Math.round(normalizedConf * 100)
            };
            if (endDate) handlePolicyEndDate(endDate);

            // Add the document to PreAuthRecord's uploadedDocuments
            const documentId = Math.random().toString(36).substring(7);
            const docPages = pages.map(p => ({
                index: p.index,
                base64Data: p.base64Data,
                ocrText: (extracted as any).ocrPages?.[p.index] || ''
            }));
            const newDoc: WizardDocument = {
                id: documentId,
                fileName: file.name,
                fileSizeDisplay: (file.size / 1024).toFixed(1) + ' KB',
                fileType: file.type.includes('pdf') ? 'pdf' : 'image',
                mimeType: file.type,
                uploadedAt: new Date().toISOString(),
                base64Data: pages[0]?.base64Data || '',
                documentCategory: extracted.document_type as any || 'other',
                autoClassified: true,
                isRequired: false,
                pageCount: pages.length,
                pages: docPages
            };
            const updatedDocuments = [...uploadedDocuments, newDoc];

            // Strategy B: Merge pre-existing user clinical note with OCR-extracted clinical excerpts
            const userNote = (clinical.additionalClinicalNotes || '').trim();
            const ocrNote = (extracted.clinical_excerpts || []).join('\n').trim();
            let mergedNotes = userNote;
            if (ocrNote) {
                if (userNote) {
                    if (!userNote.includes('[Extracted from Uploaded Document]')) {
                        mergedNotes = `${userNote}\n\n---\n[Extracted from Uploaded Document]\n${ocrNote}`;
                    }
                } else {
                    mergedNotes = ocrNote;
                }
            }
            const updatedClinical: Partial<ClinicalDetails> = {
                ...clinical,
                additionalClinicalNotes: mergedNotes
            };

            // Single bundled update — see onExtractionComplete's doc comment for why this
            // replaced three separate onPatientChange/onInsuranceChange/onDocumentsChange calls.
            if (onExtractionComplete) {
                onExtractionComplete(updatedPatient, updatedInsurance, updatedDocuments, updatedClinical);
            } else {
                onPatientChange(updatedPatient);
                onInsuranceChange(updatedInsurance);
                if (onClinicalChange) onClinicalChange(updatedClinical);
                if (onDocumentsChange) onDocumentsChange(updatedDocuments);
            }

            setExtractionResult({
                filled: extracted.extracted_fields,
                pending: extracted.missing_fields
            });
            setLastExtractedData(extracted);
            setPageClassifications(extracted.page_classifications || null);

            // Mark all non-failed pages as Completed
            setPageStates(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(k => {
                    const idx = Number(k);
                    if (next[idx].status === 'OCR Processing' || next[idx].status === 'Rendering' || next[idx].status === 'Queued') {
                        next[idx].status = 'Completed';
                    }
                });
                return next;
            });

            setOcrDone(true);
            if (onOcrDoneChange) onOcrDoneChange(true);
            setEntryPath('manual');
        } catch (error: any) {
            // Mark all non-completed pages as Failed
            setPageStates(prev => {
                const next = { ...prev };
                Object.keys(next).forEach(k => {
                    const idx = Number(k);
                    if (next[idx].status === 'OCR Processing' || next[idx].status === 'Rendering' || next[idx].status === 'Queued') {
                        next[idx].status = 'Failed';
                    }
                });
                return next;
            });
            const kind: GeminiErrorKind = error?.geminiErrorKind || classifyGeminiError(error);
            log(`AI Extraction Failed: ${error?.message || 'Unknown error'}`);
            setExtractionFailedKind(kind);
            setExtractionException(
                kind === 'unknown'
                    ? (error.message || "Failed to parse document. Please try a clearer image.")
                    : geminiErrorUserMessage(kind)
            );
        } finally {
             setIsExtracting(false);
        }
    };

    const handleResetEntryPath = () => {
        setEntryPath(null);
        setOcrDone(false);
        if (onOcrDoneChange) onOcrDoneChange(false);
    };

    const isValid = !!(
        patient.patientName && patient.age && patient.gender && patient.mobileNumber && patient.city && patient.state &&
        (insurance.insurerName || insurance.tpaName) && insurance.policyNumber && insurance.sumInsured
    );

    if (!entryPath) {
        return (
            <div className="space-y-6 text-opd-text-primary bg-white p-6 rounded-2xl border border-opd-border shadow-sm">
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => e.target.files?.[0] && handleDocumentUpload(e.target.files[0])} />

                {/* ── Section A: Clinical Note (Top) ──────────────────────── */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-bold font-lora text-opd-primary">Clinical Note</label>
                        <span className="text-[11px] text-opd-text-secondary">Type or paste clinical notes, or use the microphone to dictate.</span>
                    </div>
                    <div className="relative w-full">
                        <textarea
                            value={clinical.additionalClinicalNotes || ''}
                            onChange={e => onClinicalChange && onClinicalChange({ ...clinical, additionalClinicalNotes: e.target.value })}
                            placeholder="Add the patient's clinical notes, presenting complaints, history, diagnosis, investigations, treatment plan, etc."
                            rows={8}
                            className="w-full form-input pr-12 text-xs font-mono leading-relaxed resize-y overflow-y-auto"
                        />
                        <button
                            type="button"
                            onClick={toggleListening}
                            title={isListening ? "Stop voice dictation" : "Dictate clinical notes with microphone"}
                            className={`absolute right-3 bottom-3 p-2 rounded-full border transition-all duration-150 flex items-center justify-center ${
                                isListening
                                    ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse shadow-sm'
                                    : 'bg-opd-input-bg border-opd-border text-opd-text-secondary hover:text-opd-primary hover:border-opd-primary/30'
                            }`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                            </svg>
                        </button>
                    </div>
                    {isListening && (
                        <div className="text-[10px] text-rose-600 font-bold flex items-center gap-1.5 font-mono">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                            Listening... Speak patient clinical details clearly
                        </div>
                    )}
                </div>

                <hr className="border-opd-border" />

                {/* ── Section B: Patient & Insurance Details ─────────────── */}
                <div>
                    <h2 className="text-sm font-bold font-lora text-opd-primary">Patient & Insurance Details</h2>
                    <p className="text-opd-text-secondary text-xs mt-0.5">How would you like to add patient & insurance information?</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        {
                            path: 'scan_card' as EntryPath,
                            icon: (
                                <div className="w-12 h-12 rounded-xl bg-primary-tint flex items-center justify-center text-opd-primary border border-opd-primary/10 group-hover:bg-primary-tint/80 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                </div>
                            ),
                            title: 'Extract from PDF / Card',
                            desc: 'Upload hospital registration PDF or Insurance Card to auto-extract details',
                            badge: 'Recommended'
                        },
                        {
                            path: 'manual' as EntryPath,
                            icon: (
                                <div className="w-12 h-12 rounded-xl bg-primary-tint flex items-center justify-center text-opd-primary border border-opd-primary/10 group-hover:bg-primary-tint/80 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 11-2.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                </div>
                            ),
                            title: 'Enter Manually',
                            desc: 'Type patient & policy details by hand',
                            badge: ''
                        },
                        {
                            path: 'search_existing' as EntryPath,
                            icon: (
                                <div className="w-12 h-12 rounded-xl bg-primary-tint flex items-center justify-center text-opd-primary border border-opd-primary/10 group-hover:bg-primary-tint/80 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632zM21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                </div>
                            ),
                            title: 'Search Patient',
                            desc: 'Reuse previously created patient from Aivana database',
                            badge: ''
                        },
                    ].map(opt => (
                        <button key={opt.path} onClick={() => setEntryPath(opt.path)}
                            className="flex flex-col items-center gap-4 p-6 bg-opd-input-bg hover:bg-primary-tint/10 border border-opd-border hover:border-opd-primary rounded-2xl text-center transition-all duration-200 group hover:scale-[1.02] shadow-sm">
                            {opt.icon}
                            <div className="space-y-1">
                                <div className="font-bold text-sm text-opd-text-primary font-lora">{opt.title}</div>
                                <div className="text-[11px] text-opd-text-secondary leading-normal">{opt.desc}</div>
                                {opt.badge && <div className="mt-2 inline-block text-[10px] bg-primary-tint text-opd-primary px-2 py-0.5 rounded-full border border-opd-primary/10 font-bold">{opt.badge}</div>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (entryPath === 'search_existing') {
        return (
            <div className="space-y-6 text-opd-text-primary bg-white p-6 rounded-2xl border border-opd-border shadow-sm">
                <button onClick={handleResetEntryPath} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5" type="button">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    Back
                </button>
                <div>
                    <h2 className="text-lg font-bold font-lora text-opd-primary">Search Patient Registry</h2>
                    <p className="text-opd-text-secondary text-sm mt-1">Search patient by name, mobile, or UHID identifier</p>
                </div>
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                            className="form-input pl-10"
                            placeholder="Enter Name, Mobile, UHID..."
                            autoFocus
                        />
                        <div className="absolute left-3 top-3.5 text-opd-text-muted">
                            {searching ? (
                                <div className="w-4 h-4 border-2 border-opd-primary border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            )}
                        </div>
                    </div>

                    {searchResults.length > 0 ? (
                        <div className="bg-white border border-opd-border rounded-xl divide-y divide-opd-border overflow-hidden shadow-sm">
                            {searchResults.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => handleSelectPatient(p)}
                                    className="p-4 hover:bg-opd-bg/20 cursor-pointer flex justify-between items-start transition-colors"
                                >
                                    <div>
                                        <div className="font-bold text-sm text-opd-text-primary font-lora">{p.patientName}</div>
                                        <div className="text-xs text-opd-text-secondary mt-1 flex gap-3 font-mono">
                                            <span>UHID: {p.uhid || 'N/A'}</span>
                                            <span>Phone: {p.mobileNumber}</span>
                                            <span>{p.gender}, {p.age}{p.ageUnit === 'months' ? 'm' : 'y'}</span>
                                        </div>
                                    </div>
                                    {p.lastKnownPolicyNumber && (
                                        <div className="text-right">
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-opd-primary bg-primary-tint px-2 py-0.5 rounded border border-opd-primary/10 block">
                                                {p.lastKnownInsurer || 'Has Policy'}
                                            </span>
                                            <span className="text-[9px] text-opd-text-muted font-mono block mt-1">Pol: {p.lastKnownPolicyNumber}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : searchQuery.trim().length > 1 ? (
                        <p className="text-xs text-opd-text-muted text-center py-6">No matching patient records found.</p>
                    ) : null}
                </div>
            </div>
        );
    }

    if (entryPath === 'scan_card' && !ocrDone) {
        return (
            <div className="space-y-6 bg-white p-6 rounded-2xl border border-opd-border shadow-sm text-opd-text-primary">
                <button onClick={handleResetEntryPath} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    Back
                </button>
                <h2 className="text-lg font-bold font-lora text-opd-primary">Extract from Document</h2>
                
                {(isExtractingState || extractionFailedKind) ? (
                  <div className="space-y-4">
                    {isExtractingState ? (
                      <div className="flex items-center gap-3.5 p-5 bg-primary-tint/30 rounded-2xl border border-opd-primary/20">
                        <div className="w-5 h-5 border-2 border-opd-primary border-t-transparent rounded-full animate-spin"></div>
                        <div>
                          <p className="font-bold text-xs text-opd-primary uppercase tracking-wider font-lora">Scanning & Classifying Document...</p>
                          <p className="text-[11px] text-opd-text-secondary mt-0.5">Current Stage: <span className="font-semibold text-opd-primary">{
                            extractionStage === 'reading' ? 'Reading File' :
                            extractionStage === 'ocr' ? 'OCR Running' :
                            extractionStage === 'classifying' ? 'Classifying Documents' :
                            extractionStage === 'extracting' ? 'Extracting Patient Information' : 'Processing'
                          }</span></p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3.5 p-5 bg-red-50 rounded-2xl border border-red-200">
                        <span className="text-xl shrink-0">✗</span>
                        <div className="flex-1">
                          <p className="font-bold text-xs text-red-700 uppercase tracking-wider font-lora">AI Extraction Failed</p>
                          <p className="text-[11px] text-red-800 mt-0.5">{extractionException}</p>
                        </div>
                        <button onClick={() => fileRef.current?.click()} className="btn-secondary px-3 py-1.5 text-xs shrink-0" type="button">
                          Try Again
                        </button>
                      </div>
                    )}

                    {/* Extraction Engine Status */}
                    <div className="grid grid-cols-2 gap-3.5 text-[11px] bg-slate-50 border border-slate-200/60 p-3.5 rounded-xl font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isExtractingState ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        <span className="text-slate-500">OCR Engine:</span>
                        <span className="font-semibold text-slate-700">{isExtractingState ? 'ONLINE' : 'IDLE'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${isExtractingState ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        <span className="text-slate-500">Document Parser:</span>
                        <span className="font-semibold text-slate-700">{isExtractingState ? 'ONLINE' : 'IDLE'}</span>
                      </div>
                    </div>

                    {/* Pages Detected Chip & Page Thumbnail Grid — stays visible even on AI failure */}
                    {pagesCount !== null && (
                      <div className="space-y-2.5 p-3.5 bg-slate-50 border border-slate-200/60 rounded-xl">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">Pages detected:</span>
                          <span className="bg-blue-100 text-blue-700 font-mono text-xs px-2.5 py-0.5 rounded-full border border-blue-200 font-bold">{pagesCount}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {splitPages.map((p) => {
                            const state = pageStates[p.index];
                            const thumbnail = state?.thumbnail;
                            const status = state?.status || 'Queued';

                            return (
                              <div
                                key={p.index}
                                onClick={() => thumbnail && setPreviewPage({ index: p.index, thumbnail })}
                                className={`flex flex-col items-center justify-end border border-slate-200 bg-white rounded-lg w-16 h-20 shadow-sm relative overflow-hidden shrink-0 ${thumbnail ? 'cursor-pointer hover:border-opd-primary hover:scale-105 transition-all' : ''}`}
                                title={`Page ${p.index} Status: ${status}${thumbnail ? ' (Click to view page)' : ''}`}
                              >
                                {thumbnail ? (
                                  <img src={thumbnail} alt={`Page ${p.index}`} className="absolute inset-0 w-full h-full object-cover" />
                                ) : thumbnail === '' ? (
                                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-[8px] text-slate-400 font-semibold text-center px-1">
                                    Preview unavailable
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-1 px-1">
                                    {status === 'Rendering' ? (
                                      <>
                                        <div className="w-3.5 h-3.5 border-2 border-opd-primary/40 border-t-opd-primary rounded-full animate-spin"></div>
                                        <span className="text-[7px] text-slate-400 font-bold">Rendering</span>
                                      </>
                                    ) : status === 'OCR Processing' ? (
                                      <>
                                        <div className="w-3.5 h-3.5 border-2 border-emerald-400/40 border-t-emerald-500 rounded-full animate-spin"></div>
                                        <span className="text-[7px] text-emerald-600 font-bold">OCR...</span>
                                      </>
                                    ) : status === 'Failed' ? (
                                      <span className="text-[8px] text-red-500 font-semibold">Failed</span>
                                    ) : (
                                      <>
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-350"></span>
                                        <span className="text-[7px] text-slate-400 font-bold">Queued</span>
                                      </>
                                    )}
                                  </div>
                                )}
                                <span className="relative z-10 mb-1 text-[9px] font-bold text-white bg-black/60 px-1 py-0.5 rounded">{p.index}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Real-time OCR Terminal Logs */}
                    <div className="bg-slate-950 text-emerald-400 font-mono text-[10px] p-4 rounded-xl border border-slate-800 shadow-inner max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                      {ocrLogs.map((logLine, idx) => (
                        <div key={idx} className="whitespace-pre-wrap leading-relaxed border-l-2 border-emerald-500/20 pl-2">
                          {logLine}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                      onClick={() => { if (!isExtractingState) fileRef.current?.click() }}
                      className={`border-2 border-dashed ${extractionException ? 'border-red-300 hover:border-red-400 bg-red-50/50' : 'border-opd-primary/35 hover:border-opd-primary bg-primary-tint/5 hover:bg-primary-tint/10'} rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 shadow-sm`}
                  >
                        <div className="space-y-3.5">
                            <div className="w-14 h-14 rounded-2xl bg-primary-tint text-opd-primary border border-opd-primary/10 flex items-center justify-center mx-auto">
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="text-sm text-opd-text-primary font-bold font-lora">Drop PDF or Image here, or click to upload</div>
                            <div className="text-opd-text-secondary text-[11px] max-w-sm mx-auto leading-normal">Upload Hospital Registration PDF, TPA Card, ID Card, or Policy Document</div>
                            {extractionException && <div className="text-opd-error mt-3 text-xs font-semibold">{extractionException}</div>}
                        </div>
                  </div>
                )}

                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => e.target.files?.[0] && handleDocumentUpload(e.target.files[0])} />
                <button onClick={() => setEntryPath('manual')} className="text-xs text-opd-text-secondary hover:text-opd-primary transition-colors underline block">Skip Extraction — enter manually instead</button>
            </div>
        );
    }

    return (
        <div className="space-y-6 text-opd-text-primary">
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                onChange={e => e.target.files?.[0] && handleDocumentUpload(e.target.files[0])} />
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-opd-primary font-lora uppercase tracking-wider">Patient & Insurance Details</h2>
                </div>
                <button onClick={handleResetEntryPath} className="text-xs text-opd-primary hover:text-opd-primary-dark font-semibold transition-colors underline" type="button">Change Entry Method</button>
            </div>

            {/* Extraction Results Summary */}
            {ocrDone && extractionResult && (
                <div className="bg-primary-tint/20 border border-opd-primary/20 rounded-xl p-5 mb-4 max-w-full overflow-hidden shadow-sm">
                    <div className="flex gap-3 mb-4 items-center">
                        <div className="w-8 h-8 rounded-lg bg-primary-tint text-opd-primary flex items-center justify-center text-sm font-bold"></div>
                        <div>
                            <h3 className="text-opd-primary font-bold text-xs uppercase tracking-wider font-lora">Extraction Complete</h3>
                            <p className="text-opd-text-secondary text-xs mt-0.5">Aivana OCR parsed registration details</p>
                            {pagesCount !== null && (
                                <span className="inline-block mt-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200 font-bold">
                                    Pages detected: {pagesCount}
                                </span>
                            )}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-opd-border shadow-sm">
                        <div>
                            <div className="text-emerald-700 text-xs font-bold flex items-center gap-1.5 mb-2">
                                <span>Auto-filled fields:</span>
                            </div>
                            <ul className="text-emerald-700/80 text-[11px] space-y-1 ml-5 list-disc leading-relaxed font-semibold">
                                {extractionResult.filled.length > 0 ? (
                                    extractionResult.filled.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-opd-text-muted list-none -ml-4">No fields reliably found.</li>
                                )}
                            </ul>
                        </div>
                        <div>
                            <div className="text-amber-700 text-xs font-bold flex items-center gap-1.5 mb-2">
                                <span>Fill manually:</span>
                            </div>
                            <ul className="text-amber-700/80 text-[11px] space-y-1 ml-5 list-disc leading-relaxed font-semibold">
                                {extractionResult.pending.length > 0 ? (
                                    extractionResult.pending.map(f => (<li key={f}>{f}</li>))
                                ) : (
                                    <li className="text-opd-text-muted list-none -ml-4">All required fields extracted successfully.</li>
                                )}
                            </ul>
                        </div>
                    </div>

                    {pageClassifications && pageClassifications.length > 0 && (() => {
                        const foundTypes = Array.from(new Set(pageClassifications.map(pc => pc.documentTypeClassification))).filter(t => t && t !== 'Unclassified' && t !== 'unknown');
                        
                        const missingList = [];
                        const hasInsurance = pageClassifications.some(pc => pc.documentTypeClassification === 'Insurance Form');
                        const hasClinical = pageClassifications.some(pc => pc.documentTypeClassification === 'Clinical/Discharge' || pc.documentTypeClassification === 'Progress Notes');
                        const hasIdCard = pageClassifications.some(pc => pc.documentTypeClassification === 'ID Card');
                        
                        if (!hasInsurance) missingList.push('Insurance Form');
                        if (!hasClinical) missingList.push('Clinical/Discharge document');
                        if (!hasIdCard) missingList.push('ID Card');
                        
                        return (
                            <div className="mt-4 p-4 bg-white rounded-xl border border-opd-border shadow-sm text-xs">
                                <div className="font-bold text-opd-primary mb-2 uppercase tracking-wider font-lora text-[11px]">Document Verification Check</div>
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-emerald-700 font-bold">DOCUMENTS FOUND: </span>
                                        {foundTypes.length > 0 ? (
                                            <span className="text-opd-text-primary font-semibold">{foundTypes.join(', ')}</span>
                                        ) : (
                                            <span className="text-opd-text-secondary italic">None identified</span>
                                        )}
                                    </div>
                                    {missingList.length > 0 && (
                                        <div>
                                            <span className="text-red-600 font-bold">POSSIBLY MISSING: </span>
                                            <span className="text-red-700 font-semibold">{missingList.join(', ')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Patient Demographics */}
            <div className="card-premium space-y-4">
                <h3 className="font-semibold text-opd-primary text-[10px] uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Patient Demographics</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Full Name *</label>
                        <input value={patient.patientName ?? ''} onChange={e => onPatientChange({ ...patient, patientName: e.target.value })}
                            className="form-input" placeholder="As on insurance card" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Date of Birth</label>
                        <input type="date" value={patient.dateOfBirth ?? ''} onChange={e => handleDOBChange(e.target.value)}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Age *</label>
                        <input type="number" value={patient.age ?? ''} onChange={e => onPatientChange({ ...patient, age: +e.target.value })}
                            className="form-input" placeholder="Years" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Gender *</label>
                        <select value={patient.gender ?? ''} onChange={e => onPatientChange({ ...patient, gender: e.target.value as any })}
                            className="form-input">
                            <option value="">Select</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Marital Status</label>
                        <select value={patient.maritalStatus ?? ''} onChange={e => onPatientChange({ ...patient, maritalStatus: e.target.value as any })}
                            className="form-input">
                            <option value="">Select</option>
                            <option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option>
                        </select>
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Mobile Number *</label>
                        <input type="tel" value={patient.mobileNumber ?? ''} onChange={e => onPatientChange({ ...patient, mobileNumber: e.target.value })}
                            className="form-input" placeholder="+91 XXXXX XXXXX" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Email</label>
                        <input type="email" value={patient.email ?? ''} onChange={e => onPatientChange({ ...patient, email: e.target.value })}
                            className="form-input" placeholder="optional" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">City *</label>
                        <input value={patient.city ?? ''} onChange={e => onPatientChange({ ...patient, city: e.target.value })}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">State *</label>
                        <select value={patient.state ?? ''} onChange={e => onPatientChange({ ...patient, state: e.target.value })}
                            className="form-input">
                            <option value="">Select State</option>
                            {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="col-span-2">
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">UHID (Hospital ID)</label>
                        <input value={patient.uhid ?? ''} onChange={e => onPatientChange({ ...patient, uhid: e.target.value })}
                            className="form-input" placeholder="Optional identifier" />
                    </div>
                </div>
            </div>

            {/* Insurance Details */}
            <div className="card-premium space-y-4">
                <h3 className="font-semibold text-opd-primary text-[10px] uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Insurance & Policy Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Insurance Company *</label>
                        <datalist id="insurer-list">{INSURER_LIST.map(i => <option key={i} value={i} />)}</datalist>
                        <input list="insurer-list" value={insurance.insurerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, insurerName: e.target.value })}
                            className="form-input" placeholder="Start typing insurer..." />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">TPA Name</label>
                        <select value={insurance.tpaName ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaName: e.target.value })}
                            className="form-input">
                            <option value="">Select TPA</option>
                            {TPA_NAMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Policy Number *</label>
                        <input value={insurance.policyNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyNumber: e.target.value })}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">TPA ID Card Number</label>
                        <input value={insurance.tpaIdCardNumber ?? ''} onChange={e => onInsuranceChange({ ...insurance, tpaIdCardNumber: e.target.value })}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Policy Type</label>
                        <select value={insurance.policyType ?? 'Individual'} onChange={e => onInsuranceChange({ ...insurance, policyType: e.target.value as any })}
                            className="form-input">
                            <option>Individual</option><option>Floater</option><option>Corporate</option><option>Group</option>
                        </select>
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Sum Insured (₹) *</label>
                        <input type="number" value={insurance.sumInsured ?? ''} onChange={e => onInsuranceChange({ ...insurance, sumInsured: +e.target.value })}
                            className="form-input" placeholder="e.g. 500000" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Policy Start Date</label>
                        <input type="date" value={insurance.policyStartDate ?? ''} onChange={e => onInsuranceChange({ ...insurance, policyStartDate: e.target.value })}
                            className="form-input" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Policy End Date</label>
                        <input type="date" value={insurance.policyEndDate ?? ''} onChange={e => handlePolicyEndDate(e.target.value)}
                            className="form-input" />
                        {policyDateWarning && <p className="text-opd-error text-[11px] font-semibold mt-1.5">{policyDateWarning}</p>}
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Proposer Name</label>
                        <input value={insurance.proposerName ?? ''} onChange={e => onInsuranceChange({ ...insurance, proposerName: e.target.value })}
                            className="form-input" placeholder="Defaults to patient name" />
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Relationship with Proposer</label>
                        <select value={insurance.relationshipWithProposer ?? 'Self'} onChange={e => onInsuranceChange({ ...insurance, relationshipWithProposer: e.target.value })}
                            className="form-input">
                            <option>Self</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Father</option><option>Mother</option><option>Other</option>
                        </select>
                    </div>
                </div>
            </div>

            <button onClick={onNext} disabled={!isValid} type="button"
                className="w-full btn-primary py-2.5">
                Continue to Clinical Details
            </button>
            {!isValid && <p className="text-[10px] text-amber-600 font-semibold text-center mt-1">Fill all required (*) fields to continue</p>}

            {/* Thumbnail Preview Modal Overlay */}
            {previewPage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" onClick={() => setPreviewPage(null)}>
                    <div className="bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[85vh] flex flex-col space-y-3 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b pb-2">
                            <span className="font-bold text-sm text-opd-primary font-lora">Page {previewPage.index} Document Preview</span>
                            <button onClick={() => setPreviewPage(null)} className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 py-1">✕ Close</button>
                        </div>
                        <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100 rounded-xl p-2">
                            <img src={previewPage.thumbnail} alt={`Page ${previewPage.index}`} className="max-h-[70vh] w-auto object-contain rounded shadow" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
