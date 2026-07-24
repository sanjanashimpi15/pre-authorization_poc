// ============================================================================
// COST ESTIMATION SERVICE — Powered by ICD Cost Database (100 conditions)
// ============================================================================

import icdCostDb from '../config/icd_costs_database.json';

// -----------------------------------------------------------------------------
// TYPES (matching JSON structure)
// -----------------------------------------------------------------------------

export interface ICDCostCondition {
    id: string;
    icd_code: string;
    condition: string;
    specialty: string;
    is_surgical: boolean;
    los: { min: number; max: number; avg: number; icu: number };
    pmjay: { eligible: boolean; hbp_code: string | null; rate: number };
    private: {
        ward: number;
        semi: number;
        pvt: number;
        icu: number;
        invest: number;
        med_per_day: number;
        consult?: number;
        procedure?: number;
    };
}

export interface CostBreakdown {
    room_rent: number;
    nursing_charges: number;
    icu_charges: number;
    ot_charges: number;
    surgeon_fee: number;
    anesthetist_fee: number;
    consultant_fee: number;
    investigations: number;
    medicines: number;
    consumables: number;
    implants: number;
    miscellaneous: number;
}

export interface CostEstimateResult {
    source: 'PMJAY' | 'Private';
    condition_name: string;
    pmjay_details?: {
        hbp_code: string;
        package_name: string;
        package_rate: number;
    };
    los: {
        total_days: number;
        ward_days: number;
        icu_days: number;
    };
    breakdown: CostBreakdown;
    total_estimated: number;
    claimed_amount: number;
}

export type RoomCategory = 'General Ward' | 'Semi-Private' | 'Private' | 'ICU' | string;

// Keep backward-compat aliases used by AdmissionCostStep
export type CostEstimateInput = {
    icdCode: string;
    roomCategory: RoomCategory;
    expectedLOS: number;
    icuDays: number;
    isPMJAY: boolean;
    isSurgical: boolean;
};

export type CostEstimateOutput = CostEstimateResult;

// -----------------------------------------------------------------------------
// LOOKUP: find condition by ICD code (exact → prefix → reverse-prefix)
// -----------------------------------------------------------------------------

const allConditions: ICDCostCondition[] = (icdCostDb.conditions as any[]).filter(
    (c: any) => !c.separator
) as ICDCostCondition[];

export function findConditionByICD(icdCode: string): ICDCostCondition | null {
    if (!icdCode) return null;
    const code = icdCode.trim().toUpperCase();

    // Exact match
    const exact = allConditions.find(c => c.icd_code.toUpperCase() === code);
    if (exact) return exact;

    // Prefix match (e.g. "J15" matches "J15.9")
    const prefix = allConditions.find(c => c.icd_code.toUpperCase().startsWith(code));
    if (prefix) return prefix;

    // Reverse prefix (e.g. "J15.9" matches "J15")
    const reverse = allConditions.find(c => code.startsWith(c.icd_code.toUpperCase()));
    if (reverse) return reverse;

    return null;
}

export function findConditionByName(name: string): ICDCostCondition | null {
    if (!name) return null;
    const n = name.toLowerCase();
    return allConditions.find(c => c.condition.toLowerCase().includes(n)) ??
        allConditions.find(c => n.includes(c.condition.toLowerCase())) ??
        null;
}

// -----------------------------------------------------------------------------
// MAIN CALCULATOR
// -----------------------------------------------------------------------------

export function calculateCost(
    icdCode: string,
    roomCategory: RoomCategory,
    isPMJAY: boolean,
    customLOS?: number,
    customICUDays?: number,
): CostEstimateResult {
    const condition = findConditionByICD(icdCode);

    if (!condition) {
        return getDefaultEstimate(roomCategory, isPMJAY);
    }

    const totalDays = customLOS ?? condition.los.avg;
    const icuDays = customICUDays ?? condition.los.icu;
    const wardDays = Math.max(0, totalDays - icuDays);

    // ── PMJAY path ──────────────────────────────────────────────────────────
    if (isPMJAY && condition.pmjay.eligible && condition.pmjay.rate > 0) {
        return {
            source: 'PMJAY',
            condition_name: condition.condition,
            pmjay_details: {
                hbp_code: condition.pmjay.hbp_code || '',
                package_name: condition.condition,
                package_rate: condition.pmjay.rate,
            },
            los: { total_days: totalDays, ward_days: wardDays, icu_days: icuDays },
            breakdown: distributePMJAYPackage(condition.pmjay.rate, condition.is_surgical),
            total_estimated: condition.pmjay.rate,
            claimed_amount: condition.pmjay.rate,
        };
    }

    // ── Private path ────────────────────────────────────────────────────────
    const priv = condition.private;

    const roomRatePerDay: Record<string, number> = {
        'General Ward': priv.ward,
        'Semi-Private': priv.semi,
        'Private': priv.pvt,
        'ICU': priv.icu,
    };
    const dailyRate = roomRatePerDay[roomCategory] ?? priv.ward;

    const roomRent = dailyRate * wardDays;
    const icuCharges = priv.icu * icuDays;
    const nursingCharges = Math.round((roomRent + icuCharges) * 0.15);
    const investigations = priv.invest;
    const medicines = priv.med_per_day * totalDays;

    let otCharges = 0, surgeonFee = 0, anesthetistFee = 0, consultantFee = 0, consumables = 0;

    if (condition.is_surgical && priv.procedure) {
        otCharges = Math.round(priv.procedure * 0.25);
        surgeonFee = Math.round(priv.procedure * 0.40);
        anesthetistFee = Math.round(priv.procedure * 0.15);
        consumables = Math.round(priv.procedure * 0.20);
    } else {
        consultantFee = (priv.consult || 800) * totalDays;
    }

    const subtotal =
        roomRent + icuCharges + nursingCharges +
        otCharges + surgeonFee + anesthetistFee + consultantFee +
        investigations + medicines + consumables;

    const miscellaneous = Math.round(subtotal * 0.05);
    const total = subtotal + miscellaneous;

    return {
        source: 'Private',
        condition_name: condition.condition,
        los: { total_days: totalDays, ward_days: wardDays, icu_days: icuDays },
        breakdown: {
            room_rent: roomRent,
            nursing_charges: nursingCharges,
            icu_charges: icuCharges,
            ot_charges: otCharges,
            surgeon_fee: surgeonFee,
            anesthetist_fee: anesthetistFee,
            consultant_fee: consultantFee,
            investigations,
            medicines,
            consumables,
            implants: 0,
            miscellaneous,
        },
        total_estimated: total,
        claimed_amount: total,
    };
}

// Backward-compat wrapper used by AdmissionCostStep
export function estimateDetailedCost(
    input: CostEstimateInput,
    _unused?: any, // old ICDConditionWithCosts param, no longer needed
): CostEstimateOutput {
    return calculateCost(
        input.icdCode,
        input.roomCategory,
        input.isPMJAY,
        input.expectedLOS,
        input.icuDays,
    );
}

// Backward-compat: used by AdmissionCostStep's getCostDataForICD
export function getCostDataForICD(icd: string): ICDCostCondition | null {
    return findConditionByICD(icd);
}

// -----------------------------------------------------------------------------
// HELPER: Distribute PMJAY package into line items for display
// -----------------------------------------------------------------------------

function distributePMJAYPackage(packageRate: number, isSurgical: boolean): CostBreakdown {
    if (isSurgical) {
        return {
            room_rent: Math.round(packageRate * 0.15),
            nursing_charges: Math.round(packageRate * 0.05),
            icu_charges: 0,
            ot_charges: Math.round(packageRate * 0.20),
            surgeon_fee: Math.round(packageRate * 0.25),
            anesthetist_fee: Math.round(packageRate * 0.10),
            consultant_fee: 0,
            investigations: Math.round(packageRate * 0.10),
            medicines: Math.round(packageRate * 0.10),
            consumables: Math.round(packageRate * 0.05),
            implants: 0,
            miscellaneous: 0,
        };
    }
    return {
        room_rent: Math.round(packageRate * 0.25),
        nursing_charges: Math.round(packageRate * 0.10),
        icu_charges: 0,
        ot_charges: 0,
        surgeon_fee: 0,
        anesthetist_fee: 0,
        consultant_fee: Math.round(packageRate * 0.15),
        investigations: Math.round(packageRate * 0.20),
        medicines: Math.round(packageRate * 0.25),
        consumables: 0,
        implants: 0,
        miscellaneous: Math.round(packageRate * 0.05),
    };
}

// -----------------------------------------------------------------------------
// HELPER: Default estimate for unknown conditions
// -----------------------------------------------------------------------------

function getDefaultEstimate(roomCategory: RoomCategory, isPMJAY: boolean): CostEstimateResult {
    const defaultLOS = 5;
    const defaultRates: Record<string, number> = {
        'General Ward': 3000, 'Semi-Private': 5500, 'Private': 10000, 'ICU': 25000,
    };

    if (isPMJAY) {
        return {
            source: 'PMJAY',
            condition_name: 'Unknown Condition (Default)',
            los: { total_days: defaultLOS, ward_days: defaultLOS, icu_days: 0 },
            breakdown: distributePMJAYPackage(15000, false),
            total_estimated: 15000,
            claimed_amount: 15000,
        };
    }

    const rate = defaultRates[roomCategory] ?? 3000;
    const subtotal = (rate * defaultLOS) + 7500 + (2500 * defaultLOS) + (800 * defaultLOS);
    const total = Math.round(subtotal * 1.05);

    return {
        source: 'Private',
        condition_name: 'Unknown Condition (Default)',
        los: { total_days: defaultLOS, ward_days: defaultLOS, icu_days: 0 },
        breakdown: {
            room_rent: rate * defaultLOS,
            nursing_charges: Math.round(rate * defaultLOS * 0.15),
            icu_charges: 0,
            ot_charges: 0,
            surgeon_fee: 0,
            anesthetist_fee: 0,
            consultant_fee: 800 * defaultLOS,
            investigations: 7500,
            medicines: 2500 * defaultLOS,
            consumables: 0,
            implants: 0,
            miscellaneous: Math.round(subtotal * 0.05),
        },
        total_estimated: total,
        claimed_amount: total,
    };
}

export function validatePolicyCap(estimatedCost: number, sumInsured?: number): { exceeds: boolean; warning?: string } {
    if (!sumInsured || sumInsured <= 0) {
        return { exceeds: false };
    }
    if (estimatedCost > sumInsured) {
        return {
            exceeds: true,
            warning: `⚠️ Warning: Total estimated cost (₹${estimatedCost.toLocaleString('en-IN')}) exceeds policy coverage limit of ₹${sumInsured.toLocaleString('en-IN')}.`
        };
    }
    return { exceeds: false };
}
