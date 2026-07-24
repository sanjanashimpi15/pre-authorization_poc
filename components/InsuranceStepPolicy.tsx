import React from 'react';
import { IRDAIPreAuthForm } from '../types';

interface PolicyDetailsStepProps {
    formData: Partial<IRDAIPreAuthForm>;
    onUpdate: (updates: Partial<IRDAIPreAuthForm>) => void;
}

export const InsuranceStepPolicy: React.FC<PolicyDetailsStepProps> = ({ formData, onUpdate }) => {
    return (
        <div className="space-y-6">
            {/* Policy Information */}
            <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Policy Information</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Policy Number *</label>
                        <input
                            type="text"
                            value={formData.section2_PolicyDetails?.policyNumber || ''}
                            onChange={(e) => onUpdate({
                                section2_PolicyDetails: {
                                    ...(formData.section2_PolicyDetails as any),
                                    policyNumber: e.target.value
                                }
                            })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                            placeholder="e.g., POL123456789"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">TPA Name *</label>
                        <select
                            value={formData.section1_TpaInsurer?.tpaName || ''}
                            onChange={(e) => onUpdate({
                                section1_TpaInsurer: {
                                    ...(formData.section1_TpaInsurer as any),
                                    tpaName: e.target.value
                                }
                            })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                        >
                            <option value="">Select TPA</option>
                            <option value="MDIndia">MD India</option>
                            <option value="HealthIndia">Health India TPA</option>
                            <option value="MediAssist">Medi Assist</option>
                            <option value="Raksha">Raksha TPA</option>
                            <option value="Paramount">Paramount TPA</option>
                            <option value="FHPL">FHPL</option>
                            <option value="Vidal">Vidal Health</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Insurance Company *</label>
                        <input
                            type="text"
                            value={formData.section1_TpaInsurer?.insuranceCompanyName || ''}
                            onChange={(e) => onUpdate({
                                section1_TpaInsurer: {
                                    ...(formData.section1_TpaInsurer as any),
                                    insuranceCompanyName: e.target.value
                                }
                            })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                            placeholder="e.g., Star Health, ICICI Lombard"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Sum Insured (₹)</label>
                        <input
                            type="number"
                            value={formData.section2_PolicyDetails?.sumInsured || ''}
                            onChange={(e) => onUpdate({
                                section2_PolicyDetails: {
                                    ...(formData.section2_PolicyDetails as any),
                                    sumInsured: parseInt(e.target.value) || 0
                                }
                            })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white"
                            placeholder="e.g., 500000"
                        />
                    </div>
                </div>
            </div>

            {/* Past Medical History */}
            <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-4">Past Medical History</h3>
                <p className="text-sm text-gray-400 mb-3">Select any pre-existing conditions:</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                        { key: 'diabetes', label: 'Diabetes' },
                        { key: 'hypertension', label: 'Hypertension' },
                        { key: 'heartDisease', label: 'Heart Disease' },
                        { key: 'asthma', label: 'Asthma/COPD' },
                        { key: 'kidney', label: 'Kidney Disease' },
                        { key: 'liver', label: 'Liver Disease' },
                    ].map(condition => {
                        const history = formData.section5_AdmissionDetails?.pastMedicalHistory as any;
                        const isChecked = history?.[condition.key]?.present || false;

                        return (
                            <label key={condition.key} className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750">
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                        const admissionDetails = formData.section5_AdmissionDetails || {} as any;
                                        const pastMedicalHistory = admissionDetails.pastMedicalHistory || {} as any;

                                        onUpdate({
                                            section5_AdmissionDetails: {
                                                ...admissionDetails,
                                                pastMedicalHistory: {
                                                    ...pastMedicalHistory,
                                                    [condition.key]: {
                                                        ...pastMedicalHistory[condition.key],
                                                        present: e.target.checked
                                                    }
                                                }
                                            }
                                        });
                                    }}
                                    className="rounded bg-gray-600 border-gray-500 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-300">{condition.label}</span>
                            </label>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
