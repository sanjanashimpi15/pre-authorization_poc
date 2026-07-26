import { PreAuthRecord } from '../components/PreAuthWizard/types';
import { ExtractedPatientData } from './documentExtractionService';

export interface FieldProvenance {
    source: 'ocr' | 'clinical_note' | 'manual' | 'absent' | 'not_reviewed';
    confidence: number;
    sourceDocName?: string;
    value: any;
}

// Helper to safely read nested properties
export function getNestedProperty(obj: any, path: string): any {
    if (!obj) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        // Handle array indices if any
        if (part.includes('[') && part.includes(']')) {
            const arrayPart = part.split('[')[0];
            const index = parseInt(part.split('[')[1].split(']')[0], 10);
            current = current[arrayPart];
            if (Array.isArray(current)) {
                current = current[index];
            } else {
                return undefined;
            }
        } else {
            current = current[part];
        }
    }
    return current;
}

// Helper to safely write nested properties
export function setNestedProperty(obj: any, path: string, value: any): void {
    if (!obj) return;
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined || current[part] === null) {
            current[part] = {};
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
}

// Normalize strings for comparison
export function normalizeString(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val).toLowerCase().replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
}

// Definition of all auto-fill fields that flow through the Central Mapping Layer
export interface AutoFillFieldDef {
    path: string; // Path inside PreAuthRecord, e.g. 'patient.patientName'
    extractor: (data: any) => any;
    displayName: string;
    category: 'patient_identity' | 'insurance' | 'clinical_findings' | 'treatment';
}

export const AUTO_FILL_FIELDS: AutoFillFieldDef[] = [
    { path: 'patient.patientName', extractor: (d) => d.patient?.name, displayName: 'Patient Name', category: 'patient_identity' },
    { path: 'patient.dateOfBirth', extractor: (d) => d.patient?.dob, displayName: 'Date of Birth', category: 'patient_identity' },
    { path: 'patient.age', extractor: (d) => d.patient?.age, displayName: 'Age', category: 'patient_identity' },
    { path: 'patient.ageUnit', extractor: (d) => d.patient?.ageUnit, displayName: 'Age Unit', category: 'patient_identity' },
    { path: 'patient.gender', extractor: (d) => d.patient?.gender, displayName: 'Gender', category: 'patient_identity' },
    { path: 'patient.mobileNumber', extractor: (d) => d.patient?.phone, displayName: 'Mobile Number', category: 'patient_identity' },
    { path: 'patient.city', extractor: (d) => d.patient?.city, displayName: 'City', category: 'patient_identity' },
    { path: 'patient.state', extractor: (d) => d.patient?.state, displayName: 'State', category: 'patient_identity' },
    
    { path: 'insurance.insurerName', extractor: (d) => d.insurance?.insurance_company, displayName: 'Insurer Name', category: 'insurance' },
    { path: 'insurance.tpaName', extractor: (d) => d.insurance?.tpa_name, displayName: 'TPA Name', category: 'insurance' },
    { path: 'insurance.policyNumber', extractor: (d) => d.insurance?.policy_number, displayName: 'Policy Number', category: 'insurance' },
    { path: 'insurance.sumInsured', extractor: (d) => d.insurance?.sum_insured, displayName: 'Sum Insured', category: 'insurance' },
    { path: 'insurance.policyEndDate', extractor: (d) => d.insurance?.valid_till, displayName: 'Policy End Date', category: 'insurance' },
    { path: 'insurance.memberId', extractor: (d) => d.insurance?.member_id, displayName: 'Member ID', category: 'insurance' },

    { path: 'clinical.chiefComplaints', extractor: (d) => d.clinical?.chief_complaints, displayName: 'Chief Complaints', category: 'clinical_findings' },
    { path: 'clinical.durationOfPresentAilment', extractor: (d) => d.clinical?.duration_of_present_ailment, displayName: 'Duration of Present Ailment', category: 'clinical_findings' },
    { path: 'clinical.natureOfIllness', extractor: (d) => d.clinical?.nature_of_illness, displayName: 'Nature of Illness', category: 'clinical_findings' },
    { path: 'clinical.historyOfPresentIllness', extractor: (d) => d.clinical?.history_of_present_illness, displayName: 'History of Present Illness', category: 'clinical_findings' },
    { path: 'clinical.relevantClinicalFindings', extractor: (d) => d.clinical?.relevant_clinical_findings, displayName: 'Relevant Clinical Findings', category: 'clinical_findings' },
    { path: 'clinical.treatmentTakenSoFar', extractor: (d) => d.clinical?.treatment_taken_so_far, displayName: 'Prior OPD Treatment', category: 'clinical_findings' },
    { path: 'clinical.reasonForHospitalisation', extractor: (d) => d.clinical?.reason_for_hospitalisation, displayName: 'OPD Justification / Admission Reason', category: 'clinical_findings' },
    
    { path: 'clinical.proposedLineOfTreatment.medical', extractor: (d) => d.clinical?.proposed_line_of_treatment?.medical, displayName: 'Medical Treatment Proposed', category: 'treatment' },
    { path: 'clinical.proposedLineOfTreatment.surgical', extractor: (d) => d.clinical?.proposed_line_of_treatment?.surgical, displayName: 'Surgical Treatment Proposed', category: 'treatment' },
    { path: 'clinical.proposedLineOfTreatment.intensiveCare', extractor: (d) => d.clinical?.proposed_line_of_treatment?.intensive_care, displayName: 'Intensive Care Proposed', category: 'treatment' },
    { path: 'clinical.proposedLineOfTreatment.investigation', extractor: (d) => d.clinical?.proposed_line_of_treatment?.investigation, displayName: 'Investigation Proposed', category: 'treatment' },
    { path: 'clinical.proposedLineOfTreatment.nonAllopathic', extractor: (d) => d.clinical?.proposed_line_of_treatment?.non_allopathic, displayName: 'Non-Allopathic Proposed', category: 'treatment' },
    
    { path: 'clinical.vitals.bp', extractor: (d) => d.clinical?.vitals?.bp, displayName: 'BP Vitals', category: 'clinical_findings' },
    { path: 'clinical.vitals.pulse', extractor: (d) => d.clinical?.vitals?.pulse, displayName: 'Pulse Vitals', category: 'clinical_findings' },
    { path: 'clinical.vitals.temp', extractor: (d) => d.clinical?.vitals?.temp, displayName: 'Temp Vitals', category: 'clinical_findings' },
    { path: 'clinical.vitals.spo2', extractor: (d) => d.clinical?.vitals?.spo2, displayName: 'SpO2 Vitals', category: 'clinical_findings' },
    { path: 'clinical.vitals.rr', extractor: (d) => d.clinical?.vitals?.rr, displayName: 'RR Vitals', category: 'clinical_findings' },
    
    { path: 'admission.dateOfAdmission', extractor: (d) => d.admission?.date_of_admission, displayName: 'Date of Admission', category: 'treatment' },
    { path: 'admission.timeOfAdmission', extractor: (d) => d.admission?.time_of_admission, displayName: 'Time of Admission', category: 'treatment' },
    { path: 'admission.expectedDaysOfStay', extractor: (d) => d.admission?.expected_days_of_stay, displayName: 'Expected Days of Stay', category: 'treatment' },
    { path: 'admission.roomType', extractor: (d) => d.admission?.room_type, displayName: 'Room Type', category: 'treatment' },
    { path: 'declarations.doctor.doctorName', extractor: (d) => d.admission?.treating_doctor_name, displayName: 'Treating Doctor Name', category: 'treatment' },
    { path: 'declarations.doctor.doctorRegistrationNumber', extractor: (d) => d.admission?.treating_doctor_registration_number, displayName: 'Treating Doctor Registration Number', category: 'treatment' }
];

export class CentralMappingService {
    /**
     * Applies the central mapping rules to update a record based on raw extractions.
     * Re-runs the auto-fill precedence engine: Document (highest confidence) > Clinical Note.
     */
    static applyMapping(record: Partial<PreAuthRecord>): Partial<PreAuthRecord> {
        const updated = { ...record };
        if (!updated.patient) updated.patient = {};
        if (!updated.insurance) updated.insurance = {};
        if (!updated.clinical) updated.clinical = {};
        if (!updated.admission) updated.admission = {};
        if (!updated.declarations) updated.declarations = {};
        if (!updated.declarations.doctor) updated.declarations.doctor = {};
        if (!updated.provenanceMap) updated.provenanceMap = {};

        const extractions = updated.rawExtractions || [];
        const hasExtractions = extractions.length > 0;

        for (const fieldDef of AUTO_FILL_FIELDS) {
            const path = fieldDef.path;
            const currentProv = updated.provenanceMap[path];

            // If the user has manually edited this field, preserve the manual value
            if (currentProv?.source === 'manual') {
                continue;
            }

            // Find all OCR document extractions for this field
            const docExtractions = extractions.filter(e => e.id !== 'clinical_note');
            let bestDocVal: any = undefined;
            let bestDocConf = -1;
            let bestDocName: string | undefined = undefined;

            for (const ext of docExtractions) {
                const val = fieldDef.extractor(ext.extractedData);
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    if (ext.confidence > bestDocConf) {
                        bestDocConf = ext.confidence;
                        bestDocVal = val;
                        bestDocName = ext.fileName;
                    }
                }
            }

            // Find Clinical Note extraction for this field
            const noteExtraction = extractions.find(e => e.id === 'clinical_note');
            let noteVal: any = undefined;
            let noteConf = -1;

            if (noteExtraction) {
                const val = fieldDef.extractor(noteExtraction.extractedData);
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    noteVal = val;
                    noteConf = noteExtraction.confidence;
                }
            }

            // Apply Precedence Rule:
            // 1. Uploaded Document wins for auto-fill over Clinical Note
            if (bestDocVal !== undefined && bestDocVal !== null) {
                setNestedProperty(updated, path, bestDocVal);
                updated.provenanceMap[path] = {
                    source: 'ocr',
                    confidence: bestDocConf,
                    sourceDocName: bestDocName,
                    value: bestDocVal
                };
            }
            // 2. If no document value exists, use the Clinical Note value
            else if (noteVal !== undefined && noteVal !== null) {
                setNestedProperty(updated, path, noteVal);
                updated.provenanceMap[path] = {
                    source: 'clinical_note',
                    confidence: noteConf,
                    sourceDocName: 'clinical_note',
                    value: noteVal
                };
            }
            // 3. Genuinely absent vs not reviewed
            else {
                // If the field is empty, clear it or leave it empty
                // (no hallucinated defaults or medical placeholders)
                const currentVal = getNestedProperty(updated, path);
                // Clear any placeholders
                if (typeof currentVal === 'string' && (currentVal.toLowerCase().includes('pending') || currentVal.toLowerCase().includes('select'))) {
                    setNestedProperty(updated, path, '');
                }

                if (hasExtractions) {
                    updated.provenanceMap[path] = {
                        source: 'absent',
                        confidence: 0,
                        value: ''
                    };
                } else {
                    updated.provenanceMap[path] = {
                        source: 'not_reviewed',
                        confidence: 0,
                        value: ''
                    };
                }
            }
        }

        // Backward compatibility mapping for Admission Details fields
        if (updated.admission) {
            // Map roomType to roomCategory
            const provRoom = updated.provenanceMap['admission.roomType'];
            if (provRoom?.source !== 'absent' && provRoom?.source !== 'not_reviewed') {
                const rType = updated.admission.roomType || '';
                let category = 'General Ward';
                if (rType.toLowerCase().includes('icu')) category = 'ICU';
                else if (rType.toLowerCase().includes('private')) category = 'Private Single Room';
                else if (rType.toLowerCase().includes('semi')) category = 'Semi-Private Room';
                updated.admission.roomCategory = category;
            }

            // Map expectedDaysOfStay to expectedLengthOfStay and expectedDaysInRoom
            const provStay = updated.provenanceMap['admission.expectedDaysOfStay'];
            if (provStay?.source !== 'absent' && provStay?.source !== 'not_reviewed') {
                const stayDays = Number(updated.admission.expectedDaysOfStay || 3);
                updated.admission.expectedLengthOfStay = stayDays;
                if (updated.admission.roomCategory === 'ICU') {
                    updated.admission.expectedDaysInICU = stayDays;
                    updated.admission.expectedDaysInRoom = 0;
                } else {
                    updated.admission.expectedDaysInICU = 0;
                    updated.admission.expectedDaysInRoom = stayDays;
                }
            }
        }

        return updated;
    }
}
