/**
 * CaseWorkspace.tsx
 *
 * Composed view — NOT a new screen from scratch.
 * Left column: uploaded document list + evidence highlights (supporting vs contradicting)
 * Right rail:  (a) readiness score ring, (b) missing items checklist,
 *              (c) suggested ICD billing codes with cost, (d) eligibility indicator
 * Header bar:  case ID, patient name, diagnosis, overall status pill
 *
 * Visual rules: follows scoreColorClass() convention from utils/readinessScore.ts.
 * No new color system is introduced.
 */

import React, { useEffect, useState } from 'react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { computeReadiness, scoreColorClass, readinessStatusLine } from '../../utils/readinessScore';
import { priorAuthOrchestrator, ExtendedEvidenceReviewReport } from '../../engine/priorAuthWorkflow';
import { runBillingCodingWorkflow, BillingInput } from '../../engine/billingCoder';
import type { BillingCodingOutput } from '../../services/geminiService';
import { getPatientRecord, savePatientRecord, PatientCaseRecord } from '../../services/masterPatientRecord';
import { simulateInsurerDecision } from '../../services/simulatedInsurerService';

// ── tiny re-usable ring (lifted from ClaimReadinessRail) ──────────────────────

const RING_R = 36;
const RING_CX = 44;
const RING_CY = 44;
const RING_SIZE = 88;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

function ScoreRing({ score }: { score: number }) {
    const colors = scoreColorClass(score);
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100;
    return (
        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }}
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                    <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none"
                        stroke="#E1E7E6" strokeWidth={5} />
                    <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none"
                        stroke={colors.stroke} strokeWidth={5} strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-bold font-lora tabular-nums leading-none"
                    style={{ fontSize: 20, color: colors.stroke }}>{score}</span>
                <span className="text-[7px] font-bold uppercase tracking-wider text-opd-text-muted mt-0.5">/100</span>
            </div>
        </div>
    );
}

// ── evidence highlight card ───────────────────────────────────────────────────

interface HighlightCardProps {
    excerpt: string;
    relatedRule: string;
    sourceDocument: string;
    supportsOrContradicts: 'supports' | 'contradicts';
}

const HighlightCard: React.FC<HighlightCardProps> = ({ excerpt, relatedRule, sourceDocument, supportsOrContradicts }) => {
    const isSupport = supportsOrContradicts === 'supports';
    return (
        <div className={`border rounded-xl p-3.5 space-y-2 border-l-4 shadow-sm ${
            isSupport
                ? 'border-l-emerald-500 bg-emerald-50/30 border-y border-r border-opd-border'
                : 'border-l-red-500 bg-red-50/30 border-y border-r border-opd-border'
        }`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                    isSupport
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                    {isSupport ? 'Supports Admission' : 'Contradicts / Gap'}
                </span>
                <span className="text-[9px] font-mono text-opd-text-secondary truncate max-w-[160px]">{sourceDocument}</span>
            </div>
            <blockquote className="text-xs italic text-opd-text-secondary bg-opd-input-bg border border-opd-border rounded-lg px-3 py-2 leading-relaxed">
                "{excerpt}"
            </blockquote>
            <div className="text-[9px] text-opd-text-secondary font-semibold flex items-center gap-1">
                <span className="text-opd-text-muted">Rule:</span>
                <span className="text-opd-text-primary font-bold">{relatedRule}</span>
            </div>
        </div>
    );
};

// ── ICD billing tag ───────────────────────────────────────────────────────────

interface IcdTagProps {
    code: string;
    description: string;
    estimatedCost?: number;
    confidence: 'high' | 'medium' | 'low';
}

const IcdTag: React.FC<IcdTagProps> = ({ code, description, estimatedCost, confidence }) => {
    const confColor = confidence === 'high'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : confidence === 'medium'
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-gray-50 border-gray-200 text-gray-700';

    return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-opd-border bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] font-bold text-opd-primary shrink-0">{code}</span>
                <span className="text-[10px] text-opd-text-secondary truncate">{description}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
                {estimatedCost != null && (
                    <span className="text-[9px] font-bold text-opd-text-primary font-mono">
                        ₹{estimatedCost.toLocaleString('en-IN')}
                    </span>
                )}
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${confColor}`}>
                    {confidence}
                </span>
            </div>
        </div>
    );
};

// ── eligibility pill ─────────────────────────────────────────────────────────

type EligibilityType = 'cashless' | 'reimbursement' | 'needs_verification';

const ELIG_CONFIG: Record<EligibilityType, { label: string; text: string; bg: string; border: string; icon: string }> = {
    cashless: {
        label: 'Cashless Eligible',
        text: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        icon: '✓',
    },
    reimbursement: {
        label: 'Reimbursement Only',
        text: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        icon: '⚠',
    },
    needs_verification: {
        label: 'Needs Verification',
        text: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: '!',
    },
};

// ── overall status pill (header bar) ─────────────────────────────────────────

function StatusPill({ score }: { score: number }) {
    const colors = scoreColorClass(score);
    return (
        <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
            {score >= 80 ? '● Under Final Review' : score >= 50 ? '● Under AI Review' : '● Action Required'}
        </span>
    );
}

// ── main component ────────────────────────────────────────────────────────────

interface CaseWorkspaceProps {
    record: PreAuthRecord;
    onBack: () => void;
}

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({ record, onBack }) => {
    const [tpaReport, setTpaReport] = useState<ExtendedEvidenceReviewReport | null>(
        record.tpaEvidenceReview ?? null
    );
    const [tpaLoading, setTpaLoading] = useState(!record.tpaEvidenceReview);
    const [billingOutput, setBillingOutput] = useState<BillingCodingOutput | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);
    
    // Case Record state for Dexie Case syncing & enhancements
    const [caseRecord, setCaseRecord] = useState<PatientCaseRecord | null>(null);
    const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
    const [enhanceTrigger, setEnhanceTrigger] = useState<'icu_upgrade' | 'extended_stay' | 'new_procedure'>('extended_stay');
    const [enhanceAmount, setEnhanceAmount] = useState<number>(0);
    const [enhanceReason, setEnhanceReason] = useState('');

    useEffect(() => {
        getPatientRecord(record.id).then(r => {
            if (r) setCaseRecord(r);
        });
    }, [record.id]);

    const handleCreateEnhancement = async (trigger: 'icu_upgrade' | 'extended_stay' | 'new_procedure', requestedAmount: number, reason: string) => {
        if (!caseRecord) return;
        
        const decision = simulateInsurerDecision(caseRecord, 'enhancement', requestedAmount);
        
        const newEnhancement = {
            id: `ENH-${Math.floor(100000 + Math.random() * 900000)}`,
            trigger,
            requestedAmount,
            status: decision.outcome,
            gaps: decision.outcome === 'query' ? [decision.queryDetails || ''] : [],
            anticipatedQueries: decision.outcome === 'query' ? [{ query: decision.queryDetails }] : [],
            reviewedAt: new Date().toISOString(),
            details: { reason }
        };
        
        const updated = {
            ...caseRecord,
            enhancements: [...(caseRecord.enhancements || []), newEnhancement],
            updatedAt: new Date().toISOString()
        };
        
        if (decision.outcome === 'approved' && decision.approvedAmount) {
            updated.authorizations.push({
                id: `AUTH-ENH-${Math.floor(100000 + Math.random() * 900000)}`,
                status: 'approved',
                requestedAmount,
                approvedAmount: decision.approvedAmount,
                submittedAt: new Date().toISOString(),
                respondedAt: new Date().toISOString()
            });
        } else if (decision.outcome === 'partial_approved' && decision.approvedAmount) {
            updated.authorizations.push({
                id: `AUTH-ENH-${Math.floor(100000 + Math.random() * 900000)}`,
                status: 'partial_approved',
                requestedAmount,
                approvedAmount: decision.approvedAmount,
                submittedAt: new Date().toISOString(),
                respondedAt: new Date().toISOString(),
                deductionReason: decision.deductionReason
            });
        }
        
        await savePatientRecord(updated);
        setCaseRecord(updated);
        alert(`Enhancement processed! Outcome: ${decision.outcome.toUpperCase()}` + 
              (decision.approvedAmount ? ` (Approved Amount: ₹${decision.approvedAmount})` : '') + 
              (decision.queryDetails ? ` (Query Details: ${decision.queryDetails})` : ''));
    };

    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
    const diagnosisText = selectedDx?.diagnosis ?? '—';
    const icdCode = selectedDx?.icd10Code ?? '';

    // Load TPA review if not already cached
    useEffect(() => {
        if (record.tpaEvidenceReview) return;
        let alive = true;
        setTpaLoading(true);
        priorAuthOrchestrator(record.uploadedDocuments || [], record)
            .then(r => { if (alive) setTpaReport(r); })
            .catch(e => console.error('[CaseWorkspace] TPA review error:', e))
            .finally(() => { if (alive) setTpaLoading(false); });
        return () => { alive = false; };
    }, [record]);

    // Run billing coder once we have a diagnosis
    useEffect(() => {
        if (!diagnosisText || diagnosisText === '—' || billingOutput || billingLoading) return;
        let alive = true;
        setBillingLoading(true);
        const clinicalNote = [
            diagnosisText,
            record.clinical?.chiefComplaints ?? '',
            record.clinical?.historyOfPresentIllness ?? '',
            record.clinical?.relevantClinicalFindings ?? '',
        ].join('. ');

        const input: BillingInput = {
            clinicalNote,
            insurerName: record.insurance?.insurerName ?? 'Unknown',
            sumInsured: record.insurance?.sumInsured ?? 500000,
            wardType: (['ICU', 'ICCU', 'NICU'].includes(record.admission?.roomCategory ?? '')
                ? 'ICU'
                : record.admission?.roomCategory === 'General Ward' ? 'General'
                : record.admission?.roomCategory === 'Semi-Private' ? 'Semi-Private'
                : 'Private') as BillingInput['wardType'],
            requestedAmount: record.costEstimate?.totalEstimatedCost ?? 0,
            resolvedICD10: icdCode
        };

        runBillingCodingWorkflow(input)
            .then(o => { if (alive) setBillingOutput(o); })
            .catch(e => console.error('[CaseWorkspace] Billing error:', e))
            .finally(() => { if (alive) setBillingLoading(false); });
        return () => { alive = false; };
    }, [diagnosisText]);

    // Determine eligibility from billing output + policy data
    const eligibility: EligibilityType = (() => {
        if (!record.insurance?.policyNumber) return 'needs_verification';
        const cashlessApproved = billingOutput?.cashlessApproved ?? 0;
        const total = record.costEstimate?.totalEstimatedCost ?? 0;
        if (total === 0 || !billingOutput) return 'needs_verification';
        if (billingOutput.scrubbingStatus === 'Warnings' && (billingOutput.validationWarnings?.length ?? 0) > 2)
            return 'reimbursement';
        if (cashlessApproved > 0) return 'cashless';
        return 'needs_verification';
    })();

    const eligCfg = ELIG_CONFIG[eligibility];

    const { score, missingItems, hasInvalidICD, docsUploaded, docsRequired } = computeReadiness(record, tpaReport);
    const colors = scoreColorClass(score);
    const statusLine = readinessStatusLine(score, missingItems.length);

    // Evidence highlights from tpaReport
    const evidenceHighlights: any[] = (tpaReport as any)?.evidenceHighlights ?? [];
    const supportHighlights = evidenceHighlights.filter(h => h.supportsOrContradicts === 'supports');
    const contradictHighlights = evidenceHighlights.filter(h => h.supportsOrContradicts !== 'supports');

    // Suggested ICD codes + CPT codes from billing output
    const suggestedCodes: Array<{ code: string; description: string; cost?: number; confidence: 'high' | 'medium' | 'low' }> = [];
    if (billingOutput) {
        if (billingOutput.primaryICD10) {
            suggestedCodes.push({
                code: billingOutput.primaryICD10,
                description: billingOutput.primaryDescription,
                confidence: 'high',
            });
        }
        (billingOutput.secondaryICD10 ?? []).forEach(s => {
            suggestedCodes.push({ code: s.code, description: s.description, confidence: 'medium' });
        });
        (billingOutput.suggestedCPT ?? []).forEach(c => {
            suggestedCodes.push({ code: c.code, description: c.description, cost: c.estimatedRate, confidence: 'medium' });
        });
    } else if (icdCode && !hasInvalidICD) {
        suggestedCodes.push({
            code: icdCode,
            description: selectedDx?.icd10Description || diagnosisText,
            cost: record.costEstimate?.totalEstimatedCost,
            confidence: 'high',
        });
    }

    return (
        <div className="flex flex-col h-full min-h-screen bg-opd-bg text-opd-text-primary">
            {/* ── Header bar ────────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-opd-border bg-white px-4 py-3 flex items-center gap-3 flex-wrap shadow-sm">
                {/* Back affordance */}
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-xs font-semibold text-opd-text-secondary hover:text-opd-primary transition-all px-3 py-1.5 rounded-lg border border-opd-border bg-opd-input-bg"
                >
                    <svg className="w-3 h-3 text-opd-text-secondary" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Case List
                </button>

                <div className="w-px h-4 bg-opd-border shrink-0" />

                {/* Case meta */}
                <div className="flex items-center gap-3 flex-1 flex-wrap min-w-0">
                    <span className="font-mono text-[10px] text-opd-primary font-bold shrink-0">{record.id}</span>
                    <span className="text-sm font-semibold text-opd-text-primary truncate">{record.patient?.patientName || '—'}</span>
                    <div className="w-px h-3 bg-opd-border shrink-0" />
                    <span className="text-xs text-opd-text-secondary truncate max-w-[200px]">{diagnosisText}</span>
                    {icdCode && !hasInvalidICD && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
                            {icdCode}
                        </span>
                    )}
                </div>

                {/* Overall status pill */}
                <StatusPill score={score} />
            </div>

            {/* ── Body: two-column layout ───────────────────────────────────── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* ── LEFT: Documents + Evidence Highlights ─────────────────── */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">

                    {/* Uploaded documents */}
                    <section>
                        <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary border-b border-opd-border pb-2 mb-3">
                            Uploaded Documents ({record.uploadedDocuments?.length ?? 0})
                        </div>
                        {(record.uploadedDocuments?.length ?? 0) === 0 ? (
                            <div className="text-xs text-opd-text-muted font-medium py-4 text-center border border-dashed border-opd-border rounded-xl bg-white">
                                No documents uploaded
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {record.uploadedDocuments.map(doc => (
                                    <div key={doc.id}
                                        className="flex items-center gap-3 rounded-xl border border-opd-border bg-white px-3 py-2.5 shadow-sm text-opd-text-primary">
                                        <span className="text-base shrink-0">{doc.fileType === 'pdf' ? '📄' : '🖼️'}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-opd-text-primary truncate">{doc.fileName}</div>
                                            <div className="text-[9px] text-opd-text-secondary font-medium">{doc.documentCategory.replace(/_/g, ' ')} · {doc.fileSizeDisplay}</div>
                                            {doc.duplicateWarning && (
                                                <div className="text-[9px] text-opd-error font-bold mt-0.5">{doc.duplicateWarning}</div>
                                            )}
                                            {doc.expiryWarning && (
                                                <div className="text-[9px] text-opd-error font-bold mt-0.5">{doc.expiryWarning}</div>
                                            )}
                                            {doc.readabilityWarning && (
                                                <div className="text-[9px] text-amber-600 font-bold mt-0.5">{doc.readabilityWarning}</div>
                                            )}
                                        </div>
                                        {doc.readabilityConfidence != null && (
                                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${
                                                doc.readabilityConfidence < 70
                                                    ? 'bg-red-50 border-red-200 text-red-700 font-extrabold animate-pulse'
                                                    : doc.readabilityConfidence >= 80
                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                    : 'bg-amber-50 border-amber-200 text-amber-700'
                                            }`}>
                                                {doc.readabilityConfidence < 70 ? '⚠️ Needs Manual Check' : `OCR ${doc.readabilityConfidence}%`}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Evidence highlights */}
                    <section>
                        <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary border-b border-opd-border pb-2 mb-3">
                            Evidence Highlights
                            {tpaLoading && (
                                <span className="ml-2 text-opd-text-muted normal-case font-normal">— running review…</span>
                            )}
                        </div>

                        {tpaLoading ? (
                            <div className="flex items-center gap-2 py-6 px-3">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <span key={i} className="pulse-dot inline-block w-1 h-1 rounded-full bg-opd-primary" />
                                    ))}
                                </div>
                                <span className="text-xs text-opd-text-secondary font-medium">Running Aivana review…</span>
                            </div>
                        ) : evidenceHighlights.length === 0 ? (
                            <div className="text-xs text-opd-text-muted font-medium py-4 text-center border border-dashed border-opd-border rounded-xl bg-white">
                                {record.uploadedDocuments?.length
                                    ? 'No evidence highlights extracted. Upload richer documents to see verbatim excerpts.'
                                    : 'Upload documents for AI evidence extraction.'}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Supporting first */}
                                {supportHighlights.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                                            Supporting Evidence ({supportHighlights.length})
                                        </div>
                                        {supportHighlights.map((h, i) => (
                                            <HighlightCard key={`sup-${i}`} {...h} supportsOrContradicts="supports" />
                                        ))}
                                    </div>
                                )}
                                {/* Contradicting / gaps */}
                                {contradictHighlights.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-red-700">
                                            Gaps & Contradictions ({contradictHighlights.length})
                                        </div>
                                        {contradictHighlights.map((h, i) => (
                                            <HighlightCard key={`con-${i}`} {...h} supportsOrContradicts="contradicts" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {/* ── Enhancement Ledger ── */}
                    {caseRecord && (
                        <section className="bg-white border border-opd-border rounded-2xl p-4 space-y-4 shadow-sm text-left">
                            <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary border-b border-opd-border pb-2.5 flex justify-between items-center">
                                <span>Enhancements Ledger ({caseRecord.enhancements?.length || 0})</span>
                                {(record.status === 'submitted' || record.status === 'approved' || record.status === 'query_raised' || record.status === 'query_received' || record.status === 'enhancement_requested') && (
                                    <button
                                        type="button"
                                        onClick={() => setShowEnhanceDialog(true)}
                                        className="px-2.5 py-1.5 bg-opd-primary text-white text-[10px] font-bold rounded-lg hover:bg-opd-primary/95 transition border uppercase tracking-wider"
                                    >
                                        + Request Enhancement
                                    </button>
                                )}
                            </div>
                            
                            {(!caseRecord.enhancements || caseRecord.enhancements.length === 0) ? (
                                <p className="text-xs text-opd-text-muted italic py-3 text-center bg-gray-50/50 rounded-xl border border-dashed">
                                    No enhancements requested for this case.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {caseRecord.enhancements.map(enh => (
                                        <div key={enh.id} className="border border-opd-border rounded-xl p-3 bg-gray-50/50 space-y-2 text-xs">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-opd-primary font-mono text-[10px]">{enh.id}</span>
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border tracking-wide ${
                                                    enh.status === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                                                    enh.status === 'partial_approved' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                    'bg-blue-50 border-blue-200 text-blue-700'
                                                }`}>
                                                    {enh.status}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div>
                                                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[8px]">Trigger Type:</span>{' '}
                                                    <span className="font-bold text-opd-text-primary capitalize">{enh.trigger.replace(/_/g, ' ')}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[8px]">Requested:</span>{' '}
                                                    <span className="font-mono font-bold text-opd-text-primary">₹{enh.requestedAmount.toLocaleString('en-IN')}</span>
                                                </div>
                                            </div>
                                            {enh.details?.reason && (
                                                <div className="bg-white border border-opd-border p-2 rounded-lg italic text-[11px] text-opd-text-secondary leading-normal">
                                                    "{enh.details.reason}"
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>

                {/* ── RIGHT RAIL ────────────────────────────────────────────── */}
                <aside className="hidden lg:flex flex-col w-[292px] shrink-0 overflow-y-auto border-l border-opd-border bg-white px-4 py-5 gap-5 custom-scrollbar shadow-sm">

                    {/* (a) Readiness score */}
                    <section>
                        <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary pb-2.5 border-b border-opd-border mb-3">
                            Claim Readiness
                        </div>
                        <div className="rounded-xl p-4 bg-opd-input-bg border border-opd-border flex flex-col items-center gap-2.5 shadow-sm">
                            <ScoreRing score={score} />
                            <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider border ${colors.bg} ${colors.text} ${colors.border}`}>
                                {colors.label}
                            </span>
                            <p className="text-[10px] text-center font-medium text-opd-text-secondary leading-normal max-w-[200px]">
                                {statusLine}
                            </p>
                            {/* Quick chips */}
                            <div className="flex flex-wrap gap-1.5 mt-1 justify-center">
                                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                                    docsUploaded >= docsRequired
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-red-50 border-red-200 text-red-700'
                                }`}>
                                    {docsUploaded >= docsRequired ? '✓' : '✗'} Docs {docsUploaded}/{docsRequired}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                                    !hasInvalidICD
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-red-50 border-red-200 text-red-700'
                                }`}>
                                    {!hasInvalidICD ? '✓' : '✗'} ICD-10
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* (b) Missing items checklist */}
                    {missingItems.length > 0 && (
                        <section>
                            <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary pb-2.5 border-b border-opd-border mb-3">
                                What to Fix ({missingItems.length})
                            </div>
                            <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-0.5">
                                {missingItems.slice(0, 8).map((item, idx) => (
                                    <div key={idx}
                                        className="flex items-start gap-2 rounded-lg p-2.5 border border-opd-border bg-white shadow-sm">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-semibold text-opd-text-secondary leading-normal">{item.text}</div>
                                        </div>
                                        <span className="text-[9px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-1 py-0.5 rounded shrink-0">
                                            -{item.deduction}
                                        </span>
                                    </div>
                                ))}
                                {missingItems.length > 8 && (
                                    <p className="text-[10px] text-center text-opd-text-muted font-medium">
                                        +{missingItems.length - 8} more to address
                                    </p>
                                )}
                            </div>
                        </section>
                    )}

                    {/* (c) Suggested ICD codes with cost */}
                    <section>
                        <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary pb-2.5 border-b border-opd-border mb-3">
                            Billing Codes & Cost
                        </div>
                        {billingLoading ? (
                            <div className="flex items-center gap-2 py-3">
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <span key={i} className="pulse-dot inline-block w-1 h-1 rounded-full bg-opd-primary" />
                                    ))}
                                </div>
                                <span className="text-xs text-opd-text-secondary font-medium">Running billing coder…</span>
                            </div>
                        ) : suggestedCodes.length === 0 ? (
                            <div className="text-xs text-opd-text-muted font-medium py-3 text-center border border-dashed border-opd-border rounded-xl bg-white">
                                No codes available — add a diagnosis to generate billing suggestions.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {suggestedCodes.slice(0, 6).map((c, i) => (
                                    <IcdTag key={i} code={c.code} description={c.description}
                                        estimatedCost={c.cost} confidence={c.confidence} />
                                ))}
                                {billingOutput?.cashlessApproved != null && (
                                    <div className="mt-2 rounded-lg border border-opd-border bg-opd-input-bg px-3 py-2.5 flex justify-between items-center shadow-sm">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-opd-text-secondary">Cashless Approved Est.</span>
                                        <span className="font-mono text-xs font-bold text-emerald-700">
                                            ₹{billingOutput.cashlessApproved.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )}
                                {billingOutput?.patientShare != null && (
                                    <div className="rounded-lg border border-opd-border bg-opd-input-bg px-3 py-2.5 flex justify-between items-center shadow-sm">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-opd-text-secondary">Patient Share Est.</span>
                                        <span className="font-mono text-xs font-bold text-amber-700">
                                            ₹{billingOutput.patientShare.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Validation warnings from billing scrubber */}
                        {(billingOutput?.validationWarnings?.length ?? 0) > 0 && (
                            <div className="mt-2 space-y-1.5">
                                {billingOutput!.validationWarnings.slice(0, 3).map((w, i) => (
                                    <div key={i} className="text-[9px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                                        ⚠ {w}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* (d) Eligibility indicator */}
                    <section>
                        <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary pb-2.5 border-b border-opd-border mb-3">
                            Eligibility Status
                        </div>
                        <div className={`rounded-xl border px-4 py-3.5 flex items-center gap-3 shadow-sm ${eligCfg.bg} ${eligCfg.border}`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${eligCfg.text} ${eligCfg.border}`}>
                                {eligCfg.icon}
                            </span>
                            <div>
                                <div className={`text-xs font-bold ${eligCfg.text}`}>{eligCfg.label}</div>
                                <div className="text-[9px] text-opd-text-secondary font-medium mt-0.5">
                                    {eligibility === 'cashless'
                                        ? 'Claim can be processed as cashless'
                                        : eligibility === 'reimbursement'
                                        ? 'Patient to pay upfront; submit for reimbursement'
                                        : 'Policy / billing data insufficient for determination'}
                                </div>
                            </div>
                        </div>
                    </section>

                </aside>
            </div>

            {/* Enhancement Dialog Modal */}
            {showEnhanceDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 text-left">
                    <div className="bg-white border border-opd-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b border-opd-border pb-3">
                            <h3 className="font-bold text-sm font-lora text-opd-primary uppercase tracking-wider">Request Case Enhancement</h3>
                            <button 
                                type="button" 
                                onClick={() => setShowEnhanceDialog(false)} 
                                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="space-y-3.5 text-xs">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Trigger Type</label>
                                <select
                                    className="border border-opd-border rounded-lg px-3 py-2 bg-white text-xs focus:outline-none focus:border-opd-primary"
                                    value={enhanceTrigger}
                                    onChange={e => setEnhanceTrigger(e.target.value as any)}
                                >
                                    <option value="icu_upgrade">ICU Upgrade / Transfer</option>
                                    <option value="extended_stay">Stay Duration Extension</option>
                                    <option value="new_procedure">New Comorbid Procedure</option>
                                </select>
                            </div>
                            
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Additional Requested Amount (₹)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 80000"
                                    className="border border-opd-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-opd-primary font-mono font-semibold"
                                    value={enhanceAmount || ''}
                                    onChange={e => setEnhanceAmount(+e.target.value)}
                                />
                            </div>
                            
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Clinical Justification</label>
                                <textarea
                                    rows={3}
                                    placeholder="Explain the clinical complication or stay extension details..."
                                    className="border border-opd-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-opd-primary resize-none"
                                    value={enhanceReason}
                                    onChange={e => setEnhanceReason(e.target.value)}
                                />
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-opd-border text-xs">
                            <button
                                type="button"
                                onClick={() => setShowEnhanceDialog(false)}
                                className="px-4 py-2 border border-opd-border rounded-xl hover:bg-gray-50 font-bold transition text-opd-text-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!enhanceAmount || enhanceAmount <= 0) { alert('Enter a valid amount.'); return; }
                                    handleCreateEnhancement(enhanceTrigger, enhanceAmount, enhanceReason);
                                    setShowEnhanceDialog(false);
                                    setEnhanceAmount(0);
                                    setEnhanceReason('');
                                }}
                                className="px-4 py-2 bg-opd-primary text-white font-bold rounded-xl hover:bg-opd-primary/95 transition shadow-sm"
                            >
                                Submit Request
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
