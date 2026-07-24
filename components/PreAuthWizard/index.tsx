import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    PreAuthRecord, PatientRecord, InsurancePolicyDetails,
    ClinicalDetails, AdmissionDetails, CostEstimate, WizardState
} from './types';
import { WizardProgress } from './WizardProgress';
import { PatientInsuranceStep } from './PatientInsuranceStep';
import { ClinicalDetailsStep } from './ClinicalDetailsStep';
import { AdmissionCostStep } from './AdmissionCostStep';
import { DocumentsGenerateStep } from './DocumentsGenerateStep';
import { ClaimReadinessRail } from './ClaimReadinessRail';
import { VoiceExtractedData } from '../../services/voiceDictationService';
import { savePreAuth, savePatient, generatePreAuthId, generatePatientId } from '../../services/masterPatientRecord';
import { calculateTotals } from '../../utils/costCalculator';
import { calculateCost, findConditionByICD } from '../../services/costEstimationService';
import { classifyCaseComplexity } from '../../utils/complexityClassifier';
import { todayISO, nowTimeString } from '../../utils/formatters';
export type EvidenceReviewReport = any;
import { validateCode, mapToWhoCode, getDescription } from '../../services/icdService';
import { NoteComparisonItem } from '../../services/noteDocumentComparison';


interface PreAuthWizardProps {
    onClose: () => void;
    existingRecord?: PreAuthRecord;
    prefilledData?: Partial<PreAuthRecord>;
    startAtStep?: 1 | 2 | 3 | 4;
    defaultTab?: 'docs' | 'necessity' | 'summary' | 'declarations' | 'tpa-review';
    isDemo?: boolean;
    onResetDemo?: () => void;
}

/**
 * Ensures no ICD-10 code that fails WHO table validation can live in the record.
 * Any unrecognised code is mapped to its WHO parent or reset to the 'Pending ICD-10' placeholder.
 */
const sanitizeDiagnoses = (record: Partial<PreAuthRecord>): Partial<PreAuthRecord> => {
    if (!record.clinical?.diagnoses) return record;
    const cleaned = record.clinical.diagnoses.map(dx => {
        const code = dx.icd10Code ?? '';
        const isPlaceholder = !code || code === 'Pending ICD-10' || code === 'Selection required';
        if (!isPlaceholder && !validateCode(code)) {
            const mapped = mapToWhoCode(code);
            if (mapped) {
                console.log(`[sanitizeDiagnoses] Mapping non-WHO code "${code}" -> valid WHO code "${mapped}"`);
                return {
                    ...dx,
                    icd10Code: mapped,
                    icd10Description: getDescription(mapped)
                };
            }
            console.warn(`[sanitizeDiagnoses] Rejecting unrecognised code "${code}" — resetting to Pending ICD-10`);
            return { ...dx, icd10Code: 'Pending ICD-10', icd10Description: 'Selection required', isSelected: dx.isSelected };
        }
        return dx;
    });
    return { ...record, clinical: { ...record.clinical, diagnoses: cleaned } };
};

const buildEmptyRecord = (): Partial<PreAuthRecord> => ({
    id: generatePreAuthId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    patient: {},
    insurance: { dataSource: 'manual' },
    clinical: {
        dataSource: 'manual_entry',
        diagnoses: [],
        selectedDiagnosisIndex: 0,
        proposedLineOfTreatment: { medical: false, surgical: false, intensiveCare: false, investigation: false, nonAllopathic: false },
        vitals: { bp: '', pulse: '', temp: '', spo2: '', rr: '' },
        voiceCapturedFindings: [],
        chiefComplaints: '',
        durationOfPresentAilment: '',
        natureOfIllness: 'Acute',
        historyOfPresentIllness: '',
        relevantClinicalFindings: '',
        treatmentTakenSoFar: '',
        reasonForHospitalisation: '',
        additionalClinicalNotes: '',
    },
    admission: {
        admissionType: 'Emergency',
        dateOfAdmission: todayISO(),
        timeOfAdmission: nowTimeString(),
        roomCategory: 'General Ward',
        expectedDaysInICU: 0,
        expectedDaysInRoom: 0,
        expectedLengthOfStay: 0,
        pastMedicalHistory: {
            diabetes: { present: false }, hypertension: { present: false }, heartDisease: { present: false },
            asthma: { present: false }, epilepsy: { present: false }, cancer: { present: false },
            kidney: { present: false }, liver: { present: false }, hiv: { present: false },
            alcoholism: { present: false }, smoking: { present: false },
            hyperlipidemia: { present: false }, osteoarthritis: { present: false },
            anyOther: { present: false },
        },
        previousHospitalization: { wasHospitalizedBefore: false },
    },
    costEstimate: calculateTotals({}, 0),
    uploadedDocuments: [],
    documentRequirements: [],
    declarations: { patient: {}, doctor: {}, hospital: {} },
    outputs: {},
});

export const PreAuthWizard: React.FC<PreAuthWizardProps> = ({ 
    onClose, 
    existingRecord, 
    prefilledData,
    startAtStep = 1,
    defaultTab,
    isDemo = false,
    onResetDemo
}) => {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(() => {
        if (startAtStep && startAtStep !== 1) return startAtStep as any;
        const savedStep = typeof window !== 'undefined' ? localStorage.getItem('aivana_active_step') : null;
        return savedStep ? (Math.min(Math.max(parseInt(savedStep, 10), 1), 4) as any) : (startAtStep as any);
    });
    const [isStep1OcrDone, setIsStep1OcrDone] = useState(false);
    const [isStep1Extracting, setIsStep1Extracting] = useState(false);
    // TPA report — hoisted here so the rail shows on all steps
    const [tpaReport, setTpaReport] = useState<EvidenceReviewReport | null>(null);
    const [tpaLoading, setTpaLoading] = useState(false);
    const tpaFetchKey = useRef<string>('');
    // Note comparison — stored here so Sarvam-enhanced results from ClinicalDetailsStep
    // flow into the live readiness score on ALL steps via ClaimReadinessRail
    const [noteComparisonItems, setNoteComparisonItems] = useState<NoteComparisonItem[] | undefined>(undefined);
    const [record, setRecord] = useState<Partial<PreAuthRecord>>(() => {
        if (existingRecord) return sanitizeDiagnoses(existingRecord);
        if (typeof window !== 'undefined') {
            const savedDraft = localStorage.getItem('aivana_active_preauth_draft');
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    if (parsed && (parsed.patient?.patientName || parsed.insurance?.insurerName || parsed.id)) {
                        return sanitizeDiagnoses(parsed);
                    }
                } catch (e) {
                    console.warn('[PreAuthWizard] Failed to restore draft:', e);
                }
            }
        }
        const empty = buildEmptyRecord();
        if (prefilledData) {
            const merged = {
                ...empty,
                ...prefilledData,
                patient: { ...empty.patient, ...prefilledData.patient },
                clinical: { ...empty.clinical, ...prefilledData.clinical },
                admission: { ...empty.admission, ...prefilledData.admission },
                costEstimate: prefilledData.costEstimate ?? empty.costEstimate,
            };
            return sanitizeDiagnoses(merged);
        }
        return empty;
    });

    const [saving, setSaving] = useState(false);

    // ── Rail visibility: hide on Step 1 until a real extraction score exists ──
    // On step 1: only show AFTER extraction completes AND we're not mid-scan.
    // On steps 2–4: always show.
    const showReadinessRail = step === 1
        ? (isStep1OcrDone && !isStep1Extracting)
        : true;

    const recordRef = useRef<Partial<PreAuthRecord>>(record);
    // Debounce timer for auto-TPA review refresh
    const tpaDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        recordRef.current = record;
    }, [record]);

    // Auto-re-run TPA evidence review 2.5 s after ICD or clinical fields settle
    useEffect(() => {
        const icd = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0]?.icd10Code;
        const hasIcd = icd && icd !== 'Pending ICD-10' && icd !== 'Selection required';
        if (!hasIcd) return;

        if (tpaDebounceTimer.current) clearTimeout(tpaDebounceTimer.current);
        tpaDebounceTimer.current = setTimeout(async () => {
            const key = `${record.id}:${icd}:${record.clinical?.natureOfIllness}:${record.clinical?.proposedLineOfTreatment?.surgical}`;
            if (tpaFetchKey.current === key) return; // unchanged — skip
            tpaFetchKey.current = key;
            setTpaLoading(true);
            try {
                const { runEvidenceReview } = await import('../../engine/evidenceReview');
                const report = await runEvidenceReview(recordRef.current as PreAuthRecord);
                setTpaReport(report);
            } catch (e) {
                console.warn('[AutoTPA] Evidence review failed:', e);
            } finally {
                setTpaLoading(false);
            }
        }, 2500);

        return () => {
            if (tpaDebounceTimer.current) clearTimeout(tpaDebounceTimer.current);
        };
    }, [
        record.clinical?.diagnoses,
        record.clinical?.selectedDiagnosisIndex,
        record.clinical?.proposedLineOfTreatment?.surgical,
        record.clinical?.natureOfIllness,
    ]);


    // priorAuthOrchestrator useEffect stripped per prior AI chains cleanup
    useEffect(() => {
        console.log(`[PreAuthWizard] MOUNTED with initial record ID: ${record.id}`);
        return () => {
            console.log(`[PreAuthWizard] UNMOUNTED record ID: ${record.id}`);
        };
    }, []);

    useEffect(() => {
        console.log(`[PreAuthWizard] Step changed to: ${step}. Current Patient Name: "${record.patient?.patientName || ''}", Insurer: "${record.insurance?.insurerName || ''}"`);
        if (typeof window !== 'undefined') {
            localStorage.setItem('aivana_active_step', String(step));
        }
    }, [step, record.patient?.patientName, record.insurance?.insurerName]);

    const updateRecord = useCallback(async (partial: Partial<PreAuthRecord>) => {
        const prev = recordRef.current;
        const merged = { ...prev, ...partial, updatedAt: new Date().toISOString() };
        const updated = sanitizeDiagnoses(merged);

        // Calculate Case Complexity on the fly
        const { complexity, reason } = classifyCaseComplexity(updated);
        const finalUpdated = { ...updated, complexity, complexityReason: reason } as PreAuthRecord;

        recordRef.current = finalUpdated; // Update ref immediately to prevent async state race conditions
        setRecord(finalUpdated);

        try {
            if (typeof window !== 'undefined') {
                localStorage.setItem('aivana_active_preauth_draft', JSON.stringify(finalUpdated));
            }
            await savePreAuth(finalUpdated);
        } catch (e) {
            console.error('[PreAuthWizard] Failed to save pre-auth to database:', e);
        }
    }, []);

    const handleNext = async () => {
        setSaving(true);
        await updateRecord({});
        setSaving(false);
        if (step < 4) setStep((step + 1) as any);
    };

    const handleBack = () => {
        if (step > 1) setStep((step - 1) as any);
    };

    const handleGenerate = async (irdaiText: string) => {
        const finalStatus = (record.uploadedDocuments ?? []).length === 0 ? 'pending_documents' : 'ready_to_submit';
        await updateRecord({ status: finalStatus, outputs: { irdaiText } });
        if (record.patient?.patientName) {
            const pat = { id: generatePatientId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...record.patient } as PatientRecord;
            await savePatient(pat);
        }
    };


    // ── Voice dictation: bulk-fill all sections, auto-calculate costs, jump to step 4 ──
    const handleVoiceComplete = async (data: VoiceExtractedData) => {
        const los = data.admission.expectedLengthOfStay ?? 0;
        const roomDays = data.admission.expectedDaysInRoom ?? los;
        const icuDays = data.admission.expectedDaysInICU ?? 0;

        // Build a smart cost estimate from the Gemini-extracted admission info
        let baseCost = calculateTotals({
            expectedRoomDays: roomDays,
            expectedIcuDays: icuDays,
        }, data.insurance.sumInsured ?? 0);

        // ✅ FIX: If voice extracted ICD code, auto-calculate costs from ICD database
        const voiceDx = data.clinical?.diagnoses?.[0];
        const voiceICD = voiceDx?.icd10Code;
        if (voiceICD) {
            const roomCat = data.admission.roomCategory ?? 'General Ward';
            const isPMJAY = data.insurance.policyType?.toLowerCase().includes('pmjay') ||
                data.insurance.policyType?.toLowerCase().includes('ayushman') || false;

            console.log(`[VoiceCostFix] Calculating costs from ICD DB: ${voiceICD}, room=${roomCat}, PMJAY=${isPMJAY}`);
            const est = calculateCost(voiceICD, roomCat, isPMJAY, los || undefined, icuDays || undefined);

            // Also fix LOS from ICD database if voice didn't capture it
            const icdCond = findConditionByICD(voiceICD);
            const finalLOS = los || (icdCond?.los.avg ?? 5);
            const finalICU = icuDays || (icdCond?.los.icu ?? 0);
            const finalWard = finalLOS - finalICU;

            baseCost = calculateTotals({
                roomRentPerDay: est.breakdown.room_rent / Math.max(1, est.los.ward_days),
                expectedRoomDays: finalWard,
                nursingChargesPerDay: est.breakdown.nursing_charges / Math.max(1, est.los.ward_days),
                icuChargesPerDay: finalICU > 0 ? est.breakdown.icu_charges / finalICU : 0,
                expectedIcuDays: finalICU,
                otCharges: est.breakdown.ot_charges,
                surgeonFee: est.breakdown.surgeon_fee,
                anesthetistFee: est.breakdown.anesthetist_fee,
                consultantFee: est.breakdown.consultant_fee,
                investigationsEstimate: est.breakdown.investigations,
                medicinesEstimate: est.breakdown.medicines,
                consumablesEstimate: est.breakdown.consumables,
                miscCharges: est.breakdown.miscellaneous,
                ...(est.source === 'PMJAY' && est.pmjay_details ? {
                    isPackageRate: true,
                    packageName: est.pmjay_details.package_name,
                    packageAmount: est.pmjay_details.package_rate,
                } : {}),
            }, data.insurance.sumInsured ?? 0);

            console.log(`[VoiceCostFix] Result: LOS=${finalLOS}, Total=₹${baseCost.totalEstimatedCost}`);
        }

        const merged: Partial<PreAuthRecord> = {
            ...record,
            patient: { ...record.patient, ...data.patient },
            insurance: { ...record.insurance, ...data.insurance, dataSource: 'manual' as const },
            clinical: {
                ...record.clinical,
                ...data.clinical,
                // ICD codes from voice are ALWAYS neutralised — user must confirm via ICD picker
                diagnoses: data.clinical?.diagnoses?.map((dx, idx) => ({
                    ...dx,
                    icd10Code: 'Pending ICD-10',
                    icd10Description: 'Selection required',
                    isSelected: idx === 0
                })) || []
            } as Partial<ClinicalDetails>,
            admission: {
                ...record.admission,
                ...data.admission,
                dateOfAdmission: record.admission?.dateOfAdmission ?? todayISO(),
                timeOfAdmission: record.admission?.timeOfAdmission ?? nowTimeString(),
            } as Partial<AdmissionDetails>,
            costEstimate: baseCost,
            updatedAt: new Date().toISOString(),
        };

        setSaving(true);
        const updated = { ...merged, updatedAt: new Date().toISOString() };
        setRecord(updated);
        try { await savePreAuth(updated as PreAuthRecord); } catch (e) { /**/ }
        setSaving(false);
        // Jump straight to Documents & Generate — all data is pre-filled
        setStep(4);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-opd-text-primary/45 backdrop-blur-sm overflow-y-auto">
            <div className="wizard-modal-container bg-white border border-opd-border rounded-2xl w-full max-w-5xl my-8 mx-4 shadow-2xl overflow-hidden flex flex-col" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-opd-border bg-opd-input-bg text-opd-text-primary">
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-opd-primary font-lora">New Pre-Authorization</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 bg-white border border-opd-border text-opd-text-secondary rounded-md select-all">{record.id}</span>
                        {record.complexity && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                record.complexity === 'Low' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                record.complexity === 'Medium' ? 'bg-sky-50 border-sky-200 text-sky-700' :
                                'bg-rose-50 border-rose-200 text-rose-700'
                            }`} title={record.complexityReason}>
                                {record.complexity} Complexity {record.complexity === 'Low' && 'Fast-Track'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        {saving && (
                            <span className="text-[10px] text-opd-text-secondary flex items-center gap-1.5 font-medium">
                                <svg className="w-3 h-3 animate-spin text-opd-primary" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving...
                            </span>
                        )}
                        <button onClick={onClose} className="text-opd-text-secondary hover:text-opd-primary p-1 rounded-lg hover:bg-opd-bg transition-colors" type="button">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Two-column body: main content + persistent rail ── */}
                <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                    {/* ── Main content column ─────────────────────────── */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                        {/* Progress Bar */}
                        <div className="px-6 pt-5 pb-3">
                            <WizardProgress currentStep={step} onStepClick={s => setStep(s)} />
                        </div>

                        {/* Step Content */}
                        <div className="px-6 pb-6 overflow-y-auto" style={{ flex: 1, minHeight: 500 }}>
                            {step === 1 && (
                                <PatientInsuranceStep
                                    patient={record.patient ?? {}}
                                    insurance={record.insurance ?? {}}
                                    clinical={record.clinical ?? {}}
                                    onPatientChange={p => updateRecord({ patient: p })}
                                    onInsuranceChange={ins => updateRecord({ insurance: ins })}
                                    onClinicalChange={c => updateRecord({ clinical: c })}
                                    onNext={handleNext}
                                    uploadedDocuments={record.uploadedDocuments ?? []}
                                    onDocumentsChange={docs => updateRecord({ uploadedDocuments: docs })}
                                    onExtractionComplete={(p, ins, docs, clin) => updateRecord({ patient: p, insurance: ins, uploadedDocuments: docs, ...(clin ? { clinical: clin } : {}) })}
                                    onExtractingChange={setIsStep1Extracting}
                                    onOcrDoneChange={setIsStep1OcrDone}
                                />
                            )}
                            {step === 2 && (
                                <ClinicalDetailsStep
                                    clinical={record.clinical ?? {}}
                                    caseId={record.id}
                                    doctorName={record.declarations?.doctor?.doctorName || 'Treating Doctor'}
                                    onClinicalChange={c => updateRecord({ clinical: c })}
                                    onNext={handleNext}
                                    onBack={handleBack}
                                    complexity={record.complexity}
                                    patientData={record.patient ?? {}}
                                    insuranceData={record.insurance ?? {}}
                                    onNoteComparisonResult={setNoteComparisonItems}
                                />
                            )}
                            {step === 3 && (
                                <AdmissionCostStep
                                    admission={record.admission ?? {}}
                                    cost={record.costEstimate ?? {}}
                                    clinical={record.clinical ?? {}}
                                    sumInsured={record.insurance?.sumInsured ?? 0}
                                    onAdmissionChange={a => updateRecord({ admission: a })}
                                    onCostChange={c => updateRecord({ costEstimate: c })}
                                    onNext={handleNext}
                                    onBack={handleBack}
                                    complexity={record.complexity}
                                />
                            )}
                            {step === 4 && (
                                <DocumentsGenerateStep
                                    record={record}
                                    onRecordChange={r => updateRecord(r)}
                                    onBack={handleBack}
                                    onGenerate={handleGenerate}
                                    defaultTab={defaultTab}
                                    isDemo={isDemo}
                                    onResetDemo={onResetDemo}
                                    onJumpToStep={s => setStep(s)}
                                    externalTpaReport={tpaReport}
                                />
                            )}
                        </div>

                        {/* Mobile rail accordion — appears below step content */}
                        {showReadinessRail && (
                            <ClaimReadinessRail
                                record={record}
                                tpaReport={tpaReport}
                                tpaLoading={tpaLoading}
                                onJumpToStep={s => setStep(s)}
                                mode="mobile"
                                noteComparisonItems={noteComparisonItems}
                            />
                        )}
                    </div>

                    {/* ── Persistent right rail (desktop ≥1024px) ────── */}
                    {showReadinessRail && (
                        <ClaimReadinessRail
                            record={record}
                            tpaReport={tpaReport}
                            tpaLoading={tpaLoading}
                            onJumpToStep={s => setStep(s)}
                            mode="desktop"
                            noteComparisonItems={noteComparisonItems}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
