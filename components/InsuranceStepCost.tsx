import React from 'react';
import { IRDAIPreAuthForm } from '../types';

interface CostEstimationStepProps {
    formData: Partial<IRDAIPreAuthForm>;
    onUpdate: (updates: Partial<IRDAIPreAuthForm>) => void;
    diagnosis?: string;
}

export const InsuranceStepCost: React.FC<CostEstimationStepProps> = ({ formData, onUpdate }) => {
    // Auto-calculate totals
    const calculateTotal = () => {
        const costs = formData.section6_CostEstimate;
        if (!costs) return 0;

        return (
            (costs.totalRoomCharges || 0) +
            (costs.totalNursingCharges || 0) +
            (costs.totalIcuCharges || 0) +
            (costs.otCharges || 0) +
            (costs.professionalFees?.surgeonFee || 0) +
            (costs.professionalFees?.anesthetistFee || 0) +
            (costs.professionalFees?.consultantFee || 0) +
            (costs.investigationsEstimate || 0) +
            (costs.medicinesEstimate || 0) +
            (costs.consumablesEstimate || 0) +
            (costs.totalImplantsCost || 0) +
            (costs.miscCharges || 0)
        );
    };

    const updateCost = (key: string, value: number, category?: 'professionalFees') => {
        const currentCosts = formData.section6_CostEstimate || {} as any;

        let newCosts;
        if (category === 'professionalFees') {
            newCosts = {
                ...currentCosts,
                professionalFees: {
                    ...(currentCosts.professionalFees || {}),
                    [key]: value
                }
            };
        } else {
            newCosts = {
                ...currentCosts,
                [key]: value
            };

            // Auto calc multiplications if applicable
            if (key === 'roomRentPerDay' || key === 'expectedRoomDays') {
                newCosts.totalRoomCharges = (newCosts.roomRentPerDay || 0) * (newCosts.expectedRoomDays || 0);
            }
            if (key === 'icuChargesPerDay' || key === 'expectedIcuDays') {
                newCosts.totalIcuCharges = (newCosts.icuChargesPerDay || 0) * (newCosts.expectedIcuDays || 0);
            }
        }

        // Auto calc grand total
        const grandTotal =
            (newCosts.totalRoomCharges || 0) +
            (newCosts.totalNursingCharges || 0) +
            (newCosts.totalIcuCharges || 0) +
            (newCosts.otCharges || 0) +
            (newCosts.professionalFees?.surgeonFee || 0) +
            (newCosts.professionalFees?.anesthetistFee || 0) +
            (newCosts.professionalFees?.consultantFee || 0) +
            (newCosts.investigationsEstimate || 0) +
            (newCosts.medicinesEstimate || 0) +
            (newCosts.consumablesEstimate || 0) +
            (newCosts.totalImplantsCost || 0) +
            (newCosts.miscCharges || 0);

        newCosts.totalEstimatedCost = grandTotal;

        onUpdate({ section6_CostEstimate: newCosts });
    };

    return (
        <div className="space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-sm text-blue-300">
                    💡 Cost estimation is required for pre-authorization. TPAs use this to approve the claim amount.
                </p>
            </div>

            {/* Room Charges */}
            <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3">Room & Nursing Charges</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Room Type</label>
                        <select className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm">
                            <option>General Ward</option>
                            <option>Semi-Private</option>
                            <option>Private</option>
                            <option>Deluxe</option>
                            <option>ICU</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Rate/Day (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.roomRentPerDay || ''}
                            onChange={(e) => updateCost('roomRentPerDay', parseInt(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="2500"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Expected Days</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.expectedRoomDays || ''}
                            onChange={(e) => updateCost('expectedRoomDays', parseInt(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="5"
                        />
                    </div>
                </div>
            </div>

            {/* Professional Fees */}
            <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3">Professional Fees</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Surgeon Fee (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.professionalFees?.surgeonFee || ''}
                            onChange={(e) => updateCost('surgeonFee', parseInt(e.target.value) || 0, 'professionalFees')}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="25000"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Anesthetist Fee (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.professionalFees?.anesthetistFee || ''}
                            onChange={(e) => updateCost('anesthetistFee', parseInt(e.target.value) || 0, 'professionalFees')}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="10000"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Consultant Fee (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.professionalFees?.consultantFee || ''}
                            onChange={(e) => updateCost('consultantFee', parseInt(e.target.value) || 0, 'professionalFees')}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="5000"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">OT Charges (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.otCharges || ''}
                            onChange={(e) => updateCost('otCharges', parseInt(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="15000"
                        />
                    </div>
                </div>
            </div>

            {/* Other Costs */}
            <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-3">Medicines & Consumables</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Medicines (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.medicinesEstimate || ''}
                            onChange={(e) => updateCost('medicinesEstimate', parseInt(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="15000"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Consumables (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.consumablesEstimate || ''}
                            onChange={(e) => updateCost('consumablesEstimate', parseInt(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="8000"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Investigations (₹)</label>
                        <input
                            type="number"
                            value={formData.section6_CostEstimate?.investigationsEstimate || ''}
                            onChange={(e) => updateCost('investigationsEstimate', parseInt(e.target.value) || 0)}
                            className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm"
                            placeholder="5000"
                        />
                    </div>
                </div>
            </div>

            {/* Total */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-white">Total Estimated Cost</span>
                    <span className="text-2xl font-bold text-green-400">₹{calculateTotal().toLocaleString('en-IN')}</span>
                </div>
            </div>
        </div>
    );
};
