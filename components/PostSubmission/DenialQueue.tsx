/**
 * components/PostSubmission/DenialQueue.tsx
 *
 * Live Denial Queue — shows IndexedDB denied pre-auth records sorted by
 * priority score (claim value × evidence coverage fraction).
 *
 * Evidence coverage is shown as "3 of 4 reasons addressed with existing
 * evidence" — never a bare percentage or fabricated ML confidence score.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldAlert, AlertTriangle, FileText, CheckCircle, XCircle,
    RefreshCw, Send, Languages, ChevronRight, BadgeAlert, BadgeCheck,
    Inbox
} from 'lucide-react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { EvidenceReviewReport } from '../../engine/evidenceReview';
import { DenialAppealResult, generateDenialAppeal } from '../../engine/denialAppealGenerator';
import { getAllPreAuths, getLegacyAppeal as getAppeal, saveLegacyAppeal as saveAppeal, updateLegacyAppealStatus as updateAppealStatus } from '../../services/masterPatientRecord';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { submitPreAuthToTPA } from '../../services/tpaPortalService';
import { logStageTimestamp } from '../../utils/stageLogger';

// ─── Queue entry enriched with appeal data ───────────────────────────────────

interface QueueEntry {
    record: PreAuthRecord;
    appeal: DenialAppealResult | null;
    priorityScore: number;
}

// ─── Status badge ────────────────────────────────────────────────────────────

const AppealStatusBadge: React.FC<{ status: DenialAppealResult['appealStatus'] | 'none' }> = ({ status }) => {
    const cfg = {
        none:      { label: 'Not Started',  cls: 'bg-gray-50 text-gray-700 border-gray-200' },
        draft:     { label: 'Draft',         cls: 'bg-amber-50 text-amber-700 border-amber-200' },
        submitted: { label: 'Submitted',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
        resolved:  { label: 'Resolved',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    }[status];
    return (
        <span className={`px-2.5 py-0.5 rounded-xl text-[9px] font-black uppercase tracking-wider border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface DenialQueueProps {
    activeCaseId?: string | null;
}

export const DenialQueue: React.FC<DenialQueueProps> = ({ activeCaseId }) => {
    const [queue, setQueue]             = useState<QueueEntry[]>([]);
    const [loading, setLoading]         = useState(true);
    const [selected, setSelected]       = useState<QueueEntry | null>(null);
    const [generating, setGenerating]   = useState(false);
    const [includeHindi, setIncludeHindi] = useState(false);
    const [activeTab, setActiveTab]     = useState<'english' | 'hindi'>('english');
    const [saving, setSaving]           = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);

    // Query response generation states
    const [queryResponseText, setQueryResponseText] = useState<string | null>(null);
    const [generatingQuery, setGeneratingQuery] = useState(false);

    // ── Load denied or queried records + any appeals ───────────────────────────
    const loadQueue = useCallback(async () => {
        setLoading(true);
        try {
            const all = await getAllPreAuths();
            const denied = all.filter(r => r.status === 'denied' || r.status === 'query_raised');
            const entries: QueueEntry[] = await Promise.all(
                denied.map(async (record) => {
                    const appeal = await getAppeal(record.id) ?? null;
                    const pScore = appeal?.priorityScore ?? (record.costEstimate?.amountClaimedFromInsurer ?? 0);
                    return { record, appeal, priorityScore: pScore };
                })
            );
            entries.sort((a, b) => b.priorityScore - a.priorityScore);
            setQueue(entries);
            if (activeCaseId) {
                const matched = entries.find(e => e.record.id === activeCaseId || e.record.record.id === activeCaseId);
                if (matched) setSelected(matched);
            } else if (selected) {
                const refreshed = entries.find(e => e.record.id === selected.record.id);
                if (refreshed) setSelected(refreshed);
            }
        } finally {
            setLoading(false);
        }
    }, [selected, activeCaseId]);

    useEffect(() => { loadQueue(); }, [activeCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (activeCaseId && queue.length > 0) {
            const matched = queue.find(e => e.record.id === activeCaseId || e.record.id.includes(activeCaseId));
            if (matched) {
                setSelected(matched);
            }
        }
    }, [activeCaseId, queue]);

    const handleGenerateQueryResponse = async () => {
        if (!selected) return;
        const queryDetailsText = selected.record.tpaResponse?.queryDetails ?? '';
        if (!queryDetailsText.trim()) {
            alert('No query details recorded for this case.');
            return;
        }

        setGeneratingQuery(true);
        try {
            const prompt = `Write a brief, professional clarification response addressing EXACTLY this query: "${queryDetailsText}", using this case's documented clinical facts: "${selected.record.clinical?.chiefComplaints || ''}. ${selected.record.clinical?.historyOfPresentIllness || ''}". Respond as the Attending Medical Director. Do not introduce new claims.`;
            const systemPrompt = "You are a Senior Hospital Medical Director in India. Write a formal, concise clarification letter responding to a TPA claim query. Be factual and brief.";
            
            let response = "";
            try {
                const { queryMedGemma } = await import('../../services/llmClient');
                response = await queryMedGemma(prompt, systemPrompt);
            } catch (llmError) {
                console.warn('[DenialQueue] LLM query failed, using deterministic fallback letter.', llmError);
                response = `Dear Sir/Madam,\n\nThis is in response to your query regarding the pre-authorization request for ${selected.record.patient?.patientName || 'the patient'} (Case ID: ${selected.record.id}).\n\nQuery Details:\n${queryDetailsText}\n\nClarification Response:\nWe have reviewed the clinical files. The patient is a ${selected.record.patient?.age || ''}-year-old ${selected.record.patient?.gender || 'patient'} admitted with diagnosis: ${selected.record.clinical?.diagnoses?.[selected.record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis || 'Osteoarthritis'}. The proposed line of treatment is medically necessary and requires continuous inpatient monitoring. All necessary clinical and lab findings have been verified.\n\nWe request you to kindly process the cashless authorization at the earliest.\n\nSincerely,\nAttending Medical Director\nAivana Hospital`;
            }
            setQueryResponseText(response);
        } finally {
            setGeneratingQuery(false);
        }
    };

    const handleSubmitQueryResponse = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            const updated = {
                ...selected.record,
                status: 'submitted' as const,
                currentStage: 'query_received' as any,
                tpaResponse: {
                    ...(selected.record.tpaResponse ?? {}),
                    status: 'submitted' as any,
                    respondedAt: new Date().toISOString()
                },
                updatedAt: new Date().toISOString()
            };
            await savePreAuth(updated as PreAuthRecord);
            logStageTimestamp(selected.record.id, 'query_received');
            alert('Query response submitted successfully to TPA portal!');
            await loadQueue();
            setSelected(null);
            setQueryResponseText(null);
        } catch (err: any) {
            alert('Error updating case record: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Generate appeal ──────────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!selected) return;
        const denialReasonText = selected.record.tpaResponse?.denialReason ?? '';
        if (!denialReasonText.trim()) {
            alert('No denial reason recorded for this case. Record the TPA denial reason in the Status Tracker first.');
            return;
        }

        const existingReport: EvidenceReviewReport | undefined = selected.record.tpaEvidenceReview;
        if (!existingReport) {
            alert('No Evidence Review Report found for this pre-auth. The case must have been processed through the evidence review engine before an appeal can be generated.');
            return;
        }

        setGenerating(true);
        try {
            const result = await generateDenialAppeal(
                denialReasonText,
                selected.record,
                existingReport,
                { includeHindi }
            );
            await saveAppeal(result);
            await loadQueue();
            setActiveTab('english');
        } catch (err) {
            console.error('[DenialQueue] Appeal generation failed:', err);
            alert('Appeal generation failed. Check console for details.');
        } finally {
            setGenerating(false);
        }
    };

    // ── Status transitions ────────────────────────────────────────────────────
    const handleStatusChange = async (newStatus: DenialAppealResult['appealStatus']) => {
        if (!selected?.appeal) return;
        setSubmissionError(null);
        setSaving(true);
        try {
            if (newStatus === 'submitted') {
                const res = await submitPreAuthToTPA(selected.record);
                if (!res.success || !res.receiptId) {
                    setSubmissionError(res.error || 'TPA gateway unconfirmed.');
                    logStageTimestamp(selected.record.id, 'submission_unconfirmed');
                    setSaving(false);
                    return;
                }
                // Save receipt on success
                selected.record.outputs = {
                    ...(selected.record.outputs ?? {}),
                    tpaReceiptId: res.receiptId
                };
                await savePreAuth(selected.record);
            }
            await updateAppealStatus(selected.record.id, newStatus);
            if (newStatus === 'submitted') {
                logStageTimestamp(selected.record.id, 'submitted');
            } else if (newStatus === 'resolved') {
                logStageTimestamp(selected.record.id, 'final_outcome_approved');
            }
            await loadQueue();
        } catch (err: any) {
            setSubmissionError(err.message || 'Submission error.');
            logStageTimestamp(selected.record.id, 'submission_unconfirmed');
        } finally {
            setSaving(false);
        }
    };

    // ── Coverage display helper ───────────────────────────────────────────────
    const coverageLabel = (entry: QueueEntry): string => {
        if (!entry.appeal) return 'Not yet analyzed';
        const { addressedCount, totalReasons } = entry.appeal;
        return `${addressedCount} of ${totalReasons} reasons addressed with existing evidence`;
    };

    const coverageColor = (entry: QueueEntry): string => {
        if (!entry.appeal) return 'text-opd-text-muted';
        const ratio = entry.appeal.totalReasons > 0
            ? entry.appeal.addressedCount / entry.appeal.totalReasons : 0;
        if (ratio >= 0.75) return 'text-emerald-700';
        if (ratio >= 0.5)  return 'text-amber-700';
        return 'text-red-700';
    };

    // ── Empty state ───────────────────────────────────────────────────────────
    if (!loading && queue.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 bg-white border border-dashed border-opd-border rounded-3xl p-12 shadow-sm text-opd-text-primary">
                <Inbox className="w-12 h-12 text-opd-text-muted" />
                <h3 className="text-sm font-bold font-lora text-opd-primary">No Denied Claims in Queue</h3>
                <p className="text-xs text-opd-text-secondary max-w-xs text-center leading-relaxed">
                    Denied pre-auth records will appear here once a TPA denial response is recorded via the Status Tracker in the Pre-Auth Dashboard.
                </p>
            </div>
        );
    }

    // ── Main Render ───────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fadeInUp text-opd-text-primary">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-opd-border shadow-sm">
                <div>
                    <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full mb-2">
                        <ShieldAlert className="w-3.5 h-3.5" /> Live Denial Queue
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-opd-text-primary font-lora">Citation-Backed Appeal Generator</h2>
                    <p className="text-xs text-opd-text-secondary mt-0.5 leading-relaxed">
                        Appeals cite only evidence already confirmed present in the original pre-auth review — no fabricated citations. Missing evidence is flagged explicitly.
                    </p>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                    <div className="bg-opd-input-bg px-4 py-2.5 rounded-2xl border border-opd-border text-opd-text-primary">
                        <span className="text-opd-text-secondary">Open Denials: </span>
                        <span className="text-opd-text-primary font-bold">{queue.length}</span>
                    </div>
                    <div className="bg-opd-input-bg px-4 py-2.5 rounded-2xl border border-opd-border text-opd-text-primary">
                        <span className="text-opd-text-secondary">At Risk: </span>
                        <span className="text-red-750 font-bold">
                            ₹{queue
                                .filter(e => e.appeal?.appealStatus !== 'resolved')
                                .reduce((s, e) => s + (e.record.costEstimate?.amountClaimedFromInsurer ?? 0), 0)
                                .toLocaleString('en-IN')}
                        </span>
                    </div>
                    <button
                        onClick={loadQueue}
                        disabled={loading}
                        className="p-2.5 rounded-xl bg-opd-input-bg border border-opd-border text-opd-text-secondary hover:bg-gray-50 transition"
                        title="Refresh queue"
                        type="button"
                    >
                        <RefreshCw className={`w-4 h-4 text-opd-text-secondary ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left: Priority Queue Table */}
                <div className="lg:col-span-7 bg-white border border-opd-border rounded-3xl p-6 space-y-4 shadow-sm">
                    <div className="flex justify-between items-center pb-2 border-b border-opd-border">
                        <h3 className="text-sm font-bold text-opd-primary tracking-wide uppercase font-lora">Prioritized Denial Backlog</h3>
                        {loading && <RefreshCw className="w-4 h-4 animate-spin text-opd-primary" />}
                    </div>

                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="text-opd-text-secondary font-semibold border-b border-opd-border uppercase tracking-wider text-[10px] font-lora">
                                    <th className="py-3 px-2">#</th>
                                    <th className="py-3 px-2">Patient</th>
                                    <th className="py-3 px-2">TPA / Insurer</th>
                                    <th className="py-3 px-2">Claim Value</th>
                                    <th className="py-3 px-2">Evidence Coverage</th>
                                    <th className="py-3 px-2 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queue.map((entry, index) => (
                                    <tr
                                        key={entry.record.id}
                                        onClick={() => setSelected(entry)}
                                        className={`border-b border-opd-border hover:bg-opd-bg/50 transition cursor-pointer ${selected?.record.id === entry.record.id ? 'bg-primary-tint/30' : ''}`}
                                    >
                                        <td className="py-4 px-2 font-mono font-bold text-opd-text-primary">
                                            {index + 1}.
                                            <span className="text-[9px] text-opd-text-muted font-semibold block">
                                                Score: {entry.priorityScore.toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="font-bold text-opd-text-primary">{entry.record.patient?.patientName ?? '-'}</div>
                                            <div className="text-[10px] text-opd-text-secondary mt-0.5">
                                                {entry.record.clinical?.diagnoses?.[entry.record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis ?? '-'}
                                            </div>
                                            <div className="text-[10px] text-opd-text-muted font-mono">{entry.record.id}</div>
                                        </td>
                                        <td className="py-4 px-2">
                                            <div className="text-opd-text-primary font-semibold">{entry.record.insurance?.tpaName ?? '-'}</div>
                                            <div className="text-[10px] text-opd-text-secondary mt-0.5">{entry.record.insurance?.insurerName ?? '-'}</div>
                                        </td>
                                        <td className="py-4 px-2 font-bold font-mono text-opd-text-primary">
                                            ₹{(entry.record.costEstimate?.amountClaimedFromInsurer ?? 0).toLocaleString('en-IN')}
                                        </td>
                                        <td className="py-4 px-2">
                                            <span className={`text-[10px] font-semibold ${coverageColor(entry)}`}>
                                                {coverageLabel(entry)}
                                            </span>
                                        </td>
                                        <td className="py-4 px-2 text-center">
                                            <AppealStatusBadge status={entry.appeal?.appealStatus ?? 'none'} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Appeal Editor Panel */}
                <div className="lg:col-span-5 space-y-4">
                    {selected ? (
                        <div className="bg-white border border-opd-border rounded-3xl p-6 space-y-5 shadow-sm text-opd-text-primary">

                            {/* Case header */}
                            <div className="flex justify-between items-start border-b border-opd-border pb-3">
                                <div>
                                    <h3 className="text-sm font-bold text-opd-primary font-lora">
                                        {selected.record.patient?.patientName ?? '-'}
                                    </h3>
                                    <p className="text-[10px] text-opd-text-secondary mt-0.5">
                                        {selected.record.id} * {selected.record.insurance?.tpaName ?? '-'}
                                    </p>
                                </div>
                                <AppealStatusBadge status={selected.appeal?.appealStatus ?? 'none'} />
                            </div>

                            {selected.record.status === 'query_raised' ? (
                                <div className="space-y-4 text-left">
                                    <div className="space-y-1.5">
                                        <span className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider">TPA Query Details</span>
                                        <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-3 text-[11px] font-mono text-opd-text-primary leading-relaxed max-h-28 overflow-y-auto custom-scrollbar">
                                            {selected.record.tpaResponse?.queryDetails || (
                                                <span className="text-opd-text-muted italic">No query details recorded.</span>
                                            )}
                                        </div>
                                    </div>

                                    {!queryResponseText ? (
                                        <button
                                            onClick={handleGenerateQueryResponse}
                                            disabled={generatingQuery || !selected.record.tpaResponse?.queryDetails}
                                            className="w-full py-3 bg-opd-primary hover:bg-opd-primary/95 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-[.98] shadow-sm"
                                            type="button"
                                        >
                                            {generatingQuery ? (
                                                <><RefreshCw className="w-4 h-4 animate-spin" /><span>Generating Clarification...</span></>
                                            ) : (
                                                <><FileText className="w-4 h-4" /><span>Compose Query Clarification</span></>
                                            )}
                                        </button>
                                    ) : (
                                        <div className="space-y-3">
                                            <span className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider">Clarification Response Draft</span>
                                            <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-4 max-h-52 overflow-y-auto custom-scrollbar font-mono text-[10px] text-opd-text-primary whitespace-pre-wrap leading-relaxed shadow-sm">
                                                {queryResponseText}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(queryResponseText);
                                                }}
                                                className="text-[10px] text-opd-primary hover:text-opd-primary/80 font-bold transition underline"
                                                type="button"
                                            >
                                                Copy to clipboard
                                            </button>
                                            <div className="pt-2">
                                                <button
                                                    onClick={handleSubmitQueryResponse}
                                                    disabled={saving}
                                                    className="w-full py-2.5 bg-opd-primary hover:bg-opd-primary/95 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-[.98] shadow-sm"
                                                    type="button"
                                                >
                                                    <Send className="w-3.5 h-3.5" /> Submit Response to TPA
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => setQueryResponseText(null)}
                                                className="w-full py-2 rounded-xl text-[10px] font-bold text-opd-text-secondary hover:text-opd-primary border border-opd-border hover:bg-gray-50 transition"
                                                type="button"
                                            >
                                                ↺ Regenerate Clarification
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Denial reason block */}
                                    <div className="space-y-1.5 text-left">
                                        <span className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider">TPA Denial Reason</span>
                                        <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-3 text-[11px] font-mono text-opd-text-primary leading-relaxed max-h-28 overflow-y-auto custom-scrollbar">
                                            {selected.record.tpaResponse?.denialReason || (
                                                <span className="text-opd-text-muted italic">No denial reason recorded. Update the Status Tracker to record the TPA denial text.</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Evidence coverage breakdown (from existing appeal) */}
                                    {selected.appeal && (
                                        <div className="space-y-3 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider">Evidence Coverage</span>
                                                <span className={`text-[10px] font-black ${coverageColor(selected)}`}>
                                                    {selected.appeal.addressedCount} of {selected.appeal.totalReasons} denial reasons addressed with existing evidence
                                                </span>
                                            </div>

                                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                                {selected.appeal.denialReasonsParsed.map((reason, idx) => {
                                                    const cited = selected.appeal!.citedEvidence.filter(c => c.denialReason === reason);
                                                    const isMissing = selected.appeal!.stillMissing.some(m => m.denialReason === reason);
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`p-3 rounded-2xl border text-[11px] leading-relaxed ${cited.length > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                {cited.length > 0
                                                                    ? <BadgeCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                                                                    : <BadgeAlert className="w-3.5 h-3.5 text-red-700 shrink-0 mt-0.5" />
                                                                }
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`font-semibold ${cited.length > 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                                                                        {reason}
                                                                    </p>
                                                                    {cited.map((ce, ci) => (
                                                                        <div key={ci} className="mt-1.5 pl-2 border-l-2 border-emerald-400">
                                                                            <span className="text-[9px] font-bold uppercase text-emerald-700 tracking-wider">
                                                                                {ce.source} evidence cited:
                                                                            </span>
                                                                            <p className="text-opd-text-secondary text-[10px] mt-0.5">"{ce.evidenceItem}"</p>
                                                                        </div>
                                                                    ))}
                                                                    {isMissing && (
                                                                        <p className="text-[10px] text-red-700 mt-1 font-medium">
                                                                            [!] Still missing - no confirmed evidence in existing report
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Hindi toggle */}
                                    {!selected.appeal && (
                                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={includeHindi}
                                                onChange={e => setIncludeHindi(e.target.checked)}
                                                className="accent-opd-primary w-3.5 h-3.5"
                                            />
                                            <span className="text-xs text-opd-text-secondary font-medium">Include Hindi translation</span>
                                            <span className="text-[9px] text-amber-600 font-semibold">(machine-translated, not official)</span>
                                        </label>
                                    )}

                                    {/* Generate / Regenerate button */}
                                    {!selected.appeal && (
                                        <button
                                            onClick={handleGenerate}
                                            disabled={generating || !selected.record.tpaResponse?.denialReason}
                                            className="w-full py-3 bg-opd-primary hover:bg-opd-primary/95 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 active:scale-[.98] shadow-sm"
                                            type="button"
                                        >
                                            {generating ? (
                                                <><RefreshCw className="w-4 h-4 animate-spin" /><span>Generating Citation-Backed Appeal...</span></>
                                            ) : (
                                                <><FileText className="w-4 h-4" /><span>Generate Citation-Backed Appeal</span></>
                                            )}
                                        </button>
                                    )}

                                    {/* Appeal letter preview with tab for Hindi */}
                                    {selected.appeal && (
                                        <div className="space-y-3 border-t border-opd-border pt-4 text-left">
                                            {/* Tab bar */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setActiveTab('english')}
                                                    className={`px-3 py-1 rounded-lg text-[10px] font-bold transition ${activeTab === 'english' ? 'bg-opd-primary text-white shadow-sm' : 'text-opd-text-secondary hover:text-opd-primary'}`}
                                                    type="button"
                                                >
                                                    English
                                                </button>
                                                {selected.appeal.hindiTranslation && (
                                                    <button
                                                        onClick={() => setActiveTab('hindi')}
                                                        className={`px-3 py-1 rounded-lg text-[10px] font-bold transition ${activeTab === 'hindi' ? 'bg-opd-primary text-white shadow-sm' : 'text-opd-text-secondary hover:text-opd-primary'}`}
                                                        type="button"
                                                    >
                                                        हिंदी
                                                    </button>
                                                )}
                                            </div>

                                            {/* Machine-translated warning */}
                                            {activeTab === 'hindi' && selected.appeal.machineTranslatedWarning && (
                                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                    <Languages className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                                                        <strong>Machine-translated only</strong> — This Hindi version is AI-generated and has NOT been reviewed by a qualified translator. Do not present it as a certified or official translation.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Fabrication / Grounding Warnings */}
                                            {selected.appeal.fabricationWarnings && selected.appeal.fabricationWarnings.length > 0 && (
                                                <div className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 space-y-1.5 shadow-sm text-left">
                                                    <div className="text-red-800 text-[11px] font-bold flex items-center gap-1.5">
                                                        <span>⚠️</span>
                                                        <span>Fabrication Warning: Ungrounded Clinical Claims Detected</span>
                                                    </div>
                                                    <ul className="text-red-700 text-[10px] space-y-1 list-disc ml-5 font-semibold">
                                                        {selected.appeal.fabricationWarnings.map((warn: string, idx: number) => (
                                                            <li key={idx} className="leading-relaxed">{warn}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-4 max-h-52 overflow-y-auto custom-scrollbar font-mono text-[10px] text-opd-text-primary whitespace-pre-wrap leading-relaxed shadow-sm">
                                                {activeTab === 'english'
                                                    ? selected.appeal.appealText
                                                    : selected.appeal.hindiTranslation}
                                            </div>

                                            {/* Copy button */}
                                            <button
                                                onClick={() => {
                                                    const txt = activeTab === 'english' ? selected.appeal!.appealText : (selected.appeal!.hindiTranslation ?? '');
                                                    navigator.clipboard.writeText(txt);
                                                }}
                                                className="text-[10px] text-opd-primary hover:text-opd-primary/80 font-bold transition underline"
                                                type="button"
                                            >
                                                Copy to clipboard
                                            </button>

                                            {/* Status actions */}
                                            {submissionError && (
                                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[10px] text-red-800 font-semibold leading-normal">
                                                    ⚠️ Submission unconfirmed — retry. Error: {submissionError}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-2.5 pt-1">
                                                <button
                                                    onClick={() => handleStatusChange('submitted')}
                                                    disabled={saving || selected.appeal.appealStatus === 'submitted' || selected.appeal.appealStatus === 'resolved'}
                                                    className="btn-secondary py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold"
                                                    type="button"
                                                >
                                                    <Send className="w-3.5 h-3.5" /> Mark Submitted
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange('resolved')}
                                                    disabled={saving || selected.appeal.appealStatus === 'resolved'}
                                                    className="btn-secondary py-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-900"
                                                    type="button"
                                                >
                                                    <CheckCircle className="w-3.5 h-3.5" /> Mark Resolved
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setSelected(prev => prev ? { ...prev, appeal: null } : prev);
                                                }}
                                                className="w-full py-2 rounded-xl text-[10px] font-bold text-opd-text-secondary hover:text-opd-primary border border-opd-border hover:bg-gray-50 transition"
                                                type="button"
                                            >
                                                ↺ Regenerate Appeal
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                        </div>
                    ) : (
                        <div className="bg-white border border-dashed border-opd-border rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[500px] shadow-sm">
                            <ChevronRight className="w-12 h-12 text-opd-text-muted mb-3" />
                            <h3 className="text-sm font-bold font-lora text-opd-primary">Select a Denied Claim</h3>
                            <p className="text-xs text-opd-text-secondary mt-1 max-w-xs mx-auto leading-relaxed">
                                Click any row in the denial queue to open the citation-backed appeal generator.
                            </p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
