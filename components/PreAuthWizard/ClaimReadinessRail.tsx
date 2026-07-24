/**
 * ClaimReadinessRail.tsx
 *
 * Redesigned persistent right rail (desktop/mobile collapse)
 * Shows:
 *   1. Claim Readiness Score ring (refined SVG, live-updating, status pill)
 *   2. TPA Queries list — phrased as "reviewer question + fix"
 *   3. Missing summary chips (docs X/Y, ICD status)
 *
 * PRESENTATION ONLY — reads from existing engine outputs.
 * No logic, score computation, or engine changes here.
 */

import React, { useState } from 'react';
import { PreAuthRecord } from './types';
import { EvidenceReviewReport } from '../../engine/evidenceReview';
import { computeReadiness, readinessStatusLine, scoreColorClass } from '../../utils/readinessScore';

interface ClaimReadinessRailProps {
    record: Partial<PreAuthRecord>;
    tpaReport: EvidenceReviewReport | null;
    tpaLoading: boolean;
    onJumpToStep?: (step: 1 | 2 | 3 | 4) => void;
    mode: 'desktop' | 'mobile';
}

// ── Score Ring ──────────────────────────────────────────────────────────────

const RING_R = 40;
const RING_CX = 48;
const RING_CY = 48;
const RING_SIZE = 96;
const CIRCUMFERENCE = 2 * Math.PI * RING_R; // ≈ 251.3

function ScoreRing({ score }: { score: number }) {
    const colors = scoreColorClass(score);
    const offset = CIRCUMFERENCE - (CIRCUMFERENCE * score) / 100;

    return (
        <div className="flex flex-col items-center">
            <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
                <svg
                    width={RING_SIZE}
                    height={RING_SIZE}
                    style={{ transform: 'rotate(-90deg)' }}
                    viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                >
                    {/* Track */}
                    <circle
                        cx={RING_CX} cy={RING_CY} r={RING_R}
                        fill="none"
                        stroke="#E1E7E6"
                        strokeWidth={6}
                    />
                    {/* Progress arc */}
                    <circle
                        cx={RING_CX} cy={RING_CY} r={RING_R}
                        fill="none"
                        stroke={colors.stroke}
                        strokeWidth={6}
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s' }}
                    />
                </svg>
                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                        className="font-bold tabular-nums leading-none tracking-tight font-lora text-opd-text-primary"
                        style={{ fontSize: 24, color: colors.stroke, transition: 'color 0.4s' }}
                    >
                        {score}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-opd-text-muted mt-0.5">
                        / 100
                    </span>
                </div>
            </div>
        </div>
    );
}

// ── Query item ───────────────────────────────────────────────────────────────

interface QueryItemProps {
    query: string;
    reason: string;
    severity: 'high' | 'medium' | 'low';
    source: 'rule' | 'suggestion';
}

const QueryItem: React.FC<QueryItemProps> = ({ query, reason, severity, source }) => {
    const isRule = source === 'rule';
    let borderColor = 'border-l-opd-border bg-opd-input-bg border-opd-border';
    let labelText = 'Clinical Advisory';
    let labelStyle = 'bg-gray-50 text-gray-700 border-gray-200';

    if (isRule) {
        if (severity === 'high') {
            borderColor = 'border-l-red-500 bg-red-50/30 border-y border-r border-opd-border';
            labelText = 'High Risk Query';
            labelStyle = 'bg-red-50 text-red-700 border-red-200';
        } else {
            borderColor = 'border-l-amber-500 bg-amber-50/30 border-y border-r border-opd-border';
            labelText = 'Medium Risk Query';
            labelStyle = 'bg-amber-50 text-amber-700 border-amber-200';
        }
    }

    return (
        <div className={`border-l-2 rounded-r-lg p-3 text-xs leading-normal ${borderColor} space-y-1.5 shadow-sm`}>
            <div className="flex items-center justify-between">
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${labelStyle}`}>
                    {labelText}
                </span>
            </div>
            <p className="text-xs font-semibold text-opd-text-primary leading-snug">
                {query}
            </p>
            {reason && (
                <div className="text-[10px] text-opd-text-secondary leading-snug pl-1 border-l border-opd-border font-medium">
                    Fix: {reason}
                </div>
            )}
        </div>
    );
};

// ── Missing chips ────────────────────────────────────────────────────────────

function MissingChip({ label, ok }: { label: string; ok: boolean }) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-red-50 border-red-200 text-red-700'
            }`}
        >
            {label}
        </span>
    );
}

// ── Main Rail ────────────────────────────────────────────────────────────────

export const ClaimReadinessRail: React.FC<ClaimReadinessRailProps> = ({
    record,
    tpaReport,
    tpaLoading,
    onJumpToStep,
    mode,
}) => {
    const [mobileOpen, setMobileOpen] = useState(false);

    const { score, missingItems, hasInvalidICD, docsUploaded, docsRequired, needsManualReview } = computeReadiness(record, tpaReport);

    // Merge missingInfo from TPA policy report (Task 3)
    const allMissingItems = [...missingItems];
    if (tpaReport && (tpaReport as any).missingInfo) {
        (tpaReport as any).missingInfo.forEach((info: string) => {
            if (!allMissingItems.some(item => item.text.includes(info))) {
                allMissingItems.push({
                    text: `Policy: ${info}`,
                    deduction: 10,
                    step: 4
                });
            }
        });
    }

    const policyDeductionCount = allMissingItems.length - missingItems.length;
    const finalScore = Math.max(0, score - (policyDeductionCount * 10));
    const colors = scoreColorClass(finalScore);
    const statusLine = readinessStatusLine(finalScore, allMissingItems.length);

    // Queries sorted high → medium → low, rules before suggestions
    const queries = [...(tpaReport?.anticipatedQueries ?? [])].sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 };
        if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
        if (a.source !== b.source) return a.source === 'rule' ? -1 : 1;
        return 0;
    });

    const railContent = (
        <div className="flex flex-col gap-5">
            {/* ── Score Ring + Status ──────────────────────────────── */}
            <div
                className="rounded-xl p-4 bg-opd-input-bg border border-opd-border flex flex-col items-center gap-3 shadow-sm"
            >
                <ScoreRing score={finalScore} />
                {/* Status label */}
                <span
                    className={`text-[9px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
                    style={{ transition: 'all 0.4s' }}
                >
                    {colors.label}
                </span>
                {/* One-line status */}
                <p className="text-[11px] text-center font-medium text-opd-text-secondary leading-normal max-w-[200px]">
                    {statusLine}
                </p>

                {needsManualReview && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-[9px] rounded px-3 py-1.5 text-center font-bold tracking-wider uppercase max-w-full">
                        Needs Manual Review
                    </div>
                )}

                {/* Missing chips */}
                <div className="flex flex-wrap gap-1.5 mt-1 justify-center">
                    <MissingChip label={`Docs ${docsUploaded}/${docsRequired}`} ok={docsUploaded >= docsRequired} />
                    <MissingChip label="ICD-10" ok={!hasInvalidICD} />
                </div>
            </div>

            {/* ── Queries ─────────────────────────────────────────── */}
            <div className="space-y-2">
                <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary">
                    Open Queries {queries.length > 0 && <span className="text-opd-text-muted font-mono text-[9px] ml-1">({queries.length})</span>}
                </div>

                {tpaLoading ? (
                    /* Calm loading — pulsing dots, no spinner */
                    <div className="flex items-center gap-2 py-3 px-1">
                        <div className="flex gap-1">
                            {[0, 1, 2].map(i => (
                                <span
                                    key={i}
                                    className="pulse-dot inline-block w-1 h-1 rounded-full bg-opd-primary"
                                />
                            ))}
                        </div>
                        <span className="text-xs text-opd-text-secondary font-medium">
                            Reviewing case…
                        </span>
                    </div>
                ) : queries.length === 0 ? (
                    <div
                        className="rounded-lg p-3.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 text-center"
                    >
                        Ready. No open queries anticipated.
                    </div>
                ) : (
                    <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                        {queries.map((q, i) => (
                            <QueryItem
                                key={i}
                                query={q.query}
                                reason={q.reason}
                                severity={q.severity}
                                source={q.source}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Gap Checklist ────────────────────────────────────── */}
            {allMissingItems.length > 0 && (
                <div className="space-y-2">
                    <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary">
                        What to Fix ({allMissingItems.length})
                    </div>
                    <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                        {allMissingItems.slice(0, 12).map((item, idx) => {
                            const isMismatch = item.text.includes('Mismatch') || item.text.includes('mismatch') || item.text.includes('Consistency');
                            const isBlocking = item.deduction >= 3;
                            const stepLabels: Record<number, string> = { 1: 'Patient & Insurance', 2: 'Clinical Details', 3: 'Admission & Cost', 4: 'Review / Documents' };
                            const actionMap: Record<string, string> = {
                                'Patient Name': 'Enter full name on Step 1 or re-upload document',
                                'Patient Age': 'Enter age or date of birth on Step 1',
                                'Patient Gender': 'Select gender on Step 1',
                                'Patient Contact': 'Enter mobile number on Step 1',
                                'Policy Number': 'Enter policy number or upload insurance card',
                                'Insured Card ID': 'Enter TPA Card ID or policy number on Step 1',
                                'Doctor Registration': 'Enter registration number in Declarations',
                                'Doctor Signature': 'Confirm doctor declaration on Step 4',
                                'Hospital Seal': 'Confirm hospital seal in Declarations',
                                'ICD-10': 'Select a valid ICD-10 code in Clinical Details (Step 2)',
                                'Diagnosis': 'Add a primary diagnosis on Step 2',
                                'Line of Treatment': 'Select Medical/Surgical/ICU on Step 2',
                                'Date of Admission': 'Enter admission date on Step 3',
                                'Room Category': 'Select room type on Step 3',
                                'Length of Stay': 'Enter expected days on Step 3',
                                'Total Estimated Cost': 'Enter cost estimate on Step 3',
                            };
                            const matchedAction = Object.entries(actionMap).find(([key]) =>
                                item.text.toLowerCase().includes(key.toLowerCase())
                            );
                            const suggestedAction = matchedAction?.[1] ?? `Fix on Step ${item.step} — ${stepLabels[item.step] || ''}`;

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => onJumpToStep && onJumpToStep(item.step)}
                                    className={`w-full text-left rounded-lg border transition-all duration-150 group shadow-sm overflow-hidden shrink-0 ${
                                        isMismatch
                                            ? 'border-amber-200 hover:border-amber-400 bg-amber-50/40 hover:bg-amber-50'
                                            : isBlocking
                                            ? 'border-rose-200 hover:border-rose-400 bg-rose-50/30 hover:bg-rose-50'
                                            : 'border-opd-border hover:border-opd-primary/30 bg-white hover:bg-primary-tint/5'
                                    }`}
                                >
                                    {/* Header bar */}
                                    <div className={`flex items-center justify-between px-2.5 py-1.5 border-b ${
                                        isMismatch ? 'border-amber-100 bg-amber-50' : isBlocking ? 'border-rose-100 bg-rose-50' : 'border-opd-border bg-slate-50'
                                    }`}>
                                        <span className={`text-[8px] font-bold uppercase tracking-wider ${
                                            isMismatch ? 'text-amber-700' : isBlocking ? 'text-rose-700' : 'text-slate-500'
                                        }`}>
                                            {isMismatch ? 'Conflict' : isBlocking ? 'Blocking' : 'Advisory'}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[8px] text-slate-400 font-mono">Step {item.step}</span>
                                            {item.deduction > 0 && (
                                                <span className={`text-[8px] font-extrabold px-1 py-0.5 rounded border ${
                                                    isMismatch ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200'
                                                }`}>
                                                    -{item.deduction}pts
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Body */}
                                    <div className="px-2.5 py-2 space-y-1.5">
                                        <div className="text-xs font-semibold text-opd-text-primary group-hover:text-opd-primary leading-snug">
                                            {item.text}
                                        </div>
                                        {item.reason && (
                                            <div className="text-[10px] text-slate-500 leading-snug border-l-2 border-slate-200 pl-1.5 italic">
                                                {item.reason}
                                            </div>
                                        )}
                                        <div className={`text-[9px] font-semibold leading-snug ${
                                            isMismatch ? 'text-amber-700' : 'text-opd-primary'
                                        }`}>
                                            → {suggestedAction}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        {allMissingItems.length > 12 && (
                            <p className="text-[10px] text-center text-opd-text-muted font-medium py-1">
                                +{allMissingItems.length - 12} more items to address
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    if (mode === 'desktop') {
        return (
            <aside
                className="hidden lg:flex flex-col overflow-y-auto w-[280px] shrink-0 bg-white border-l border-opd-border py-5 px-4 shadow-sm gap-4 h-full"
            >
                <div className="text-[10px] font-bold font-lora uppercase tracking-wider text-opd-text-secondary border-b border-opd-border pb-2.5">
                    Claim Readiness
                </div>
                {railContent}
            </aside>
        );
    }

    return (
        <div
            className="lg:hidden bg-white border-t border-opd-border shadow-sm"
        >
            <button
                type="button"
                onClick={() => setMobileOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3"
            >
                <div className="flex items-center gap-2">
                    <span
                        className="text-xs font-bold font-mono"
                        style={{ color: scoreColorClass(finalScore).stroke }}
                    >
                        {finalScore}
                    </span>
                    <span className="text-xs font-bold text-opd-text-primary font-lora">
                        Claim Readiness
                    </span>
                    {allMissingItems.length > 0 && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                            {allMissingItems.length} gap{allMissingItems.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    {needsManualReview && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 uppercase tracking-wider">
                            Needs Review
                        </span>
                    )}
                </div>
                <span
                    className="text-[10px] text-opd-text-secondary transition-transform duration-200"
                    style={{ transform: mobileOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                >
                    ▼
                </span>
            </button>
            {mobileOpen && (
                <div className="px-4 pb-4 border-t border-opd-border pt-3">
                    {railContent}
                </div>
            )}
        </div>
    );
};
