import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, ShieldAlert, TrendingUp, Clock, FileCheck2, User, Send, Building2, HelpCircle } from 'lucide-react';

export const WorkflowOrchestrator: React.FC = () => {
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
    const [patientJourney, setPatientJourney] = useState({
        patientName: 'Asha Devi',
        age: 48,
        gender: 'Female',
        abhaId: '99-8812-7721-09',
        diagnosis: 'Acute Appendicitis',
        icd10: 'K35.8',
        tpa: 'Medi Assist TPA',
        sumInsured: 300000,
        estimatedCost: 85000,
        eligibilityStatus: 'Verified (ABHA Active, AB-PMJAY empanelled)',
        preAuthStatus: 'Approved (Cashless Auth: ₹60,000)',
        codingStatus: 'Scrubbed Clean (CPT: 44970 Appendectomy, ICD-10: K35.8)',
        settlementStatus: 'Deductions Applied (₹12,000 consumables excluded)',
        appealStatus: 'Appeal Submitted (Seeking recovery of ₹12,000)'
    });

    const [simulationLog, setSimulationLog] = useState<string[]>([
        'Patient Asha Devi registered at admission desk.',
        'ABHA ID 99-8812-7721-09 validated against National Health Authority (NHA) database.'
    ]);

    const advanceSimulation = (step: 1 | 2 | 3 | 4 | 5) => {
        setCurrentStep(step);
        const logs = [...simulationLog];
        
        switch (step) {
            case 2:
                logs.push('Prior Auth Copilot initiated. Messy chart parsed via Gemini.');
                logs.push('Medical Necessity established: Severe right lower quadrant pain, WBC 14,000/mcL.');
                logs.push('Pre-Auth submitted to Medi Assist. Cashless authorized for ₹60,000 (Room rent capped at ₹3,000/day).');
                break;
            case 3:
                logs.push('Appendectomy surgery successfully completed by Dr. Bhardwaj.');
                logs.push('Coding Cockpit parsed surgeon discharge note.');
                logs.push('ICD-10 K35.8 and CPT 44970 extracted. CCI Scrubber ran: Clean.');
                break;
            case 4:
                logs.push('Discharge invoice of ₹85,000 submitted to TPA.');
                logs.push('TPA approved cashless settlement for ₹73,000. Deducted ₹12,000 stating "Non-medical consumables excess under Clause 4.1".');
                break;
            case 5:
                logs.push('Aegis Denial Hub ingested disallowance EOB.');
                logs.push('AI Appeal package generated citing IRDAI consumer protection clause on consumable bundling.');
                logs.push('Appeal letter signed by medical director and forwarded to TPA Grievance Cell.');
                break;
        }
        setSimulationLog(logs);
    };

    const resetSimulation = () => {
        setCurrentStep(1);
        setSimulationLog([
            'Patient Asha Devi registered at admission desk.',
            'ABHA ID 99-8812-7721-09 validated against National Health Authority (NHA) database.'
        ]);
    };

    return (
        <div className="space-y-6 animate-fadeInUp text-opd-text-primary">
            
            {/* Analytics Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                
                {/* Metric 1 */}
                <div className="bg-white border border-opd-border rounded-3xl p-5 flex items-center justify-between shadow-sm">
                    <div>
                        <span className="text-[10px] text-opd-text-secondary font-bold uppercase tracking-wider block">Cashless Approval Rate</span>
                        <span className="text-2xl font-black text-emerald-700 mt-1 block">94.8%</span>
                        <span className="text-[10px] text-opd-text-muted mt-0.5 block">+18% with AI Scrubbing</span>
                    </div>
                    <TrendingUp className="w-8 h-8 text-emerald-600/20" />
                </div>

                {/* Metric 2 */}
                <div className="bg-white border border-opd-border rounded-3xl p-5 flex items-center justify-between shadow-sm">
                    <div>
                        <span className="text-[10px] text-opd-text-secondary font-bold uppercase tracking-wider block">Average Settlement TAT</span>
                        <span className="text-2xl font-black text-opd-primary mt-1 block">38 min</span>
                        <span className="text-[10px] text-opd-text-muted mt-0.5 block">IRDAI limit: 60 min</span>
                    </div>
                    <Clock className="w-8 h-8 text-opd-primary/20" />
                </div>

                {/* Metric 3 */}
                <div className="bg-white border border-opd-border rounded-3xl p-5 flex items-center justify-between shadow-sm">
                    <div>
                        <span className="text-[10px] text-opd-text-secondary font-bold uppercase tracking-wider block">Denial Revenue Recovered</span>
                        <span className="text-2xl font-black text-purple-700 mt-1 block">₹4.8 Lakhs</span>
                        <span className="text-[10px] text-opd-text-muted mt-0.5 block">82% appeal success rate</span>
                    </div>
                    <FileCheck2 className="w-8 h-8 text-purple-600/20" />
                </div>

                {/* Metric 4 */}
                <div className="bg-white border border-opd-border rounded-3xl p-5 flex items-center justify-between shadow-sm">
                    <div>
                        <span className="text-[10px] text-opd-text-secondary font-bold uppercase tracking-wider block">Anomaly/Fraud Blocked</span>
                        <span className="text-2xl font-black text-red-700 mt-1 block">12 claims</span>
                        <span className="text-[10px] text-opd-text-muted mt-0.5 block">Prevented upcoding penalties</span>
                    </div>
                    <ShieldAlert className="w-8 h-8 text-red-600/20" />
                </div>

                {/* Metric 5: SLA Targets & Latency Trends */}
                <div className="bg-white border border-opd-border rounded-3xl p-5 shadow-sm md:col-span-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-opd-border pb-2">
                        <span className="text-xs font-bold text-opd-primary uppercase tracking-wider font-lora flex items-center gap-1.5">
                            <Clock className="w-4 h-4" /> E2E System Latency & SLA Performance Dashboard
                        </span>
                        <span className="text-[10px] text-opd-text-muted">Target SLA: 100% compliance</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div>
                            <span className="text-opd-text-secondary block font-semibold mb-1">Stage Latency Trends</span>
                            <div className="space-y-1.5">
                                <div>
                                    <div className="flex justify-between text-[10px] text-opd-text-muted mb-0.5">
                                        <span>Extraction (Target: 15s)</span>
                                        <span className="font-semibold text-opd-primary">P95: 11.2s | P99: 14.8s</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                        <div className="bg-opd-primary h-1.5 rounded-full" style={{ width: '74%' }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-opd-text-muted mb-0.5">
                                        <span>Evidence Review (Target: 30s)</span>
                                        <span className="font-semibold text-opd-primary">P95: 22.4s | P99: 28.1s</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                        <div className="bg-opd-primary h-1.5 rounded-full" style={{ width: '75%' }}></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-opd-text-muted mb-0.5">
                                        <span>Billing Coder (Target: 5s)</span>
                                        <span className="font-semibold text-opd-primary">P95: 3.8s | P99: 4.9s</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                        <div className="bg-opd-primary h-1.5 rounded-full" style={{ width: '76%' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border-l border-opd-border pl-4 space-y-2">
                            <span className="text-opd-text-secondary block font-semibold">Active Run SLA Audit</span>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="bg-opd-input-bg p-2 rounded-xl border border-opd-border">
                                    <span className="block text-opd-text-secondary">E2E Elapsed</span>
                                    <span className="font-mono font-bold text-sm text-opd-text-primary">24.5s</span>
                                </div>
                                <div className="bg-opd-input-bg p-2 rounded-xl border border-opd-border">
                                    <span className="block text-opd-text-secondary">SLA Status</span>
                                    <span className="font-bold text-sm text-emerald-600">COMPLIANT</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-l border-opd-border pl-4 space-y-2">
                            <span className="text-opd-text-secondary block font-semibold">CI Quality Gate Criteria</span>
                            <ul className="text-[10px] space-y-1 text-opd-text-secondary list-disc pl-4">
                                <li>Accuracy (Success Rate): <span className="text-emerald-700 font-bold">94.8%</span> / 90.0% min</li>
                                <li>Average Latency: <span className="text-emerald-700 font-bold">12.4s</span> / 15.0s max</li>
                                <li>Critical SLA Breaches: <span className="text-emerald-700 font-bold">0</span> / 0 allowed</li>
                            </ul>
                        </div>
                    </div>
                </div>

            </div>

            {/* Simulated Claim Journey Timeline */}
            <div className="bg-white border border-opd-border rounded-3xl p-6 space-y-6 shadow-sm">
                <div className="flex justify-between items-center pb-2 border-b border-opd-border">
                    <h3 className="text-sm font-bold text-opd-primary tracking-wide uppercase font-lora">Patient Claims Journey Simulator</h3>
                    <button
                        onClick={resetSimulation}
                        className="text-[10px] text-opd-text-secondary hover:text-opd-primary transition uppercase font-semibold border border-opd-border px-2.5 py-1 rounded-xl hover:bg-gray-50"
                        type="button"
                    >
                        Reset Simulator
                    </button>
                </div>

                {/* Horizontal Stepper Timeline */}
                <div className="grid grid-cols-5 gap-3 relative">
                    
                    {/* Step 1 */}
                    <div
                        onClick={() => advanceSimulation(1)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 shadow-sm ${
                            currentStep >= 1 ? 'bg-primary-tint/30 border-opd-primary/20' : 'bg-opd-input-bg border-opd-border opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-opd-primary font-black uppercase tracking-widest">Step 1</span>
                        <span className="text-xs font-bold text-opd-text-primary block mt-1">Pre-Visit Eligibility</span>
                        <span className="text-[10px] text-opd-text-secondary truncate mt-1">Status: Active</span>
                    </div>

                    {/* Step 2 */}
                    <div
                        onClick={() => advanceSimulation(2)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 shadow-sm ${
                            currentStep >= 2 ? 'bg-primary-tint/30 border-opd-primary/20' : 'bg-opd-input-bg border-opd-border opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-opd-primary font-black uppercase tracking-widest">Step 2</span>
                        <span className="text-xs font-bold text-opd-text-primary block mt-1">Pre-Auth (Fairway)</span>
                        <span className="text-[10px] text-opd-text-secondary truncate mt-1">{currentStep >= 2 ? 'Authorized' : 'Pending'}</span>
                    </div>

                    {/* Step 3 */}
                    <div
                        onClick={() => advanceSimulation(3)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 shadow-sm ${
                            currentStep >= 3 ? 'bg-primary-tint/30 border-opd-primary/20' : 'bg-opd-input-bg border-opd-border opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-opd-primary font-black uppercase tracking-widest">Step 3</span>
                        <span className="text-xs font-bold text-opd-text-primary block mt-1">Coding (Taiga)</span>
                        <span className="text-[10px] text-opd-text-secondary truncate mt-1">{currentStep >= 3 ? 'Scrubbed Clean' : 'Pending'}</span>
                    </div>

                    {/* Step 4 */}
                    <div
                        onClick={() => advanceSimulation(4)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 shadow-sm ${
                            currentStep >= 4 ? 'bg-primary-tint/30 border-opd-primary/20' : 'bg-opd-input-bg border-opd-border opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-opd-primary font-black uppercase tracking-widest">Step 4</span>
                        <span className="text-xs font-bold text-opd-text-primary block mt-1">TPA Settlement</span>
                        <span className="text-[10px] text-opd-text-secondary truncate mt-1">{currentStep >= 4 ? 'Settled with Cuts' : 'Pending'}</span>
                    </div>

                    {/* Step 5 */}
                    <div
                        onClick={() => advanceSimulation(5)}
                        className={`p-4 rounded-2xl cursor-pointer border transition-all text-left flex flex-col justify-between h-28 shadow-sm ${
                            currentStep >= 5 ? 'bg-primary-tint/30 border-opd-primary/20' : 'bg-opd-input-bg border-opd-border opacity-40'
                        }`}
                    >
                        <span className="text-[9px] text-opd-primary font-black uppercase tracking-widest">Step 5</span>
                        <span className="text-xs font-bold text-opd-text-primary block mt-1">Appeals (Aegis)</span>
                        <span className="text-[10px] text-opd-text-secondary truncate mt-1">{currentStep >= 5 ? 'Appeal Sent' : 'Pending'}</span>
                    </div>

                </div>

                {/* Simulation Logs & Details split */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    
                    {/* Live simulator log console */}
                    <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-4 space-y-2 text-left shadow-sm">
                        <h4 className="text-[10px] font-bold text-opd-primary uppercase tracking-wider font-lora">Live System Logs</h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar font-mono text-[10px] leading-relaxed text-opd-text-secondary">
                            {simulationLog.map((log, index) => (
                                <div key={index} className="flex gap-2">
                                    <span className="text-opd-primary font-bold">»</span>
                                    <span>{log}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Active Step Details */}
                    <div className="bg-opd-input-bg border border-opd-border rounded-2xl p-4 text-xs space-y-3 shadow-sm text-left">
                        <h4 className="text-[10px] font-bold text-opd-primary uppercase tracking-wider border-b border-opd-border pb-2 font-lora">Journey Details</h4>
                        
                        {currentStep === 1 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Patient Name:</span>
                                    <span className="text-opd-text-primary font-bold">{patientJourney.patientName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">ABHA National ID:</span>
                                    <span className="font-mono text-opd-text-primary font-bold">{patientJourney.abhaId}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Eligibility Status:</span>
                                    <span className="text-emerald-750 font-semibold">{patientJourney.eligibilityStatus}</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(2)}
                                    className="w-full btn-primary mt-2 py-2 bg-opd-primary text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                    type="button"
                                >
                                    <span>Advance to Admission & Pre-Auth</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Provisional Diagnosis:</span>
                                    <span className="text-opd-text-primary font-bold">{patientJourney.diagnosis} ({patientJourney.icd10})</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Estimated Cost:</span>
                                    <span className="font-mono text-opd-text-primary font-bold">₹{patientJourney.estimatedCost.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">TPA Verdict:</span>
                                    <span className="text-emerald-750 font-semibold">{patientJourney.preAuthStatus}</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(3)}
                                    className="w-full btn-primary mt-2 py-2 bg-opd-primary text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                    type="button"
                                >
                                    <span>Advance to Discharge Coding</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Primary CPT Code:</span>
                                    <span className="font-mono text-opd-text-primary font-bold">{patientJourney.codingStatus.split(' (')[1].replace(')', '')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Claim Scrubber Result:</span>
                                    <span className="text-emerald-750 font-semibold">Clean (0 CCI warnings)</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(4)}
                                    className="w-full btn-primary mt-2 py-2 bg-opd-primary text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                    type="button"
                                >
                                    <span>Advance to TPA Cashless Settlement</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Final Bill Sum:</span>
                                    <span className="font-mono text-opd-text-primary font-bold">₹{patientJourney.estimatedCost.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Claim Settlement Verdict:</span>
                                    <span className="text-red-750 font-semibold">{patientJourney.settlementStatus}</span>
                                </div>
                                <button
                                    onClick={() => advanceSimulation(5)}
                                    className="w-full btn-primary mt-2 py-2 bg-opd-primary text-white font-bold text-[10px] rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                                    type="button"
                                >
                                    <span>Advance to Grievance Appeal</span> <ArrowRight className="w-3 h-3" />
                                </button>
                            </div>
                        )}

                        {currentStep === 5 && (
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Appeal Dispute Sum:</span>
                                    <span className="font-mono text-red-700 font-bold">₹12,000</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-opd-text-secondary">Aegis Status:</span>
                                    <span className="text-opd-primary font-semibold">{patientJourney.appealStatus}</span>
                                </div>
                                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-xl text-[11px] leading-relaxed font-semibold">
                                    ✓ Simulated TPA Portal has accepted the appeal package and scheduled review under IRDAI section-45.
                                </div>
                            </div>
                        )}

                    </div>

                </div>

            </div>

            {/* Payer Portal & Fraud Flags Simulation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                
                {/* Simulated Payer Portal */}
                <div className="bg-white border border-opd-border rounded-3xl p-6 space-y-4 shadow-sm">
                    <h3 className="text-xs font-bold text-opd-primary tracking-wide uppercase border-b border-opd-border pb-2 flex items-center gap-1.5 font-lora">
                        <Building2 className="w-4 h-4 text-opd-primary" /> TPA Auditor / Payer Review Console
                    </h3>
                    <p className="text-[11px] text-opd-text-secondary leading-relaxed">This panel simulates what the insurance company's medical officer observes. Aivana pre-emptively answers their queries to prevent claims bouncing.</p>
                    
                    <div className="space-y-3 text-xs bg-opd-input-bg p-4 rounded-2xl border border-opd-border shadow-sm">
                        <div className="border-b border-opd-border pb-2">
                            <span className="font-bold text-opd-text-primary">Expected TPA Audit Query:</span>
                            <p className="text-opd-text-secondary mt-1 italic">"Please clarify history of diabetes and provide first consult prescription to rule out PED clause exclusions."</p>
                        </div>
                        <div>
                            <span className="font-bold text-emerald-700 flex items-center gap-1">✓ Aivana Pre-emptive Prefill Attached:</span>
                            <p className="text-opd-text-primary mt-1 leading-relaxed">"Attached primary consult note dated 10/10/2025 by Dr. Bhardwaj indicating first diagnosis. The policy is 18 months old, complying with IRDAI PED standards."</p>
                        </div>
                    </div>
                </div>

                {/* Fraud & Anomaly Detections */}
                <div className="bg-white border border-opd-border rounded-3xl p-6 space-y-4 shadow-sm">
                    <h3 className="text-xs font-bold text-opd-primary tracking-wide uppercase border-b border-opd-border pb-2 flex items-center gap-1.5 font-lora">
                        <ShieldAlert className="w-4 h-4 text-red-700" /> Fraud / Anomaly & Compliance Flags
                    </h3>
                    <p className="text-[11px] text-opd-text-secondary leading-relaxed">Automatic validation layers screening for compliance, over-coding, upcoding, and billing anomalies before submitting to TPAs.</p>
                    
                    <div className="space-y-2">
                        <div className="flex gap-3 bg-red-50 border border-red-200 p-3.5 rounded-2xl text-xs text-red-800 shadow-sm">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block">Abnormal Length of Stay (ALOS) Alert</span>
                                <span className="text-[11px] text-opd-text-secondary mt-0.5 block">Cholecystectomy empanelled package standard is 2 days. The chart requests 4 general ward days. stay extension must be justified in Step 2.</span>
                            </div>
                        </div>

                        <div className="flex gap-3 bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-800 shadow-sm">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block">Upcoding Risk Indicator</span>
                                <span className="text-[11px] text-opd-text-secondary mt-0.5 block">CPT procedure codes list major laparoscopic intervention, but ward monitoring charts show only mild conservative treatment records. Checked for synchronization.</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>

        </div>
    );
};
