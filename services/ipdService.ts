import { IPDCase, IPDDay } from '../types';

const IPD_STORAGE_KEY = 'opd_platform_ipd_cases';

// Helper to get cases from local storage
const getStoredCases = (): IPDCase[] => {
    const data = localStorage.getItem(IPD_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
};

// Helper to save cases to local storage
const saveCases = (cases: IPDCase[]) => {
    localStorage.setItem(IPD_STORAGE_KEY, JSON.stringify(cases));
};

export interface CreateIPDParams {
    patient_id: string;
    linked_opd_session_id: string;
    admitting_doctor_id: string;
    admission_type: 'Emergency' | 'Planned';
    ward_type: 'General' | 'ICU' | 'HDU';
}

export const createIPDCase = async (params: CreateIPDParams): Promise<IPDCase> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const newCase: IPDCase = {
        ipd_case_id: `IPD_${new Date().getFullYear()}_${Date.now().toString().slice(-4)}`,
        patient_id: params.patient_id,
        linked_opd_session_id: params.linked_opd_session_id,
        admitting_doctor_id: params.admitting_doctor_id,
        admission_date: new Date().toISOString(),
        admission_type: params.admission_type,
        current_ipd_day: 1,
        status: 'Active',
        ward_type: params.ward_type,
        created_at: new Date().toISOString()
    };

    const cases = getStoredCases();
    cases.push(newCase);
    saveCases(cases);

    console.log("IPD Case Created:", newCase);
    return newCase;
};

export interface IPDTimeline {
    caseDetails: IPDCase;
    days: IPDDay[];
}

export const getIPDTimeline = async (caseId: string): Promise<IPDTimeline | null> => {
    await new Promise(resolve => setTimeout(resolve, 500));

    const cases = getStoredCases();
    const foundCase = cases.find(c => c.ipd_case_id === caseId);

    if (!foundCase) return null;

    // Mock generating day 1
    const day1: IPDDay = {
        ipd_day: 1,
        date: foundCase.admission_date.split('T')[0],
        nursing_entries_count: 0,
        doctor_notes_count: 0
    };

    return {
        caseDetails: foundCase,
        days: [day1]
    };
};

export const dischargeIPDCase = async (caseId: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));

    const cases = getStoredCases();
    const updatedCases = cases.map(c =>
        c.ipd_case_id === caseId ? { ...c, status: 'Discharged' as const } : c
    );
    saveCases(updatedCases);
    console.log(`IPD Case ${caseId} discharged.`);
};
