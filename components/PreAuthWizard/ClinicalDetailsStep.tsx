import React, { useState } from 'react';
import { ClinicalDetails, ClinicalDataSource, DiagnosisEntry, WizardVitals, CaseComplexity, PatientRecord, InsurancePolicyDetails, PreAuthRecord } from '../PreAuthWizard/types';
import { searchICD10 } from '../../config/icd10Database';
import { ICDPicker } from './ICDPicker';
import { performNoteDocumentComparison, NoteComparisonItem, NoteComparisonReport } from '../../services/noteDocumentComparison';
import { resolveDiagnosisToIcd, getCachedNormalization } from '../../services/icdService';

if (typeof window !== 'undefined') {
    (window as any).resolveDiagnosisToIcd = resolveDiagnosisToIcd;
    (window as any).getCachedNormalization = getCachedNormalization;
}

interface ClinicalDetailsStepProps {
    clinical: Partial<ClinicalDetails>;
    caseId: string;
    doctorName?: string;
    onClinicalChange: (c: Partial<ClinicalDetails>) => void;
    onNext: () => void;
    onBack: () => void;
    complexity?: CaseComplexity;
    patientData?: Partial<PatientRecord>;
    insuranceData?: Partial<InsurancePolicyDetails>;
    /** Called after a successful note comparison so the results can flow into
     *  the live readiness score via index.tsx state. */
    onNoteComparisonResult?: (items: NoteComparisonItem[]) => void;
    record?: Partial<PreAuthRecord>;
    onFieldManual?: (path: string) => void;
}

const DEFAULT_VITALS: WizardVitals = { bp: '', pulse: '', temp: '', spo2: '', rr: '' };

export const ClinicalDetailsStep: React.FC<ClinicalDetailsStepProps> = ({
    clinical, caseId, doctorName, onClinicalChange, onNext, onBack, complexity, patientData, insuranceData, onNoteComparisonResult,
    record, onFieldManual
}) => {
    const [dataSource, setDataSource] = useState<ClinicalDataSource | null>(clinical.chiefComplaints ? 'manual_entry' : null);
    const [comparisonResult, setComparisonResult] = useState<NoteComparisonReport | null>(null);
    const [comparing, setComparing] = useState(false);
    const [comparisonError, setComparisonError] = useState('');
    const [showOptionalFields, setShowOptionalFields] = useState(false);
    const [icdQuery, setIcdQuery] = useState('');
    const [icdResults, setIcdResults] = useState<ReturnType<typeof searchICD10>>([]);
    const [showInjury, setShowInjury] = useState(false);
    const [showSurgery, setShowSurgery] = useState(false);
    const [showMaternity, setShowMaternity] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const renderAbsentWarning = (path: string) => {
        if (focusedField === path && record?.provenanceMap?.[path]?.source === 'absent') {
            return (
                <p className="text-[10px] text-amber-600 font-semibold mt-1 animate-fade-in">
                    ⚠️ This information was not found in the uploaded documents. Please enter it manually.
                </p>
            );
        }
        return null;
    };

    // Auto-prefill hospitalisation reason for Low-complexity cases to speed up desk throughput
    if (complexity === 'Low' && !clinical.reasonForHospitalisation) {
        setTimeout(() => {
            onClinicalChange({
                ...clinical,
                reasonForHospitalisation: 'Patient requires safe clinical environment for planned elective procedure.'
            });
        }, 0);
    }

    const vitals = clinical.vitals ?? DEFAULT_VITALS;
    const c = clinical;

    const update = (partial: Partial<ClinicalDetails>) => onClinicalChange({ ...clinical, ...partial });

    const handleCompareNote = async () => {
        setComparing(true);
        setComparisonError('');
        setComparisonResult(null);
        try {
            if (!record) {
                throw new Error("PreAuth record not loaded.");
            }
            const report = performNoteDocumentComparison(record);
            setComparisonResult(report);
            // Bubble up so parent (index.tsx) can feed results into live readiness score
            onNoteComparisonResult?.(report.items);
        } catch (err: any) {
            setComparisonError(err.message || 'Note comparison failed.');
        } finally {
            setComparing(false);
        }
    };

    const handleVitalChange = (field: keyof WizardVitals, val: string) => {
        update({ vitals: { ...vitals, [field]: val } });
    };

    const [loadingPill, setLoadingPill] = useState<string | null>(null);

    const handleAddSuggestedDiagnosis = async (diagText: string) => {
        setLoadingPill(diagText);
        try {
            const contextText = [c.chiefComplaints, c.historyOfPresentIllness, c.relevantClinicalFindings].filter(Boolean).join('\n');
            const candidates = await resolveDiagnosisToIcd(diagText, contextText);
            const topCandidate = candidates[0];
            const autoSelect = topCandidate && (topCandidate.confidenceScore || 0) >= 0.80;
            
            const code = autoSelect ? topCandidate.code : 'Pending ICD-10';
            const desc = autoSelect ? topCandidate.description : 'Selection required';
            const matchMethod = autoSelect ? topCandidate.matchMethod : 'manual';
            
            const existing = c.diagnoses ?? [];
            if (existing.some(d => d.diagnosis === diagText)) return;
            
            const newEntry: DiagnosisEntry = {
                diagnosis: diagText,
                icd10Code: code,
                icd10Description: desc,
                icd10MatchMethod: matchMethod,
                probability: 0.90,
                reasoning: topCandidate?.note || '',
                isSelected: existing.length === 0,
                originalDiagnosis: diagText,
                normalizedPrimaryDiagnosis: topCandidate?.description || diagText,
                associatedDiagnoses: [],
                icd10Candidates: candidates
            };
            
            update({
                diagnoses: [...existing, newEntry],
                selectedDiagnosisIndex: existing.length === 0 ? 0 : (c.selectedDiagnosisIndex ?? 0),
                suggestedDiagnoses: (c.suggestedDiagnoses ?? []).filter(s => s !== diagText)
            });
        } catch (err) {
            console.error("Error adding suggested diagnosis:", err);
        } finally {
            setLoadingPill(null);
        }
    };

    const handleIcdSearch = (q: string) => {
        setIcdQuery(q);
        setIcdResults(q.length >= 2 ? searchICD10(q) : []);
    };

    const addDiagnosis = (entry: ReturnType<typeof searchICD10>[0]) => {
        const existing = c.diagnoses ?? [];
        if (existing.some(d => d.icd10Code === entry.code)) return;
        const newEntry: DiagnosisEntry = {
            diagnosis: entry.commonName ?? entry.description,
            icd10Code: entry.code,
            icd10Description: entry.description,
            icd10MatchMethod: 'exact',
            probability: 0.95,
            reasoning: 'Selected from ICD-10 Search Catalog',
            isSelected: existing.length === 0,
            originalDiagnosis: entry.commonName ?? entry.description,
            normalizedPrimaryDiagnosis: entry.commonName ?? entry.description,
            associatedDiagnoses: [],
            icd10Candidates: []
        };
        update({ diagnoses: [...existing, newEntry], selectedDiagnosisIndex: existing.length === 0 ? 0 : (c.selectedDiagnosisIndex ?? 0) });
        setIcdQuery('');
        setIcdResults([]);
    };

    const selectPrimaryDx = (idx: number) => {
        update({
            selectedDiagnosisIndex: idx,
            diagnoses: (c.diagnoses ?? []).map((d, i) => ({ ...d, isSelected: i === idx }))
        });
    };

    const removeDx = (idx: number) => {
        const updated = (c.diagnoses ?? []).filter((_, i) => i !== idx);
        update({ diagnoses: updated, selectedDiagnosisIndex: 0 });
    };

    const spo2Val = parseInt(vitals.spo2 || '100');
    const pulseVal = parseInt(vitals.pulse || '80');
    const tempVal = parseFloat(vitals.temp || '98.6');

    const isValid = !!(
        c.chiefComplaints && c.durationOfPresentAilment && c.natureOfIllness &&
        c.diagnoses && c.diagnoses.length > 0 &&
        c.diagnoses.every(d => d.icd10Code && !d.icd10Code.toLowerCase().includes('pending')) &&
        (c.proposedLineOfTreatment?.medical || c.proposedLineOfTreatment?.surgical ||
            c.proposedLineOfTreatment?.intensiveCare || c.proposedLineOfTreatment?.investigation) &&
        c.reasonForHospitalisation
    );

    if (!dataSource) {
        return (
            <div className="space-y-6 text-opd-text-primary bg-white p-6 rounded-2xl border border-opd-border shadow-sm">
                <div>
                    <h2 className="text-lg font-bold font-lora text-opd-primary">Clinical Details</h2>
                    <p className="text-opd-text-secondary text-sm mt-1">How would you like to enter clinical details?</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setDataSource('voice_scribe')}
                        className="flex flex-col items-center gap-3 p-6 bg-opd-input-bg hover:bg-primary-tint/10 border border-opd-border hover:border-opd-primary rounded-2xl text-center transition-all group">
                        <svg className="w-9 h-9 text-opd-primary group-hover:scale-105 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                        <div>
                            <div className="font-bold text-sm text-opd-text-primary font-lora">Import from Voice Scribe</div>
                            <div className="text-xs text-opd-text-secondary mt-1">Auto-fill from today's consultation recording</div>
                            <div className="mt-2 text-xs text-opd-primary font-bold">Recommended</div>
                        </div>
                    </button>
                    <button onClick={() => setDataSource('manual_entry')}
                        className="flex flex-col items-center gap-3 p-6 bg-opd-input-bg hover:bg-primary-tint/10 border border-opd-border hover:border-opd-primary rounded-2xl text-center transition-all group">
                        <svg className="w-9 h-9 text-opd-primary group-hover:scale-105 transition-transform" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                        <div>
                            <div className="font-bold text-sm text-opd-text-primary font-lora">Enter Manually</div>
                            <div className="text-xs text-opd-text-secondary mt-1">Type clinical details into structured form</div>
                        </div>
                    </button>
                </div>
                {dataSource === 'voice_scribe' && (
                    <div className="bg-primary-tint/30 border border-opd-primary/20 rounded-xl p-4 text-opd-primary shadow-sm">
                        <p className="text-sm font-semibold">No active voice session found. Continuing in manual entry mode.</p>
                        <button className="mt-2 text-xs text-opd-primary hover:text-opd-primary-dark underline font-bold" onClick={() => setDataSource('manual_entry')}>Continue with manual entry →</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-5 text-opd-text-primary">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-bold font-lora text-opd-primary">Clinical Details</h2>
                <button onClick={() => setDataSource(null)} className="text-xs text-opd-text-secondary hover:text-opd-primary transition-colors underline" type="button">Change source</button>
            </div>

            {/* Presenting Illness */}
            <div className="card-premium space-y-4">
                <h3 className="font-semibold text-opd-primary text-[10px] uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Presenting Illness</h3>
                <div>
                    <label className="form-label uppercase tracking-wider text-[9px] mb-1">Chief Complaints *</label>
                    <textarea value={c.chiefComplaints ?? ''}
                        onChange={e => {
                            update({ chiefComplaints: e.target.value });
                            onFieldManual?.('clinical.chiefComplaints');
                        }}
                        onFocus={() => setFocusedField('clinical.chiefComplaints')}
                        onBlur={() => setFocusedField(null)}
                        rows={4}
                        className="form-input"
                        placeholder="Fever, cough, breathlessness..." />
                    {renderAbsentWarning('clinical.chiefComplaints')}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Duration of Ailment *</label>
                        <input value={c.durationOfPresentAilment ?? ''}
                            onChange={e => {
                                update({ durationOfPresentAilment: e.target.value });
                                onFieldManual?.('clinical.durationOfPresentAilment');
                            }}
                            onFocus={() => setFocusedField('clinical.durationOfPresentAilment')}
                            onBlur={() => setFocusedField(null)}
                            className="form-input" placeholder="e.g. 5 days" />
                        {renderAbsentWarning('clinical.durationOfPresentAilment')}
                    </div>
                    <div>
                        <label className="form-label uppercase tracking-wider text-[9px] mb-1">Nature of Illness *</label>
                        <select value={c.natureOfIllness ?? ''}
                            onChange={e => {
                                update({ natureOfIllness: e.target.value as any });
                                onFieldManual?.('clinical.natureOfIllness');
                            }}
                            onFocus={() => setFocusedField('clinical.natureOfIllness')}
                            onBlur={() => setFocusedField(null)}
                            className="form-input">
                            <option value="">Select</option>
                            <option>Acute</option><option>Chronic</option><option>Acute on Chronic</option>
                        </select>
                        {renderAbsentWarning('clinical.natureOfIllness')}
                    </div>
                </div>
                {complexity === 'Low' ? (
                    <div className="bg-opd-input-bg border border-opd-border rounded-xl p-4 space-y-3 shadow-sm">
                        <button
                            type="button"
                            onClick={() => setShowOptionalFields(!showOptionalFields)}
                            className="w-full flex items-center justify-between text-[10px] font-bold text-opd-text-secondary hover:text-opd-primary uppercase tracking-wider transition-colors"
                        >
                            <span>Optional Clinical Fields ({showOptionalFields ? 'Expanded' : 'Collapsed'})</span>
                            <span>{showOptionalFields ? '▲' : '▼'}</span>
                        </button>
                        {showOptionalFields && (
                            <div className="space-y-4 pt-2 border-t border-opd-border mt-2 animate-fade-in">
                                <div>
                                    <label className="form-label uppercase tracking-wider text-[9px] mb-1">History of Present Illness</label>
                                    <textarea value={c.historyOfPresentIllness ?? ''}
                                        onChange={e => {
                                            update({ historyOfPresentIllness: e.target.value });
                                            onFieldManual?.('clinical.historyOfPresentIllness');
                                        }}
                                        onFocus={() => setFocusedField('clinical.historyOfPresentIllness')}
                                        onBlur={() => setFocusedField(null)}
                                        rows={4}
                                        className="form-input"
                                        placeholder="Describe onset, progression, associated symptoms..." />
                                    {renderAbsentWarning('clinical.historyOfPresentIllness')}
                                </div>
                                <div>
                                    <label className="form-label uppercase tracking-wider text-[9px] mb-1">Relevant Clinical Findings</label>
                                    <textarea value={c.relevantClinicalFindings ?? ''}
                                        onChange={e => {
                                            update({ relevantClinicalFindings: e.target.value });
                                            onFieldManual?.('clinical.relevantClinicalFindings');
                                        }}
                                        onFocus={() => setFocusedField('clinical.relevantClinicalFindings')}
                                        onBlur={() => setFocusedField(null)}
                                        rows={4}
                                        className="form-input"
                                        placeholder="Examination findings, auscultation, palpation..." />
                                    {renderAbsentWarning('clinical.relevantClinicalFindings')}
                                </div>
                                <div>
                                    <label className="form-label uppercase tracking-wider text-[9px] mb-1">Prior OPD Treatment (if any)</label>
                                    <textarea value={c.treatmentTakenSoFar ?? ''}
                                        onChange={e => {
                                            update({ treatmentTakenSoFar: e.target.value });
                                            onFieldManual?.('clinical.treatmentTakenSoFar');
                                        }}
                                        onFocus={() => setFocusedField('clinical.treatmentTakenSoFar')}
                                        onBlur={() => setFocusedField(null)}
                                        rows={4}
                                        className="form-input"
                                        placeholder="OPD treatment tried..." />
                                    {renderAbsentWarning('clinical.treatmentTakenSoFar')}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="form-label uppercase tracking-wider text-[9px] mb-1">History of Present Illness</label>
                            <textarea value={c.historyOfPresentIllness ?? ''}
                                onChange={e => {
                                    update({ historyOfPresentIllness: e.target.value });
                                    onFieldManual?.('clinical.historyOfPresentIllness');
                                }}
                                onFocus={() => setFocusedField('clinical.historyOfPresentIllness')}
                                onBlur={() => setFocusedField(null)}
                                rows={4}
                                className="form-input"
                                placeholder="Describe onset, progression, associated symptoms, prior treatment tried..." />
                            {renderAbsentWarning('clinical.historyOfPresentIllness')}
                        </div>
                        <div>
                            <label className="form-label uppercase tracking-wider text-[9px] mb-1">Relevant Clinical Findings *</label>
                            <textarea value={c.relevantClinicalFindings ?? ''}
                                onChange={e => {
                                    update({ relevantClinicalFindings: e.target.value });
                                    onFieldManual?.('clinical.relevantClinicalFindings');
                                }}
                                onFocus={() => setFocusedField('clinical.relevantClinicalFindings')}
                                onBlur={() => setFocusedField(null)}
                                rows={4}
                                className="form-input"
                                placeholder="Examination findings, auscultation, palpation etc." />
                            {renderAbsentWarning('clinical.relevantClinicalFindings')}
                        </div>
                        <div>
                            <label className="form-label uppercase tracking-wider text-[9px] mb-1">Prior OPD Treatment (if any)</label>
                            <textarea value={c.treatmentTakenSoFar ?? ''}
                                onChange={e => {
                                    update({ treatmentTakenSoFar: e.target.value });
                                    onFieldManual?.('clinical.treatmentTakenSoFar');
                                }}
                                onFocus={() => setFocusedField('clinical.treatmentTakenSoFar')}
                                onBlur={() => setFocusedField(null)}
                                rows={4}
                                className="form-input"
                                placeholder="e.g. Oral antibiotics for 3 days without relief..." />
                            {renderAbsentWarning('clinical.treatmentTakenSoFar')}
                        </div>
                    </>
                )}

                <div className="pt-2 border-t border-opd-border flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={handleCompareNote}
                        disabled={comparing || !c.chiefComplaints}
                        className="btn-secondary px-3 py-1.5 text-xs font-bold self-start disabled:opacity-50"
                    >
                        {comparing ? 'Comparing Note to Document…' : 'Compare Note to Document'}
                    </button>

                    {comparisonError && (
                        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {comparisonError}
                        </div>
                    )}

                    {comparisonResult && (
                        <div className="bg-opd-input-bg border border-opd-border rounded-xl p-4 space-y-4 shadow-sm">
                            {/* Header & Overall Score */}
                            <div className="flex items-center justify-between border-b border-opd-border pb-2.5">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-opd-primary font-lora">
                                        Note vs. Document Consistency Check
                                    </div>
                                    <p className="text-[10px] text-opd-text-secondary mt-0.5 font-semibold">Weighted audit of structured source documents vs treating doctor's clinical note</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-opd-text-secondary">Overall Match</span>
                                    <div className={`text-xl font-bold font-mono ${
                                        comparisonResult.overallScore >= 80 ? 'text-emerald-600' :
                                        comparisonResult.overallScore >= 50 ? 'text-amber-600' : 'text-rose-600'
                                    }`}>
                                        {comparisonResult.overallScore}%
                                    </div>
                                </div>
                            </div>

                            {/* Category Scores Breakdown */}
                            <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] bg-white p-2 rounded-lg border border-opd-border">
                                <div>
                                    <span className="text-opd-text-secondary block font-bold text-[9px] uppercase">Patient ID</span>
                                    <span className="font-bold text-slate-800 font-mono text-[11px]">{comparisonResult.categoryScores.patient_identity}%</span>
                                    <span className="text-[8px] text-opd-text-secondary block mt-0.5 font-medium">(10%)</span>
                                </div>
                                <div className="border-l border-opd-border">
                                    <span className="text-opd-text-secondary block font-bold text-[9px] uppercase">Insurance</span>
                                    <span className="font-bold text-slate-800 font-mono text-[11px]">{comparisonResult.categoryScores.insurance}%</span>
                                    <span className="text-[8px] text-opd-text-secondary block mt-0.5 font-medium">(10%)</span>
                                </div>
                                <div className="border-l border-opd-border">
                                    <span className="text-opd-text-secondary block font-bold text-[9px] uppercase">Diagnosis</span>
                                    <span className="font-bold text-slate-800 font-mono text-[11px]">{comparisonResult.categoryScores.diagnosis}%</span>
                                    <span className="text-[8px] text-opd-text-secondary block mt-0.5 font-medium">(25%)</span>
                                </div>
                                <div className="border-l border-opd-border">
                                    <span className="text-opd-text-secondary block font-bold text-[9px] uppercase">Findings</span>
                                    <span className="font-bold text-slate-800 font-mono text-[11px]">{comparisonResult.categoryScores.clinical_findings}%</span>
                                    <span className="text-[8px] text-opd-text-secondary block mt-0.5 font-medium">(25%)</span>
                                </div>
                                <div className="border-l border-opd-border">
                                    <span className="text-opd-text-secondary block font-bold text-[9px] uppercase">Treatment</span>
                                    <span className="font-bold text-slate-800 font-mono text-[11px]">{comparisonResult.categoryScores.treatment}%</span>
                                    <span className="text-[8px] text-opd-text-secondary block mt-0.5 font-medium">(30%)</span>
                                </div>
                            </div>

                            {/* Detailed List */}
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {comparisonResult.items.filter(item => item.status !== 'missing' && !['patient_name', 'age', 'gender', 'policy_number', 'insurer_name'].includes(item.field)).map((item, i) => {
                                    const style =
                                        item.status === 'match' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        item.status === 'conflict' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        'bg-amber-50 text-amber-700 border-amber-200';
                                    const label =
                                        item.status === 'match' ? 'Match' :
                                        item.status === 'conflict' ? 'Conflict' :
                                        item.status === 'doc_only' ? 'Document Only' :
                                        'Clinical Note Only';
                                    return (
                                        <div key={i} className={`text-[11px] rounded-lg border px-2.5 py-1.5 ${style}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold">{item.displayName || item.field}</span>
                                                <span className="text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-white/60 border border-current/15">{label}</span>
                                            </div>
                                            {(item.note_value || item.document_value) && (
                                                <div className="mt-1 space-y-0.5 text-[10px] opacity-90 border-t border-current/10 pt-1 font-mono">
                                                    {item.document_value && <div className="truncate"><span className="font-semibold">Document:</span> {item.document_value}</div>}
                                                    {item.note_value && <div className="truncate"><span className="font-semibold">Clinical Note:</span> {item.note_value}</div>}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Vitals */}
            <div className="card-premium space-y-4">
                <h3 className="font-semibold text-opd-primary text-[10px] uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Vitals at Presentation</h3>
                <div className="grid grid-cols-5 gap-3">
                    {([['bp', 'BP (mmHg)', '130/80'], ['pulse', 'Pulse (/min)', '80'], ['temp', 'Temp (°F)', '98.6'], ['spo2', 'SpO2 (%)', '98'], ['rr', 'RR (/min)', '16']] as [keyof WizardVitals, string, string][]).map(([f, label, ph]) => {
                        let alertClass = 'border-opd-border focus:border-opd-primary';
                        if (f === 'spo2' && vitals.spo2 && parseInt(vitals.spo2) < 94) alertClass = 'border-red-300 text-red-700 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20';
                        else if (f === 'temp' && vitals.temp && parseFloat(vitals.temp) > 100.4) alertClass = 'border-amber-300 text-amber-700 bg-amber-50 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
                        else if (f === 'pulse' && vitals.pulse && (parseInt(vitals.pulse) > 100 || parseInt(vitals.pulse) < 60)) alertClass = 'border-amber-300 text-amber-700 bg-amber-50 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20';
                        return (
                            <div key={f}>
                                <label className="block text-[10px] text-opd-text-secondary font-semibold mb-1">{label}</label>
                                <input value={vitals[f] ?? ''}
                                    onChange={e => {
                                        handleVitalChange(f, e.target.value);
                                        onFieldManual?.(`clinical.vitals.${f}`);
                                    }}
                                    onFocus={() => setFocusedField(`clinical.vitals.${f}`)}
                                    onBlur={() => setFocusedField(null)}
                                    className={`form-input ${alertClass}`}
                                    placeholder={ph} />
                                {renderAbsentWarning(`clinical.vitals.${f}`)}
                            </div>
                        );
                    })}
                </div>
                {spo2Val < 94 && vitals.spo2 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-xs font-semibold leading-relaxed shadow-sm">
                        ⚠️ SpO2 {vitals.spo2}% — Hypoxia detected. This strongly supports inpatient medical necessity.
                    </div>
                )}
            </div>

            {/* Diagnosis */}
            <div className="card-premium space-y-4">
                <h3 className="font-semibold text-opd-primary text-[10px] uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Diagnosis</h3>
                <div className="relative">
                    <input value={icdQuery} onChange={e => handleIcdSearch(e.target.value)}
                        className="form-input"
                        placeholder="Search diagnosis by name or ICD-10 code (e.g. Pneumonia)..." />
                    {icdResults.length > 0 && (
                        <div className="absolute z-20 w-full bg-white border border-opd-border rounded-lg mt-1 shadow-xl max-h-56 overflow-y-auto divide-y divide-opd-border">
                            {icdResults.map(r => (
                                <button key={r.code} onClick={() => addDiagnosis(r)}
                                    className="w-full px-4 py-2.5 text-left hover:bg-opd-bg text-xs flex justify-between items-center transition-all text-opd-text-primary"
                                    type="button">
                                    <span className="font-semibold">{r.commonName ?? r.description}</span>
                                    <span className="font-mono text-[10px] bg-primary-tint border border-opd-primary/10 text-opd-primary px-2 py-0.5 rounded font-bold">{r.code}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {c.suggestedDiagnoses && c.suggestedDiagnoses.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center bg-opd-input-bg border border-opd-border rounded-xl p-3">
                        <span className="text-[10px] text-opd-text-secondary font-bold uppercase tracking-wider">Suggestions from Document:</span>
                        {c.suggestedDiagnoses.map((s, idx) => (
                            <button
                                key={idx}
                                type="button"
                                disabled={loadingPill === s}
                                onClick={() => handleAddSuggestedDiagnosis(s)}
                                className="bg-primary-tint/10 hover:bg-primary-tint/20 border border-opd-primary/20 text-opd-primary px-2.5 py-1 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                            >
                                {loadingPill === s ? 'Resolving...' : `+ ${s}`}
                            </button>
                        ))}
                    </div>
                )}

                {(c.diagnoses ?? []).length > 0 && (
                    <div className="space-y-2">
                        {(c.diagnoses ?? []).map((dx, i) => (
                            <div key={i} className={`flex flex-col gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${dx.isSelected ? 'bg-primary-tint/20 border-opd-primary' : 'bg-white border-opd-border hover:border-opd-primary/40'}`}
                                onClick={() => selectPrimaryDx(i)}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${dx.isSelected ? 'border-opd-primary' : 'border-opd-border'}`}>
                                        {dx.isSelected && <div className="w-1.5 h-1.5 rounded-full bg-opd-primary" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-semibold text-opd-text-primary">{dx.diagnosis}</div>
                                        <div className="text-[10px] text-opd-text-secondary mt-0.5">
                                            {dx.icd10Code.includes('Pending') ? (
                                                <span className="text-amber-700 font-bold">⚠️ {dx.icd10Code} — {dx.icd10Description}</span>
                                            ) : (
                                                <span className="font-medium font-mono">{dx.icd10Code} — {dx.icd10Description}</span>
                                            )}
                                        </div>
                                    </div>
                                    {dx.isSelected && <span className="text-[9px] bg-primary-tint border border-opd-primary/15 text-opd-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider font-lora">Primary</span>}
                                    <button onClick={e => { e.stopPropagation(); removeDx(i); }} className="text-opd-text-secondary hover:text-red-500 p-1.5 hover:bg-opd-bg rounded-lg transition-all" type="button">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                
                                {dx.icd10Code.includes('Pending') && dx.icd10Candidates && dx.icd10Candidates.length > 0 && (
                                    <div className="pl-6.5 flex flex-wrap gap-2 items-center border-t border-opd-border/40 pt-2" onClick={e => e.stopPropagation()}>
                                        <span className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">Ranked suggestions (Click to confirm):</span>
                                        {dx.icd10Candidates.slice(0, 3).map((cand: any) => {
                                            const scorePct = Math.round((cand.confidenceScore || 0) * 100);
                                            return (
                                                <button
                                                    key={cand.code}
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = (c.diagnoses ?? []).map((d, idx) => {
                                                            if (idx === i) {
                                                                    return {
                                                                        ...d,
                                                                        icd10Code: cand.code,
                                                                        icd10Description: cand.description,
                                                                        icd10MatchMethod: cand.matchMethod
                                                                    };
                                                            }
                                                            return d;
                                                        });
                                                        update({ diagnoses: updated });
                                                    }}
                                                    className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded text-[10px] font-semibold transition-all flex items-center gap-1"
                                                >
                                                    <span className="font-mono font-bold">{cand.code}</span>
                                                    <span className="opacity-70">({scorePct}%)</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                {(c.diagnoses ?? []).length === 0 && <p className="text-opd-text-muted text-xs text-center py-4">Search and add the primary diagnosis above *</p>}

                {/* Render ICD Picker for the selected (primary) diagnosis */}
                {c.diagnoses && c.diagnoses.length > 0 && (() => {
                    const primaryIdx = c.selectedDiagnosisIndex ?? 0;
                    const primaryDx = c.diagnoses[primaryIdx];
                    if (!primaryDx) return null;
                    return (
                        <div className="mt-2">
                            <ICDPicker
                                caseId={caseId}
                                diagnosisText={primaryDx.diagnosis}
                                clinicalContext={c.chiefComplaints || ''}
                                initialCode={primaryDx.icd10Code && !primaryDx.icd10Code.toLowerCase().includes('pending') ? primaryDx.icd10Code : ''}
                                initialDescription={primaryDx.icd10Description && !primaryDx.icd10Description.toLowerCase().includes('pending') ? primaryDx.icd10Description : ''}
                                initialMatchMethod={primaryDx.icd10MatchMethod}
                                doctorName={doctorName}
                                onConfirm={(code, description, matchMethod) => {
                                    const updated = (c.diagnoses ?? []).map((dx, idx) => {
                                        if (idx === primaryIdx) {
                                            return {
                                                ...dx,
                                                icd10Code: code,
                                                icd10Description: description,
                                                icd10MatchMethod: matchMethod
                                            };
                                        }
                                        return dx;
                                    });
                                    update({ diagnoses: updated });
                                }}
                            />
                        </div>
                    );
                })()}
            </div>

            {/* Treatment Plan */}
            <div className="card-premium space-y-4">
                <h3 className="font-semibold text-opd-primary text-[10px] uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Proposed Treatment Plan</h3>
                <div>
                    <label className="block text-[10px] text-opd-text-secondary font-semibold uppercase tracking-wider mb-2">Line of Treatment *</label>
                    <div className="flex flex-wrap gap-2.5">
                        {([['medical', 'Medical Management'], ['surgical', 'Surgical Management'], ['intensiveCare', 'Intensive Care'], ['investigation', 'Investigation Only'], ['nonAllopathic', 'Non-Allopathic']] as const).map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer bg-white border border-opd-border hover:border-opd-primary hover:bg-primary-tint/5 rounded-lg px-3.5 py-2 text-xs text-opd-text-secondary transition-all select-none shadow-sm">
                                <input type="checkbox"
                                    checked={c.proposedLineOfTreatment?.[key] ?? false}
                                    onChange={e => {
                                        update({ proposedLineOfTreatment: { ...{ medical: false, surgical: false, intensiveCare: false, investigation: false, nonAllopathic: false }, ...c.proposedLineOfTreatment, [key]: e.target.checked } });
                                        onFieldManual?.(`clinical.proposedLineOfTreatment.${key}`);
                                    }}
                                    className="accent-opd-primary w-3.5 h-3.5 rounded" />
                                <span className="font-semibold" onClick={() => {
                                    if (key === 'surgical') setShowSurgery(prev => !prev);
                                }}>{label}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="form-label uppercase tracking-wider text-[9px] mb-1.5">Why is OPD management NOT appropriate? *</label>
                    <textarea value={c.reasonForHospitalisation ?? ''}
                        onChange={e => {
                            update({ reasonForHospitalisation: e.target.value });
                            onFieldManual?.('clinical.reasonForHospitalisation');
                        }}
                        onFocus={() => setFocusedField('clinical.reasonForHospitalisation')}
                        onBlur={() => setFocusedField(null)}
                        rows={4}
                        className="form-input"
                        placeholder="e.g. Patient requires IV antibiotics, continuous oxygen therapy, and hemodynamic monitoring which cannot be accomplished on outpatient basis." />
                    {renderAbsentWarning('clinical.reasonForHospitalisation')}
                </div>

                {/* Conditional Panels */}
                <div className="space-y-3 pt-2">
                    <button onClick={() => setShowInjury(p => !p)} className="text-xs text-opd-primary hover:text-opd-primary-dark font-semibold flex items-center gap-1 transition-colors underline" type="button">
                        <span className="text-[10px]">{showInjury ? '▼' : '▶'}</span> Is this an injury/accident case?
                    </button>
                    {showInjury && (
                        <div className="bg-opd-input-bg border border-opd-border rounded-xl p-4 grid grid-cols-2 gap-4 shadow-sm">
                            <div>
                                <label className="form-label uppercase tracking-wider text-[9px] mb-1">Date of Injury</label>
                                <input type="date" value={c.injuryDetails?.dateOfInjury ?? ''} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, dateOfInjury: e.target.value, isMLC: c.injuryDetails?.isMLC ?? false } })}
                                    className="form-input" />
                            </div>
                            <div>
                                <label className="form-label uppercase tracking-wider text-[9px] mb-1">Cause of Injury</label>
                                <input value={c.injuryDetails?.causeOfInjury ?? ''} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, causeOfInjury: e.target.value, isMLC: c.injuryDetails?.isMLC ?? false } })}
                                    className="form-input" placeholder="Road accident, fall..." />
                            </div>
                            <div className="col-span-2 flex items-center mt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={c.injuryDetails?.isMLC ?? false} onChange={e => update({ injuryDetails: { ...c.injuryDetails as any, isInjury: true, isMLC: e.target.checked } })} className="accent-opd-primary w-3.5 h-3.5 rounded" />
                                    <span className="text-xs text-opd-text-secondary font-medium select-none">Medico-Legal Case (MLC)</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <button onClick={() => setShowSurgery(p => !p)} className="text-xs text-opd-primary hover:text-opd-primary-dark font-semibold flex items-center gap-1 transition-colors underline" type="button">
                        <span className="text-[10px]">{showSurgery ? '▼' : '▶'}</span> Add surgery details
                    </button>
                    {showSurgery && (
                        <div className="bg-opd-input-bg border border-opd-border rounded-xl p-4 grid grid-cols-2 gap-4 shadow-sm">
                            <div>
                                <label className="form-label uppercase tracking-wider text-[9px] mb-1">Name of Surgery *</label>
                                <input value={c.surgeryDetails?.nameOfSurgery ?? ''} onChange={e => update({ surgeryDetails: { ...c.surgeryDetails as any, nameOfSurgery: e.target.value, routeOfSurgery: c.surgeryDetails?.routeOfSurgery ?? 'Open' } })}
                                    className="form-input" placeholder="e.g. Laparoscopic Appendicectomy" />
                            </div>
                            <div>
                                <label className="form-label uppercase tracking-wider text-[9px] mb-1">Route of Surgery</label>
                                <select value={c.surgeryDetails?.routeOfSurgery ?? 'Open'} onChange={e => update({ surgeryDetails: { ...c.surgeryDetails as any, nameOfSurgery: c.surgeryDetails?.nameOfSurgery ?? '', routeOfSurgery: e.target.value as any } })}
                                    className="form-input">
                                    <option>Open</option><option>Laparoscopic</option><option>Endoscopic</option><option>Robotic</option><option>Other</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={onBack} className="btn-secondary py-2" type="button">
                    ← Back
                </button>
                <button onClick={onNext} disabled={!isValid} type="button"
                    className="btn-primary py-2">
                    Continue to Admission & Cost
                </button>
            </div>
            {!isValid && <p className="text-[10px] text-amber-600 font-semibold text-center mt-1">Add diagnosis (with confirmed ICD-10 code), treatment line, and OPD justification to continue</p>}
        </div>
    );
};
