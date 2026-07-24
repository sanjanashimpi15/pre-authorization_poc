import { RateCardEntry, RoomCategory } from '../components/PreAuthWizard/types';

export const DEFAULT_RATE_CARD: RateCardEntry[] = [
    { roomCategory: 'General Ward', roomRentPerDay: 1200, nursingChargesPerDay: 500, icuChargesPerDay: 0, defaultStayDays: 5 },
    { roomCategory: 'Semi-Private', roomRentPerDay: 2500, nursingChargesPerDay: 700, icuChargesPerDay: 0, defaultStayDays: 5 },
    { roomCategory: 'Private', roomRentPerDay: 4500, nursingChargesPerDay: 900, icuChargesPerDay: 0, defaultStayDays: 5 },
    { roomCategory: 'Deluxe', roomRentPerDay: 7000, nursingChargesPerDay: 1200, icuChargesPerDay: 0, defaultStayDays: 4 },
    { roomCategory: 'ICU', roomRentPerDay: 0, nursingChargesPerDay: 0, icuChargesPerDay: 8000, defaultStayDays: 3 },
    { roomCategory: 'ICCU', roomRentPerDay: 0, nursingChargesPerDay: 0, icuChargesPerDay: 9500, defaultStayDays: 3 },
    { roomCategory: 'NICU', roomRentPerDay: 0, nursingChargesPerDay: 0, icuChargesPerDay: 7500, defaultStayDays: 5 },
    { roomCategory: 'HDU', roomRentPerDay: 0, nursingChargesPerDay: 0, icuChargesPerDay: 6000, defaultStayDays: 3 },
];

export const DEFAULT_FEES = {
    otCharges: 15000,
    surgeonFee: 25000,
    anesthetistFee: 10000,
    consultantFee: 5000,
};

export const getRateForCategory = (category: RoomCategory): RateCardEntry => {
    return DEFAULT_RATE_CARD.find(r => r.roomCategory === category) ?? DEFAULT_RATE_CARD[0];
};

// Smart LOS (Length of Stay) defaults by ICD-10 prefix
export const DEFAULT_LOS_BY_ICD: Record<string, { wardDays: number; icuDays: number }> = {
    'J18': { wardDays: 5, icuDays: 0 },  // Pneumonia
    'J44': { wardDays: 4, icuDays: 1 },  // COPD
    'I21': { wardDays: 5, icuDays: 2 },  // MI
    'I50': { wardDays: 4, icuDays: 1 },  // Heart failure
    'A41': { wardDays: 3, icuDays: 3 },  // Sepsis
    'A90': { wardDays: 5, icuDays: 0 },  // Dengue
    'K35': { wardDays: 3, icuDays: 0 },  // Appendicitis
    'K80': { wardDays: 3, icuDays: 0 },  // Cholelithiasis
    'N20': { wardDays: 2, icuDays: 0 },  // Kidney stone
    'S06': { wardDays: 3, icuDays: 1 },  // Head injury
};

export const getLOSForDiagnosis = (diagnosisOrIcd: string): { wardDays: number; icuDays: number } => {
    const icdPrefix = diagnosisOrIcd.substring(0, 3).toUpperCase();
    return DEFAULT_LOS_BY_ICD[icdPrefix] ?? { wardDays: 5, icuDays: 0 };
};
