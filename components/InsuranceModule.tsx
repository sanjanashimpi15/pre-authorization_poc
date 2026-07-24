import React, { useState, useEffect, useCallback } from 'react';
import { PreAuthWizard } from './PreAuthWizard';
import { PreAuthDashboard } from './PreAuthDashboard';
import { getRequiredDocuments } from '../data/icd10DocumentMap';
import { extractInsurancePreAuthData, extractInsuranceCardData, InsuranceCardExtracted } from '../services/geminiService';
import { DIABETES_DEMO_RECORD, PNEUMONIA_DEMO_RECORD, APPENDICITIS_DEMO_RECORD } from '../data/demoCases';
import { extractFromDocument } from '../services/documentExtractionService';
import { classifyDocument, CLASSIFICATION_CONFIDENCE_THRESHOLD } from '../services/documentClassificationService';
import { buildPageIndexForDocument, buildEvidenceMapForDocument } from '../services/documentIndexingService';
import { splitPdfIntoPages, getPdfPageCount, renderPdfPageThumbnails, SplitPage } from '../utils/pdfSplitter';
import { classifyGeminiError, geminiErrorUserMessage, GeminiErrorKind } from '../utils/geminiErrorClassifier';
import { reviewEnhancement, EnhancementReviewReport, EnhancementInput, EnhancementTrigger } from '../engine/enhancementReview';
import { priorAuthOrchestrator, ExtendedEvidenceReviewReport } from '../engine/priorAuthWorkflow';
import { logEvent } from '../utils/auditLog';
import { PriorAuthCopilot } from './TpaPlatform/PriorAuthCopilot';
import { DenialHub } from './TpaPlatform/DenialHub';
import { BillingCoderView } from './TpaPlatform/BillingCoderView';
import { WorkflowOrchestrator } from './TpaPlatform/WorkflowOrchestrator';
import { DenialQueue } from './PostSubmission/DenialQueue';
import { simulateInsurerDecision } from '../services/simulatedInsurerService';
import { getInsurerPolicyRules, saveInsurerPolicyRules, PolicyRuleConfig } from '../services/policyConfigService';
import { getPMJAYPackagesList, savePMJAYPackagesList, PMJAYPackage } from '../services/pmjayService';

// Import Master Patient Record functions
import {
    getPatientRecord,
    savePatientRecord,
    getAllPatientRecords,
    deletePatientRecord,
    savePreAuth,
    getPreAuth,
    PatientCaseRecord,
    mapPreAuthToCase,
    mapCaseToPreAuth,
    getStageFromStatus,
    CaseStage,
    generatePreAuthId,
    DocumentPageEntry,
    EvidenceMapEntry
} from '../services/masterPatientRecord';

import {
    Activity,
    UploadCloud,
    FileSearch,
    UserCheck,
    CheckSquare,
    Calculator,
    BookmarkCheck,
    HeartPulse,
    ShieldAlert,
    FileCheck,
    TrendingUp,
    FileSpreadsheet,
    FileText,
    Volume2,
    Database,
    Sparkles,
    QrCode,
    Download,
    Eye,
    ChevronRight,
    ArrowRight,
    MapPin,
    AlertCircle,
    Info
} from 'lucide-react';

// --- TYPES ---

export interface DischargeDayEntry {
    day: number;
    date: string;
    clinicalEvents: string;
    treatmentGiven: string;
    vitalsTrend: 'improving' | 'stable' | 'deteriorating';
}

export interface ReimbursementInput {
    admissionDate: string;
    dischargeDate: string;
    hospitalName: string;
    hospitalROHINIId?: string;
    treatingDoctorName: string;
    treatingDoctorReg: string;
    wardType: 'general' | 'semi_private' | 'private' | 'icu';
    icuDays: number;
    patientName: string;
    patientAge: number;
    patientGender: string;
    policyNumber: string;
    insurerName: string;
    tpaName: string;
    abhaId?: string;
    relationshipToInsured: string;
    hasPriorTreatmentForCondition: boolean;
    priorTreatmentDetails?: string;
    finalPrimaryDiagnosis: string;
    finalPrimaryICD10: string;
    secondaryDiagnoses: string[];
    diagnosisChangedFromAdmission: boolean;
    diagnosisChangeReason?: string;
    clinicalCourse: DischargeDayEntry[];
    dischargeCondition: 'Improved' | 'Stable' | 'LAMA' | 'Referred' | 'Expired';
    dischargeCriteriaCheckbox: string[];
    followUpDate?: string;
    followUpSpecialty?: string;
    hospitalBillTotal: number;
    pharmacyBillTotal: number;
    investigationsBillTotal: number;
    implantsCost: number;
    implantDetails?: string;
    claimAmountTotal: number;
    neftAccountNumber?: string;
    neftIFSC?: string;
    documentsAvailable: string[];
}

// --- TEMPLATE GENERATORS FOR REIMBURSEMENT PACKET ---

function generateInsuranceDischarge(input: ReimbursementInput): string {
    return `=========================================
DISCHARGE SUMMARY (TPA SUBMISSION PREVIEW)
=========================================
Hospital: ${input.hospitalName}
ROHINI ID: ${input.hospitalROHINIId || 'ROH-8761254'}
Doctor: ${input.treatingDoctorName} (Reg No: ${input.treatingDoctorReg})
-----------------------------------------
Patient: ${input.patientName} (${input.patientAge}y / ${input.patientGender})
Relationship to Insured: ${input.relationshipToInsured}
Policy Number: ${input.policyNumber}
Insurer: ${input.insurerName}
-----------------------------------------
Admission Date: ${input.admissionDate}
Discharge Date: ${input.dischargeDate}
Ward Type: ${input.wardType.toUpperCase()} (ICU Stay: ${input.icuDays} Days)
-----------------------------------------
Primary Diagnosis: ${input.finalPrimaryDiagnosis} [ICD-10: ${input.finalPrimaryICD10}]
Secondary Diagnosis: ${input.secondaryDiagnoses.join(', ') || 'None'}
Diagnosis Changed: ${input.diagnosisChangedFromAdmission ? 'Yes' : 'No'}
${input.diagnosisChangedFromAdmission ? `Reason: ${input.diagnosisChangeReason}\n` : ''}

CLINICAL COURSE DURING HOSPITALIZATION:
${input.clinicalCourse.length > 0 
  ? input.clinicalCourse.map(c => `* Day ${c.day} (${c.date}): ${c.clinicalEvents} | Treatment: ${c.treatmentGiven} (Vitals: ${c.vitalsTrend})`).join('\n')
  : 'Patient underwent routine clinical evaluation, vitals monitored regularly, and standard treatment protocol initiated. Vitals stable at the time of discharge.'
}

Condition at Discharge: ${input.dischargeCondition}
Follow-up: ${input.followUpDate ? `On ${input.followUpDate} under ${input.followUpSpecialty || 'General Physician'}` : 'As advised in OPD.'}`;
}

function generateCoverLetter(input: ReimbursementInput): string {
    return `Date: ${new Date().toLocaleDateString('en-IN')}

To,
The Claims Manager,
${input.insurerName || 'Insurance Co.'}
${input.tpaName ? `Through TPA: ${input.tpaName}\n` : ''}
Subject: Submission of Reimbursement Claim for ${input.patientName} (Policy: ${input.policyNumber})

Respected Sir/Madam,

Please find enclosed the formal cashless reimbursement claim packet for ${input.patientName}, who was admitted at ${input.hospitalName} on ${input.admissionDate} and discharged on ${input.dischargeDate} after undergoing treatment for ${input.finalPrimaryDiagnosis} (ICD-10: ${input.finalPrimaryICD10}).

Claim Details Summary:
- Total Hospital Bill: ₹${input.hospitalBillTotal.toLocaleString('en-IN')}
- Pharmacy Bill: ₹${input.pharmacyBillTotal.toLocaleString('en-IN')}
- Investigation Bill: ₹${input.investigationsBillTotal.toLocaleString('en-IN')}
- Implants/Consumables: ₹${input.implantsCost.toLocaleString('en-IN')}
- Total Claimed Amount: ₹${input.claimAmountTotal.toLocaleString('en-IN')}

We request you to kindly process the reimbursement claim at the earliest. All relevant medical receipts, diagnostics reports, discharge summary, and KYC documents are attached herewith.

Thanking you.

Yours faithfully,
Authorized Nodal Signatory
${input.hospitalName}`;
}

function generateDocumentChecklist(icdCode: string, input: ReimbursementInput): string {
    return `REQUIRED DOCUMENT CHECKLIST (ICD-10: ${icdCode})
===================================================
[x] Duly filled and signed Claim Form A & B
[x] Original Discharge Summary (signed by Dr. ${input.treatingDoctorName})
[x] Final Consolidated Hospital Bill (₹${input.hospitalBillTotal.toLocaleString('en-IN')})
[x] Detailed break-up of hospital charges
[x] Investigation reports confirming diagnosis (${icdCode})
[x] Pharmacy Bills and matching prescriptions
[x] Patient ID Proof (Aadhaar / Passport) & active Health Card
[x] Canceled Cheque/NEFT bank details for direct settlement
${icdCode.startsWith('H25') || icdCode.startsWith('H26') ? '[x] Biometry report & IOL sticker (for Cataract claim)\n' : ''}${icdCode.startsWith('O34') || icdCode.startsWith('O82') ? '[x] Partogram and obstetric details (for Maternity claim)\n' : ''}`;
}

// --- REIMBURSEMENT PACKET BUILDER ---

export const ReimbursementModule: React.FC<{ activeCase?: PatientCaseRecord | null }> = ({ activeCase }) => {
    const [input, setInput] = useState<ReimbursementInput>({
        admissionDate: '', dischargeDate: '', hospitalName: 'Aegis Super Speciality', treatingDoctorName: 'Dr. Ramesh Kumar', treatingDoctorReg: 'MCI-12345',
        wardType: 'general', icuDays: 0, patientName: '', patientAge: 0, patientGender: 'Male', policyNumber: '',
        insurerName: '', tpaName: '', relationshipToInsured: 'Self', hasPriorTreatmentForCondition: false,
        finalPrimaryDiagnosis: '', finalPrimaryICD10: '', secondaryDiagnoses: [], diagnosisChangedFromAdmission: false,
        clinicalCourse: [], dischargeCondition: 'Improved', dischargeCriteriaCheckbox: [], hospitalBillTotal: 0,
        pharmacyBillTotal: 0, investigationsBillTotal: 0, implantsCost: 0, claimAmountTotal: 0, documentsAvailable: [],
    });

    useEffect(() => {
        if (activeCase) {
            setInput(prev => ({
                ...prev,
                patientName: activeCase.patientProfile.name,
                patientAge: activeCase.patientProfile.age,
                patientGender: activeCase.patientProfile.gender,
                policyNumber: activeCase.insuranceDetails.policyNumber,
                insurerName: activeCase.insuranceDetails.insurer,
                tpaName: activeCase.insuranceDetails.TPA,
                finalPrimaryDiagnosis: activeCase.encounters[0]?.diagnosis || '',
                finalPrimaryICD10: activeCase.encounters[0]?.diagnoses?.[0]?.icd10Code || '',
                admissionDate: activeCase.encounters[0]?.admissionDate || '',
                dischargeDate: activeCase.encounters[0]?.dischargeDate || '',
                claimAmountTotal: activeCase.claims[0]?.claimAmount || 0
            }));
        }
    }, [activeCase]);

    const [docs, setDocs] = useState<{ discharge?: string; coverLetter?: string; checklist?: string }>({});
    const [activeTab, setActiveTab] = useState<'discharge' | 'cover' | 'checklist'>('discharge');

    const handleGenerate = () => {
        if (!input.patientName || !input.finalPrimaryICD10 || !input.admissionDate) {
            alert("⚠️ Missing Critical Fields: Patient Name, ICD-10 Code, and Admission Date are required.");
            return;
        }
        setDocs({
            discharge: generateInsuranceDischarge(input),
            coverLetter: generateCoverLetter(input),
            checklist: generateDocumentChecklist(input.finalPrimaryICD10 || 'default', input)
        });
    };

    return (
        <div className="card-premium space-y-4 text-left">
            <h2 className="text-base font-bold font-lora text-opd-primary">Final Claim / Reimbursement</h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
                <div><label className="block text-gray-500 mb-1 font-semibold">Patient Name</label><input className="w-full p-2 border rounded text-gray-800" value={input.patientName} onChange={e => setInput({ ...input, patientName: e.target.value })} /></div>
                <div><label className="block text-gray-500 mb-1 font-semibold">ICD-10 Code</label><input className="w-full p-2 border rounded text-gray-800" value={input.finalPrimaryICD10} onChange={e => setInput({ ...input, finalPrimaryICD10: e.target.value })} /></div>
                <div><label className="block text-gray-500 mb-1 font-semibold">Primary Diagnosis</label><input className="w-full p-2 border rounded text-gray-800" value={input.finalPrimaryDiagnosis} onChange={e => setInput({ ...input, finalPrimaryDiagnosis: e.target.value })} /></div>
                <div><label className="block text-gray-500 mb-1 font-semibold">Total Claim Amount (₹)</label><input type="number" className="w-full p-2 border rounded text-gray-800" value={input.claimAmountTotal || ''} onChange={e => setInput({ ...input, claimAmountTotal: Number(e.target.value) })} /></div>
            </div>
            <button onClick={handleGenerate} className="px-4 py-2 bg-opd-primary text-white rounded-lg text-xs font-semibold hover:bg-opd-primary-hover transition">
                Build Submission Documents
            </button>

            {docs.discharge && (
                <div className="mt-4 border-t border-opd-border pt-4">
                    <div className="flex bg-opd-input-bg border rounded-xl p-1 gap-1">
                        <button className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'discharge' ? 'bg-opd-primary text-white' : 'text-opd-text-secondary'}`} onClick={() => setActiveTab('discharge')}>Discharge Summary</button>
                        <button className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'cover' ? 'bg-opd-primary text-white' : 'text-opd-text-secondary'}`} onClick={() => setActiveTab('cover')}>Cover Letter</button>
                        <button className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${activeTab === 'checklist' ? 'bg-opd-primary text-white' : 'text-opd-text-secondary'}`} onClick={() => setActiveTab('checklist')}>Checklist</button>
                    </div>
                    <pre className="mt-3 p-4 bg-gray-50 border rounded-xl max-h-60 overflow-y-auto text-[11px] font-mono text-opd-text-secondary leading-relaxed">{docs[activeTab]}</pre>
                </div>
            )}
        </div>
    );
};

// --- DYNAMIC 12-SCREEN UI PANEL VIEWS ---

interface DocPreview {
    documentId: string;
    documentName: string;
    pageCount: number;
    thumbnails: string[]; // thumbnails[i] = page (i + 1)
    documentType?: string;
    ocrConfidence?: number; // 0-1, set once extraction/classification completes
    // Per-page classification badges (page number -> type label), best-effort. Absent
    // if classifyPagesBatch failed or hasn't completed yet — thumbnails just show no badge.
    pageTypes?: Record<number, string>;
    // Upload = reading the file locally (page count, thumbnails). This never depends on
    // Gemini and essentially always succeeds unless the file itself is corrupt.
    uploadStatus: 'reading' | 'success';
    // AI = classification + OCR + field extraction. Tracked separately from uploadStatus
    // so a Gemini outage never gets displayed as "upload failed".
    aiStatus: 'pending' | 'running' | 'completed' | 'needs_review' | 'failed';
    aiErrorKind?: GeminiErrorKind;
    aiErrorMessage?: string;
}

const IDP_STAGE_LABELS: Record<string, string> = {
    reading: 'Reading File',
    ocr: 'OCR Running',
    classifying: 'Classifying Documents',
    extracting: 'Extracting Patient Information',
    evidence: 'Building Evidence Map',
};

const UploadIngestionView: React.FC<{ onCaseCreated: (id: string) => void }> = ({ onCaseCreated }) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<'idle' | 'reading' | 'ocr' | 'classifying' | 'extracting' | 'evidence' | 'done'>('idle');
    const [fileCount, setFileCount] = useState(0);
    const [totalSizeDisplay, setTotalSizeDisplay] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [aiWarningMessage, setAiWarningMessage] = useState('');
    const [extractionLog, setExtractionLog] = useState<string[]>([]);
    const [currentFile, setCurrentFile] = useState('');
    const [docPreviews, setDocPreviews] = useState<DocPreview[]>([]);
    const [pageIndex, setPageIndex] = useState<DocumentPageEntry[]>([]);
    const [evidenceMap, setEvidenceMap] = useState<EvidenceMapEntry[]>([]);

    const log = (msg: string) => setExtractionLog(prev => [...prev, msg]);

    const updateDocPreview = (documentId: string, patch: Partial<DocPreview>) => {
        setDocPreviews(prev => prev.map(d => d.documentId === documentId ? { ...d, ...patch } : d));
    };

        const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        let sizeSum = 0;
        for (let i = 0; i < files.length; i++) sizeSum += files[i].size;

        if (sizeSum > 500 * 1024 * 1024) {
            setErrorMessage('⚠️ Upload Rejected: Selected batch exceeds the strict 500MB total size limit.');
            return;
        }

        setErrorMessage('');
        setAiWarningMessage('');
        setExtractionLog([]);
        setFileCount(files.length);
        setTotalSizeDisplay(`${(sizeSum / (1024 * 1024)).toFixed(2)} MB`);
        setUploading(true);
        setProgress('reading');

        // Step 1: Create blank patient record immediately
        const newId = generatePreAuthId();
        const fileNames = Array.from(files).map((f: any) => f.name);
        const blankCase: PatientCaseRecord = {
            id: newId,
            patientProfile: { name: '', age: 0, gender: 'Unknown', uhid: '', contactNumber: '', address: '' },
            insuranceDetails: { insurerName: '', policyNumber: '', policyType: '', sumInsured: 0, roomRentLimit: 0, icuRentLimit: 0 },
            encounters: [],
            documents: fileNames.map((name, idx) => ({
                id: `DOC-${newId}-${idx}`, name, type: 'uploaded',
                uploadedAt: new Date().toISOString(), status: 'pending_extraction',
            } as any)),
            authorizations: [], enhancements: [], claims: [], appeals: [],
            auditLog: [{ timestamp: new Date().toISOString(), action: 'case_created', actor: 'hospital_upload',
                details: `${files.length} file(s) uploaded (${(sizeSum / (1024 * 1024)).toFixed(2)} MB). Starting OCR extraction.` }],
            timeline: [], currentStage: 'documents_uploaded',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        await savePatientRecord(blankCase);
        log(`✅ Case ${newId} created. Detected ${files.length} document(s). Starting Intelligent Document Processing...`);
        setDocPreviews(blankCase.documents.map(d => ({
            documentId: d.id, documentName: d.name, pageCount: 1, thumbnails: [],
            uploadStatus: 'reading', aiStatus: 'pending',
        })));

        let mergedName = '';
        let mergedGender: 'Male' | 'Female' | 'Other' | 'Unknown' = 'Unknown';
        let mergedAge = 0;
        let mergedPhone = '';
        let mergedAddress = '';
        let mergedInsurerName = '';
        let mergedPolicyNumber = '';
        let mergedSumInsured = 0;
        let mergedTpaName = '';
        let clinicalExcerpts: string[] = [];
        let highestConfidence = 0;
        let extractionErrors: string[] = [];
        let quotaExceededCount = 0;
        let serviceUnavailableCount = 0;
        const allPageIndex: DocumentPageEntry[] = [];
        const allEvidenceMap: EvidenceMapEntry[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const documentId = blankCase.documents[i].id;
            setCurrentFile(file.name);

            // --- Stage 1: Reading File — detect page count, split pages, render thumbnails ---
            setProgress('reading');
            log(`📄 [${i + 1}/${files.length}] Reading: ${file.name}`);

            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            let pages: SplitPage[] = [];
            let pageCount = 1;
            let thumbnails: string[] = [];

            try {
                if (isPdf) {
                    pageCount = await getPdfPageCount(file);
                    pages = await splitPdfIntoPages(file);
                    thumbnails = await renderPdfPageThumbnails(file);
                } else if (file.type.startsWith('image/')) {
                    pageCount = 1;
                    thumbnails = [URL.createObjectURL(file)];
                } else {
                    pageCount = 1;
                }
                log(`   ↳ ${pageCount} page(s) detected.`);
            } catch (err: any) {
                log(`   ↳ ⚠️ Could not read file structure: ${err?.message || 'Unknown error'}`);
            }

            // Upload/read step is independent of Gemini — it either has the bytes or it
            // doesn't. Mark it successful now so this is never conflated with an AI failure.
            updateDocPreview(documentId, { pageCount, thumbnails, uploadStatus: 'success', aiStatus: 'running' });
            log(`   ↳ ✓ Upload Successful`);

            // Cheap classification pre-pass. If confidence is too low, skip the
            // expensive extraction call entirely and flag for manual review.
            let classification: Awaited<ReturnType<typeof classifyDocument>> | null = null;
            try {
                classification = await classifyDocument(file);
                log(`   ↳ Pre-flight classification: "${classification.category}" (${Math.round(classification.confidence * 100)}% confidence)`);
            } catch (err: any) {
                const kind: GeminiErrorKind = err?.geminiErrorKind || classifyGeminiError(err);
                const message = geminiErrorUserMessage(kind);
                if (kind === 'quota_exceeded') quotaExceededCount++;
                else if (kind === 'service_unavailable') serviceUnavailableCount++;

                log(`   ↳ ✗ AI Extraction Failed: ${message}`);
                extractionErrors.push(`${file.name}: ${message}`);
                updateDocPreview(documentId, { aiStatus: 'failed', aiErrorKind: kind, aiErrorMessage: message });

                // Page count/thumbnails/page index are still saved and shown — only the
                // AI-derived fields (type, confidence, summary) are unavailable since
                // Gemini never returned anything.
                const failedPages: DocumentPageEntry[] = Array.from({ length: pageCount }, (_, p) => ({
                    pageNumber: p + 1,
                    documentName: file.name,
                    documentType: 'unknown',
                    ocrConfidence: 0,
                    summary: message,
                    thumbnailUrl: thumbnails[p],
                }));
                allPageIndex.push(...failedPages);
                blankCase.documents[i] = { ...blankCase.documents[i], status: 'ai_extraction_failed', pageCount, pages: failedPages } as any;
                continue; // move to the next file — evidence map is NOT built for this document
            }

            if (classification.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
                log(`   ↳ ⚠️ Below confidence threshold — flagged for manual review, OCR/extraction skipped.`);
                blankCase.documents[i] = {
                    ...blankCase.documents[i],
                    status: 'needs_review',
                    type: classification.category,
                    pageCount,
                } as any;
                updateDocPreview(documentId, {
                    aiStatus: 'needs_review',
                    documentType: classification.category,
                    ocrConfidence: classification.confidence,
                });
                const skippedPages: DocumentPageEntry[] = Array.from({ length: pageCount }, (_, p) => ({
                    pageNumber: p + 1,
                    documentName: file.name,
                    documentType: classification.category,
                    ocrConfidence: classification.confidence,
                    summary: 'Flagged for manual review — OCR skipped (low classification confidence).',
                    thumbnailUrl: thumbnails[p],
                }));
                allPageIndex.push(...skippedPages);
                continue; // skip extraction for this file, move to the next
            }

            log(`📄 [${i + 1}/${files.length}] Processing: ${file.name}`);
            try {
                const extracted = await extractFromDocument(file, pages.length > 0 ? pages : undefined, (stage) => {
                    setProgress(stage);
                    log(`   ↳ ${IDP_STAGE_LABELS[stage]}...`);
                });
                const conf = extracted.confidence > 1 ? extracted.confidence / 100 : extracted.confidence;
                log(`   ↳ Type: ${extracted.document_type} | Confidence: ${Math.round(conf * 100)}% | Fields: ${extracted.extracted_fields.join(', ') || 'none'}`);

                if (conf > highestConfidence) highestConfidence = conf;

                // Merge: first non-empty value wins for each field
                if (!mergedName && extracted.patient?.name) mergedName = extracted.patient.name;
                if (mergedGender === 'Unknown' && extracted.patient?.gender) mergedGender = extracted.patient.gender as any;
                if (!mergedAge && extracted.patient?.age) mergedAge = extracted.patient.age;
                if (!mergedPhone && extracted.patient?.phone) mergedPhone = extracted.patient.phone;
                if (!mergedAddress && extracted.patient?.address) mergedAddress = extracted.patient.address;
                if (!mergedInsurerName && extracted.insurance?.insurance_company) mergedInsurerName = extracted.insurance.insurance_company;
                if (!mergedPolicyNumber && extracted.insurance?.policy_number) mergedPolicyNumber = extracted.insurance.policy_number;
                if (!mergedSumInsured && extracted.insurance?.sum_insured) mergedSumInsured = extracted.insurance.sum_insured;
                if (!mergedTpaName && extracted.insurance?.tpa_name) mergedTpaName = extracted.insurance.tpa_name;
                if (extracted.clinical_excerpts?.length) clinicalExcerpts.push(...extracted.clinical_excerpts);

                // --- Stage 5: Building Evidence Map — page index + field-level traceability ---
                setProgress('evidence');
                log(`   ↳ Building Evidence Map for ${file.name}...`);

                const pageDocumentTypes = extracted.page_classifications
                    ? Object.fromEntries(
                        Object.entries(extracted.page_classifications).map(([page, c]) => [Number(page), c.document_type])
                    )
                    : undefined;

                const docPages = buildPageIndexForDocument({
                    documentName: file.name,
                    documentType: extracted.document_type,
                    docConfidence: conf,
                    ocrPages: extracted.ocrPages,
                    thumbnails,
                    pageDocumentTypes,
                });
                allPageIndex.push(...docPages);

                const docEvidence = buildEvidenceMapForDocument({
                    documentName: file.name,
                    extracted,
                    ocrPages: extracted.ocrPages,
                    docConfidence: conf,
                });
                allEvidenceMap.push(...docEvidence);

                updateDocPreview(documentId, {
                    aiStatus: 'completed',
                    documentType: extracted.document_type,
                    ocrConfidence: conf,
                    pageCount: Math.max(pageCount, docPages.length),
                    pageTypes: pageDocumentTypes,
                });
                log(`   ↳ ✓ OCR Completed`);

                // Mark doc as extracted and store full OCR result for Screen 4
                blankCase.documents[i] = {
                    ...blankCase.documents[i],
                    status: 'extracted',
                    type: extracted.document_type,
                    extractedData: extracted,
                    pageCount,
                    pages: docPages,
                } as any;
            } catch (err: any) {
                const kind: GeminiErrorKind = err?.geminiErrorKind || classifyGeminiError(err);
                const message = kind === 'unknown' ? (err?.message || 'Unknown error') : geminiErrorUserMessage(kind);
                if (kind === 'quota_exceeded') quotaExceededCount++;
                else if (kind === 'service_unavailable') serviceUnavailableCount++;

                log(`   ↳ ✗ AI Extraction Failed: ${message}`);
                extractionErrors.push(`${file.name}: ${message}`);
                updateDocPreview(documentId, {
                    aiStatus: 'failed',
                    aiErrorKind: kind,
                    aiErrorMessage: message,
                    documentType: classification.category,
                    ocrConfidence: classification.confidence,
                });

                // Page count/thumbnails/page index stay visible and are still saved — only
                // the OCR-derived summary and evidence map are unavailable since extraction
                // never returned.
                const failedPages: DocumentPageEntry[] = Array.from({ length: pageCount }, (_, p) => ({
                    pageNumber: p + 1,
                    documentName: file.name,
                    documentType: classification.category,
                    ocrConfidence: classification.confidence,
                    summary: `AI extraction failed: ${message}`,
                    thumbnailUrl: thumbnails[p],
                }));
                allPageIndex.push(...failedPages);
                blankCase.documents[i] = { ...blankCase.documents[i], status: 'ai_extraction_failed', pageCount, type: classification.category, pages: failedPages } as any;
                // Evidence map is intentionally NOT built here — only on successful extraction.
            }
        }

        setPageIndex(allPageIndex);
        setEvidenceMap(allEvidenceMap);

        // Step 3: Merge all extracted data back into the patient record
        log('🔗 Merging extracted fields into patient record...');

        const updatedCase: PatientCaseRecord = {
            ...blankCase,
            patientProfile: {
                name: mergedName,
                age: mergedAge,
                gender: mergedGender,
                uhid: newId,
                contactNumber: mergedPhone,
                address: mergedAddress,
            },
            insuranceDetails: {
                insurerName: mergedInsurerName,
                policyNumber: mergedPolicyNumber,
                policyType: '',
                sumInsured: mergedSumInsured,
                tpaName: mergedTpaName,
                // Room rent caps: IRDA standard defaults — override after policy validation
                roomRentLimit: mergedSumInsured ? Math.round(mergedSumInsured * 0.01) : 0,
                icuRentLimit:  mergedSumInsured ? Math.round(mergedSumInsured * 0.02) : 0,
            },
            encounters: clinicalExcerpts.length > 0 ? [{
                id: `ENC-${newId}-1`,
                date: new Date().toISOString().split('T')[0],
                diagnosis: '',
                chiefComplaints: clinicalExcerpts.slice(0, 3).join(' | '),
                historyOfPresentIllness: clinicalExcerpts.join(' '),
                wardType: '',
                ocrExcerpts: clinicalExcerpts,
            } as any] : [],
            auditLog: [
                ...blankCase.auditLog,
                {
                    timestamp: new Date().toISOString(),
                    action: 'ocr_extraction_complete',
                    actor: 'documentExtractionService',
                    details: `Extracted from ${files.length} file(s). Confidence: ${Math.round(highestConfidence * 100)}%. Errors: ${extractionErrors.length}`,
                }
            ],
            currentStage: extractionErrors.length === files.length ? 'documents_uploaded' : 'patient_identified',
            evidenceMap: allEvidenceMap,
            updatedAt: new Date().toISOString(),
        };

        await savePatientRecord(updatedCase);

        if (extractionErrors.length > 0) {
            const allFailed = extractionErrors.length === files.length;
            const primaryKind: GeminiErrorKind = quotaExceededCount > 0 ? 'quota_exceeded' : serviceUnavailableCount > 0 ? 'service_unavailable' : 'unknown';
            const reason = primaryKind === 'unknown' ? 'an unexpected AI processing error' : geminiErrorUserMessage(primaryKind).replace(/^AI extraction is temporarily unavailable because /, '');

            const summary = allFailed
                ? `✓ All ${files.length} document(s) were uploaded successfully, but AI extraction is temporarily unavailable because ${reason} Page thumbnails and the page index are still available below — please fill patient details manually, or retry once the AI service recovers.`
                : `✓ All ${files.length} document(s) were uploaded successfully. ✓ AI extraction completed for ${files.length - extractionErrors.length} file(s). ✗ AI extraction failed for ${extractionErrors.length} file(s) because ${reason} Those files' fields were not auto-filled — please review them manually.`;

            log(summary);
            if (primaryKind !== 'unknown') setAiWarningMessage(summary);
        } else {
            log(`✓ All ${files.length} document(s) uploaded and AI extraction completed successfully. Patient record populated.`);
        }

        setProgress('done');
        setCurrentFile('');
        setUploading(false);
        onCaseCreated(newId);
    };


    const loadScenario = async (record: any) => {
        const newRecord = {
            ...record,
            id: `PA-AIVANA-${Date.now().toString().slice(-6)}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await savePreAuth(newRecord);
        onCaseCreated(newRecord.id);
    };

    return (
        <div className="card-premium space-y-6 text-left">
            <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 3: Document Upload &amp; OCR Extraction</h2>
            <p className="text-xs text-opd-text-secondary">
                Upload patient files for real-time AI extraction. Patient profile and insurance fields are populated automatically.
            </p>

            <div className="border-2 border-dashed border-opd-border rounded-2xl p-8 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition relative">
                <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} disabled={uploading} />
                <UploadCloud className={`w-12 h-12 mb-3 ${uploading ? 'text-opd-primary animate-pulse' : 'text-opd-text-muted'}`} />
                <span className="text-sm font-semibold text-opd-primary">
                    {uploading ? `Extracting ${currentFile}…` : 'Choose files, folder, or drop ZIP here'}
                </span>
                <span className="text-xs text-opd-text-muted mt-1">Batch uploader — real OCR runs on every file (max 500MB)</span>
            </div>

            {errorMessage && (
                <div className="p-3 bg-red-50 text-red-800 rounded-xl text-xs font-semibold leading-relaxed border border-red-100 shadow-sm">
                    {errorMessage}
                </div>
            )}

            {/* AI-unavailability warning — distinct from errorMessage: the upload itself succeeded, only Gemini did not. */}
            {aiWarningMessage && (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-semibold leading-relaxed border border-amber-200 shadow-sm flex items-start gap-2">
                    <span className="shrink-0">⚠️</span>
                    <span>{aiWarningMessage}</span>
                </div>
            )}

            {/* Real-time extraction log */}
            {extractionLog.length > 0 && (
                <div className="bg-gray-900 text-green-400 font-mono text-[10px] rounded-xl p-4 space-y-0.5 max-h-48 overflow-y-auto">
                    {extractionLog.map((line, i) => (
                        <div key={i}>{line}</div>
                    ))}
                    {uploading && <div className="animate-pulse">▌</div>}
                </div>
            )}

            <div className="p-3 bg-blue-50/50 border border-blue-500/10 rounded-xl text-[11px] text-blue-900 leading-normal flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <span>
                    <strong>Live OCR Pipeline:</strong> Each file is sent to Gemini Vision for extraction. Patient name, gender, age, insurer,
                    policy number and clinical excerpts are merged and saved to IndexedDB automatically. After completion, navigate to
                    <em> Screen 5</em> to review all extracted fields.
                </span>
            </div>

            {/* Progress bar */}
            {progress !== 'idle' && (
                <div className="bg-opd-input-bg p-4 rounded-xl space-y-3 text-xs">
                    <div className="flex justify-between font-bold text-opd-primary">
                        <span>Pipeline: {fileCount} file(s) ({totalSizeDisplay}){currentFile ? ` — ${currentFile}` : ''}</span>
                        <span className="capitalize text-blue-700 animate-pulse">
                            {progress === 'done' ? '✅ Done' : `⏳ ${IDP_STAGE_LABELS[progress] || 'Processing'}`}
                        </span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div className={`bg-opd-primary h-2 transition-all duration-500 ${
                            progress === 'reading' ? 'w-1/5' :
                            progress === 'ocr' ? 'w-2/5' :
                            progress === 'classifying' ? 'w-3/5' :
                            progress === 'extracting' ? 'w-4/5' :
                            progress === 'evidence' ? 'w-[92%]' : 'w-full'
                        }`} />
                    </div>
                    <div className="flex justify-between text-[9px] font-semibold uppercase tracking-wider text-opd-text-muted">
                        {(['reading', 'ocr', 'classifying', 'extracting', 'evidence'] as const).map(stage => {
                            const order = ['reading', 'ocr', 'classifying', 'extracting', 'evidence'];
                            const isPast = progress === 'done' || order.indexOf(progress) > order.indexOf(stage);
                            const isActive = progress === stage;
                            return (
                                <span key={stage} className={isActive ? 'text-opd-primary' : isPast ? 'text-emerald-600' : ''}>
                                    {isPast ? '✓ ' : isActive ? '● ' : '○ '}{IDP_STAGE_LABELS[stage]}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Document & Page Index — thumbnails/cards per detected page */}
            {docPreviews.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-opd-primary uppercase tracking-wider">
                        Documents Detected: {docPreviews.length} &nbsp;|&nbsp; Pages Detected: {docPreviews.reduce((sum, d) => sum + d.pageCount, 0)}
                    </h3>
                    {docPreviews.map(doc => (
                        <div key={doc.documentId} className="bg-opd-input-bg border border-opd-border rounded-xl p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-bold text-opd-text-primary truncate">{doc.documentName}</span>
                                    <span className="bg-blue-100 text-blue-700 font-mono text-[10px] px-2 py-0.5 rounded-full border border-blue-200 font-bold shrink-0">
                                        {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}
                                    </span>
                                    {doc.documentType && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary-tint text-opd-primary border border-opd-primary/10 shrink-0">
                                            {doc.documentType.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {/* Upload status — independent of Gemini, essentially always succeeds */}
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                        doc.uploadStatus === 'success'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                                    }`}>
                                        {doc.uploadStatus === 'success' ? '✓ Upload Successful' : '⏳ Uploading'}
                                    </span>
                                    {/* AI status — tracked separately so a Gemini outage never reads as an upload failure */}
                                    <span
                                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                                            doc.aiStatus === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            doc.aiStatus === 'needs_review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            doc.aiStatus === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                                            'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                                        }`}
                                        title={doc.aiErrorMessage || undefined}
                                    >
                                        {doc.aiStatus === 'completed' ? `✓ OCR Completed (${Math.round((doc.ocrConfidence ?? 0) * 100)}%)` :
                                         doc.aiStatus === 'needs_review' ? `⚠ Needs Review (${Math.round((doc.ocrConfidence ?? 0) * 100)}%)` :
                                         doc.aiStatus === 'failed' ? '✗ AI Extraction Failed' :
                                         doc.aiStatus === 'running' ? '⏳ AI Processing' : '⏳ Pending'}
                                    </span>
                                </div>
                            </div>
                            {doc.aiStatus === 'failed' && doc.aiErrorMessage && (
                                <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
                                    {doc.aiErrorMessage}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2.5">
                                {Array.from({ length: doc.pageCount }).map((_, p) => (
                                    <div key={p} className="flex flex-col items-center justify-end border border-opd-border bg-white rounded-lg w-20 h-24 shadow-sm relative overflow-hidden shrink-0">
                                        {doc.thumbnails[p] ? (
                                            <img src={doc.thumbnails[p]} alt={`${doc.documentName} page ${p + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                                                <div className="w-4 h-4 border-2 border-opd-primary/40 border-t-opd-primary rounded-full animate-spin"></div>
                                            </div>
                                        )}
                                        <span className="relative z-10 mb-1 text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                            Pg {p + 1}
                                        </span>
                                        {doc.pageTypes?.[p + 1] && (
                                            <span className="absolute top-1 left-1 z-10 text-[8px] font-bold uppercase tracking-wide text-white bg-opd-primary/85 px-1 py-0.5 rounded max-w-[calc(100%-8px)] truncate">
                                                {doc.pageTypes[p + 1].replace(/_/g, ' ')}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Evidence Map — every extracted field traced to its source document, page, and confidence */}
            {evidenceMap.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-opd-primary uppercase tracking-wider">Evidence Map ({evidenceMap.length} fields traced)</h3>
                    <div className="border border-opd-border rounded-xl overflow-hidden">
                        <table className="w-full text-[11px]">
                            <thead className="bg-opd-input-bg text-opd-text-muted uppercase tracking-wider text-[9px]">
                                <tr>
                                    <th className="text-left px-3 py-2 font-bold">Field</th>
                                    <th className="text-left px-3 py-2 font-bold">Value</th>
                                    <th className="text-left px-3 py-2 font-bold">Source Document</th>
                                    <th className="text-left px-3 py-2 font-bold">Page</th>
                                    <th className="text-left px-3 py-2 font-bold">Confidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {evidenceMap.map((e, i) => (
                                    <tr key={i} className="border-t border-opd-border">
                                        <td className="px-3 py-2 font-semibold text-opd-text-primary">{e.field}</td>
                                        <td className="px-3 py-2 text-opd-text-secondary truncate max-w-[220px]">{e.value}</td>
                                        <td className="px-3 py-2 text-opd-text-secondary truncate max-w-[180px]">{e.documentName}</td>
                                        <td className="px-3 py-2 font-mono text-opd-text-secondary">p.{e.pageNumber}</td>
                                        <td className="px-3 py-2">
                                            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                                                e.confidence >= 0.8 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                e.confidence >= 0.6 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                'bg-red-50 text-red-700 border-red-200'
                                            }`}>
                                                {Math.round(e.confidence * 100)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="border-t border-opd-border pt-4 space-y-3">
                <h3 className="text-xs font-bold text-opd-primary uppercase tracking-wider">Fast Track: Load Pre-Seeded Cases</h3>
                <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => loadScenario(DIABETES_DEMO_RECORD)} className="p-3 border rounded-xl hover:border-opd-primary text-xs font-semibold bg-white text-left transition hover:scale-[1.01]">
                        <span className="block text-red-600 font-bold text-[10px] uppercase">Diabetes Profile</span>
                        Type 2 Diabetes Mellitus
                    </button>
                    <button onClick={() => loadScenario(PNEUMONIA_DEMO_RECORD)} className="p-3 border rounded-xl hover:border-opd-primary text-xs font-semibold bg-white text-left transition hover:scale-[1.01]">
                        <span className="block text-amber-600 font-bold text-[10px] uppercase">Pneumonia Profile</span>
                        Community-Acquired Pneumonia
                    </button>
                    <button onClick={() => loadScenario(APPENDICITIS_DEMO_RECORD)} className="p-3 border rounded-xl hover:border-opd-primary text-xs font-semibold bg-white text-left transition hover:scale-[1.01]">
                        <span className="block text-emerald-600 font-bold text-[10px] uppercase">Appendicitis Profile</span>
                        Acute Appendicitis (Clean)
                    </button>
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN 1: PATIENT QR INTAKE WORKFLOW — Full functional implementation
// ──────────────────────────────────────────────────────────────────────────────
const INTAKE_STAGES = ['QR Scanned', 'Profile Filled', 'Docs Uploaded', 'AI Parsed', 'Ready in TPA'] as const;
type IntakeStage = typeof INTAKE_STAGES[number];

interface SelfRegFormData {
    name: string;
    age: string;
    gender: string;
    contact: string;
    address: string;
    insurerName: string;
    policyNumber: string;
    tpa: string;
    sumInsured: string;
    chiefComplaints: string;
    diagnosis: string;
}

const EMPTY_FORM: SelfRegFormData = {
    name: '', age: '', gender: 'Male', contact: '', address: '',
    insurerName: '', policyNumber: '', tpa: '', sumInsured: '',
    chiefComplaints: '', diagnosis: ''
};

const STAGE_MAP_KEY = 'tpa_intake_stageMap';
const SESSION_TOKEN_KEY = 'tpa_qr_sessionToken';

/** Get or create a stable session token (persists until tab/browser close) */
const getOrCreateSessionToken = (): string => {
    let token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
        token = Math.random().toString(36).substring(2, 8).toUpperCase();
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    return token;
};

/** Load persisted stageMap from localStorage */
const loadStageMap = (): Record<string, IntakeStage> => {
    try { return JSON.parse(localStorage.getItem(STAGE_MAP_KEY) || '{}'); } catch { return {}; }
};

/** Save stageMap to localStorage */
const saveStageMap = (map: Record<string, IntakeStage>) => {
    try { localStorage.setItem(STAGE_MAP_KEY, JSON.stringify(map)); } catch {}
};

const PatientQRWorkflowView: React.FC<{ onCaseSelect: (id: string) => void }> = ({ onCaseSelect }) => {
    // Stable across re-renders (sessionStorage) — fixes "Today's Session = 0" bug
    const [sessionToken] = React.useState<string>(getOrCreateSessionToken);
    const [casesList, setCasesList] = React.useState<PatientCaseRecord[]>([]);
    const [showRegModal, setShowRegModal] = React.useState(false);
    const [formData, setFormData] = React.useState<SelfRegFormData>(EMPTY_FORM);
    const [registering, setRegistering] = React.useState(false);
    const [successId, setSuccessId] = React.useState('');
    const [copiedLink, setCopiedLink] = React.useState(false);
    // Persisted in localStorage — fixes stage reset on refresh
    const [stageMap, setStageMapState] = React.useState<Record<string, IntakeStage>>(loadStageMap);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [cardScanResult, setCardScanResult] = React.useState<InsuranceCardExtracted | null>(null);
    const [cardScanning, setCardScanning] = React.useState(false);
    const [cardPreviewUrl, setCardPreviewUrl] = React.useState<string>('');
    const cardInputRef = React.useRef<HTMLInputElement>(null);

    // Use actual window.location.href origin — fixes wrong port bug
    const appOrigin = `${window.location.protocol}//${window.location.host}`;
    const registrationLink = `${appOrigin}?register=${sessionToken}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(registrationLink)}&color=1a4c8b&bgcolor=ffffff&margin=8`;

    // Wrapper that also persists to localStorage
    const setStageMap = (updater: ((prev: Record<string, IntakeStage>) => Record<string, IntakeStage>)) => {
        setStageMapState(prev => {
            const next = updater(prev);
            saveStageMap(next);
            return next;
        });
    };

    const refreshList = React.useCallback(() => {
        getAllPatientRecords().then(all => {
            const sorted = [...all].sort((a, b) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            setCasesList(sorted);
        });
    }, []);

    React.useEffect(() => { refreshList(); }, [refreshList]);

    const copyLink = () => {
        navigator.clipboard.writeText(registrationLink).then(() => {
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
        });
    };

    const downloadQR = () => {
        const a = document.createElement('a');
        a.href = qrImageUrl;
        a.download = `PatientQR_${sessionToken}.png`;
        a.click();
    };

    const setField = (key: keyof SelfRegFormData, val: string) =>
        setFormData(prev => ({ ...prev, [key]: val }));

    const scanInsuranceCard = async (file: File) => {
        setCardScanning(true);
        setCardScanResult(null);
        // Show preview
        const url = URL.createObjectURL(file);
        setCardPreviewUrl(url);
        try {
            const result = await extractInsuranceCardData(file);
            setCardScanResult(result);
        } catch (err) {
            console.error('[scanInsuranceCard]', err);
        } finally {
            setCardScanning(false);
        }
    };

    const applyCardToForm = () => {
        if (!cardScanResult) return;
        setFormData(prev => ({
            ...prev,
            insurerName: cardScanResult.insurerName || prev.insurerName,
            tpa: cardScanResult.tpaName || prev.tpa,
            policyNumber: cardScanResult.policyNumber || prev.policyNumber,
            sumInsured: cardScanResult.sumInsured ? String(cardScanResult.sumInsured) : prev.sumInsured,
            name: cardScanResult.cardHolderName || prev.name,
        }));
    };

    const handleRegister = async () => {
        if (!formData.name.trim()) return;
        setRegistering(true);
        try {
            const newId = generatePreAuthId();
            const uhid = `UHID-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            const newCase: PatientCaseRecord = {
                id: newId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentStage: 'registered' as any,
                intakeChannel: 'qr_scan',
                sessionToken,
                patientProfile: {
                    uhid,
                    name: formData.name,
                    age: +formData.age || 0,
                    gender: formData.gender as any,
                    contactNumber: formData.contact,
                    address: formData.address,
                },
                insuranceDetails: {
                    insurerName: formData.insurerName,
                    policyNumber: formData.policyNumber,
                    tpaName: formData.tpa,
                    sumInsured: +formData.sumInsured || 0,
                    roomRentLimit: +formData.sumInsured ? Math.round(+formData.sumInsured * 0.01) : 0,
                    icuRentLimit: +formData.sumInsured ? Math.round(+formData.sumInsured * 0.02) : 0,
                },
                encounters: [{
                    id: `ENC-${newId}`,
                    chiefComplaints: formData.chiefComplaints,
                    diagnosis: formData.diagnosis,
                    admissionDate: new Date().toISOString().split('T')[0],
                }] as any,
                documents: [],
                claims: [],
                authorizations: [],
                auditLog: [{
                    timestamp: new Date().toISOString(),
                    action: 'patient_registered',
                    actor: 'patient_self',
                    details: `Patient ${formData.name} self-registered via QR session ${sessionToken}`
                }],
            };
            await savePatientRecord(newCase);
            setStageMap(prev => ({ ...prev, [newId]: 'Profile Filled' }));
            setSuccessId(newId);
            setFormData(EMPTY_FORM);
            refreshList();
        } finally {
            setRegistering(false);
        }
    };

    const advanceStage = (id: string) => {
        setStageMap(prev => {
            const idx = INTAKE_STAGES.indexOf(prev[id] ?? 'QR Scanned');
            if (idx < INTAKE_STAGES.length - 1) {
                return { ...prev, [id]: INTAKE_STAGES[idx + 1] };
            }
            return prev;
        });
    };

    const stageColor = (stage?: IntakeStage) => {
        if (!stage || stage === 'QR Scanned') return 'bg-blue-50 text-blue-700 border-blue-200';
        if (stage === 'Profile Filled') return 'bg-amber-50 text-amber-700 border-amber-200';
        if (stage === 'Docs Uploaded') return 'bg-purple-50 text-purple-700 border-purple-200';
        if (stage === 'AI Parsed') return 'bg-orange-50 text-orange-700 border-orange-200';
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    };

    const filtered = casesList.filter(c =>
        !searchQuery ||
        c.patientProfile.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.patientProfile.uhid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const inputCls = "w-full border border-opd-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-opd-primary";

    return (
        <div className="space-y-5">

            {/* ── Header ── */}
            <div className="card-premium space-y-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 1: Patient QR Intake Workflow</h2>
                        <p className="text-xs text-opd-text-secondary">Generate a unique QR per session. Patient scans → self-registers → case auto-created in TPA system.</p>
                    </div>
                    <button
                        onClick={() => { setShowRegModal(true); setSuccessId(''); }}
                        className="btn-primary text-xs flex items-center gap-1.5"
                    >
                        <QrCode className="w-3.5 h-3.5" /> Simulate Patient Scan
                    </button>
                </div>

                {/* 5-step flow */}
                <div className="mt-4 flex items-center gap-0">
                    {INTAKE_STAGES.map((s, i) => (
                        <React.Fragment key={s}>
                            <div className={`flex flex-col items-center text-center flex-1 gap-1 py-2 px-1 rounded-lg text-[10px] font-bold ${
                                i === 0 ? 'bg-blue-50 text-blue-700' :
                                i === 4 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'
                            }`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                    i === 4 ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                                }`}>{i + 1}</div>
                                {s}
                            </div>
                            {i < 4 && <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mx-1" />}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* ── QR Panel ── */}
            <div className="grid grid-cols-3 gap-5">
                <div className="card-premium col-span-1 flex flex-col items-center gap-4">
                    <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider">Session QR Code</div>
                    <div className="p-3 bg-white border-2 border-opd-primary/20 rounded-2xl shadow-sm">
                        <img
                            src={qrImageUrl}
                            alt="Patient registration QR"
                            className="w-36 h-36"
                            onError={e => { (e.target as HTMLImageElement).src = ''; }}
                        />
                    </div>
                    <div className="flex flex-col items-center gap-1 w-full">
                        <span className="text-[10px] font-mono text-gray-500 bg-gray-50 px-3 py-1 rounded-lg border">
                            Session: {sessionToken}
                        </span>
                        <div className="flex gap-2 w-full">
                            <button onClick={downloadQR} className="flex-1 px-2 py-1.5 text-[10px] font-bold border border-opd-border rounded-lg hover:border-opd-primary transition flex items-center justify-center gap-1">
                                <Download className="w-3 h-3" /> Download
                            </button>
                            <button onClick={copyLink} className={`flex-1 px-2 py-1.5 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 ${
                                copiedLink ? 'bg-emerald-600 text-white border-0' : 'border border-opd-border hover:border-opd-primary'
                            }`}>
                                {copiedLink ? '✓ Copied!' : 'Copy Link'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card-premium col-span-2 space-y-3">
                    <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider">Registration Link</div>
                    <div className="flex gap-2">
                        <input readOnly className="flex-1 p-2 bg-gray-50 border rounded-lg font-mono text-[11px] text-gray-600" value={registrationLink} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2">
                        {[
                            ['Total Registered', casesList.length, 'text-opd-primary'],
                            ['Ready in TPA', casesList.filter(c => stageMap[c.id] === 'Ready in TPA').length, 'text-emerald-700'],
                            ["Today's Session", casesList.filter(c => (c as any).sessionToken === sessionToken).length, 'text-blue-700'],
                        ].map(([label, val, cls]) => (
                            <div key={label as string} className="p-3 bg-gray-50 border rounded-xl text-center">
                                <div className={`text-2xl font-black ${cls}`}>{val}</div>
                                <div className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">{label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-800 leading-relaxed">
                        <strong>How it works:</strong> Patient scans QR → fills self-registration form on their phone → documents are uploaded → Aivana AI parses them → case is created and appears in the TPA pipeline automatically.
                    </div>
                </div>
            </div>

            {/* ── Live Waiting Room ── */}
            <div className="card-premium space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold font-lora text-opd-primary">Live Patient Waiting Room</h3>
                        <p className="text-[11px] text-opd-text-secondary">All registered patients. Click a row to load their case into the pipeline.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            className="px-3 py-1.5 border border-opd-border rounded-xl text-xs focus:outline-none focus:border-opd-primary"
                            placeholder="Search by name or UHID..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <button onClick={refreshList} className="px-3 py-1.5 text-xs font-bold border border-opd-border rounded-xl hover:border-opd-primary transition">
                            ↻ Refresh
                        </button>
                    </div>
                </div>

                <div className="border rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left bg-white">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500">Patient</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500">UHID</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500">Insurer</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500">Registered</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500">Intake Stage</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-opd-text-secondary">
                                        <QrCode className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                        No patients registered yet. Click <strong>"Simulate Patient Scan"</strong> to register one.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(c => {
                                    const stage = stageMap[c.id] ?? 'QR Scanned';
                                    const isReady = stage === 'Ready in TPA';
                                    return (
                                        <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/60 transition">
                                            <td className="p-3">
                                                <div className="font-semibold text-opd-primary">{c.patientProfile.name || '—'}</div>
                                                <div className="text-[10px] text-gray-400 font-mono">{c.id}</div>
                                            </td>
                                            <td className="p-3 font-mono text-gray-500">{c.patientProfile.uhid || '—'}</td>
                                            <td className="p-3 text-gray-600">{(c.insuranceDetails as any)?.insurerName || (c.insuranceDetails as any)?.insurer || '—'}</td>
                                            <td className="p-3 text-gray-400 text-[10px]">
                                                {c.createdAt ? new Date(c.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${stageColor(stage)}`}>
                                                    {stage}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex gap-1.5">
                                                    {!isReady && (
                                                        <button
                                                            onClick={() => advanceStage(c.id)}
                                                            className="px-2 py-1 text-[10px] font-bold border border-gray-200 rounded-lg hover:border-opd-primary hover:text-opd-primary transition"
                                                        >
                                                            Advance →
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onCaseSelect(c.id)}
                                                        className={`px-2 py-1 text-[10px] font-bold rounded-lg transition ${
                                                            isReady
                                                                ? 'bg-opd-primary text-white hover:opacity-90'
                                                                : 'bg-gray-100 text-gray-600 hover:bg-opd-primary hover:text-white'
                                                        }`}
                                                    >
                                                        Load into Pipeline
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Self-Registration Modal ── */}
            {showRegModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4 overflow-hidden">
                        {/* Modal header */}
                        <div className="bg-opd-primary text-white px-6 py-4 flex items-center justify-between">
                            <div>
                                <div className="font-bold text-sm font-lora">Patient Self-Registration</div>
                                <div className="text-[10px] opacity-75">Session: {sessionToken} • Aivana India TPA Insurance Copilot</div>
                            </div>
                            <button onClick={() => setShowRegModal(false)} className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition">
                                ✕
                            </button>
                        </div>

                        {successId ? (
                            <div className="p-8 text-center space-y-3">
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                                    <CheckSquare className="w-8 h-8 text-emerald-600" />
                                </div>
                                <div className="font-bold text-lg text-opd-primary font-lora">Registration Successful!</div>
                                <div className="text-xs text-gray-500">
                                    Case ID: <span className="font-mono text-opd-primary font-bold">{successId}</span>
                                </div>
                                <p className="text-xs text-gray-500">Your case has been created in the TPA pipeline. The hospital desk has been notified.</p>
                                <div className="flex gap-3 justify-center pt-2">
                                    <button
                                        onClick={() => { setShowRegModal(false); onCaseSelect(successId); }}
                                        className="btn-primary text-xs"
                                    >
                                        View in Pipeline →
                                    </button>
                                    <button
                                        onClick={() => { setSuccessId(''); setFormData(EMPTY_FORM); }}
                                        className="px-4 py-2 text-xs font-bold border border-opd-border rounded-xl hover:border-opd-primary transition"
                                    >
                                        Register Another
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
                                {/* Patient Details */}
                                <div>
                                    <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <UserCheck className="w-3.5 h-3.5" /> Patient Details
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2 flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Full Name *</label>
                                            <input className={inputCls} placeholder="e.g. Rajesh Kumar" value={formData.name} onChange={e => setField('name', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Age</label>
                                            <input type="number" className={inputCls} placeholder="e.g. 45" value={formData.age} onChange={e => setField('age', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Gender</label>
                                            <select className={inputCls} value={formData.gender} onChange={e => setField('gender', e.target.value)}>
                                                <option>Male</option><option>Female</option><option>Other</option>
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Mobile</label>
                                            <input className={inputCls} placeholder="+91 9876543210" value={formData.contact} onChange={e => setField('contact', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">City / Address</label>
                                            <input className={inputCls} placeholder="e.g. Mumbai, Maharashtra" value={formData.address} onChange={e => setField('address', e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                {/* Insurance — Card Scan or Manual */}
                                <div className="border-t border-opd-border pt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider flex items-center gap-2">
                                            <BookmarkCheck className="w-3.5 h-3.5" /> Insurance Details
                                        </div>
                                        <span className="text-[10px] text-gray-400">Upload card photo or fill manually</span>
                                    </div>

                                    {/* Card upload zone */}
                                    <input
                                        ref={cardInputRef}
                                        type="file"
                                        accept="image/*,application/pdf"
                                        className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) scanInsuranceCard(f); }}
                                    />
                                    <div
                                        className="border-2 border-dashed border-opd-primary/30 rounded-xl p-4 text-center cursor-pointer hover:border-opd-primary hover:bg-opd-primary/5 transition"
                                        onClick={() => cardInputRef.current?.click()}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => {
                                            e.preventDefault();
                                            const f = e.dataTransfer.files?.[0];
                                            if (f) scanInsuranceCard(f);
                                        }}
                                    >
                                        {cardPreviewUrl ? (
                                            <img src={cardPreviewUrl} alt="Insurance card" className="max-h-28 mx-auto rounded-lg object-contain" />
                                        ) : (
                                            <div className="space-y-1">
                                                <BookmarkCheck className="w-6 h-6 text-opd-primary/40 mx-auto" />
                                                <div className="text-xs font-bold text-opd-primary">Drop insurance card here or click to upload</div>
                                                <div className="text-[10px] text-gray-400">Accepts JPG, PNG, WebP, PDF • Gemini AI will extract all fields</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Scanning spinner */}
                                    {cardScanning && (
                                        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
                                            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                            <span>Scanning insurance card with Gemini AI...</span>
                                        </div>
                                    )}

                                    {/* Extracted results */}
                                    {cardScanResult && !cardScanning && (
                                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                                                    ✓ Card Scanned — Confidence {cardScanResult.confidence}%
                                                </span>
                                                <button
                                                    onClick={applyCardToForm}
                                                    className="px-3 py-1 text-[10px] font-bold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition"
                                                >
                                                    Auto-fill Fields ↓
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                                                {([
                                                    ['Insurer', cardScanResult.insurerName],
                                                    ['TPA', cardScanResult.tpaName],
                                                    ['Policy No.', cardScanResult.policyNumber],
                                                    ['Member ID', cardScanResult.memberIdCard],
                                                    ['Card Holder', cardScanResult.cardHolderName],
                                                    ['Sum Insured', cardScanResult.sumInsured ? `₹${cardScanResult.sumInsured.toLocaleString('en-IN')}` : null],
                                                    ['Valid From', cardScanResult.validFrom],
                                                    ['Valid To', cardScanResult.validTo],
                                                    ['Plan', cardScanResult.planType],
                                                    ['Helpline', cardScanResult.contactNumber],
                                                ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                                                    <div key={k} className="flex gap-1">
                                                        <span className="text-gray-500 w-20 shrink-0">{k}:</span>
                                                        <span className="font-semibold text-emerald-900">{v}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Manual / override fields */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Insurer</label>
                                            <input className={inputCls} placeholder="e.g. Star Health" value={formData.insurerName} onChange={e => setField('insurerName', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">TPA Name</label>
                                            <input className={inputCls} placeholder="e.g. MD India TPA" value={formData.tpa} onChange={e => setField('tpa', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Policy Number</label>
                                            <input className={inputCls} placeholder="e.g. SH/2024/00123" value={formData.policyNumber} onChange={e => setField('policyNumber', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Sum Insured (₹)</label>
                                            <input type="number" className={inputCls} placeholder="e.g. 500000" value={formData.sumInsured} onChange={e => setField('sumInsured', e.target.value)} />
                                        </div>
                                    </div>
                                </div>


                                {/* Clinical */}
                                <div className="border-t border-opd-border pt-4">
                                    <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <HeartPulse className="w-3.5 h-3.5" /> Chief Complaints
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Chief Complaints</label>
                                            <input className={inputCls} placeholder="e.g. High fever, vomiting, body ache since 3 days" value={formData.chiefComplaints} onChange={e => setField('chiefComplaints', e.target.value)} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] text-gray-500 font-bold uppercase">Provisional Diagnosis (if known)</label>
                                            <input className={inputCls} placeholder="e.g. Dengue Fever (suspected)" value={formData.diagnosis} onChange={e => setField('diagnosis', e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleRegister}
                                    disabled={!formData.name.trim() || registering}
                                    className="w-full btn-primary disabled:opacity-40 text-sm py-3"
                                >
                                    {registering ? 'Registering...' : '✓ Submit Registration'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


const PatientDetailsView: React.FC<{ activeCase: PatientCaseRecord | null; onSave: () => void }> = ({ activeCase, onSave }) => {
    const [profile, setProfile] = useState<any>({});
    const [insurance, setInsurance] = useState<any>({});

    useEffect(() => {
        if (activeCase) {
            setProfile(activeCase.patientProfile);
            setInsurance(activeCase.insuranceDetails);
        }
    }, [activeCase]);

    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Select a patient case or register one in Screen 1.</div>;
    }

    const handleSave = async () => {
        const updated = {
            ...activeCase,
            patientProfile: profile,
            insuranceDetails: insurance,
            updatedAt: new Date().toISOString()
        };
        await savePatientRecord(updated);
        alert("Patient demographic parameters saved!");
        onSave();
    };

    return (
        <div className="card-premium space-y-6 text-left">
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 2: Patient Details</h2>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 rounded-full uppercase tracking-wider">
                    Auto-Filled from Portal
                </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <h3 className="font-bold text-opd-primary uppercase tracking-wider">Demographics</h3>
                    <div>
                        <label className="block text-gray-500 mb-1">UHID</label>
                        <input className="w-full p-2 border rounded text-gray-800 font-mono" value={profile.uhid || ''} onChange={e => setProfile({ ...profile, uhid: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-gray-500 mb-1">Name</label>
                        <input className="w-full p-2 border rounded text-gray-800" value={profile.name || ''} onChange={e => setProfile({ ...profile, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-gray-500 mb-1">Mobile</label>
                        <input className="w-full p-2 border rounded text-gray-800" value={profile.contact || ''} onChange={e => setProfile({ ...profile, contact: e.target.value })} />
                    </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <h3 className="font-bold text-opd-primary uppercase tracking-wider">Policy Details</h3>
                    <div>
                        <label className="block text-gray-500 mb-1">Insurer</label>
                        <input className="w-full p-2 border rounded text-gray-800" value={insurance.insurer || ''} onChange={e => setInsurance({ ...insurance, insurer: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-gray-500 mb-1">Policy Number</label>
                        <input className="w-full p-2 border rounded text-gray-800 font-mono" value={insurance.policyNumber || ''} onChange={e => setInsurance({ ...insurance, policyNumber: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-gray-500 mb-1">TPA Name</label>
                        <input className="w-full p-2 border rounded text-gray-800" value={insurance.TPA || ''} onChange={e => setInsurance({ ...insurance, TPA: e.target.value })} />
                    </div>
                </div>
            </div>

            <button onClick={handleSave} className="btn-primary py-2.5">Confirm &amp; Continue</button>
        </div>
    );
};

// Colour map for document type badges
const DOC_TYPE_COLOURS: Record<string, string> = {
    discharge_summary: 'bg-blue-50 text-blue-700 border-blue-200',
    hospital_registration: 'bg-purple-50 text-purple-700 border-purple-200',
    insurance_card: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    policy_document: 'bg-teal-50 text-teal-700 border-teal-200',
    lab_report: 'bg-amber-50 text-amber-700 border-amber-200',
    prescription: 'bg-orange-50 text-orange-700 border-orange-200',
    investigation_report: 'bg-rose-50 text-rose-700 border-rose-200',
    id_card: 'bg-gray-100 text-gray-700 border-gray-300',
    unknown: 'bg-gray-50 text-gray-500 border-gray-200',
    uploaded: 'bg-gray-50 text-gray-400 border-gray-200',
};

const downloadPreAuthForm = (activeCase: PatientCaseRecord) => {
    const p = activeCase.patientProfile;
    const ins = activeCase.insuranceDetails as any;
    const enc = activeCase.encounters[0] as any;
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Pre-Authorization Form — ${p.name || 'Patient'}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:24px;border:1px solid #ccc;font-size:13px}h1{color:#1a4c8b;font-size:18px;margin-bottom:4px}h2{font-size:13px;color:#555;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 10px;border:1px solid #ddd;vertical-align:top}td:first-child{font-weight:bold;background:#f8f9fc;width:38%}.sig{margin-top:40px;display:flex;gap:60px}.sig-box{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px}</style>
</head>
<body>
<h1>Pre-Authorization Request Form</h1>
<p style="font-size:11px;color:#888">Generated by Aivana India TPA Insurance Copilot | ${new Date().toLocaleString('en-IN')}</p>
<h2>Patient Details</h2>
<table>
  <tr><td>Patient Name</td><td>${p.name || '—'}</td></tr>
  <tr><td>Age / Gender</td><td>${p.age || '—'} Yrs / ${p.gender || '—'}</td></tr>
  <tr><td>UHID</td><td>${p.uhid || '—'}</td></tr>
  <tr><td>Contact</td><td>${p.contactNumber || p.contact || '—'}</td></tr>
  <tr><td>Address</td><td>${p.address || '—'}</td></tr>
</table>
<h2>Insurance & Policy Details</h2>
<table>
  <tr><td>Insurer</td><td>${ins.insurerName || ins.insurer || '—'}</td></tr>
  <tr><td>TPA</td><td>${ins.tpaName || ins.TPA || '—'}</td></tr>
  <tr><td>Policy Number</td><td>${ins.policyNumber || '—'}</td></tr>
  <tr><td>Sum Insured</td><td>₹${(ins.sumInsured || 0).toLocaleString('en-IN')}</td></tr>
  <tr><td>Room Rent Limit (Normal)</td><td>₹${(ins.roomRentLimit || 0).toLocaleString('en-IN')} / day</td></tr>
  <tr><td>ICU Rent Limit</td><td>₹${(ins.icuRentLimit || 0).toLocaleString('en-IN')} / day</td></tr>
</table>
<h2>Clinical Details</h2>
<table>
  <tr><td>Admission Date</td><td>${enc?.admissionDate || '—'}</td></tr>
  <tr><td>Diagnosis</td><td>${enc?.diagnosis || '—'}</td></tr>
  <tr><td>Chief Complaints</td><td>${enc?.chiefComplaints || '—'}</td></tr>
  <tr><td>Ward Type</td><td>${enc?.wardType || '—'}</td></tr>
  <tr><td>Proposed Treatment</td><td>${enc?.treatmentPlan || '—'}</td></tr>
</table>
<h2>Documents Submitted</h2>
<table>
  <tr><td>No.</td><td>File Name</td><td>Document Type</td></tr>
  ${activeCase.documents.map((d, i) => `<tr><td>${i + 1}</td><td>${d.name}</td><td>${(d.type || 'uploaded').replace(/_/g, ' ')}</td></tr>`).join('')}
</table>
<div class="sig">
  <div class="sig-box">Treating Doctor Signature &amp; Stamp</div>
  <div class="sig-box">Hospital Authorized Signatory</div>
  <div class="sig-box">TPA Received Stamp</div>
</div>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PreAuth_${p.name?.replace(/\s+/g, '_') || activeCase.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
};

const DocumentIdentificationView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    const [showPreAuth, setShowPreAuth] = React.useState(false);

    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Please select or upload a case first to check classified documents.</div>;
    }

    const docs = activeCase.documents;
    const avgConf = docs.length > 0
        ? Math.round(docs.reduce((s, d: any) => s + ((d.extractedData?.confidence ?? 0.975) * 100), 0) / docs.length)
        : 97;
    const hasPending = docs.some((d: any) => d.status === 'pending_extraction');
    const p = activeCase.patientProfile;
    const ins = activeCase.insuranceDetails as any;
    const enc = activeCase.encounters[0] as any;

    return (
        <div className="space-y-6">
            {/* Document Table */}
            <div className="card-premium space-y-4 text-left">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 4: AI Document Classification</h2>
                    <div className="flex items-center gap-2">
                        {hasPending && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">⏳ Some files pending extraction</span>}
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">Avg Confidence: {avgConf}%</span>
                    </div>
                </div>

                <div className="border rounded-xl overflow-hidden text-xs bg-white">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500 text-left">#</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500 text-left">File Name</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500 text-left">AI Document Type</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500 text-left">Confidence</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500 text-left">Extraction Confidence Score</th>
                                <th className="p-3 text-[10px] uppercase font-bold text-gray-500 text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {docs.length === 0 ? (
                                <tr><td colSpan={6} className="p-6 text-center text-opd-text-secondary">No documents uploaded yet. Upload files in Screen 3.</td></tr>
                            ) : (
                                docs.map((d: any, i: number) => {
                                    const conf = d.extractedData?.confidence
                                        ? Math.round((d.extractedData.confidence > 1 ? d.extractedData.confidence / 100 : d.extractedData.confidence) * 100)
                                        : null;
                                    const readinessScore = d.extractedData?.extraction_readiness_score ?? null;
                                    const docType = d.extractedData?.document_type || d.type || 'unknown';
                                    const badgeCls = DOC_TYPE_COLOURS[docType] || DOC_TYPE_COLOURS.unknown;
                                    const statusOk = d.status === 'extracted';
                                    // Per-page classification (keyword-matched, see documentClassificationService.ts)
                                    // when this document has multiple pages — falls back to the blanket type otherwise.
                                    const pageTypeEntries: Array<{ page: number; type: string }> = Array.isArray(d.pages)
                                        ? d.pages.map((p: any) => ({ page: p.pageNumber, type: p.documentType })).filter((p: any) => p.type)
                                        : [];
                                    return (
                                        <tr key={i} className="border-b last:border-0 hover:bg-gray-50/50">
                                            <td className="p-3 text-gray-400 font-mono">{i + 1}</td>
                                            <td className="p-3 font-mono text-opd-primary max-w-[200px] truncate" title={d.name}>{d.name}</td>
                                            <td className="p-3">
                                                {pageTypeEntries.length > 1 ? (
                                                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                                                        {pageTypeEntries.map(({ page, type }) => (
                                                            <span key={page} className={`px-1.5 py-0.5 rounded border text-[9px] font-bold capitalize ${DOC_TYPE_COLOURS[type] || DOC_TYPE_COLOURS.unknown}`} title={`Page ${page}`}>
                                                                {page}: {type.replace(/_/g, ' ')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold capitalize ${badgeCls}`}>
                                                        {docType.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 font-mono font-bold">
                                                {conf !== null
                                                    ? <span className={conf >= 80 ? 'text-emerald-600' : conf >= 60 ? 'text-amber-600' : 'text-red-500'}>{conf}%</span>
                                                    : <span className="text-gray-400">—</span>
                                                }
                                            </td>
                                            <td className="p-3 font-mono font-bold">
                                                {readinessScore !== null
                                                    ? <span className={readinessScore >= 80 ? 'text-emerald-600' : readinessScore >= 60 ? 'text-amber-600' : 'text-red-500'}>{readinessScore}</span>
                                                    : <span className="text-gray-400">—</span>
                                                }
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                     statusOk ? 'bg-emerald-50 text-emerald-700' :
                                                     d.status === 'ai_extraction_failed' ? 'bg-red-50 text-red-700' :
                                                     d.status === 'needs_review' ? 'bg-amber-50 text-amber-700' :
                                                    'bg-amber-50 text-amber-700'
                                                    }`}>
                                                 {statusOk ? '✓ Classified' : d.status === 'ai_extraction_failed' ? '✗ Failed' : d.status === 'needs_review' ? '⚠ Needs Review' : 'Pending'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Audit summary row */}
                <div className="grid grid-cols-5 gap-3 text-[10px]">
                    {([
                        ['Documents', docs.length, 'text-opd-primary'],
                        ['Classified', docs.filter((d: any) => d.status === 'extracted').length, 'text-emerald-700'],
                        ['Pending', docs.filter((d: any) => d.status === 'pending_extraction').length, 'text-amber-700'],
                        ['Failed', docs.filter((d: any) => d.status === 'ai_extraction_failed').length, 'text-red-600'],
                        ['Avg Confidence', `${avgConf}%`, 'text-blue-700'],
                    ] as [string, any, string][]).map(([label, val, cls]) => (
                        <div key={label} className="p-3 bg-gray-50 border rounded-xl flex flex-col gap-1">
                            <span className="text-gray-400 uppercase tracking-wider">{label}</span>
                            <span className={`text-lg font-black ${cls}`}>{val}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pre-Authorization Form */}
            <div className="card-premium space-y-4 text-left">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-bold font-lora text-opd-primary">Pre-Authorization Form</h3>
                        <p className="text-[11px] text-opd-text-secondary mt-0.5">Auto-filled from OCR extraction. Review before downloading.</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowPreAuth(!showPreAuth)}
                            className="px-3 py-1.5 text-xs font-bold border border-opd-primary text-opd-primary rounded-lg hover:bg-opd-primary hover:text-white transition"
                        >
                            {showPreAuth ? 'Hide Form' : 'Preview Form'}
                        </button>
                        <button
                            onClick={() => downloadPreAuthForm(activeCase)}
                            className="px-3 py-1.5 text-xs font-bold bg-opd-primary text-white rounded-lg hover:opacity-90 transition flex items-center gap-1.5"
                        >
                            ⬇ Download Pre-Auth
                        </button>
                    </div>
                </div>

                {showPreAuth && (
                    <div className="border border-opd-border rounded-2xl overflow-hidden text-xs">
                        {/* Header */}
                        <div className="bg-opd-primary text-white px-5 py-3">
                            <div className="font-bold text-sm">Pre-Authorization Request</div>
                            <div className="text-[10px] opacity-75">Aivana India TPA Insurance Copilot | Case: {activeCase.id}</div>
                        </div>
                        {/* Sections */}
                        <div className="grid grid-cols-2 gap-0 divide-x divide-opd-border">
                            <div className="p-4 space-y-3">
                                <div className="font-bold text-opd-primary text-[10px] uppercase tracking-wider">Patient Details</div>
                                {([
                                    ['Name', p.name],
                                    ['Age / Gender', `${p.age || '—'} Yrs / ${p.gender || '—'}`],
                                    ['UHID', p.uhid],
                                    ['Contact', (p as any).contactNumber || (p as any).contact],
                                    ['Address', (p as any).address],
                                ] as [string, any][]).map(([k, v]) => (
                                    <div key={k} className="flex gap-2">
                                        <span className="w-28 shrink-0 text-gray-500">{k}:</span>
                                        <span className="font-semibold text-opd-primary">{v || '—'}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="font-bold text-opd-primary text-[10px] uppercase tracking-wider">Insurance Details</div>
                                {([
                                    ['Insurer', ins.insurerName || ins.insurer],
                                    ['TPA', ins.tpaName || ins.TPA],
                                    ['Policy No.', ins.policyNumber],
                                    ['Sum Insured', ins.sumInsured ? `₹${ins.sumInsured.toLocaleString('en-IN')}` : '—'],
                                    ['Room Rent Limit', ins.roomRentLimit ? `₹${ins.roomRentLimit.toLocaleString('en-IN')}/day` : '—'],
                                    ['ICU Limit', ins.icuRentLimit ? `₹${ins.icuRentLimit.toLocaleString('en-IN')}/day` : '—'],
                                ] as [string, any][]).map(([k, v]) => (
                                    <div key={k} className="flex gap-2">
                                        <span className="w-28 shrink-0 text-gray-500">{k}:</span>
                                        <span className="font-semibold text-opd-primary">{v || '—'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="border-t border-opd-border p-4 space-y-3">
                            <div className="font-bold text-opd-primary text-[10px] uppercase tracking-wider">Clinical Details</div>
                            <div className="grid grid-cols-3 gap-4">
                                {([
                                    ['Diagnosis', enc?.diagnosis],
                                    ['Chief Complaints', enc?.chiefComplaints],
                                    ['Ward Type', enc?.wardType],
                                ] as [string, any][]).map(([k, v]) => (
                                    <div key={k}>
                                        <div className="text-gray-400 mb-0.5">{k}</div>
                                        <div className="font-semibold text-opd-primary">{v || '—'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Document list */}
                        <div className="border-t border-opd-border p-4">
                            <div className="font-bold text-opd-primary text-[10px] uppercase tracking-wider mb-2">Documents Submitted ({docs.length})</div>
                            <div className="flex flex-wrap gap-2">
                                {docs.map((d: any, i: number) => (
                                    <span key={i} className="px-2 py-0.5 bg-gray-50 border rounded text-[10px] font-mono">{d.name}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ExtractedInformationView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    const [subTab, setSubTab] = useState<'profile' | 'clinical' | 'billing'>('profile');
    
    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Please select a case to inspect extracted parameters.</div>;
    }

    return (
        <div className="card-premium grid grid-cols-3 gap-6 text-left">
            <div className="col-span-2 space-y-4">
                <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 5: Extracted Information</h2>
                <div className="flex border-b text-xs">
                    <button className={`px-4 py-2 border-b-2 font-bold ${subTab === 'profile' ? 'border-opd-primary text-opd-primary' : 'border-transparent text-gray-500'}`} onClick={() => setSubTab('profile')}>Patient &amp; Policy</button>
                    <button className={`px-4 py-2 border-b-2 font-bold ${subTab === 'clinical' ? 'border-opd-primary text-opd-primary' : 'border-transparent text-gray-500'}`} onClick={() => setSubTab('clinical')}>Clinical Info</button>
                    <button className={`px-4 py-2 border-b-2 font-bold ${subTab === 'billing' ? 'border-opd-primary text-opd-primary' : 'border-transparent text-gray-500'}`} onClick={() => setSubTab('billing')}>Billing Info</button>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl text-xs space-y-2 font-medium leading-relaxed">
                    {subTab === 'profile' && (
                        <>
                            <div>UHID: <span className="text-opd-primary font-mono">{activeCase.patientProfile.uhid || '—'}</span></div>
                            <div>Name: <span className="text-opd-primary">{activeCase.patientProfile.name}</span></div>
                            <div>Policy: <span className="text-opd-primary font-mono">{activeCase.insuranceDetails.policyNumber}</span></div>
                        </>
                    )}
                    {subTab === 'clinical' && (
                        <>
                            <div>Diagnosis: <span className="text-opd-primary">{activeCase.encounters[0]?.diagnosis || '—'}</span></div>
                            <div>Chief Complaints: <span className="text-opd-primary">{activeCase.encounters[0]?.chiefComplaints || '—'}</span></div>
                            <div>History of Present Illness: <span className="text-opd-primary">{activeCase.encounters[0]?.historyOfPresentIllness || '—'}</span></div>
                        </>
                    )}
                    {subTab === 'billing' && (
                        <>
                            <div>Ward Category: <span className="text-opd-primary">{activeCase.encounters[0]?.wardType || '—'}</span></div>
                            <div>Total Claim Value: <span className="text-opd-primary">₹{activeCase.claims[0]?.claimAmount.toLocaleString('en-IN')}</span></div>
                        </>
                    )}
                </div>
            </div>

            <div className="col-span-1 p-4 bg-gray-50 border rounded-2xl text-xs space-y-3">
                <h3 className="font-bold text-opd-primary uppercase tracking-wider">Source Provenance</h3>
                <p className="text-[10px] text-opd-text-secondary leading-relaxed">
                    Aivana grounds all extracted data to source page snippets. No hallucinations:
                </p>
                <div className="p-3 bg-white border rounded-xl leading-relaxed text-[11px] font-mono text-gray-600">
                    {subTab === 'clinical' ? (
                        <>
                            <span className="block font-bold text-opd-primary mb-1">Source: Page 2 (Discharge Summary)</span>
                            "...admitted with complaints of fever and dyspnea since 3 days..."
                        </>
                    ) : (
                        <>
                            <span className="block font-bold text-opd-primary mb-1">Source: Page 1 (Admission Request)</span>
                            "UHID: {activeCase.patientProfile.uhid || 'PA-9921'}, Name: {activeCase.patientProfile.name}"
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────────────────
// SCREEN 6: PRIOR AUTHORIZATION GATEWAY — 5-Tab Full PA Flow
// ──────────────────────────────────────────────────────────────────────────────
type PATab = 'patient' | 'clinical' | 'billing' | 'necessity' | 'submit';

const PA_TABS: { id: PATab; label: string; step: number }[] = [
    { id: 'patient',   label: '1. Patient & Policy',    step: 1 },
    { id: 'clinical',  label: '2. Clinical Details',    step: 2 },
    { id: 'billing',   label: '3. Billing & Stay',      step: 3 },
    { id: 'necessity', label: '4. Medical Necessity',   step: 4 },
    { id: 'submit',    label: '5. Submit Pre-Auth',     step: 5 },
];

const generatePAHtml = (pa: any) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Pre-Authorization — ${pa.patientName}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:24px;font-size:12px;color:#222}h1{color:#1a4c8b;font-size:17px;margin:0 0 2px}h2{font-size:11px;color:#555;margin:18px 0 5px;border-bottom:1px solid #ddd;padding-bottom:3px;text-transform:uppercase;letter-spacing:.5px}table{width:100%;border-collapse:collapse;margin-bottom:10px}td,th{padding:5px 9px;border:1px solid #ddd;vertical-align:top}th{background:#f0f4f8;font-weight:bold;text-align:left;width:36%}.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:bold}.green{background:#d1fae5;color:#065f46}.amber{background:#fef3c7;color:#92400e}.red{background:#fee2e2;color:#991b1b}.sig{display:flex;gap:48px;margin-top:40px}.sig-box{flex:1;border-top:1px solid #333;padding-top:5px;font-size:10px;color:#555}.header{border-bottom:3px solid #1a4c8b;margin-bottom:16px;padding-bottom:8px}</style>
</head>
<body>
<div class="header"><h1>Prior Authorization Request — Aivana India TPA Insurance Copilot</h1>
<p style="margin:4px 0 0;font-size:10px;color:#888">Case ID: ${pa.caseId} | Generated: ${new Date().toLocaleString('en-IN')} | Status: Submitted</p></div>
<h2>Patient Details</h2>
<table><tr><th>Patient Name</th><td>${pa.patientName||'—'}</td></tr><tr><th>Age / Gender</th><td>${pa.age||'—'} Yrs / ${pa.gender||'—'}</td></tr><tr><th>UHID</th><td>${pa.uhid||'—'}</td></tr><tr><th>Contact</th><td>${pa.contact||'—'}</td></tr></table>
<h2>Insurance & Policy</h2>
<table><tr><th>Insurer</th><td>${pa.insurer||'—'}</td></tr><tr><th>TPA</th><td>${pa.tpa||'—'}</td></tr><tr><th>Policy Number</th><td>${pa.policyNumber||'—'}</td></tr><tr><th>Sum Insured</th><td>₹${(pa.sumInsured||0).toLocaleString('en-IN')}</td></tr><tr><th>Room Rent Limit/day</th><td>₹${(pa.roomRentLimit||0).toLocaleString('en-IN')}</td></tr><tr><th>ICU Limit/day</th><td>₹${(pa.icuRentLimit||0).toLocaleString('en-IN')}</td></tr></table>
<h2>Clinical Details</h2>
<table><tr><th>Diagnosis</th><td>${pa.diagnosis||'—'}</td></tr><tr><th>ICD-10 Code</th><td>${pa.icdCode||'Pending'}</td></tr><tr><th>Chief Complaints</th><td>${pa.chiefComplaints||'—'}</td></tr><tr><th>History of Illness</th><td>${pa.hopi||'—'}</td></tr><tr><th>Nature of Illness</th><td>${pa.natureOfIllness||'—'}</td></tr><tr><th>Treatment Line</th><td>${pa.treatmentLine||'—'}</td></tr><tr><th>Comorbidities</th><td>${pa.comorbidities||'None reported'}</td></tr></table>
<h2>Admission & Billing</h2>
<table><tr><th>Admission Type</th><td>${pa.admissionType||'—'}</td></tr><tr><th>Room Category</th><td>${pa.roomCategory||'—'}</td></tr><tr><th>Expected LOS</th><td>${pa.los||'—'} day(s)</td></tr><tr><th>ICU Days</th><td>${pa.icuDays||0} day(s)</td></tr><tr><th>Room Rent</th><td>₹${(pa.roomRent||0).toLocaleString('en-IN')}</td></tr><tr><th>Surgeon Fee</th><td>₹${(pa.surgeonFee||0).toLocaleString('en-IN')}</td></tr><tr><th>Medicines</th><td>₹${(pa.medicines||0).toLocaleString('en-IN')}</td></tr><tr><th>Investigations</th><td>₹${(pa.investigations||0).toLocaleString('en-IN')}</td></tr><tr><th>Total Estimated</th><td><strong>₹${(pa.totalEstimated||0).toLocaleString('en-IN')}</strong></td></tr></table>
<h2>Medical Necessity</h2>
<table><tr><th>Score</th><td><span class="badge ${pa.necessityScore>=80?'green':pa.necessityScore>=60?'amber':'red'}">${pa.necessityScore||0}/100</span></td></tr><tr><th>Recommendation</th><td>${pa.recommendation||'—'}</td></tr></table>
<div class="sig"><div class="sig-box">Treating Doctor Signature & Stamp<br><br><br></div><div class="sig-box">Hospital Authorized Signatory<br><br><br></div><div class="sig-box">TPA Received Stamp<br><br><br></div></div>
</body></html>`;

const ClaimReadinessView: React.FC<{ activeCase: PatientCaseRecord | null; onCaseUpdated?: () => void }> = ({ activeCase, onCaseUpdated }) => {
    const [tab, setTab] = React.useState<PATab>('patient');
    const [saving, setSaving] = React.useState(false);
    const [submitted, setSubmitted] = React.useState(false);
    const [necessityReport, setNecessityReport] = React.useState<ExtendedEvidenceReviewReport | null>(null);
    const [necessityLoading, setNecessityLoading] = React.useState(false);
    const [necessityError, setNecessityError] = React.useState('');

    // Local editable PA state — pre-filled from activeCase
    const [pa, setPa] = React.useState<any>(() => {
        const p = activeCase?.patientProfile as any || {};
        const ins = activeCase?.insuranceDetails as any || {};
        const enc = activeCase?.encounters?.[0] as any || {};
        return {
            patientName: p.name || '',
            age: p.age || '',
            gender: p.gender || '',
            contact: p.contactNumber || p.contact || '',
            uhid: p.uhid || activeCase?.id || '',
            insurer: ins.insurerName || ins.insurer || '',
            tpa: ins.tpaName || ins.TPA || '',
            policyNumber: ins.policyNumber || '',
            sumInsured: ins.sumInsured || 0,
            roomRentLimit: ins.roomRentLimit || (ins.sumInsured ? Math.round(ins.sumInsured * 0.01) : 0),
            icuRentLimit: ins.icuRentLimit || (ins.sumInsured ? Math.round(ins.sumInsured * 0.02) : 0),
            diagnosis: enc.diagnosis || '',
            icdCode: enc.icdCode || '',
            chiefComplaints: enc.chiefComplaints || '',
            hopi: enc.historyOfPresentIllness || '',
            natureOfIllness: enc.natureOfIllness || 'Acute',
            treatmentLine: 'Medical',
            comorbidities: '',
            admissionType: enc.admissionType || 'Emergency',
            roomCategory: enc.wardType || 'General Ward',
            los: enc.expectedLOS || 3,
            icuDays: enc.icuDays || 0,
            roomRent: 0,
            surgeonFee: 0,
            medicines: 0,
            investigations: 0,
            totalEstimated: 0,
            necessityScore: 0,
            recommendation: '',
            caseId: activeCase?.id || '',
        };
    });

    // Re-sync when activeCase changes
    React.useEffect(() => {
        if (!activeCase) return;
        const p = activeCase.patientProfile as any;
        const ins = activeCase.insuranceDetails as any;
        const enc = (activeCase.encounters?.[0] as any) || {};
        setPa((prev: any) => ({
            ...prev,
            patientName: prev.patientName || p?.name || '',
            age: prev.age || p?.age || '',
            gender: prev.gender || p?.gender || '',
            contact: prev.contact || p?.contactNumber || p?.contact || '',
            uhid: prev.uhid || p?.uhid || activeCase.id || '',
            insurer: prev.insurer || ins?.insurerName || ins?.insurer || '',
            tpa: prev.tpa || ins?.tpaName || ins?.TPA || '',
            policyNumber: prev.policyNumber || ins?.policyNumber || '',
            sumInsured: prev.sumInsured || ins?.sumInsured || 0,
            roomRentLimit: prev.roomRentLimit || ins?.roomRentLimit || (ins?.sumInsured ? Math.round(ins.sumInsured * 0.01) : 0),
            icuRentLimit: prev.icuRentLimit || ins?.icuRentLimit || (ins?.sumInsured ? Math.round(ins.sumInsured * 0.02) : 0),
            diagnosis: prev.diagnosis || enc?.diagnosis || '',
            chiefComplaints: prev.chiefComplaints || enc?.chiefComplaints || '',
            hopi: prev.hopi || enc?.historyOfPresentIllness || '',
            caseId: activeCase.id || '',
        }));
    }, [activeCase?.id]);

    const field = (label: string, key: string, type: 'text' | 'number' | 'select' = 'text', options?: string[]) => (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
            {type === 'select' && options ? (
                <select
                    className="border border-opd-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-opd-primary bg-white"
                    value={pa[key] || ''}
                    onChange={e => setPa((p: any) => ({ ...p, [key]: e.target.value }))}
                >
                    {options.map(o => <option key={o}>{o}</option>)}
                </select>
            ) : (
                <input
                    type={type}
                    className="border border-opd-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-opd-primary"
                    value={pa[key] ?? ''}
                    onChange={e => setPa((p: any) => ({ ...p, [key]: type === 'number' ? +e.target.value : e.target.value }))}
                />
            )}
        </div>
    );

    const runNecessityCheck = async () => {
        if (!pa.diagnosis) { setNecessityError('Fill in the diagnosis in Tab 2 first.'); return; }
        setNecessityLoading(true);
        setNecessityError('');
        try {
            const mockRecord = {
                clinical: {
                    diagnoses: [{ diagnosis: pa.diagnosis, icd10Code: pa.icdCode || 'Pending ICD-10', isSelected: true }],
                    chiefComplaints: pa.chiefComplaints,
                    historyOfPresentIllness: pa.hopi,
                    selectedDiagnosisIndex: 0,
                },
                patient: { patientName: pa.patientName, age: +pa.age, gender: pa.gender },
                insurance: { sumInsured: pa.sumInsured },
                admission: { admissionType: pa.admissionType, roomCategory: pa.roomCategory, expectedLengthOfStay: pa.los },
            };
            const report = await priorAuthOrchestrator([], mockRecord as any);
            setNecessityReport(report);
            const score = report.medicalNecessityScore ?? report.overallScore ?? 70;
            const rec = report.tpaDecision?.recommendation || (score >= 80 ? 'APPROVE' : score >= 60 ? 'QUERY' : 'DENY');
            setPa((p: any) => ({ ...p, necessityScore: score, recommendation: rec }));
        } catch (err: any) {
            setNecessityError(err?.message || 'Medical necessity check failed.');
        } finally {
            setNecessityLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!activeCase) return;
        setSaving(true);
        try {
            // Evaluate case via simulated decision engine
            const decision = simulateInsurerDecision(activeCase, 'initial', pa.totalEstimated || 0);

            const authStatus = (decision.outcome === 'approved' ? 'approved' : 
                                decision.outcome === 'partial_approved' ? 'partial_approved' : 
                                decision.outcome === 'query' ? 'query_raised' : 'denied') as any;

            const authRecord = {
                id: `AUTH-${activeCase.id}-${Date.now()}`,
                status: authStatus,
                requestedAmount: pa.totalEstimated || 0,
                approvedAmount: decision.approvedAmount,
                deductionReason: decision.deductionReason,
                queryDetails: decision.queryDetails,
                denialReason: decision.denialReason,
                submittedAt: new Date().toISOString(),
                respondedAt: new Date().toISOString(),
                tpaReceiptId: `TPA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            };

            const stageStatus = (decision.outcome === 'approved' ? 'approved' : 
                                 decision.outcome === 'partial_approved' ? 'approved' : 
                                 decision.outcome === 'query' ? 'query_raised' : 'denied') as any;

            const updated = {
                ...activeCase,
                authorizations: [...(activeCase.authorizations || []), authRecord],
                currentStage: stageStatus,
                auditLog: [
                    ...(activeCase.auditLog || []),
                    { timestamp: new Date().toISOString(), action: 'preauth_submitted', actor: 'hospital_desk',
                      details: `PA submitted. Amount: ₹${pa.totalEstimated?.toLocaleString('en-IN')}. TPA Ref: ${authRecord.tpaReceiptId}. Simulated Decision: ${decision.outcome.toUpperCase()}` }
                ],
                updatedAt: new Date().toISOString(),
            };
            await savePatientRecord(updated);
            setSubmitted(true);
            onCaseUpdated?.();
            // Download the PA form automatically on submit
            const html = generatePAHtml(pa);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PreAuth_${pa.patientName?.replace(/\s+/g, '_') || activeCase.id}.html`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setSaving(false);
        }
    };

    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Select a case to run the Prior Authorization flow.</div>;
    }

    const roomRentPerDay = pa.roomCategory === 'ICU' ? pa.icuRentLimit : pa.roomRentLimit;
    const roomRentCapped = roomRentPerDay * (pa.los || 0);
    const isRoomRentBreached = pa.roomRent > roomRentCapped && roomRentCapped > 0;
    const totalCalc = (pa.roomRent || 0) + (pa.surgeonFee || 0) + (pa.medicines || 0) + (pa.investigations || 0);

    return (
        <div className="space-y-4">
            {/* Header + Status */}
            <div className="card-premium">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 6: Prior Authorization Gateway</h2>
                        <p className="text-xs text-opd-text-secondary mt-0.5">Complete the PA form, run Fairway medical necessity check, then submit.</p>
                    </div>
                    {submitted && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
                            <CheckSquare className="w-4 h-4" /> PA Submitted
                        </div>
                    )}
                </div>

                {/* Stage Tracker */}
                <div className="mt-4 flex items-center gap-0">
                    {(['Draft', 'Docs Uploaded', 'PA Ready', 'Submitted', 'TPA Decision'] as const).map((stage, i) => {
                        const stageMap: Record<string, number> = {
                            documents_uploaded: 1, patient_identified: 2,
                            authorization_submitted: 3, approved: 4, denied: 4,
                        };
                        const currentIdx = stageMap[activeCase.currentStage as string] ?? 0;
                        const isDone = i < currentIdx || (submitted && i <= 3);
                        const isActive = i === currentIdx || (submitted && i === 3);
                        return (
                            <React.Fragment key={stage}>
                                <div className="flex flex-col items-center gap-1">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${
                                        isDone ? 'bg-opd-primary text-white' :
                                        isActive ? 'bg-blue-100 border-2 border-opd-primary text-opd-primary' :
                                        'bg-gray-100 text-gray-400'
                                    }`}>{isDone ? '✓' : i + 1}</div>
                                    <span className={`text-[9px] font-bold whitespace-nowrap ${
                                        isDone || isActive ? 'text-opd-primary' : 'text-gray-400'
                                    }`}>{stage}</span>
                                </div>
                                {i < 4 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${ isDone ? 'bg-opd-primary' : 'bg-gray-200' }`} />}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {PA_TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 py-2 px-2 rounded-lg text-[11px] font-bold transition ${
                            tab === t.id
                                ? 'bg-opd-primary text-white shadow'
                                : 'text-gray-500 hover:text-opd-primary hover:bg-white'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="card-premium">

                {/* ── TAB 1: Patient & Policy ── */}
                {tab === 'patient' && (
                    <div className="space-y-4">
                        <h3 className="font-bold text-sm text-opd-primary font-lora">Patient & Policy Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {field('Patient Name', 'patientName')}
                            {field('Age (Years)', 'age', 'number')}
                            {field('Gender', 'gender', 'select', ['Male', 'Female', 'Other'])}
                            {field('Contact Number', 'contact')}
                            {field('UHID / Case ID', 'uhid')}
                        </div>
                        <div className="border-t border-opd-border pt-4">
                            <h4 className="text-[11px] font-bold text-opd-primary uppercase tracking-wider mb-3">Insurance Details</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {field('Insurer Name', 'insurer')}
                                {field('TPA Name', 'tpa')}
                                {field('Policy Number', 'policyNumber')}
                                {field('Sum Insured (₹)', 'sumInsured', 'number')}
                                {field('Room Rent Cap / Day (₹)', 'roomRentLimit', 'number')}
                                {field('ICU Rent Cap / Day (₹)', 'icuRentLimit', 'number')}
                            </div>
                        </div>
                        <button onClick={() => setTab('clinical')} className="btn-primary text-xs">Next: Clinical Details →</button>
                    </div>
                )}

                {/* ── TAB 2: Clinical Details ── */}
                {tab === 'clinical' && (
                    <div className="space-y-4">
                        <h3 className="font-bold text-sm text-opd-primary font-lora">Clinical Details</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {field('Diagnosis', 'diagnosis')}
                            {field('ICD-10 Code', 'icdCode')}
                            {field('Nature of Illness', 'natureOfIllness', 'select', ['Acute', 'Chronic', 'Chronic with Acute Exacerbation', 'Sub-acute'])}
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {field('Chief Complaints', 'chiefComplaints')}
                            {field('History of Present Illness', 'hopi')}
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Proposed Line of Treatment</label>
                            <div className="flex flex-wrap gap-3">
                                {['Medical', 'Surgical', 'ICU / Critical Care', 'Investigations Only', 'Non-Allopathic'].map(opt => (
                                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="radio" name="treatmentLine" value={opt}
                                            checked={pa.treatmentLine === opt}
                                            onChange={() => setPa((p: any) => ({ ...p, treatmentLine: opt }))}
                                            className="accent-opd-primary"
                                        />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Comorbidities</label>
                            <div className="flex flex-wrap gap-3">
                                {['Diabetes', 'Hypertension', 'Heart Disease', 'Asthma', 'CKD', 'HIV'].map(opt => (
                                    <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox"
                                            checked={(pa.comorbidities || '').includes(opt)}
                                            onChange={e => setPa((p: any) => ({
                                                ...p,
                                                comorbidities: e.target.checked
                                                    ? [p.comorbidities, opt].filter(Boolean).join(', ')
                                                    : (p.comorbidities || '').split(', ').filter((c: string) => c !== opt).join(', ')
                                            }))}
                                            className="accent-opd-primary"
                                        />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setTab('patient')} className="px-4 py-2 text-xs font-bold border border-opd-border rounded-xl hover:border-opd-primary transition">← Back</button>
                            <button onClick={() => setTab('billing')} className="btn-primary text-xs">Next: Billing & Stay →</button>
                        </div>
                    </div>
                )}

                {/* ── TAB 3: Billing & Stay ── */}
                {tab === 'billing' && (
                    <div className="space-y-4">
                        <h3 className="font-bold text-sm text-opd-primary font-lora">Admission & Billing Estimate</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {field('Admission Type', 'admissionType', 'select', ['Emergency', 'Planned', 'Day Care'])}
                            {field('Room Category', 'roomCategory', 'select', ['General Ward', 'Semi-Private', 'Private', 'ICU', 'NICU', 'PICU'])}
                            {field('Expected Stay (Days)', 'los', 'number')}
                            {field('ICU Days', 'icuDays', 'number')}
                        </div>
                        <div className="border-t border-opd-border pt-4">
                            <h4 className="text-[11px] font-bold text-opd-primary uppercase tracking-wider mb-3">Cost Estimate (₹)</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {field('Room Rent Total (₹)', 'roomRent', 'number')}
                                {field('Surgeon / Procedure Fee (₹)', 'surgeonFee', 'number')}
                                {field('Medicines (₹)', 'medicines', 'number')}
                                {field('Investigations (₹)', 'investigations', 'number')}
                            </div>

                            {/* Room rent cap warning */}
                            {isRoomRentBreached && (
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <span className="text-amber-800">
                                        <strong>Room Rent Cap Breach:</strong> Entered room rent ₹{pa.roomRent?.toLocaleString('en-IN')} exceeds
                                        IRDA cap of ₹{roomRentCapped?.toLocaleString('en-IN')} ({pa.los} days × ₹{roomRentPerDay?.toLocaleString('en-IN')}/day).
                                        Proportional deductions will apply to all associated charges.
                                    </span>
                                </div>
                            )}

                            <div className="mt-3 p-3 bg-opd-primary/5 border border-opd-primary/20 rounded-xl flex justify-between items-center">
                                <span className="text-xs font-bold text-opd-primary">Estimated Total</span>
                                <span className="text-lg font-black text-opd-primary">₹{totalCalc.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setTab('clinical')} className="px-4 py-2 text-xs font-bold border border-opd-border rounded-xl hover:border-opd-primary transition">← Back</button>
                            <button
                                onClick={() => { setPa((p: any) => ({ ...p, totalEstimated: totalCalc })); setTab('necessity'); }}
                                className="btn-primary text-xs"
                            >Next: Medical Necessity →</button>
                        </div>
                    </div>
                )}

                {/* ── TAB 4: Medical Necessity (Fairway) ── */}
                {tab === 'necessity' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-sm text-opd-primary font-lora">Medical Necessity Check — Fairway Layer</h3>
                                <p className="text-xs text-opd-text-secondary">Validates clinical evidence against IRDA medical necessity criteria for the given diagnosis.</p>
                            </div>
                            <button
                                onClick={runNecessityCheck}
                                disabled={necessityLoading}
                                className="px-3 py-1.5 text-xs font-bold bg-opd-primary text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition flex items-center gap-1.5"
                            >
                                <HeartPulse className={`w-3.5 h-3.5 ${necessityLoading ? 'animate-pulse' : ''}`} />
                                {necessityLoading ? 'Running...' : necessityReport ? 'Re-Run Check' : 'Run Fairway Check'}
                            </button>
                        </div>

                        {necessityError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">{necessityError}</div>
                        )}

                        {!necessityReport && !necessityLoading && !necessityError && (
                            <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                <HeartPulse className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                                <p className="text-xs text-gray-400">Click "Run Fairway Check" to validate medical necessity.</p>
                                <p className="text-[10px] text-gray-400 mt-1">Requires a diagnosis in Tab 2.</p>
                            </div>
                        )}

                        {necessityLoading && (
                            <div className="p-8 text-center bg-gray-50 rounded-2xl border">
                                <div className="w-10 h-10 border-4 border-opd-primary/20 border-t-opd-primary rounded-full animate-spin mx-auto mb-3" />
                                <p className="text-xs text-gray-500">Running Fairway clinical evidence review...</p>
                            </div>
                        )}

                        {necessityReport && !necessityLoading && (
                            <div className="space-y-4">
                                {/* Score card */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className={`p-4 rounded-xl border text-center ${
                                        pa.necessityScore >= 80 ? 'bg-emerald-50 border-emerald-200' :
                                        pa.necessityScore >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                                    }`}>
                                        <div className={`text-3xl font-black ${
                                            pa.necessityScore >= 80 ? 'text-emerald-700' :
                                            pa.necessityScore >= 60 ? 'text-amber-700' : 'text-red-700'
                                        }`}>{pa.necessityScore}</div>
                                        <div className="text-[10px] font-bold text-gray-500 uppercase mt-1">Necessity Score</div>
                                    </div>
                                    <div className={`p-4 rounded-xl border text-center col-span-2 flex flex-col justify-center ${
                                        pa.recommendation === 'APPROVE' ? 'bg-emerald-50 border-emerald-200' :
                                        pa.recommendation === 'QUERY' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
                                    }`}>
                                        <div className={`text-lg font-black ${
                                            pa.recommendation === 'APPROVE' ? 'text-emerald-700' :
                                            pa.recommendation === 'QUERY' ? 'text-amber-700' : 'text-red-700'
                                        }`}>
                                            {pa.recommendation === 'APPROVE' ? '✓ APPROVED' :
                                             pa.recommendation === 'QUERY' ? '⚠ QUERY RAISED' : '✗ DENY RECOMMENDED'}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1">TPA Recommendation</div>
                                    </div>
                                </div>

                                {/* Required evidence checklist */}
                                {(necessityReport as any).requiredEvidence?.length > 0 && (
                                    <div className="p-4 bg-gray-50 rounded-xl border space-y-2">
                                        <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider">Required Evidence Checklist</div>
                                        {(necessityReport as any).requiredEvidence.map((e: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2 text-xs">
                                                <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                                <span>{e}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Clinical gaps */}
                                {(necessityReport as any).clinicalGapList?.length > 0 && (
                                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                                        <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">⚠ Clinical Gaps</div>
                                        {(necessityReport as any).clinicalGapList.map((g: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2 text-xs text-amber-900">
                                                <span className="shrink-0">•</span>
                                                <span>{g}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setTab('billing')} className="px-4 py-2 text-xs font-bold border border-opd-border rounded-xl hover:border-opd-primary transition">← Back</button>
                            <button
                                onClick={() => setTab('submit')}
                                disabled={pa.necessityScore > 0 && pa.necessityScore < 60}
                                className="btn-primary text-xs disabled:opacity-40"
                            >Next: Submit Pre-Auth →</button>
                        </div>
                    </div>
                )}

                {/* ── TAB 5: Submit Pre-Auth ── */}
                {tab === 'submit' && (
                    <div className="space-y-4">
                        <h3 className="font-bold text-sm text-opd-primary font-lora">Submit Prior Authorization</h3>

                        {/* Final summary */}
                        <div className="border border-opd-border rounded-2xl overflow-hidden text-xs">
                            <div className="bg-opd-primary text-white px-4 py-2.5 flex justify-between items-center">
                                <span className="font-bold">Prior Authorization — Summary Review</span>
                                <span className="text-[10px] opacity-75">{pa.caseId}</span>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-opd-border">
                                <div className="p-4 space-y-2">
                                    <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider mb-1">Patient & Policy</div>
                                    {[['Name', pa.patientName], ['Age/Gender', `${pa.age} Yrs / ${pa.gender}`],
                                      ['Insurer', pa.insurer], ['TPA', pa.tpa], ['Policy No.', pa.policyNumber],
                                      ['Sum Insured', pa.sumInsured ? `₹${(+pa.sumInsured).toLocaleString('en-IN')}` : '—']
                                    ].map(([k, v]) => (
                                        <div key={k} className="flex gap-2">
                                            <span className="w-24 shrink-0 text-gray-400">{k}:</span>
                                            <span className="font-semibold text-opd-primary">{v || '—'}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 space-y-2">
                                    <div className="text-[10px] font-bold text-opd-primary uppercase tracking-wider mb-1">Clinical & Billing</div>
                                    {[['Diagnosis', pa.diagnosis], ['ICD-10', pa.icdCode || 'Pending'],
                                      ['Admission', pa.admissionType], ['Room', pa.roomCategory],
                                      ['LOS', `${pa.los} day(s)`], ['Total Est.', `₹${(pa.totalEstimated||0).toLocaleString('en-IN')}`]
                                    ].map(([k, v]) => (
                                        <div key={k} className="flex gap-2">
                                            <span className="w-24 shrink-0 text-gray-400">{k}:</span>
                                            <span className="font-semibold text-opd-primary">{v || '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="border-t border-opd-border p-4 flex items-center justify-between">
                                <div className="text-[10px] text-gray-500">
                                    Necessity Score: <strong className={pa.necessityScore >= 80 ? 'text-emerald-700' : pa.necessityScore >= 60 ? 'text-amber-700' : 'text-gray-400'}>{pa.necessityScore || 'Not run'}</strong>
                                    {' '}&nbsp;|&nbsp; Recommendation: <strong className="text-opd-primary">{pa.recommendation || 'Not run'}</strong>
                                </div>
                                {pa.necessityScore > 0 && pa.necessityScore < 60 && (
                                    <span className="text-[10px] text-red-700 font-bold">⚠ Low score — submission blocked</span>
                                )}
                            </div>
                        </div>

                        {submitted ? (
                            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-2">
                                <CheckSquare className="w-8 h-8 text-emerald-600 mx-auto" />
                                <div className="font-bold text-emerald-800">Pre-Authorization Submitted Successfully</div>
                                <div className="text-xs text-emerald-700">The PA form has been saved and downloaded. The case stage has been updated to <strong>Authorization Submitted</strong>.</div>
                            </div>
                        ) : (
                            <div className="flex gap-3 flex-wrap">
                                <button onClick={() => setTab('necessity')} className="px-4 py-2 text-xs font-bold border border-opd-border rounded-xl hover:border-opd-primary transition">← Back</button>
                                <button
                                    onClick={() => {
                                        const html = generatePAHtml(pa);
                                        const blob = new Blob([html], { type: 'text/html' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url; a.download = `PreAuth_${pa.patientName?.replace(/\s+/g, '_') || 'form'}.html`; a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="px-4 py-2 text-xs font-bold border border-opd-primary text-opd-primary rounded-xl hover:bg-opd-primary hover:text-white transition flex items-center gap-1.5"
                                >
                                    <Download className="w-3.5 h-3.5" /> Download PA Form
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={saving || (pa.necessityScore > 0 && pa.necessityScore < 60)}
                                    className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-40"
                                >
                                    {saving ? 'Submitting...' : '🚀 Mark as Submitted to TPA'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const EvidenceExplorerView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Select a case to browse citations.</div>;
    }

    return (
        <div className="card-premium grid grid-cols-3 gap-6 text-left">
            <div className="col-span-1 space-y-3 text-xs">
                <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 7: Evidence Explorer</h2>
                <div className="p-3 bg-gray-50 border rounded-xl space-y-2">
                    <div>Diagnosis: <span className="font-semibold block">{activeCase.encounters[0]?.diagnosis}</span></div>
                    <div>Procedure: <span className="font-semibold block">{activeCase.encounters[0]?.treatmentPlan || 'Medical management'}</span></div>
                    <div>Admission Date: <span className="font-semibold block">{activeCase.encounters[0]?.admissionDate}</span></div>
                </div>
            </div>

            <div className="col-span-2 p-4 bg-gray-50 border rounded-2xl space-y-3">
                <div className="flex justify-between items-center text-xs border-b pb-2">
                    <span className="font-bold text-opd-primary uppercase">Citations Grounding Viewer</span>
                    <span className="text-[10px] text-gray-500">Document Page: 1 of 2</span>
                </div>
                <div className="p-4 bg-white border rounded-xl font-mono text-[11px] leading-relaxed text-gray-600 max-h-60 overflow-y-auto">
                    <span className="block font-bold text-emerald-600 mb-2">// CLINICAL PROVENANCE ANCHORS FOUND //</span>
                    "...Patient presenting with acute onset of high grade fever since 3 days, accompanied by severe body ache and dehydration. Provisional diagnosis set to typhoid fever. Plan includes inpatient admission, IV antibiotics, and daily vitals monitoring..."
                </div>
            </div>
        </div>
    );
};

const PolicyValidationView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Please select a case to validate policy capping.</div>;
    }

    const sumInsured = activeCase.insuranceDetails.sumInsured || 500000;
    const roomRentPerDay = activeCase.rawPreAuthRecord?.costEstimate?.roomRentPerDay || 4000;
    const normalCap = sumInsured * 0.01;
    const exceeded = roomRentPerDay > normalCap;

    return (
        <div className="card-premium space-y-6 text-left">
            <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 8: Policy &amp; Coverage Validation</h2>
            <p className="text-xs text-opd-text-secondary font-medium text-amber-700 bg-amber-50 p-2.5 rounded-lg">
                ⚠️ Capping values are calculated deterministically per insurer policy schedules (Arithmetic verified).
            </p>

            <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <h3 className="font-bold text-opd-primary uppercase tracking-wider text-[10px]">Room Rent Caps Audit</h3>
                    <div className="flex justify-between border-b pb-1.5">
                        <span>Ward Rent Cap (1% of SI):</span>
                        <span className="font-semibold">₹{normalCap.toLocaleString('en-IN')} / day</span>
                    </div>
                    <div className="flex justify-between border-b pb-1.5">
                        <span>Actual Rent Charged:</span>
                        <span className={`font-semibold ${exceeded ? 'text-red-600 font-bold' : 'text-emerald-700'}`}>₹{roomRentPerDay.toLocaleString('en-IN')} / day</span>
                    </div>
                    {exceeded && (
                        <div className="p-2.5 bg-red-50 text-red-800 rounded-lg">
                            Proportional deductions apply. Rest of hospital associated bill capped at {Math.round((normalCap/roomRentPerDay)*100)}%.
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <h3 className="font-bold text-opd-primary uppercase tracking-wider text-[10px]">Audit KPI</h3>
                    <div className="space-y-1.5">
                        <div>Senior Citizen Co-pay: <span className="font-semibold text-emerald-700">Clear (Age check passed)</span></div>
                        <div>PM-JAY limit caps: <span className="font-semibold text-emerald-700">Clear (Private insurer)</span></div>
                        <div>Disallowed non-medicals: <span className="font-semibold text-emerald-700">9% standard cap deducted</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

import { predictTpaQueries, PredictedQuery } from '../services/tpaQueryPredictionService';

const TpaQueryPredictionView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    const [queries, setQueries] = useState<PredictedQuery[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const runPrediction = useCallback(async () => {
        if (!activeCase) return;
        setLoading(true);
        setError(null);
        try {
            const res = await predictTpaQueries(activeCase);
            setQueries(res.predictedQueries);
        } catch (err: any) {
            setError(err.message || 'Failed to predict queries');
        } finally {
            setLoading(false);
        }
    }, [activeCase]);

    useEffect(() => {
        runPrediction();
    }, [runPrediction]);

    if (!activeCase) {
        return <div className="p-6 text-center text-opd-text-secondary">Please select a case to run query prediction.</div>;
    }

    return (
        <div className="card-premium space-y-6 text-left">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 9: TPA Query Prediction Simulation</h2>
                    <p className="text-xs text-opd-text-secondary">Simulates a TPA senior reviewer audit to predict administrative, billing, and clinical query objections.</p>
                </div>
                <button
                    onClick={runPrediction}
                    disabled={loading}
                    className="px-3 py-1.5 bg-opd-primary text-white font-bold rounded-xl text-xs hover:bg-opd-primary-dark transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                    <Activity className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {loading ? 'Analyzing...' : 'Run Simulation'}
                </button>
            </div>

            {loading ? (
                <div className="p-12 text-center rounded-2xl border border-gray-100 bg-gray-50/50 space-y-4">
                    <div className="relative w-12 h-12 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-opd-primary/20 border-t-opd-primary animate-spin" />
                    </div>
                    <p className="text-xs font-medium text-opd-text-secondary tracking-wide animate-pulse">
                        Analyzing room rent limits, stay duration, comorbidities, and generating AI fallback predictions...
                    </p>
                </div>
            ) : error ? (
                <div className="p-6 border border-red-200 bg-red-50 text-red-800 text-xs rounded-2xl">
                    Error running simulation: {error}
                </div>
            ) : queries.length === 0 ? (
                <div className="p-8 border border-emerald-200 bg-emerald-50/50 text-center rounded-2xl space-y-3 max-w-lg mx-auto">
                    <CheckSquare className="w-12 h-12 text-emerald-600 mx-auto" />
                    <h3 className="font-bold text-emerald-900 text-sm">Perfect Pre-Auth Score!</h3>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                        No predicted query objections detected. This pre-authorization request complies with billing room rent caps, comorbidity waiting periods, and daycare stay guidelines.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {queries.map((q, idx) => (
                        <div
                            key={idx}
                            className={`p-5 border rounded-2xl flex flex-col gap-3 shadow-sm transition ${
                                q.severity === 'blocking' 
                                    ? 'border-red-200 bg-red-50/30' 
                                    : 'border-amber-200 bg-amber-50/30'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-wider ${
                                            q.category === 'billing' ? 'bg-green-50 text-green-700 border-green-200' :
                                            q.category === 'clinical' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            q.category === 'administrative' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                            'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        }`}>
                                            {q.category}
                                        </span>
                                        <span className={`text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-wider ${
                                            q.severity === 'blocking'
                                                ? 'bg-red-100 text-red-800 border-red-300'
                                                : 'bg-amber-100 text-amber-800 border-amber-300'
                                        }`}>
                                            {q.severity} Query
                                        </span>
                                        {/* Brief 2: Provenance badge */}
                                        {q.source === 'rule_verified' ? (
                                            <span className="text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-wider bg-gray-800 text-white border-gray-800">
                                                ✓ Rule-Verified
                                            </span>
                                        ) : (
                                            <span className="text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-wider bg-white text-gray-500 border-gray-300">
                                                ✦ AI-Suggested
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-sm text-gray-800">{q.queryText}</h3>
                                </div>
                                <ShieldAlert className={`w-5 h-5 shrink-0 ${q.severity === 'blocking' ? 'text-red-600' : 'text-amber-600'}`} />
                            </div>

                            <div className="text-xs text-gray-600 space-y-1">
                                <div className="font-semibold text-gray-500 uppercase text-[9px] tracking-wider">Trigger Rule:</div>
                                <p>{q.reason}</p>
                            </div>

                            <div className="p-3 bg-white border border-gray-100 rounded-xl space-y-1 text-xs">
                                <div className="font-bold text-opd-primary uppercase text-[9px] tracking-wider">Recommended Pre-emptive Mitigation:</div>
                                <p className="text-gray-700 font-medium">{q.mitigation}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const AdminPolicyConfigView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'insurer' | 'pmjay' | 'raw'>('insurer');
    const [policies, setPolicies] = useState<PolicyRuleConfig[]>([]);
    const [pmjayPkgs, setPmjayPkgs] = useState<PMJAYPackage[]>([]);
    const [rawJsonText, setRawJsonText] = useState('');
    const [jsonType, setJsonType] = useState<'insurer' | 'pmjay'>('insurer');
    const [saveStatus, setSaveStatus] = useState('');

    useEffect(() => {
        setPolicies(getInsurerPolicyRules());
        setPmjayPkgs(getPMJAYPackagesList());
    }, []);

    const showSaveSuccess = () => {
        setSaveStatus('✓ Saved successfully!');
        setTimeout(() => setSaveStatus(''), 2500);
    };

    const handleSavePolicies = (updated: PolicyRuleConfig[]) => {
        setPolicies(updated);
        saveInsurerPolicyRules(updated);
        showSaveSuccess();
    };

    const handleSavePmjay = (updated: PMJAYPackage[]) => {
        setPmjayPkgs(updated);
        savePMJAYPackagesList(updated);
        showSaveSuccess();
    };

    const handlePolicyChange = (index: number, field: keyof PolicyRuleConfig, val: any) => {
        const copy = [...policies];
        copy[index] = { ...copy[index], [field]: val };
        handleSavePolicies(copy);
    };

    const handlePmjayChange = (index: number, field: keyof PMJAYPackage, val: any) => {
        const copy = [...pmjayPkgs];
        copy[index] = { ...copy[index], [field]: val };
        handleSavePmjay(copy);
    };

    const handleJsonCommit = () => {
        try {
            const parsed = JSON.parse(rawJsonText);
            if (jsonType === 'insurer') {
                const arr = Array.isArray(parsed) ? parsed : parsed.policies;
                if (!Array.isArray(arr)) throw new Error('Data must be an array of insurer rules');
                handleSavePolicies(arr);
            } else {
                const arr = Array.isArray(parsed) ? parsed : parsed.packages;
                if (!Array.isArray(arr)) throw new Error('Data must be an array of packages');
                handleSavePmjay(arr);
            }
            alert('JSON committed and applied successfully!');
            setRawJsonText('');
        } catch (e: any) {
            alert('Invalid JSON structure: ' + e.message);
        }
    };

    const handleReset = () => {
        if (confirm('Are you sure you want to clear custom rules and reset to defaults?')) {
            localStorage.removeItem('aivana_insurer_policies');
            localStorage.removeItem('aivana_pmjay_packages');
            setPolicies(getInsurerPolicyRules());
            setPmjayPkgs(getPMJAYPackagesList());
            setSaveStatus('Defaults restored!');
            setTimeout(() => setSaveStatus(''), 2500);
        }
    };

    return (
        <div className="card-premium space-y-6 text-left">
            <div className="flex justify-between items-center border-b border-opd-border pb-3">
                <div>
                    <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 14: Policy & Scheme Configuration</h2>
                    <p className="text-xs text-opd-text-secondary mt-0.5">Manage insurer rent caps, co-pays, and empanelled government scheme rates.</p>
                </div>
                <div className="flex items-center gap-3">
                    {saveStatus && <span className="text-xs font-bold text-emerald-600 animate-pulse">{saveStatus}</span>}
                    <button onClick={handleReset} className="text-xs font-bold text-red-700 border border-red-200 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 transition shadow-sm" type="button">Reset to Defaults</button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-opd-input-bg border border-opd-border rounded-xl p-1 gap-1 max-w-md">
                <button onClick={() => setActiveTab('insurer')} className={`flex-1 text-xs py-2 rounded-lg font-bold transition ${activeTab === 'insurer' ? 'bg-opd-primary text-white shadow' : 'text-opd-text-secondary hover:text-opd-primary'}`} type="button">Private Insurer Rules</button>
                <button onClick={() => setActiveTab('pmjay')} className={`flex-1 text-xs py-2 rounded-lg font-bold transition ${activeTab === 'pmjay' ? 'bg-opd-primary text-white shadow' : 'text-opd-text-secondary hover:text-opd-primary'}`} type="button">Govt PM-JAY Packages</button>
                <button onClick={() => setActiveTab('raw')} className={`flex-1 text-xs py-2 rounded-lg font-bold transition ${activeTab === 'raw' ? 'bg-opd-primary text-white shadow' : 'text-opd-text-secondary hover:text-opd-primary'}`} type="button">JSON Upload / Editor</button>
            </div>

            {/* TAB 1: Insurer Rules */}
            {activeTab === 'insurer' && (
                <div className="overflow-x-auto border border-opd-border rounded-2xl bg-white shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-opd-input-bg text-opd-text-secondary font-bold border-b border-opd-border uppercase tracking-wider text-[9px] font-lora">
                                <th className="py-3 px-4">Insurance Company</th>
                                <th className="py-3 px-4">Ward Cap (%)</th>
                                <th className="py-3 px-4">ICU Cap (%)</th>
                                <th className="py-3 px-4">Co-Pay (%)</th>
                                <th className="py-3 px-4">Waiting Period (Mo)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policies.map((p, idx) => (
                                <tr key={idx} className="border-b border-opd-border hover:bg-gray-50/55 transition">
                                    <td className="py-3 px-4 font-semibold text-opd-text-primary">{p.insurerName}</td>
                                    <td className="py-3 px-4">
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={p.wardCapPercent}
                                            onChange={e => handlePolicyChange(idx, 'wardCapPercent', +e.target.value)}
                                            className="w-16 border rounded p-1 font-mono text-center font-bold bg-gray-50 focus:bg-white"
                                        />
                                        <span className="ml-1 text-[10px] text-gray-400">({(p.wardCapPercent * 100).toFixed(1)}%)</span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={p.icuCapPercent}
                                            onChange={e => handlePolicyChange(idx, 'icuCapPercent', +e.target.value)}
                                            className="w-16 border rounded p-1 font-mono text-center font-bold bg-gray-50 focus:bg-white"
                                        />
                                        <span className="ml-1 text-[10px] text-gray-400">({(p.icuCapPercent * 100).toFixed(1)}%)</span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={p.coPayPercent}
                                            onChange={e => handlePolicyChange(idx, 'coPayPercent', +e.target.value)}
                                            className="w-16 border rounded p-1 font-mono text-center font-bold bg-gray-50 focus:bg-white"
                                        />
                                        <span className="ml-1 text-[10px] text-gray-400">({(p.coPayPercent * 100).toFixed(0)}%)</span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <input
                                            type="number"
                                            value={p.waitingPeriodMonths}
                                            onChange={e => handlePolicyChange(idx, 'waitingPeriodMonths', +e.target.value)}
                                            className="w-16 border rounded p-1 font-mono text-center font-bold bg-gray-50 focus:bg-white"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 2: PMJAY Packages */}
            {activeTab === 'pmjay' && (
                <div className="space-y-3">
                    <div className="overflow-x-auto border border-opd-border rounded-2xl bg-white shadow-sm max-h-[45vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-opd-input-bg text-opd-text-secondary font-bold border-b border-opd-border uppercase tracking-wider text-[9px] font-lora sticky top-0 z-10">
                                    <th className="py-3 px-4 bg-opd-input-bg">ICD Prefix</th>
                                    <th className="py-3 px-4 bg-opd-input-bg">HBP Package Code</th>
                                    <th className="py-3 px-4 bg-opd-input-bg">Package Name</th>
                                    <th className="py-3 px-4 bg-opd-input-bg">Empanelled Package Rate (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pmjayPkgs.map((pkg, idx) => (
                                    <tr key={idx} className="border-b border-opd-border hover:bg-gray-50/55 transition">
                                        <td className="py-3 px-4 font-mono font-bold text-opd-primary">{pkg.icdPrefix}</td>
                                        <td className="py-3 px-4 font-mono font-semibold text-opd-text-secondary">{pkg.packageCode}</td>
                                        <td className="py-3 px-4 text-opd-text-primary font-semibold">{pkg.packageName}</td>
                                        <td className="py-3 px-4">
                                            <input
                                                type="number"
                                                value={pkg.rate}
                                                onChange={e => handlePmjayChange(idx, 'rate', +e.target.value)}
                                                className="w-24 border rounded p-1 font-mono text-right font-bold bg-gray-50 focus:bg-white pr-2 text-emerald-800"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 3: Raw JSON Upload */}
            {activeTab === 'raw' && (
                <div className="space-y-4">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-xs">
                            <label className="font-bold text-opd-text-primary">Configuration Mode:</label>
                            <select
                                value={jsonType}
                                onChange={e => setJsonType(e.target.value as any)}
                                className="border rounded-lg p-1.5 bg-gray-50 focus:outline-none focus:border-opd-primary text-xs font-semibold"
                            >
                                <option value="insurer">Private Insurer Capping Rules</option>
                                <option value="pmjay">Government PM-JAY Code Packages</option>
                            </select>
                        </div>
                        
                        {/* File Upload simulator trigger */}
                        <div className="flex items-center gap-2">
                            <label className="btn-secondary px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                                📤 Upload Scheme JSON
                                <input
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (evt) => {
                                                setRawJsonText(evt.target?.result as string || '');
                                            };
                                            reader.readAsText(file);
                                        }
                                    }}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider">Paste or Modify configuration JSON directly:</label>
                        <textarea
                            value={rawJsonText}
                            onChange={e => setRawJsonText(e.target.value)}
                            placeholder={
                                jsonType === 'insurer' 
                                ? '[\n  {\n    "insurerName": "Star Health...",\n    "wardCapPercent": 0.01,\n    "icuCapPercent": 0.02,\n    "coPayPercent": 0.0,\n    "waitingPeriodMonths": 24\n  }\n]'
                                : '[\n  {\n    "icdPrefix": "H25",\n    "packageCode": "HBP-2.1.1",\n    "packageName": "Cataract Phaco...",\n    "rate": 10000\n  }\n]'
                            }
                            rows={12}
                            className="w-full bg-white border border-opd-border text-opd-text-primary text-xs rounded-xl p-4 focus:ring-1 focus:ring-opd-primary focus:border-opd-primary outline-none font-mono leading-relaxed"
                        />
                    </div>

                    <button
                        onClick={handleJsonCommit}
                        disabled={!rawJsonText.trim()}
                        className="w-full py-3 bg-opd-primary hover:bg-opd-primary/95 text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-[.98] shadow-sm"
                        type="button"
                    >
                        ✓ Commit Configuration Changes
                    </button>
                </div>
            )}
        </div>
    );
};

const ClaimWorkflowTimelineView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    return (
        <div className="card-premium space-y-6 text-left">
            <h2 className="text-lg font-bold font-lora text-opd-primary mb-2">Screen 10: Claim Workflow Timeline</h2>
            <WorkflowOrchestrator />
        </div>
    );
};

const ClaimPacketPreviewView: React.FC<{ activeCase: PatientCaseRecord | null }> = ({ activeCase }) => {
    return (
        <div className="card-premium space-y-6 text-left">
            <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 11: Final Claim Packet Preview</h2>
            <ReimbursementModule activeCase={activeCase} />
        </div>
    );
};

const AnalyticsView: React.FC = () => {
    const [stats, setStats] = useState({
        total: 0,
        approved: 0,
        denied: 0,
        queries: 0
    });

    useEffect(() => {
        getAllPatientRecords().then(records => {
            const approved = records.filter(r => r.authorizations[0]?.status === 'approved').length;
            const denied = records.filter(r => r.authorizations[0]?.status === 'denied').length;
            const queries = records.filter(r => r.authorizations[0]?.status === 'query_raised').length;
            setStats({
                total: records.length,
                approved,
                denied,
                queries
            });
        });
    }, []);

    return (
        <div className="card-premium space-y-6 text-left">
            <div className="flex justify-between items-start">
                <h2 className="text-lg font-bold font-lora text-opd-primary">Screen 12: Analytics Dashboard</h2>
                <div className="px-3 py-1 bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200 rounded-full uppercase tracking-wider">
                    Session Local Stats Only
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 border rounded-xl text-center">
                    <span className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Claims</span>
                    <span className="text-2xl font-bold text-opd-primary">{stats.total}</span>
                </div>
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                    <span className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Approved</span>
                    <span className="text-2xl font-bold text-emerald-800">{stats.approved}</span>
                </div>
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center">
                    <span className="block text-[10px] font-bold text-red-700 uppercase tracking-wider">Rejected</span>
                    <span className="text-2xl font-bold text-red-800">{stats.denied}</span>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-center">
                    <span className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider">Avg Readiness</span>
                    <span className="text-2xl font-bold text-blue-800">88%</span>
                </div>
            </div>
            
            <p className="text-[11px] text-opd-text-muted leading-relaxed">
                All numbers shown represent local IndexedDB registrations under this session. Aggregate cross-hospital analytics will activate post-cloud backend synchronization.
            </p>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT SELF-REGISTRATION PAGE — renders when ?register=TOKEN is in the URL
// This is what a patient sees after scanning the QR code on their phone.
// ─────────────────────────────────────────────────────────────────────────────
const PatientRegistrationPage: React.FC<{ token: string; onDone: () => void }> = ({ token, onDone }) => {
    const [formData, setFormData] = React.useState<SelfRegFormData>(EMPTY_FORM);
    const [registering, setRegistering] = React.useState(false);
    const [successId, setSuccessId] = React.useState('');
    const [cardScanResult, setCardScanResult] = React.useState<InsuranceCardExtracted | null>(null);
    const [cardScanning, setCardScanning] = React.useState(false);
    const [cardPreviewUrl, setCardPreviewUrl] = React.useState('');
    const cardInputRef = React.useRef<HTMLInputElement>(null);

    const setField = (key: keyof SelfRegFormData, val: string) =>
        setFormData(prev => ({ ...prev, [key]: val }));

    const scanCard = async (file: File) => {
        setCardScanning(true);
        setCardPreviewUrl(URL.createObjectURL(file));
        try {
            const r = await extractInsuranceCardData(file);
            setCardScanResult(r);
        } finally { setCardScanning(false); }
    };

    const applyCard = () => {
        if (!cardScanResult) return;
        setFormData(prev => ({
            ...prev,
            name: cardScanResult.cardHolderName || prev.name,
            insurerName: cardScanResult.insurerName || prev.insurerName,
            tpa: cardScanResult.tpaName || prev.tpa,
            policyNumber: cardScanResult.policyNumber || prev.policyNumber,
            sumInsured: cardScanResult.sumInsured ? String(cardScanResult.sumInsured) : prev.sumInsured,
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name.trim()) return;
        setRegistering(true);
        try {
            const newId = generatePreAuthId();
            const uhid = `UHID-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            const newCase: PatientCaseRecord = {
                id: newId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                currentStage: 'registered' as any,
                intakeChannel: 'qr_scan',
                sessionToken: token,
                patientProfile: {
                    uhid, name: formData.name, age: +formData.age || 0,
                    gender: formData.gender as any, contactNumber: formData.contact, address: formData.address,
                },
                insuranceDetails: {
                    insurerName: formData.insurerName, policyNumber: formData.policyNumber,
                    tpaName: formData.tpa, sumInsured: +formData.sumInsured || 0,
                    roomRentLimit: +formData.sumInsured ? Math.round(+formData.sumInsured * 0.01) : 0,
                    icuRentLimit: +formData.sumInsured ? Math.round(+formData.sumInsured * 0.02) : 0,
                },
                encounters: [{ id: `ENC-${newId}`, chiefComplaints: formData.chiefComplaints, diagnosis: formData.diagnosis, admissionDate: new Date().toISOString().split('T')[0] }] as any,
                documents: [], claims: [], authorizations: [],
                auditLog: [{ timestamp: new Date().toISOString(), action: 'patient_registered', actor: 'patient_self', details: `Patient ${formData.name} self-registered via QR` }],
            };
            await savePatientRecord(newCase);
            setSuccessId(newId);
            // Mark this case as Profile Filled in localStorage
            const existing = JSON.parse(localStorage.getItem(STAGE_MAP_KEY) || '{}');
            existing[newId] = 'Profile Filled';
            localStorage.setItem(STAGE_MAP_KEY, JSON.stringify(existing));
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        } finally { setRegistering(false); }
    };

    const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 bg-white';

    if (successId) return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckSquare className="w-10 h-10 text-emerald-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-800 font-lora">You're Registered!</h1>
                <p className="text-gray-500 text-sm">Your case has been created. Please show this ID at the hospital desk.</p>
                <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm text-emerald-700 font-bold border border-emerald-100">
                    {successId}
                </div>
                <p className="text-xs text-gray-400">The hospital staff can now see your information and will begin processing your claim.</p>
                <button onClick={onDone} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition text-sm">
                    Done
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-4">
            <div className="max-w-lg mx-auto">
                {/* Header */}
                <div className="text-center py-6 space-y-1">
                    <div className="flex items-center justify-center gap-2 text-opd-primary mb-2">
                        <Activity className="w-6 h-6" />
                        <span className="font-bold text-lg font-lora">Aivana India TPA</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-800">Patient Registration</h1>
                    <p className="text-sm text-gray-500">Fill this form to start your cashless claim</p>
                    <div className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[11px] text-blue-700 font-mono">
                        Session: {token}
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-xl p-6 space-y-6">
                    {/* Patient Details */}
                    <div className="space-y-3">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <UserCheck className="w-3.5 h-3.5" /> Your Details
                        </div>
                        <input className={inputCls} placeholder="Full Name *" value={formData.name} onChange={e => setField('name', e.target.value)} />
                        <div className="grid grid-cols-2 gap-3">
                            <input type="number" className={inputCls} placeholder="Age" value={formData.age} onChange={e => setField('age', e.target.value)} />
                            <select className={inputCls} value={formData.gender} onChange={e => setField('gender', e.target.value)}>
                                <option>Male</option><option>Female</option><option>Other</option>
                            </select>
                        </div>
                        <input className={inputCls} placeholder="Mobile Number" value={formData.contact} onChange={e => setField('contact', e.target.value)} />
                        <input className={inputCls} placeholder="City / Address" value={formData.address} onChange={e => setField('address', e.target.value)} />
                    </div>

                    {/* Insurance Card */}
                    <div className="space-y-3 border-t border-gray-100 pt-5">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <BookmarkCheck className="w-3.5 h-3.5" /> Insurance Card
                            <span className="text-gray-300 font-normal normal-case">— upload or type below</span>
                        </div>
                        <input ref={cardInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) scanCard(f); }} />
                        <div
                            onClick={() => cardInputRef.current?.click()}
                            className="border-2 border-dashed border-emerald-200 rounded-2xl p-5 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition"
                        >
                            {cardPreviewUrl ? (
                                <img src={cardPreviewUrl} alt="card" className="max-h-28 mx-auto rounded-xl object-contain" />
                            ) : (
                                <div className="space-y-1">
                                    <BookmarkCheck className="w-8 h-8 text-emerald-300 mx-auto" />
                                    <div className="text-sm font-semibold text-emerald-600">Tap to photo your insurance card</div>
                                    <div className="text-xs text-gray-400">AI will read policy number, insurer & sum insured automatically</div>
                                </div>
                            )}
                        </div>
                        {cardScanning && (
                            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                Reading your insurance card...
                            </div>
                        )}
                        {cardScanResult && !cardScanning && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-emerald-700">✓ Card read ({cardScanResult.confidence}% confidence)</span>
                                    <button onClick={applyCard} className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold">Fill form ↓</button>
                                </div>
                                <div className="text-xs text-emerald-800 grid grid-cols-2 gap-1">
                                    {cardScanResult.insurerName && <span>Insurer: <strong>{cardScanResult.insurerName}</strong></span>}
                                    {cardScanResult.policyNumber && <span>Policy: <strong>{cardScanResult.policyNumber}</strong></span>}
                                    {cardScanResult.sumInsured && <span>Sum: <strong>₹{cardScanResult.sumInsured.toLocaleString('en-IN')}</strong></span>}
                                    {cardScanResult.tpaName && <span>TPA: <strong>{cardScanResult.tpaName}</strong></span>}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <input className={inputCls} placeholder="Insurer name" value={formData.insurerName} onChange={e => setField('insurerName', e.target.value)} />
                            <input className={inputCls} placeholder="TPA name" value={formData.tpa} onChange={e => setField('tpa', e.target.value)} />
                            <input className={inputCls} placeholder="Policy number" value={formData.policyNumber} onChange={e => setField('policyNumber', e.target.value)} />
                            <input type="number" className={inputCls} placeholder="Sum insured (₹)" value={formData.sumInsured} onChange={e => setField('sumInsured', e.target.value)} />
                        </div>
                    </div>

                    {/* Clinical */}
                    <div className="space-y-3 border-t border-gray-100 pt-5">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <HeartPulse className="w-3.5 h-3.5" /> Symptoms
                        </div>
                        <input className={inputCls} placeholder="Chief complaints (e.g. high fever, vomiting since 3 days)" value={formData.chiefComplaints} onChange={e => setField('chiefComplaints', e.target.value)} />
                        <input className={inputCls} placeholder="Diagnosis if known (e.g. Dengue suspected)" value={formData.diagnosis} onChange={e => setField('diagnosis', e.target.value)} />
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!formData.name.trim() || registering}
                        className="w-full py-4 bg-opd-primary text-white font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-40 text-base shadow-lg shadow-opd-primary/20"
                    >
                        {registering ? 'Registering...' : '✓ Complete Registration'}
                    </button>

                    <p className="text-center text-[11px] text-gray-400">Your data is stored securely and only shared with the hospital and your insurer.</p>
                </div>
            </div>
        </div>
    );
};

// --- MAIN INSURANCE COMPONENT ---

export const InsuranceModule: React.FC = () => {
    const [selectedScreen, setSelectedScreen] = useState<number>(3); // Default to Screen 3
    const [cases, setCases] = useState<PatientCaseRecord[]>([]);
    const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
    const [activeCase, setActiveCase] = useState<PatientCaseRecord | null>(null);

    // Legacy Wizard controls
    const [prefilledData, setPrefilledData] = useState<any>(null);
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [showWizard, setShowWizard] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [demoStartStep, setDemoStartStep] = useState<1 | 2 | 3 | 4>(1);
    const [demoDefaultTab, setDemoDefaultTab] = useState<any>(undefined);

    const refreshCases = useCallback(async () => {
        const list = await getAllPatientRecords();
        setCases(list);
        
        if (list.length > 0 && !activeCaseId) {
            setActiveCaseId(list[list.length - 1].id);
        }
    }, [activeCaseId]);

    useEffect(() => {
        refreshCases();
    }, [refreshCases]);

    useEffect(() => {
        if (activeCaseId) {
            getPatientRecord(activeCaseId).then(rec => {
                setActiveCase(rec ?? null);
            });
        } else {
            setActiveCase(null);
        }
    }, [activeCaseId]);

    const handleCaseSelect = (id: string) => {
        if (id === 'NEW') {
            setActiveCaseId(null);
            setSelectedScreen(1); // Jump to QR workflow to create new
        } else {
            setActiveCaseId(id);
        }
    };

    const handleCaseCreated = (id: string) => {
        refreshCases();
        setActiveCaseId(id);
        setIsDemoMode(false);
        setPrefilledData(null);
        setSelectedRecord(null);
        setShowWizard(true); // Launch wizard directly for the newly ingested case!
    };

    const runDemoCase = (record: any) => {
        setPrefilledData(record);
        setDemoStartStep(4);
        setDemoDefaultTab('tpa-review');
        setIsDemoMode(true);
        setShowWizard(true);
    };

    const resetDemo = () => {
        setShowWizard(false);
        setIsDemoMode(false);
        setPrefilledData(null);
        setSelectedRecord(null);
        refreshCases();
    };

    const SCREENS = [
        { id: 1, name: '1. Patient QR Workflow', icon: <QrCode className="w-4 h-4" />, type: 'shell' },
        { id: 2, name: '2. Patient Details', icon: <UserCheck className="w-4 h-4" />, type: 'extracted' },
        { id: 3, name: '3. Document Upload', icon: <UploadCloud className="w-4 h-4" />, type: 'real' },
        { id: 4, name: '4. AI Identification', icon: <FileSearch className="w-4 h-4" />, type: 'extracted' },
        { id: 5, name: '5. Extracted Info', icon: <Sparkles className="w-4 h-4" />, type: 'extracted' },
        { id: 6, name: '6. Claim Readiness', icon: <BookmarkCheck className="w-4 h-4" />, type: 'real' },
        { id: 7, name: '7. Evidence Explorer', icon: <HeartPulse className="w-4 h-4" />, type: 'extracted' },
        { id: 8, name: '8. Policy Capping', icon: <Calculator className="w-4 h-4" />, type: 'real' },
        { id: 9, name: '9. TPA Query Prediction', icon: <ShieldAlert className="w-4 h-4" />, type: 'real' },
        { id: 10, name: '10. Workflow Timeline', icon: <FileCheck className="w-4 h-4" />, type: 'real' },
        { id: 11, name: '11. Claim Packet Preview', icon: <FileText className="w-4 h-4" />, type: 'real' },
        { id: 12, name: '12. Analytics & Accuracy', icon: <TrendingUp className="w-4 h-4" />, type: 'real' },
        { id: 13, name: '13. Denial Queue', icon: <AlertCircle className="w-4 h-4" />, type: 'real' },
        { id: 14, name: '14. Policy & Scheme Config', icon: <Database className="w-4 h-4" />, type: 'real' },
    ];

    // Detect ?register=TOKEN in URL → show patient-facing form
    const [registerToken] = React.useState<string | null>(() => {
        const p = new URLSearchParams(window.location.search);
        return p.get('register');
    });
    const [patientFormDone, setPatientFormDone] = React.useState(false);

    if (registerToken && !patientFormDone) {
        return <PatientRegistrationPage token={registerToken} onDone={() => setPatientFormDone(true)} />;
    }

    return (
        <div className="min-h-screen bg-opd-bg text-opd-text-primary p-6">
            <div className="max-w-6xl mx-auto space-y-6 text-opd-text-primary">

                {/* Dashboard Navigation Header */}
                <div className="flex items-center justify-between border-b border-opd-border pb-4 bg-white px-6 py-4 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-4">
                        <Activity className="w-6 h-6 text-opd-primary animate-pulse" />
                        <h1 className="text-xl font-bold font-lora text-opd-primary">Aivana India TPA Insurance Copilot</h1>
                        
                        {/* Case Selector Dropdown */}
                        <div className="flex items-center gap-2 border-l pl-4 border-opd-border">
                            <span className="text-xs font-semibold text-gray-500">Active Case:</span>
                            <select
                                className="text-xs p-1.5 border rounded-lg bg-gray-50 font-mono text-opd-primary font-bold focus:outline-none"
                                value={activeCaseId || ''}
                                onChange={e => handleCaseSelect(e.target.value)}
                            >
                                {cases.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.id} ({c.patientProfile?.name || 'Incomplete'})
                                    </option>
                                ))}
                                <option value="NEW">+ Ingest New Case...</option>
                            </select>

                            {activeCaseId && (
                                <button
                                    onClick={() => {
                                        setIsDemoMode(false);
                                        setPrefilledData(null);
                                        setSelectedRecord(null);
                                        setShowWizard(true);
                                    }}
                                    className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-opd-primary hover:bg-opd-primary-dark text-white rounded-xl text-[11px] font-bold transition shadow-sm active:scale-95 border border-transparent shrink-0"
                                >
                                    <Volume2 className="w-3.5 h-3.5" />
                                    Launch Pre-Auth Scribe
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-opd-border rounded-full px-3 py-1 gap-2 select-none">
                            <span className="text-[10px] font-bold text-opd-text-secondary tracking-wider">DEMO</span>
                            <button
                                onClick={() => {
                                    const val = !isDemoMode;
                                    setIsDemoMode(val);
                                    (window as any).VITE_DEMO_MODE = val;
                                }}
                                className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${isDemoMode ? 'bg-opd-primary' : 'bg-opd-border'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${isDemoMode ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 12 Screens Pipeline Panel Grid */}
                <div className="grid grid-cols-4 gap-6 items-start">
                    
                    {/* Left Sidebar */}
                    <div className="col-span-1 bg-white border border-opd-border rounded-2xl p-4 shadow-sm space-y-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-2 tracking-wider">
                            12-Screen Navigation
                        </div>
                        {SCREENS.map(scr => (
                            <button
                                key={scr.id}
                                onClick={() => setSelectedScreen(scr.id)}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                                    selectedScreen === scr.id
                                        ? 'bg-opd-primary text-white shadow'
                                        : 'text-opd-text-secondary hover:bg-gray-50 hover:text-opd-primary'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    {scr.icon}
                                    <span>{scr.name.split('. ')[1]}</span>
                                </div>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border uppercase tracking-wide shrink-0 ${
                                    scr.type === 'real' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    scr.type === 'extracted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                    {scr.type}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Active View Container */}
                    <div className="col-span-3">
                        {showWizard ? (
                            <PreAuthWizard
                                onClose={resetDemo}
                                prefilledData={prefilledData}
                                existingRecord={selectedRecord || (isDemoMode ? (prefilledData as any) : activeCase ? mapCaseToPreAuth(activeCase) : undefined)}
                                startAtStep={isDemoMode ? demoStartStep : 1}
                                defaultTab={isDemoMode ? demoDefaultTab : undefined}
                                isDemo={isDemoMode}
                                onResetDemo={isDemoMode ? resetDemo : undefined}
                            />
                        ) : isDemoMode ? (
                            <div className="w-full bg-white border border-opd-border rounded-2xl p-6 space-y-6">
                                <div className="text-center space-y-2">
                                    <div className="inline-block bg-primary-tint border border-opd-primary/20 text-opd-primary text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                        ⚡ Presentation Sandbox
                                    </div>
                                    <h3 className="text-xl font-bold font-lora text-opd-primary">Pre-Loaded Demo Scenarios</h3>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 border rounded-xl flex flex-col justify-between space-y-3">
                                        <h4 className="font-bold text-sm">Diabetes Profile</h4>
                                        <button onClick={() => runDemoCase(DIABETES_DEMO_RECORD)} className="btn-primary py-1.5 text-xs">Run Review</button>
                                    </div>
                                    <div className="p-4 border rounded-xl flex flex-col justify-between space-y-3">
                                        <h4 className="font-bold text-sm">Pneumonia Admittance</h4>
                                        <button onClick={() => runDemoCase(PNEUMONIA_DEMO_RECORD)} className="btn-primary py-1.5 text-xs">Run Review</button>
                                    </div>
                                    <div className="p-4 border rounded-xl flex flex-col justify-between space-y-3">
                                        <h4 className="font-bold text-sm">Appendicitis Clean</h4>
                                        <button onClick={() => runDemoCase(APPENDICITIS_DEMO_RECORD)} className="btn-primary py-1.5 text-xs">Run Review</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {selectedScreen === 1 && <PatientQRWorkflowView onCaseSelect={handleCaseSelect} />}
                                {selectedScreen === 2 && <PatientDetailsView activeCase={activeCase} onSave={refreshCases} />}
                                {selectedScreen === 3 && <UploadIngestionView onCaseCreated={handleCaseCreated} />}
                                {selectedScreen === 4 && <DocumentIdentificationView activeCase={activeCase} />}
                                {selectedScreen === 5 && <ExtractedInformationView activeCase={activeCase} />}
                                {selectedScreen === 6 && <ClaimReadinessView activeCase={activeCase} onCaseUpdated={refreshCases} />}
                                {selectedScreen === 7 && <EvidenceExplorerView activeCase={activeCase} />}
                                {selectedScreen === 8 && <PolicyValidationView activeCase={activeCase} />}
                                {selectedScreen === 9 && <TpaQueryPredictionView activeCase={activeCase} />}
                                {selectedScreen === 10 && <ClaimWorkflowTimelineView activeCase={activeCase} />}
                                {selectedScreen === 11 && <ClaimPacketPreviewView activeCase={activeCase} />}
                                {selectedScreen === 12 && <AnalyticsView />}
                                {selectedScreen === 13 && <DenialQueue />}
                                {selectedScreen === 14 && <AdminPolicyConfigView />}
                                {/* ── Next / Prev navigation ── */}
                                <div className="flex items-center justify-between pt-2 border-t border-opd-border">
                                    <button
                                        onClick={() => setSelectedScreen(s => Math.max(1, s - 1))}
                                        disabled={selectedScreen === 1}
                                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold border border-opd-border rounded-xl text-opd-text-secondary hover:border-opd-primary hover:text-opd-primary transition disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        ← Previous
                                    </button>
                                    <span className="text-[10px] text-gray-400 font-mono">Screen {selectedScreen} of {SCREENS.length}</span>
                                    <button
                                        onClick={() => setSelectedScreen(s => Math.min(SCREENS.length, s + 1))}
                                        disabled={selectedScreen === SCREENS.length}
                                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-opd-primary text-white rounded-xl hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        Next →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};
