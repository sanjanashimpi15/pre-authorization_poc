import React from 'react';
import { NexusInsuranceInput, DdxItem } from '../types';

interface InsuranceStepReviewProps {
    nexusData: NexusInsuranceInput;
    selectedDiagnosisIndex: number;
    onDiagnosisSelect: (index: number) => void;
    onSeverityOverrideChange: (override: { overridden: boolean; newSeverity: string; justification: string }) => void;
    severityOverride: { overridden: boolean; newSeverity: string; justification: string };
    patientName: string;
}

export const InsuranceStepReview: React.FC<InsuranceStepReviewProps> = ({
    nexusData,
    selectedDiagnosisIndex,
    onDiagnosisSelect,
    onSeverityOverrideChange,
    severityOverride,
    patientName
}) => {
    if (!nexusData || nexusData.ddx.length === 0) return null;

    const handleOverrideToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSeverityOverrideChange({ ...severityOverride, overridden: e.target.checked });
    };

    const handleSeverityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onSeverityOverrideChange({ ...severityOverride, newSeverity: e.target.value });
    };

    const handleJustificationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onSeverityOverrideChange({ ...severityOverride, justification: e.target.value });
    };

    return (
        <div className="space-y-6 text-gray-200">
            <div>
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-4">
                    Patient & Diagnosis Approval
                </h3>
                <p className="mb-4"><span className="text-gray-400">Patient:</span> {patientName}</p>

                <p className="text-sm text-gray-400 mb-2">Select the Provisional Diagnosis to proceed:</p>
                <div className="space-y-3">
                    {nexusData.ddx.map((dx, idx) => (
                        <div
                            key={idx}
                            onClick={() => onDiagnosisSelect(idx)}
                            className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${selectedDiagnosisIndex === idx
                                    ? 'bg-blue-900/40 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                    : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="mt-1">
                                    <input
                                        type="radio"
                                        checked={selectedDiagnosisIndex === idx}
                                        onChange={() => onDiagnosisSelect(idx)}
                                        className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                                    />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <h4 className={`font-semibold ${selectedDiagnosisIndex === idx ? 'text-blue-400' : 'text-gray-200'}`}>
                                            {dx.diagnosis}
                                        </h4>
                                        <span className={`text-xs px-2 py-1 rounded-full ${dx.confidence === 'High' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                dx.confidence === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                    'bg-red-500/20 text-red-400 border border-red-500/30'
                                            }`}>
                                            {dx.confidence} Confidence
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400">{dx.rationale}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-4">
                    Clinical Severity Assessment (NEXUS)
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <p className="text-sm text-gray-400">Symptom Severity</p>
                        <p className="text-xl font-semibold text-white">{nexusData.severity.phenoIntensity.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <p className="text-sm text-gray-400">Clinical Urgency</p>
                        <p className="text-xl font-semibold text-white">{nexusData.severity.urgencyQuotient.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <p className="text-sm text-gray-400">Deterioration Risk</p>
                        <p className="text-xl font-semibold text-white">{nexusData.severity.deteriorationVelocity.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded border border-gray-700">
                        <p className="text-sm text-gray-400">Red Flag Status</p>
                        <p className="text-xl font-semibold text-white uppercase">{nexusData.severity.redFlagSeverity}</p>
                    </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={severityOverride.overridden}
                            onChange={handleOverrideToggle}
                            className="rounded bg-gray-700 border-gray-600 text-purple-600"
                        />
                        <span className="font-medium">Override NEXUS Severity Assessment</span>
                    </label>

                    {severityOverride.overridden && (
                        <div className="mt-4 space-y-4 pl-7 border-l-2 border-opd-primary">
                            <div>
                                <label className="block text-sm text-opd-text-secondary mb-1">New Severity Level</label>
                                <select
                                    value={severityOverride.newSeverity}
                                    onChange={handleSeverityChange}
                                    className="w-full bg-opd-input-bg border border-opd-border rounded p-2 text-opd-text-primary focus:outline-none focus:border-opd-primary transition"
                                >
                                    <option value="">Select severity...</option>
                                    <option value="critical">Critical (Immediate Admission)</option>
                                    <option value="high">High (Standard Admission)</option>
                                    <option value="moderate">Moderate (Observation/Day Care)</option>
                                    <option value="low">Low (OPD Management)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-opd-text-secondary mb-1">Clinical Justification</label>
                                <textarea
                                    value={severityOverride.justification}
                                    onChange={handleJustificationChange}
                                    placeholder="Provide clinical rationale for overriding the AI assessment..."
                                    className="w-full bg-opd-input-bg border border-opd-border rounded p-2 text-opd-text-primary h-24 focus:outline-none focus:border-opd-primary transition"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* 
      <div>
        <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2 mb-4">
          Key Findings Supporting Admission
        </h3>
        <ul className="list-disc list-inside space-y-1 text-gray-300">
          {nexusData.keyFindings.map((finding, idx) => (
            <li key={idx}>{finding}</li>
          ))}
        </ul>
      </div> */}
        </div>
    );
};
