import Dexie, { Table } from 'dexie';
import { PreAuthRecord, PatientRecord } from '../components/PreAuthWizard/types';
import type { DenialAppealResult } from '../engine/denialAppealGenerator';
import { mapToWhoCode, validateCode, getDescription } from './icdService';

// --- SCHEMA DEFINITIONS ---

export interface PatientProfile {
    name: string;
    age: number;
    gender: string;
    contact?: string;
    contactNumber?: string;
    address?: string;
    uhid?: string;
}

export interface InsuranceDetails {
    insurer?: string;
    insurerName?: string;
    policyNumber: string;
    sumInsured: number;
    TPA?: string;
    tpaName?: string;
    policyType?: string;
    roomRentLimit?: number;
    icuRentLimit?: number;
}

export interface EncounterDetails {
    admissionDate?: string;
    dischargeDate?: string;
    diagnosis?: string;
    diagnoses?: any[];
    treatmentPlan?: string;
    chiefComplaints?: string;
    historyOfPresentIllness?: string;
    relevantClinicalFindings?: string;
    wardType?: string;
    icuDays?: number;
}

export interface DocumentPageEntry {
    pageNumber: number;
    documentName: string;
    documentType: string;
    ocrConfidence: number; // 0-1
    summary: string;
    thumbnailUrl?: string; // data URL
}

export interface DocumentEntry {
    id: string;
    name: string;
    type: string;
    extractedData?: any;
    pageCount?: number;
    pages?: DocumentPageEntry[];
}

export interface EvidenceMapEntry {
    field: string;
    value: string;
    documentName: string;
    pageNumber: number;
    confidence: number; // 0-1
}

export interface AuthorizationRecord {
    id: string;
    status: string;
    requestedAmount?: number;
    approvedAmount?: number;
    denialReason?: string;
    queryDetails?: string;
    submittedAt?: string;
    respondedAt?: string;
    tpaReceiptId?: string;
    irdaiText?: string;
    tpaEvidenceReview?: any;
}

export interface EnhancementEntry {
    id: string;
    trigger: 'new_procedure' | 'extended_stay' | 'icu_upgrade';
    requestedAmount: number;
    status: string;
    gaps: string[];
    anticipatedQueries: any[];
    reviewedAt: string;
    details: any;
}

export interface ClaimEntry {
    id: string;
    claimAmount: number;
    status: string;
    billDetails?: any;
    claimDocuments?: any;
}

export interface AppealEntry {
    id: string;
    appealStatus: 'draft' | 'submitted' | 'resolved';
    generatedAt: string;
    denialReason: string;
    appealLetterEnglish: string;
    appealLetterHindi?: string;
    totalReasons: number;
    addressedCount: number;
    priorityScore: number;
}

export interface AuditLogEntry {
    timestamp: string;
    action: string;
    user?: string;
    actor?: string;
    details?: any;
}

export interface TimelineEvent {
    timestamp: string;
    event: string;
    description: string;
}

export type CaseStage =
    | 'admission'
    | 'docs_uploaded'
    | 'documents_uploaded'
    | 'patient_identified'
    | 'ai_processing'
    | 'hospital_review'
    | 'ready_to_submit'
    | 'submitted_to_tpa'
    | 'tpa_review'
    | 'approved'
    | 'payment';

export function getStageFromStatus(status: string, hasDocs: boolean): CaseStage {
    switch (status) {
        case 'draft':
            return hasDocs ? 'docs_uploaded' : 'admission';
        case 'pending_documents':
            return 'docs_uploaded';
        case 'ready_to_submit':
            return 'ready_to_submit';
        case 'submitted':
            return 'submitted_to_tpa';
        case 'query_raised':
        case 'denied':
            return 'tpa_review';
        case 'approved':
            return 'approved';
        case 'closed':
            return 'payment';
        default:
            return 'admission';
    }
}

export interface PatientCaseRecord {
    id: string; // Unified case ID
    patientProfile: PatientProfile;
    insuranceDetails: InsuranceDetails;
    encounters: EncounterDetails[];
    documents: DocumentEntry[];
    authorizations: AuthorizationRecord[];
    enhancements: EnhancementEntry[];
    claims: ClaimEntry[];
    appeals: AppealEntry[];
    auditLog: AuditLogEntry[];
    timeline: TimelineEvent[];
    currentStage: CaseStage; // Added workflow stage schema

    // Intelligent Document Processing: page-level evidence traceability
    evidenceMap?: EvidenceMapEntry[];

    // QR self-registration metadata
    intakeChannel?: 'qr_scan' | 'manual' | 'upload' | string;
    sessionToken?: string;

    // Legacy support field containing full state
    rawPreAuthRecord?: any;
    createdAt: string;
    updatedAt: string;
}

// --- DEXIE DATABASE CLASS ---

class MasterPatientDatabase extends Dexie {
    patientCases!: Table<PatientCaseRecord, string>;
    patients!: Table<PatientRecord, string>; // Legacy table for wizard autocompletion

    constructor() {
        super('AivanaMasterPatientDB');
        this.version(1).stores({
            patientCases: 'id, updatedAt',
            patients: 'id, patientName, mobileNumber'
        });
    }
}

export const db = new MasterPatientDatabase();

// --- MAPPING UTILITIES ---

export function mapPreAuthToCase(preAuth: PreAuthRecord): PatientCaseRecord {
    const selectedIndex = preAuth.clinical?.selectedDiagnosisIndex ?? 0;
    const selectedDx = preAuth.clinical?.diagnoses?.[selectedIndex];
    
    return {
        id: preAuth.id,
        patientProfile: {
            name: preAuth.patient?.patientName || '',
            age: Number(preAuth.patient?.age || 0),
            gender: preAuth.patient?.gender || '',
            contact: preAuth.patient?.mobileNumber || '',
            uhid: preAuth.patient?.uhid,
        },
        insuranceDetails: {
            insurer: preAuth.insurance?.insurerName || '',
            policyNumber: preAuth.insurance?.policyNumber || '',
            sumInsured: Number(preAuth.insurance?.sumInsured || 0),
            TPA: preAuth.insurance?.tpaName || '',
        },
        encounters: [{
            admissionDate: preAuth.admission?.dateOfAdmission,
            dischargeDate: undefined,
            diagnosis: selectedDx?.diagnosis,
            diagnoses: preAuth.clinical?.diagnoses,
            chiefComplaints: preAuth.clinical?.chiefComplaints,
            historyOfPresentIllness: preAuth.clinical?.historyOfPresentIllness,
            relevantClinicalFindings: preAuth.clinical?.relevantClinicalFindings,
            wardType: preAuth.admission?.roomCategory,
            icuDays: preAuth.admission?.expectedDaysInICU,
        }],
        documents: (preAuth.uploadedDocuments || []).map(d => ({
            id: d.id,
            name: d.fileName,
            type: d.fileType || '',
            extractedData: (d as any).extractedData,
        })),
        authorizations: [{
            id: preAuth.id,
            status: preAuth.status,
            requestedAmount: preAuth.costEstimate?.amountClaimedFromInsurer,
            approvedAmount: preAuth.tpaResponse?.approvedAmount,
            denialReason: preAuth.tpaResponse?.denialReason,
            queryDetails: preAuth.tpaResponse?.queryDetails,
            submittedAt: preAuth.updatedAt,
            respondedAt: preAuth.tpaResponse?.respondedAt,
            tpaReceiptId: (preAuth.outputs as any)?.tpaReceiptId,
            irdaiText: preAuth.outputs?.irdaiText,
            tpaEvidenceReview: preAuth.tpaEvidenceReview,
        }],
        enhancements: [],
        claims: [{
            id: preAuth.id,
            claimAmount: preAuth.costEstimate?.amountClaimedFromInsurer || 0,
            status: preAuth.status,
        }],
        appeals: [],
        auditLog: [{
            timestamp: new Date().toISOString(),
            action: 'case_mapped',
            user: preAuth.createdBy || 'doctor',
        }],
        timeline: [
            { timestamp: preAuth.createdAt, event: 'created', description: 'Pre-auth record initialized' },
            { timestamp: preAuth.updatedAt, event: 'updated', description: 'Pre-auth record modified' },
        ],
        rawPreAuthRecord: preAuth,
        currentStage: getStageFromStatus(preAuth.status, (preAuth.uploadedDocuments || []).length > 0),
        createdAt: preAuth.createdAt,
        updatedAt: preAuth.updatedAt,
    };
}

export function mapCaseToPreAuth(caseRecord: PatientCaseRecord): PreAuthRecord {
    if (caseRecord.rawPreAuthRecord) {
        const preAuth = { ...caseRecord.rawPreAuthRecord };
        preAuth.id = caseRecord.id;
        preAuth.status = caseRecord.authorizations[0]?.status || preAuth.status;
        
        if (caseRecord.authorizations[0]) {
            preAuth.tpaResponse = {
                respondedAt: caseRecord.authorizations[0].respondedAt || '',
                status: caseRecord.authorizations[0].status as any,
                approvedAmount: caseRecord.authorizations[0].approvedAmount,
                denialReason: caseRecord.authorizations[0].denialReason,
                queryDetails: caseRecord.authorizations[0].queryDetails,
            };
            preAuth.outputs = {
                ...preAuth.outputs,
                tpaReceiptId: caseRecord.authorizations[0].tpaReceiptId,
                irdaiText: caseRecord.authorizations[0].irdaiText,
            };
            preAuth.tpaEvidenceReview = caseRecord.authorizations[0].tpaEvidenceReview;
        }
        
        // Load latest appeal if available in caseRecord
        if (caseRecord.appeals && caseRecord.appeals.length > 0) {
            preAuth.appeal = caseRecord.appeals[0];
        }
        
        return preAuth;
    }

    return {
        id: caseRecord.id,
        createdAt: caseRecord.createdAt,
        updatedAt: caseRecord.updatedAt,
        status: (caseRecord.authorizations[0]?.status || 'draft') as any,
        version: 1,
        createdBy: 'doctor',
        patient: {
            patientName: caseRecord.patientProfile.name,
            age: caseRecord.patientProfile.age,
            gender: caseRecord.patientProfile.gender as any,
            mobileNumber: caseRecord.patientProfile.contact || (caseRecord.patientProfile as any).contactNumber || '',
            uhid: caseRecord.patientProfile.uhid,
        },
        insurance: {
            insurerName: caseRecord.insuranceDetails.insurer,
            policyNumber: caseRecord.insuranceDetails.policyNumber,
            sumInsured: caseRecord.insuranceDetails.sumInsured,
            tpaName: caseRecord.insuranceDetails.TPA,
        },
        clinical: {
            diagnoses: caseRecord.encounters[0]?.diagnoses || [],
            selectedDiagnosisIndex: 0,
            chiefComplaints: caseRecord.encounters[0]?.chiefComplaints || '',
            historyOfPresentIllness: caseRecord.encounters[0]?.historyOfPresentIllness || '',
            relevantClinicalFindings: caseRecord.encounters[0]?.relevantClinicalFindings || '',
            durationOfPresentAilment: '',
            natureOfIllness: 'Acute',
            treatmentTakenSoFar: '',
            vitals: { bp: '', pulse: '', temp: '', rr: '', spo2: '' },
            severity: { phenoIntensity: 0, urgencyQuotient: 0, deteriorationVelocity: 0, overallRisk: 'Low', mustNotMiss: false },
            proposedLineOfTreatment: { medical: true, surgical: false, intensiveCare: false, investigation: false, nonAllopathic: false },
            reasonForHospitalisation: ''
        },
        admission: {
            roomCategory: caseRecord.encounters[0]?.wardType as any,
            dateOfAdmission: caseRecord.encounters[0]?.admissionDate || '',
            timeOfAdmission: '',
            admissionType: 'Planned',
            expectedLengthOfStay: 3,
            expectedDaysInICU: caseRecord.encounters[0]?.icuDays || 0,
            expectedDaysInRoom: 3,
            pastMedicalHistory: {},
            previousHospitalization: { wasHospitalizedBefore: false }
        },
        costEstimate: {
            amountClaimedFromInsurer: caseRecord.claims[0]?.claimAmount || 0,
        },
        uploadedDocuments: caseRecord.documents.map(d => ({
            id: d.id,
            fileName: d.name,
            fileSizeDisplay: '0 KB',
            fileType: d.type === 'image' ? 'image' : 'pdf',
            mimeType: d.type === 'image' ? 'image/png' : 'application/pdf',
            uploadedAt: new Date().toISOString(),
            base64Data: '',
            documentCategory: 'other',
            autoClassified: true,
            isRequired: false,
            extractedData: d.extractedData,
        } as any)),
        documentRequirements: [],
        declarations: { patient: {}, doctor: {}, hospital: {} },
        outputs: {},
    };
}

// --- CORE FUNCTION EXPORTS ---

async function callDbApi(action: string, args: any = {}): Promise<any> {
    const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, args })
    });
    if (!res.ok) {
        throw new Error(await res.text());
    }
    return res.json();
}

export async function getPatientRecord(id: string): Promise<PatientCaseRecord | undefined> {
    try {
        const res = await callDbApi('getPatientCase', { id });
        return res.data || undefined;
    } catch (err) {
        console.error("Failed to get patient case from SQLite:", err);
        return undefined;
    }
}

export async function savePatientRecord(record: PatientCaseRecord): Promise<void> {
    try {
        await callDbApi('savePatientCase', { id: record.id, updatedAt: record.updatedAt, data: record });
    } catch (err) {
        console.error("Failed to save patient case to SQLite:", err);
    }
}

export async function getAllPatientRecords(): Promise<PatientCaseRecord[]> {
    try {
        const res = await callDbApi('getAllPatientCases');
        return res.cases || [];
    } catch (err) {
        console.error("Failed to get all patient cases from SQLite:", err);
        return [];
    }
}

export async function deletePatientRecord(id: string): Promise<void> {
    try {
        await callDbApi('deletePatientCase', { id });
    } catch (err) {
        console.error("Failed to delete patient case from SQLite:", err);
    }
}

export async function saveEncounter(patientId: string, encounter: EncounterDetails): Promise<void> {
    const caseRecord = await getPatientRecord(patientId);
    if (!caseRecord) return;
    caseRecord.encounters.push(encounter);
    caseRecord.timeline.push({
        timestamp: new Date().toISOString(),
        event: 'encounter_saved',
        description: `New encounter added with diagnosis: ${encounter.diagnosis}`
    });
    caseRecord.auditLog.push({
        timestamp: new Date().toISOString(),
        action: 'save_encounter',
        user: 'doctor'
    });
    await savePatientRecord(caseRecord);
}

export async function recordAuthorization(patientId: string, auth: AuthorizationRecord): Promise<void> {
    const caseRecord = await getPatientRecord(patientId);
    if (!caseRecord) return;
    
    const existingIndex = caseRecord.authorizations.findIndex(a => a.id === auth.id);
    if (existingIndex > -1) {
        caseRecord.authorizations[existingIndex] = auth;
    } else {
        caseRecord.authorizations.push(auth);
    }
    
    caseRecord.timeline.push({
        timestamp: new Date().toISOString(),
        event: 'authorization_recorded',
        description: `Auth status set to ${auth.status} with receipt ${auth.tpaReceiptId || 'N/A'}`
    });
    caseRecord.auditLog.push({
        timestamp: new Date().toISOString(),
        action: 'record_authorization',
        user: 'doctor'
    });
    await savePatientRecord(caseRecord);
}

export async function saveAppeal(patientId: string, appeal: AppealEntry): Promise<void> {
    const caseRecord = await getPatientRecord(patientId);
    if (!caseRecord) return;
    
    const existingIndex = caseRecord.appeals.findIndex(a => a.id === appeal.id);
    if (existingIndex > -1) {
        caseRecord.appeals[existingIndex] = appeal;
    } else {
        caseRecord.appeals.push(appeal);
    }
    
    caseRecord.timeline.push({
        timestamp: new Date().toISOString(),
        event: 'appeal_saved',
        description: `Appeal created with status: ${appeal.appealStatus}`
    });
    caseRecord.auditLog.push({
        timestamp: new Date().toISOString(),
        action: 'save_appeal',
        user: 'doctor'
    });
    await savePatientRecord(caseRecord);
}

export async function getAppeal(patientId: string): Promise<AppealEntry | undefined> {
    const caseRecord = await getPatientRecord(patientId);
    return caseRecord?.appeals?.[0];
}

export async function updateAppealStatus(patientId: string, status: AppealEntry['appealStatus']): Promise<void> {
    const caseRecord = await getPatientRecord(patientId);
    if (!caseRecord || caseRecord.appeals.length === 0) return;
    caseRecord.appeals[0].appealStatus = status;
    caseRecord.timeline.push({
        timestamp: new Date().toISOString(),
        event: 'appeal_status_updated',
        description: `Appeal status changed to ${status}`
    });
    caseRecord.auditLog.push({
        timestamp: new Date().toISOString(),
        action: 'update_appeal_status',
        user: 'doctor'
    });
    await savePatientRecord(caseRecord);
}

// --- LEGACY BACKWARD-COMPATIBILITY ADAPTERS (REROUTES) ---

export async function savePreAuth(record: PreAuthRecord): Promise<void> {
    // Legacy compliance check (sanitize diagnoses)
    if (record.clinical?.diagnoses) {
        record.clinical.diagnoses = record.clinical.diagnoses.map(dx => {
            const code = dx.icd10Code;
            if (code && !code.toLowerCase().includes('pending') && !code.toLowerCase().includes('selection')) {
                if (validateCode(code)) {
                    return dx;
                }
                const mapped = mapToWhoCode(code);
                if (mapped) {
                    console.log(`[StorageSanitizer] Mapping non-WHO code "${code}" -> valid WHO code "${mapped}"`);
                    return {
                        ...dx,
                        icd10Code: mapped,
                        icd10Description: getDescription(mapped)
                    };
                }
                console.warn(`[StorageSanitizer] Invalid non-WHO code "${code}" could not be mapped. Resetting to Pending.`);
                return {
                    ...dx,
                    icd10Code: 'Pending ICD-10',
                    icd10Description: 'Selection required'
                };
            }
            return dx;
        });
    }

    const caseRecord = mapPreAuthToCase(record);
    
    // Retain existing appeals in case caseRecord is updated
    const existing = await getPatientRecord(record.id);
    if (existing) {
        caseRecord.appeals = existing.appeals;
        caseRecord.enhancements = existing.enhancements;
    }
    
    await savePatientRecord(caseRecord);
}

export async function getPreAuth(id: string): Promise<PreAuthRecord | undefined> {
    const caseRecord = await getPatientRecord(id);
    if (!caseRecord) return undefined;
    return mapCaseToPreAuth(caseRecord);
}

export async function getAllPreAuths(): Promise<PreAuthRecord[]> {
    const cases = await getAllPatientRecords();
    return cases.map(mapCaseToPreAuth);
}

export async function deletePreAuth(id: string): Promise<void> {
    await deletePatientRecord(id);
}

export async function savePatient(patient: PatientRecord): Promise<void> {
    try {
        await callDbApi('savePatient', {
            id: patient.id,
            patientName: patient.patientName,
            mobileNumber: patient.mobileNumber,
            uhid: patient.uhid || '',
            data: patient
        });
    } catch (err) {
        console.error("Failed to save patient to SQLite:", err);
    }
}

export async function getAllPatients(): Promise<PatientRecord[]> {
    try {
        const res = await callDbApi('getAllPatients');
        return res.patients || [];
    } catch (err) {
        console.error("Failed to get all patients from SQLite:", err);
        return [];
    }
}

export async function searchPatients(query: string): Promise<PatientRecord[]> {
    try {
        const res = await callDbApi('searchPatients', { query });
        return res.patients || [];
    } catch (err) {
        console.error("Failed to search patients in SQLite:", err);
        return [];
    }
}

export async function saveLegacyAppeal(appeal: DenialAppealResult): Promise<void> {
    const caseRecord = await getPatientRecord(appeal.recordId);
    if (!caseRecord) return;
    
    const appealEntry: AppealEntry = {
        id: appeal.recordId,
        appealStatus: appeal.appealStatus,
        generatedAt: appeal.generatedAt,
        denialReason: appeal.denialReasonsParsed.join('. '),
        appealLetterEnglish: appeal.appealText,
        appealLetterHindi: appeal.hindiTranslation,
        totalReasons: appeal.totalReasons,
        addressedCount: appeal.addressedCount,
        priorityScore: appeal.priorityScore,
    };
    
    await saveAppeal(appeal.recordId, appealEntry);
}

export async function getLegacyAppeal(recordId: string): Promise<DenialAppealResult | undefined> {
    const appeal = await getAppeal(recordId);
    if (!appeal) return undefined;
    
    return {
        recordId: appeal.id,
        appealStatus: appeal.appealStatus,
        generatedAt: appeal.generatedAt,
        denialReasonsParsed: [appeal.denialReason],
        appealText: appeal.appealLetterEnglish,
        hindiTranslation: appeal.appealLetterHindi,
        totalReasons: appeal.totalReasons,
        addressedCount: appeal.addressedCount,
        priorityScore: appeal.priorityScore,
        citedEvidence: [],
        stillMissing: [],
    };
}

export async function getAllLegacyAppeals(): Promise<DenialAppealResult[]> {
    const cases = await getAllPatientRecords();
    const results: DenialAppealResult[] = [];
    for (const c of cases) {
        if (c.appeals && c.appeals.length > 0) {
            const appeal = c.appeals[0];
            results.push({
                recordId: appeal.id,
                appealStatus: appeal.appealStatus,
                generatedAt: appeal.generatedAt,
                denialReasonsParsed: [appeal.denialReason],
                appealText: appeal.appealLetterEnglish,
                hindiTranslation: appeal.appealLetterHindi,
                totalReasons: appeal.totalReasons,
                addressedCount: appeal.addressedCount,
                priorityScore: appeal.priorityScore,
                citedEvidence: [],
                stillMissing: [],
            });
        }
    }
    return results;
}

export async function updateLegacyAppealStatus(
    recordId: string,
    newStatus: DenialAppealResult['appealStatus']
): Promise<void> {
    await updateAppealStatus(recordId, newStatus);
}

// --- ID GENERATION ---

export const generatePreAuthId = (): string => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 9000) + 1000);
    return `PA-AIVANA-${dateStr}-${seq}`;
};

export const generatePatientId = (): string => `PAT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
