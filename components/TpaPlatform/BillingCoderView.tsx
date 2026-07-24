import React, { useState } from 'react';
import { Layers, FileText, CheckCircle, AlertTriangle, XCircle, CreditCard, Sparkles, RefreshCw } from 'lucide-react';
import { runBillingCodingWorkflow, BillingInput } from '../../engine/billingCoder';
import { BillingCodingOutput } from '../../services/geminiService';

export const BillingCoderView: React.FC = () => {
    const [clinicalNote, setClinicalNote] = useState(`DISCHARGE BRIEF & TREATMENT RECORD
Patient: Sushma Swaraj, 54-year-old female, admitted for right knee severe osteoarthritis (Grade 4). She has undergone a planned unilateral Total Knee Replacement (TKR) on 03/07/2026.
Procedure: Unilateral Total Knee Replacement. Access made via midline longitudinal incision, patella everted. Bone cuts done, sizing of components completed. Femoral and tibial components cemented. Patella resurfaced. Lavage done. Joint capsule closed. Drainage tube inserted.
Comorbidities: Essential Hypertension on Telmisartan 40mg. Type 2 Diabetes Mellitus on Metformin 500mg.
Daily progress: Day 1 post-op, pain managed with femoral nerve block. Started on passive range of motion exercises. Wound dry, drainage minimal. Day 2 post-op, ambulated with walker. Stable vitals. LFTs normal. Platelets normal.
Billing request: Total surgery package, private ward stay (INR 8,000/day for 4 days), orthopedic implants (cemented unilateral knee prosthesis), post-op knee brace, physical therapy sessions (INR 1,200/session x 3), surgical sutures, dressing kits.`);

    const [insurerName, setInsurerName] = useState('HDFC Ergo');
    const [sumInsured, setSumInsured] = useState(400000);
    const [wardType, setWardType] = useState<'General' | 'Semi-Private' | 'Private' | 'ICU'>('Private');
    const [requestedAmount, setRequestedAmount] = useState(185000);

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BillingCodingOutput | null>(null);

    const handleRunCoder = async () => {
        setLoading(true);
        try {
            const output = await runBillingCodingWorkflow({
                clinicalNote,
                insurerName,
                sumInsured,
                wardType,
                requestedAmount
            });
            setResult(output);
        } catch (e) {
            console.error(e);
            alert("Coding engine execution failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fadeInUp">
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-opd-border shadow-sm text-left">
                <div>
                    <div className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full mb-2">
                        <Sparkles className="w-3.5 h-3.5" /> Taiga Style Billing Coder
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-opd-text-primary font-lora">AI-Powered ICD-10/CPT Medical Coding & Scrubbing</h2>
                    <p className="text-xs text-opd-text-secondary mt-0.5 leading-relaxed">Scrubbing claim documentation against CCI unbundling edits and room rent caps, dynamically formulating approved cashless ledgers.</p>
                </div>
            </div>

            {/* Layout Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
                
                {/* Inputs Pane (7 columns) */}
                <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white border border-opd-border rounded-3xl p-6 space-y-4 shadow-sm text-opd-text-primary text-left">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-bold text-opd-primary font-lora tracking-wide uppercase">Discharge Notes & Consumables Checklist</h3>
                            <button
                                onClick={() => setClinicalNote('')}
                                className="text-[10px] text-opd-text-secondary hover:text-opd-primary transition uppercase font-semibold"
                                type="button"
                            >
                                Clear Notes
                            </button>
                        </div>

                        <textarea
                            value={clinicalNote}
                            onChange={(e) => setClinicalNote(e.target.value)}
                            rows={10}
                            className="form-input font-mono text-xs text-opd-text-primary"
                        />

                        {/* Financial and Policy Parameters */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs border-t border-opd-border pt-4">
                            <div>
                                <label className="text-[10px] text-opd-text-secondary font-bold mb-1 block">Insurer Name</label>
                                <input type="text" value={insurerName} onChange={(e) => setInsurerName(e.target.value)} className="w-full p-2.5 bg-opd-input-bg border border-opd-border rounded-xl text-xs text-opd-text-primary focus:outline-none focus:border-opd-primary transition" />
                            </div>
                            <div>
                                <label className="text-[10px] text-opd-text-secondary font-bold mb-1 block">Sum Insured (₹)</label>
                                <input type="number" value={sumInsured} onChange={(e) => setSumInsured(Number(e.target.value))} className="w-full p-2.5 bg-opd-input-bg border border-opd-border rounded-xl text-xs text-opd-text-primary focus:outline-none focus:border-opd-primary transition" />
                            </div>
                            <div>
                                <label className="text-[10px] text-opd-text-secondary font-bold mb-1 block">Ward Capping Class</label>
                                <select value={wardType} onChange={(e) => setWardType(e.target.value as any)} className="w-full p-2.5 bg-opd-input-bg border border-opd-border rounded-xl text-xs text-opd-text-primary focus:outline-none focus:border-opd-primary transition">
                                    <option value="General">General (1% limit)</option>
                                    <option value="Semi-Private">Semi-Private</option>
                                    <option value="Private">Private</option>
                                    <option value="ICU">ICU (2% limit)</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-opd-text-secondary font-bold mb-1 block">Invoice Bill Total (₹)</label>
                                <input type="number" value={requestedAmount} onChange={(e) => setRequestedAmount(Number(e.target.value))} className="w-full p-2.5 bg-opd-input-bg border border-opd-border rounded-xl text-xs text-purple-700 font-bold focus:outline-none focus:border-opd-primary transition" />
                            </div>
                        </div>

                        {/* Execute Button */}
                        <button
                            onClick={handleRunCoder}
                            disabled={loading || !clinicalNote}
                            className="w-full py-4 rounded-2xl bg-opd-primary hover:bg-opd-primary/95 text-white font-bold tracking-wider text-sm transition shadow-sm disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99] flex items-center justify-center gap-2"
                            type="button"
                        >
                            {loading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Coding, Validating & Scrubbing Claim...</span>
                                </>
                            ) : (
                                <span>Code & Scrub Hospital Claim ⚡</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Audit & Coding Output Pane (5 columns) */}
                <div className="lg:col-span-5 space-y-6">
                    {result ? (
                        <div className="bg-white border border-opd-border rounded-3xl p-6 space-y-6 relative shadow-sm text-opd-text-primary text-left">
                            
                            {/* Header Status */}
                            <div className="flex items-center justify-between border-b border-opd-border pb-4">
                                <h3 className="text-sm font-bold text-opd-text-primary font-lora tracking-wide uppercase">Claim Scrubbing Report</h3>
                                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl tracking-wider border ${
                                    result.scrubbingStatus === 'Clean' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    result.scrubbingStatus === 'Failed' ? 'bg-red-50 text-red-755 border-red-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                    {result.scrubbingStatus}
                                </span>
                            </div>

                            {result.scrubbingStatus === 'Failed' ? (
                                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-4 shadow-sm">
                                    <AlertTriangle className="w-12 h-12 text-red-750 mx-auto" />
                                    <h4 className="text-base font-bold text-red-800">Manual Intervention Required</h4>
                                    <p className="text-xs text-opd-text-secondary leading-relaxed">
                                        Automated extraction, coding, and scrubbing could not be completed safely. No automated clinical or billing suggestions are available. Please perform manual coding and TPA auditing.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Coded Diagnoses (ICD-10) */}
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                                            <FileText className="w-3.5 h-3.5 text-purple-700" /> Coded ICD-10 Diagnoses
                                        </h4>
                                        <div className="space-y-2 bg-opd-input-bg p-4 rounded-2xl border border-opd-border text-xs shadow-sm">
                                            <div className="flex justify-between items-start gap-3 text-left">
                                                <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">{result.primaryICD10}</span>
                                                <div className="text-right">
                                                    <span className="font-bold text-opd-text-primary block">Primary: {result.primaryDescription}</span>
                                                </div>
                                            </div>

                                            {result.secondaryICD10.length > 0 && (
                                                <div className="border-t border-opd-border pt-2.5 mt-2.5 space-y-2">
                                                    <span className="text-[9px] text-opd-text-secondary font-bold block uppercase tracking-wider">Secondary / Comorbidities</span>
                                                    {result.secondaryICD10.map((sec, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-[11px] text-left">
                                                            <span className="font-mono text-opd-text-secondary bg-white px-1.5 py-0.5 rounded border border-opd-border shadow-sm">{sec.code}</span>
                                                            <span className="text-opd-text-primary ml-2">{sec.description}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Suggested Procedures (CPT) */}
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                                            <Layers className="w-3.5 h-3.5 text-indigo-700" /> Coded CPT Procedures & Rates
                                        </h4>
                                        <div className="space-y-2 bg-opd-input-bg p-4 rounded-2xl border border-opd-border text-xs shadow-sm">
                                            {result.suggestedCPT.map((cpt, idx) => (
                                                <div key={idx} className="flex justify-between items-center py-1.5 border-b border-opd-border last:border-b-0 last:pb-0 first:pt-0">
                                                    <div className="text-left flex items-center">
                                                        <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 text-[10px] font-bold mr-2">{cpt.code}</span>
                                                        <span className="text-opd-text-primary text-[11px]">{cpt.description}</span>
                                                    </div>
                                                    <span className="font-mono text-opd-text-primary font-bold">₹{cpt.estimatedRate.toLocaleString('en-IN')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Claim Scrubbing Warnings */}
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> CCI Edits & Validation Warnings
                                        </h4>
                                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 shadow-sm">
                                            {result.validationWarnings.length > 0 ? (
                                                <ul className="list-disc pl-4 space-y-1.5 text-xs text-amber-800 font-medium text-left">
                                                    {result.validationWarnings.map((warning, idx) => (
                                                        <li key={idx} className="leading-relaxed">{warning}</li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold text-left">
                                                    <CheckCircle className="w-4 h-4" /> Claim is clean. No CCI unbundling or double billing detected.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Cashless Approval Ledger */}
                                    <div className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-opd-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                                            <CreditCard className="w-3.5 h-3.5 text-emerald-700" /> Final Cashless Billing Ledger
                                        </h4>
                                        <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-4 space-y-2.5 text-xs shadow-sm">
                                            <div className="flex justify-between items-center text-opd-text-secondary">
                                                <span>Total Invoiced Bill:</span>
                                                <span className="font-mono text-opd-text-primary">₹{requestedAmount.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-red-750">
                                                <span>Non-Medical Deductions (Consumables ~8%):</span>
                                                <span className="font-mono">- ₹{Math.round(requestedAmount * 0.08).toLocaleString('en-IN')}</span>
                                            </div>
                                            {result.copayDeductions > 0 && (
                                                <div className="flex justify-between items-center text-red-750">
                                                    <span>Policy Co-payment:</span>
                                                    <span className="font-mono">- ₹{result.copayDeductions.toLocaleString('en-IN')}</span>
                                                </div>
                                            )}
                                            {result.patientShare > (requestedAmount * 0.08 + result.copayDeductions) && (
                                                <div className="flex justify-between items-center text-red-750">
                                                    <span>Room Rent Excess & Proportional Deductions:</span>
                                                    <span className="font-mono">- ₹{Math.round(result.patientShare - (requestedAmount * 0.08) - result.copayDeductions).toLocaleString('en-IN')}</span>
                                                </div>
                                            )}
                                            <div className="border-t border-opd-border pt-2.5 flex justify-between items-center font-bold text-opd-text-primary">
                                                <span>Approved Cashless Coverage:</span>
                                                <span className="font-mono text-emerald-700 text-sm">₹{result.cashlessApproved.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="flex justify-between items-center font-bold text-opd-text-secondary">
                                                <span>Patient Co-pay/Share:</span>
                                                <span className="font-mono text-amber-700 text-xs">₹{result.patientShare.toLocaleString('en-IN')}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white border border-dashed border-opd-border rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[500px] shadow-sm text-opd-text-primary">
                            <Layers className="w-12 h-12 text-opd-text-muted mb-3" />
                            <h3 className="text-sm font-bold font-lora text-opd-primary">Awaiting Coding Report</h3>
                            <p className="text-xs text-opd-text-secondary mt-1 max-w-xs mx-auto leading-relaxed">Click the button on the left to extract ICD-10 codes, suggest CPT listings, and audit the billing ledger.</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
