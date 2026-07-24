import { CostEstimate } from '../components/PreAuthWizard/types';

/**
 * Recalculates all derived totals in a CostEstimate object.
 * Call this whenever any numeric field changes.
 */
export const calculateTotals = (cost: Partial<CostEstimate>, sumInsured: number = 0): CostEstimate => {
    const base: CostEstimate = {
        roomRentPerDay: cost.roomRentPerDay ?? 0,
        expectedRoomDays: cost.expectedRoomDays ?? 0,
        totalRoomCharges: 0,
        nursingChargesPerDay: cost.nursingChargesPerDay ?? 0,
        totalNursingCharges: 0,
        icuChargesPerDay: cost.icuChargesPerDay ?? 0,
        expectedIcuDays: cost.expectedIcuDays ?? 0,
        totalIcuCharges: 0,
        otCharges: cost.otCharges ?? 0,
        surgeonFee: cost.surgeonFee ?? 0,
        anesthetistFee: cost.anesthetistFee ?? 0,
        consultantFee: cost.consultantFee ?? 0,
        otherDoctorFees: cost.otherDoctorFees ?? 0,
        investigationsEstimate: cost.investigationsEstimate ?? 0,
        medicinesEstimate: cost.medicinesEstimate ?? 0,
        consumablesEstimate: cost.consumablesEstimate ?? 0,
        implants: cost.implants ?? [],
        totalImplantsCost: 0,
        ambulanceCharges: cost.ambulanceCharges ?? 0,
        miscCharges: cost.miscCharges ?? 0,
        packageName: cost.packageName,
        packageAmount: cost.packageAmount,
        isPackageRate: cost.isPackageRate ?? false,
        totalEstimatedCost: 0,
        amountClaimedFromInsurer: 0,
        patientResponsibility: 0,
        exceedsSumInsured: false,
        excessAmount: 0,
        copayPercentage: cost.copayPercentage,
        copayAmount: 0,
    };

    if (base.isPackageRate && base.packageAmount) {
        base.totalEstimatedCost = base.packageAmount;
    } else {
        base.totalRoomCharges = base.roomRentPerDay * base.expectedRoomDays;
        base.totalNursingCharges = base.nursingChargesPerDay * base.expectedRoomDays;
        base.totalIcuCharges = base.icuChargesPerDay * base.expectedIcuDays;
        base.totalImplantsCost = base.implants.reduce((sum, i) => sum + (i.implantCost ?? 0), 0);

        base.totalEstimatedCost =
            base.totalRoomCharges +
            base.totalNursingCharges +
            base.totalIcuCharges +
            base.otCharges +
            base.surgeonFee +
            base.anesthetistFee +
            base.consultantFee +
            base.otherDoctorFees +
            base.investigationsEstimate +
            base.medicinesEstimate +
            base.consumablesEstimate +
            base.totalImplantsCost +
            base.ambulanceCharges +
            base.miscCharges;
    }

    if (base.copayPercentage) {
        base.copayAmount = Math.round(base.totalEstimatedCost * (base.copayPercentage / 100));
    }

    // Default claimed = min(total, sum insured)
    base.amountClaimedFromInsurer = cost.amountClaimedFromInsurer !== undefined
        ? cost.amountClaimedFromInsurer
        : (sumInsured > 0 ? Math.min(base.totalEstimatedCost, sumInsured) : base.totalEstimatedCost);

    base.patientResponsibility = Math.max(0, base.totalEstimatedCost - base.amountClaimedFromInsurer);
    base.exceedsSumInsured = sumInsured > 0 && base.totalEstimatedCost > sumInsured;
    base.excessAmount = base.exceedsSumInsured ? base.totalEstimatedCost - sumInsured : 0;

    return base;
};

export const formatCostDisplay = (amount: number): string =>
    `₹${amount.toLocaleString('en-IN')}`;
