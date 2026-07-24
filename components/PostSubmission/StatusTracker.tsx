import React, { useState, useEffect } from 'react';
import { PreAuthRecord } from '../PreAuthWizard/types';
import { savePreAuth, getLegacyAppeal as getAppeal } from '../../services/masterPatientRecord';
import type { DenialAppealResult } from '../../engine/denialAppealGenerator';
import { StatusBadge } from '../PreAuthDashboard/StatusBadge';
import { formatDateTime, formatCurrency } from '../../utils/formatters';
import { logFeedbackEvent } from '../../utils/feedbackLogger';
import { submitPreAuthToTPA } from '../../services/tpaPortalService';
import { logStageTimestamp } from '../../utils/stageLogger';


interface StatusTrackerProps {
    record: PreAuthRecord;
    onClose: () => void;
    onRecordUpdate: (r: PreAuthRecord) => void;
}

export const StatusTracker: React.FC<StatusTrackerProps> = ({ record, onClose, onRecordUpdate }) => {
    const [tpaStatus, setTpaStatus] = useState<'approved' | 'denied' | 'query' | 'partial_approved'>(record.tpaResponse?.status ?? 'approved');
    const [approvedAmount, setApprovedAmount] = useState(record.tpaResponse?.approvedAmount ?? 0);
    const [denialReason, setDenialReason] = useState(record.tpaResponse?.denialReason ?? '');
    const [queryDetails, setQueryDetails] = useState(record.tpaResponse?.queryDetails ?? '');
    const [saving, setSaving] = useState(false);
    const [existingAppeal, setExistingAppeal] = useState<DenialAppealResult | null>(null);
    const [submissionError, setSubmissionError] = useState<string | null>(null);

    // Load any existing appeal for this record
    useEffect(() => {
        if (record.status === 'denied') {
            getAppeal(record.id).then(a => setExistingAppeal(a ?? null)).catch(() => {});
        }
    }, [record.id, record.status]);

    const handleSave = async () => {
        setSaving(true);
        const updatedStatus = tpaStatus === 'approved' || tpaStatus === 'partial_approved' ? 'approved' :
            tpaStatus === 'denied' ? 'denied' : 'query_raised';

        // Audit Feedback Loop: capture real-world outcomes for cases flagged insufficient by NEXUS
        if (record.tpaEvidenceReview?.status === 'insufficient') {
            if (tpaStatus === 'query') {
                logFeedbackEvent(record.id, 'queried_insufficient', {
                    queryDetails,
                    diagnosis: record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis
                });
            } else if (tpaStatus === 'approved' || tpaStatus === 'partial_approved') {
                logFeedbackEvent(record.id, 'approved_insufficient', {
                    approvedAmount,
                    diagnosis: record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis
                });
            }
        }

        const updated: PreAuthRecord = {
            ...record,
            status: updatedStatus,
            updatedAt: new Date().toISOString(),
            tpaResponse: { respondedAt: new Date().toISOString(), status: tpaStatus, approvedAmount, denialReason, queryDetails },
        };
        await savePreAuth(updated);
        
        // Log stage updates for calibration & delay analysis
        logStageTimestamp(record.id, 'response_received');
        if (updatedStatus === 'approved') {
            logStageTimestamp(record.id, 'final_outcome_approved');
        } else if (updatedStatus === 'denied') {
            logStageTimestamp(record.id, 'final_outcome_denied');
        }
        
        setSaving(false);
        onRecordUpdate(updated);
    };


    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white border border-opd-border rounded-2xl w-full max-w-2xl my-8 mx-4 shadow-2xl text-opd-text-primary text-left">
                <div className="flex justify-between items-center px-6 py-4 border-b border-opd-border">
                    <h2 className="font-bold text-opd-primary font-lora">Pre-Auth Details</h2>
                    <button onClick={onClose} className="text-opd-text-muted hover:text-opd-primary text-xl" type="button">✕</button>
                </div>
                <div className="px-6 py-5 space-y-5">
                    {/* Summary */}
                    <div className="bg-opd-input-bg border border-opd-border rounded-xl p-4 space-y-2 text-sm shadow-sm">
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-opd-primary text-xs font-bold">{record.id}</span>
                            <StatusBadge status={record.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-opd-text-secondary pt-1">
                            <div>Patient: <span className="text-opd-text-primary font-semibold">{record.patient?.patientName}</span></div>
                            <div>Age/Sex: <span className="text-opd-text-primary font-semibold">{record.patient?.age}{record.patient?.ageUnit === 'months' ? 'M' : 'Y'} · {record.patient?.gender}</span></div>
                            <div>Diagnosis: <span className="text-opd-text-primary font-semibold">{selectedDx?.diagnosis ?? '-'}</span></div>
                            <div>ICD-10: <span className="text-opd-text-primary font-mono font-semibold">{selectedDx?.icd10Code ?? '-'}</span></div>
                            <div>Insurer: <span className="text-opd-text-primary font-semibold">{record.insurance?.insurerName}</span></div>
                            <div>TPA: <span className="text-opd-text-primary font-semibold">{record.insurance?.tpaName}</span></div>
                            <div>Amount: <span className="text-opd-text-primary font-semibold">₹{(record.costEstimate?.amountClaimedFromInsurer ?? 0).toLocaleString('en-IN')}</span></div>
                            <div>Updated: <span className="text-opd-text-primary font-semibold">{formatDateTime(record.updatedAt)}</span></div>
                        </div>
                    </div>

                    {/* Generated Document */}
                    {record.outputs?.irdaiText && (() => {
                        const buildHTML = (text: string) => {
                            const dx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
                            return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Pre-Auth — ${record.id}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Times New Roman',serif;font-size:11pt;color:#000;padding:20mm 18mm}
.header{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:14px}.header h1{font-size:14pt;font-weight:bold}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin-bottom:14px;font-size:10pt}
.meta-row{display:flex;gap:6px}.meta-row .label{font-weight:bold;min-width:120px}
.section-title{font-weight:bold;font-size:10pt;border-bottom:1px solid #999;margin:12px 0 6px;padding-bottom:2px;text-transform:uppercase}
pre{white-space:pre-wrap;font-family:'Courier New',monospace;font-size:9.5pt;line-height:1.5}
.footer{margin-top:20px;border-top:1px solid #999;padding-top:10px;font-size:9pt;color:#444;text-align:center}
@media print{body{padding:10mm 12mm}}</style></head><body>
<div class="header"><h1>INSURANCE PRE-AUTHORIZATION REQUEST</h1><p>IRDAI Part-C — Medical Necessity Statement</p></div>
<div class="meta">
<div class="meta-row"><span class="label">Ref No:</span> ${record.id}</div>
<div class="meta-row"><span class="label">Date:</span> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
<div class="meta-row"><span class="label">Patient:</span> ${record.patient?.patientName ?? '—'}, ${record.patient?.age ?? '?'}${record.patient?.ageUnit === 'months' ? 'M' : 'Y'} ${record.patient?.gender ?? ''}</div>
<div class="meta-row"><span class="label">Policy No:</span> ${record.insurance?.policyNumber ?? '—'}</div>
<div class="meta-row"><span class="label">Insurer:</span> ${record.insurance?.insurerName ?? '—'}</div>
<div class="meta-row"><span class="label">TPA:</span> ${record.insurance?.tpaName ?? '—'}</div>
<div class="meta-row"><span class="label">Diagnosis:</span> ${dx?.diagnosis ?? '—'}</div>
<div class="meta-row"><span class="label">ICD-10:</span> ${dx?.icd10Code ?? '—'}</div>
</div>
<div class="section-title">Pre-Authorization Document</div>
<pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
<div class="footer">Generated by Aivana Insurance Pre-Auth System &nbsp;|&nbsp; Not valid without hospital seal and authorized signature</div>
</body></html>`;
                        };
                        const openPrint = () => {
                            const w = window.open('', '_blank', 'width=900,height=700');
                            if (!w) return;
                            w.document.write(buildHTML(record.outputs.irdaiText!));
                            w.document.close();
                            w.focus();
                            setTimeout(() => w.print(), 400);
                        };
                        return (
                            <div className="space-y-2 text-left">
                                <h3 className="text-xs font-semibold text-opd-text-secondary uppercase tracking-wide">IRDAI Pre-Auth Document</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => navigator.clipboard.writeText(record.outputs.irdaiText!)}
                                        className="btn-secondary py-2 font-semibold text-xs flex items-center justify-center gap-1"
                                        type="button">
                                        📋 Copy
                                    </button>
                                    <button onClick={openPrint}
                                        className="btn-secondary py-2 font-semibold text-xs text-opd-primary border-opd-primary/30 flex items-center justify-center gap-1"
                                        type="button">
                                        🖨️ Print
                                    </button>
                                    <button onClick={openPrint}
                                        className="btn-primary py-2 font-semibold text-xs bg-opd-primary text-white flex items-center justify-center gap-1"
                                        type="button">
                                        📄 PDF
                                    </button>
                                </div>
                                <textarea readOnly value={record.outputs.irdaiText} rows={8}
                                    className="form-input font-mono" />
                            </div>
                        );
                    })()}


                    {/* TPA Response Entry */}
                    {(record.status === 'submitted' || record.status === 'query_raised' || record.status === 'approved' || record.status === 'denied') && (
                        <div className="bg-opd-input-bg border border-opd-border rounded-xl p-4 space-y-4 shadow-sm text-left">
                            <h3 className="font-semibold text-opd-primary text-sm font-lora">📨 Record TPA Response</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {(['approved', 'partial_approved', 'query', 'denied'] as const).map(s => (
                                    <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
                                        <input type="radio" name="tpaStatus" value={s} checked={tpaStatus === s} onChange={() => setTpaStatus(s)} className="accent-opd-primary" />
                                        <span className="text-sm text-opd-text-secondary capitalize">{s.replace('_', ' ')}</span>
                                    </label>
                                ))}
                            </div>
                            {(tpaStatus === 'approved' || tpaStatus === 'partial_approved') && (
                                <div className="space-y-1">
                                    <label className="block text-xs text-opd-text-secondary mb-1">Approved Amount (₹)</label>
                                    <input type="number" value={approvedAmount} onChange={e => setApprovedAmount(+e.target.value)}
                                        className="form-input" />
                                </div>
                            )}
                            {tpaStatus === 'denied' && (
                                <div className="space-y-1">
                                    <label className="block text-xs text-opd-text-secondary mb-1">Denial Reason</label>
                                    <textarea value={denialReason} onChange={e => setDenialReason(e.target.value)} rows={3}
                                        className="form-input" />
                                </div>
                            )}
                            {tpaStatus === 'query' && (
                                <div className="space-y-1">
                                    <label className="block text-xs text-opd-text-secondary mb-1">TPA Query Details</label>
                                    <textarea value={queryDetails} onChange={e => setQueryDetails(e.target.value)} rows={3}
                                        className="form-input" />
                                </div>
                            )}
                            <button onClick={handleSave} disabled={saving}
                                className="w-full btn-primary bg-opd-primary hover:bg-opd-primary/95 text-white py-2.5 shadow-sm text-sm"
                                type="button">
                                {saving ? 'Saving...' : 'Save TPA Response'}
                            </button>
                        </div>
                    )}

                    {/* Mark as Submitted */}
                    {(record.status === 'ready_to_submit' || record.status === 'draft') && (
                        <div className="space-y-2">
                            {submissionError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 font-semibold leading-normal shadow-sm">
                                    ⚠️ Submission unconfirmed — retry. Error: {submissionError}
                                </div>
                            )}
                            <button 
                                disabled={saving}
                                onClick={async () => {
                                    setSubmissionError(null);
                                    setSaving(true);
                                    
                                    try {
                                        const res = await submitPreAuthToTPA(record);
                                        if (res.success && res.receiptId) {
                                            // Audit Feedback Loop: log if desk officer submits despite review warnings
                                            if (record.tpaEvidenceReview?.status === 'insufficient') {
                                                logFeedbackEvent(record.id, 'submitted_insufficient', {
                                                    diagnosis: record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0]?.diagnosis
                                                });
                                            }

                                            const updated = { 
                                                ...record, 
                                                status: 'submitted' as const, 
                                                updatedAt: new Date().toISOString(),
                                                // Store receipt ID in record outputs
                                                outputs: {
                                                    ...(record.outputs ?? {}),
                                                    tpaReceiptId: res.receiptId
                                                }
                                            };
                                            await savePreAuth(updated as PreAuthRecord);
                                            logStageTimestamp(record.id, 'submitted');
                                            onRecordUpdate(updated as PreAuthRecord);
                                        } else {
                                            setSubmissionError(res.error || 'No confirmation receipt returned from TPA.');
                                            logStageTimestamp(record.id, 'submission_unconfirmed');
                                        }
                                    } catch (err: any) {
                                        setSubmissionError(err.message || 'Network gateway timeout.');
                                        logStageTimestamp(record.id, 'submission_unconfirmed');
                                    } finally {
                                        setSaving(false);
                                    }
                                }} 
                                className="w-full btn-primary bg-opd-primary hover:bg-opd-primary/95 text-white py-2.5 shadow-sm text-sm"
                                type="button"
                            >
                                {saving ? 'Submitting to TPA Portal...' : '📤 Mark as Submitted to TPA'}
                            </button>
                        </div>
                    )}

                    {/* Appeal Status Card (for denied records) */}
                    {record.status === 'denied' && (
                        <div className={`rounded-xl p-4 border space-y-2 text-left shadow-sm ${
                            existingAppeal ? 'bg-red-50 border-red-200' : 'bg-opd-input-bg border-opd-border'
                        }`}>
                            <h3 className="font-semibold text-sm text-opd-primary font-lora">⚖️ Appeal Status</h3>
                            {existingAppeal ? (
                                <div className="space-y-1 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                            existingAppeal.appealStatus === 'resolved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            existingAppeal.appealStatus === 'submitted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}>
                                            {existingAppeal.appealStatus}
                                        </span>
                                        <span className="text-opd-text-secondary">
                                            {existingAppeal.addressedCount} of {existingAppeal.totalReasons} denial reasons addressed with existing evidence
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-opd-text-muted mt-1 leading-relaxed">
                                        Generated: {new Date(existingAppeal.generatedAt).toLocaleDateString('en-IN')} · Open the Denial Queue to edit or submit.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-opd-text-secondary leading-relaxed">
                                    No appeal generated yet. Use the <strong>Denial Queue</strong> tab in the TPA Center to generate a citation-backed appeal.
                                </p>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
