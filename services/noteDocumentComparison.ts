/**
 * services/noteDocumentComparison.ts
 *
 * Real deterministic note-to-document comparison rule engine with category weights.
 * Classifies every comparable structured field and calculates category scores and an overall score.
 */

import { PreAuthRecord } from '../components/PreAuthWizard/types';
import { getNestedProperty } from './centralMappingService';
import { getCachedNormalization } from './icdService';

export interface NoteComparisonItem {
    field: string;
    displayName: string;
    status: 'match' | 'conflict' | 'doc_only' | 'note_only' | 'missing' | 'mismatch'; // mismatch is for backward compatibility
    note_value: string | null;
    document_value: string | null;
}

export interface NoteComparisonReport {
    items: NoteComparisonItem[];
    categoryScores: {
        patient_identity: number;
        insurance: number;
        diagnosis: number;
        clinical_findings: number;
        treatment: number;
    };
    overallScore: number;
}

// ─── NORMALIZATION HELPERS ───

export function normalizeString(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val)
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeAge(val: any): string {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    const match = s.match(/\d+/);
    return match ? match[0] : s;
}

export function normalizeGender(val: any): string {
    if (!val) return '';
    const s = String(val).toLowerCase().trim();
    if (s === 'm' || s.startsWith('male') || s === 'boy' || s === 'gentleman' || s === 'man') return 'male';
    if (s === 'f' || s.startsWith('female') || s === 'girl' || s === 'lady' || s === 'woman') return 'female';
    if (s.startsWith('oth')) return 'other';
    return s;
}

export function normalizeDate(val: any): string {
    if (!val) return '';
    const s = String(val).trim();
    if (!s) return '';
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
        const dd = match[1].padStart(2, '0');
        const mm = match[2].padStart(2, '0');
        const yyyy = match[3];
        return `${yyyy}-${mm}-${dd}`;
    }
    const match2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (match2) {
        const yyyy = match2[1];
        const mm = match2[2].padStart(2, '0');
        const dd = match2[3].padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    return s.toLowerCase().trim();
}

export function normalizePolicyNumber(val: any): string {
    if (!val) return '';
    return String(val).replace(/\D/g, ''); // keep only digits
}

export function compareInsurer(val1: string, val2: string): boolean {
    const n1 = normalizeString(val1);
    const n2 = normalizeString(val2);
    if (!n1 || !n2) return false;
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
    const stopWords = new Set(['and', 'allied', 'insurance', 'company', 'limited', 'co', 'ltd', 'general', 'health', 'corporation', 'of', 'india']);
    const words1 = n1.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const words2 = n2.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    for (const w of words1) {
        if (words2.includes(w)) return true;
    }
    return false;
}

export function compareCityOrHospital(val1: string, val2: string): boolean {
    const n1 = normalizeString(val1);
    const n2 = normalizeString(val2);
    if (!n1 || !n2) return false;
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
    const stopWords = new Set(['hospital', 'clinic', 'medical', 'centre', 'center', 'nursing', 'home', 'care', 'health']);
    const words1 = n1.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const words2 = n2.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    for (const w of words1) {
        if (words2.includes(w)) return true;
    }
    return false;
}

function localFallbackSplit(diagnosis: string): { primary: string; associated: string[] } {
    const text = diagnosis.trim();
    const regex = /\s+(?:with|and|\+|\&|associated with|secondary to)\s+/i;
    const parts = text.split(regex);
    if (parts.length > 1) {
        return {
            primary: parts[0].trim(),
            associated: parts.slice(1).map(p => p.trim())
        };
    }
    return {
        primary: text,
        associated: []
    };
}

export function compareDiagnosis(val1: string, val2: string): boolean {
    if (!val1 || !val2) return false;
    const c1 = getCachedNormalization(val1);
    const c2 = getCachedNormalization(val2);
    if (c1 && c2 && c1.candidates?.[0]?.code && c2.candidates?.[0]?.code) {
        if (c1.candidates[0].code === c2.candidates[0].code) return true;
    }
    const p1 = c1 ? c1.primary : localFallbackSplit(val1).primary;
    const p2 = c2 ? c2.primary : localFallbackSplit(val2).primary;
    const n1 = normalizeString(p1);
    const n2 = normalizeString(p2);
    return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

// ─── FIELDS DEFINITIONS ───

interface ComparisonFieldDef {
    path: string;
    displayName: string;
    category: 'patient_identity' | 'insurance' | 'diagnosis' | 'clinical_findings' | 'treatment';
    extractor: (d: any) => any;
    normalizeFn?: (val: any) => string;
    compareFn?: (val1: string, val2: string) => boolean;
}

const COMPARISON_FIELDS: ComparisonFieldDef[] = [
    // Patient Identity
    { path: 'patient.patientName', displayName: 'Patient Name', category: 'patient_identity', extractor: (d) => d.patient?.name },
    { path: 'patient.age', displayName: 'Age', category: 'patient_identity', extractor: (d) => d.patient?.age, normalizeFn: normalizeAge },
    { path: 'patient.gender', displayName: 'Gender', category: 'patient_identity', extractor: (d) => d.patient?.gender, normalizeFn: normalizeGender },
    { path: 'patient.dateOfBirth', displayName: 'Date of Birth', category: 'patient_identity', extractor: (d) => d.patient?.dob, normalizeFn: normalizeDate },
    { path: 'patient.mobileNumber', displayName: 'Mobile Number', category: 'patient_identity', extractor: (d) => d.patient?.phone, normalizeFn: normalizePolicyNumber },
    { path: 'patient.address', displayName: 'Address', category: 'patient_identity', extractor: (d) => d.patient?.address },
    { path: 'patient.city', displayName: 'City', category: 'patient_identity', extractor: (d) => d.patient?.city, compareFn: compareCityOrHospital },
    { path: 'patient.state', displayName: 'State', category: 'patient_identity', extractor: (d) => d.patient?.state },

    // Insurance
    { path: 'insurance.insurerName', displayName: 'Insurer Name', category: 'insurance', extractor: (d) => d.insurance?.insurance_company, compareFn: compareInsurer },
    { path: 'insurance.policyNumber', displayName: 'Policy Number', category: 'insurance', extractor: (d) => d.insurance?.policy_number, normalizeFn: normalizePolicyNumber },
    { path: 'insurance.memberId', displayName: 'Member ID', category: 'insurance', extractor: (d) => d.insurance?.member_id, normalizeFn: normalizePolicyNumber },
    { path: 'insurance.tpaName', displayName: 'TPA Name', category: 'insurance', extractor: (d) => d.insurance?.tpa_name, compareFn: compareInsurer },
    { path: 'insurance.sumInsured', displayName: 'Sum Insured', category: 'insurance', extractor: (d) => d.insurance?.sum_insured, normalizeFn: normalizeAge },
    { path: 'insurance.policyType', displayName: 'Policy Type', category: 'insurance', extractor: (d) => d.insurance?.policy_type },

    // Diagnosis
    {
        path: 'clinical.diagnoses[0].diagnosis',
        displayName: 'Provisional Diagnosis',
        category: 'diagnosis',
        extractor: (d) => {
            const dx = d.diagnoses?.[0];
            if (!dx) return null;
            return typeof dx === 'object' ? (dx.originalDiagnosis || dx.diagnosis) : dx;
        },
        compareFn: compareDiagnosis
    },

    // Clinical Findings
    { path: 'clinical.chiefComplaints', displayName: 'Chief Complaints', category: 'clinical_findings', extractor: (d) => d.clinical?.chief_complaints },
    { path: 'clinical.durationOfPresentAilment', displayName: 'Duration of Present Ailment', category: 'clinical_findings', extractor: (d) => d.clinical?.duration_of_present_ailment },
    { path: 'clinical.historyOfPresentIllness', displayName: 'History of Present Illness', category: 'clinical_findings', extractor: (d) => d.clinical?.history_of_present_illness },
    { path: 'clinical.relevantClinicalFindings', displayName: 'Relevant Clinical Findings', category: 'clinical_findings', extractor: (d) => d.clinical?.relevant_clinical_findings },
    { path: 'clinical.treatmentTakenSoFar', displayName: 'Prior OPD Treatment', category: 'clinical_findings', extractor: (d) => d.clinical?.treatment_taken_so_far },
    { path: 'clinical.comorbidities', displayName: 'Co-morbidities', category: 'clinical_findings', extractor: (d) => d.clinical?.comorbidities },

    // Treatment
    { path: 'admission.hospitalName', displayName: 'Hospital Name', category: 'treatment', extractor: (d) => d.admission?.hospital_name, compareFn: compareCityOrHospital },
    { path: 'admission.dateOfAdmission', displayName: 'Date of Admission', category: 'treatment', extractor: (d) => d.admission?.date_of_admission, normalizeFn: normalizeDate },
    { path: 'admission.roomType', displayName: 'Ward / Room Type', category: 'treatment', extractor: (d) => d.admission?.room_type },
    { path: 'declarations.doctor.doctorName', displayName: 'Treating Doctor Name', category: 'treatment', extractor: (d) => d.admission?.treating_doctor_name },
    {
        path: 'clinical.proposedLineOfTreatment.surgical',
        displayName: 'Proposed Procedures',
        category: 'treatment',
        extractor: (d) => {
            const val = d.clinical?.proposed_line_of_treatment?.surgical;
            return val === true ? 'surgical' : val === false ? 'no surgical' : null;
        }
    },
    { path: 'clinical.medications', displayName: 'Medicines Plan', category: 'treatment', extractor: (d) => d.clinical?.medications },
    { path: 'clinical.investigation_details', displayName: 'Investigations Planned', category: 'treatment', extractor: (d) => d.clinical?.investigation_details },
    { path: 'clinical.reasonForHospitalisation', displayName: 'Planned Treatment Rationale', category: 'treatment', extractor: (d) => d.clinical?.reason_for_hospitalisation }
];

export function performNoteDocumentComparison(record: Partial<PreAuthRecord>): NoteComparisonReport {
    const extractions = record.rawExtractions || [];
    
    // 1. Combined document raw extractions (excluding note)
    const docExtractions = extractions.filter(e => e.id !== 'clinical_note');
    
    // 2. Note raw extraction
    const noteExtraction = extractions.find(e => e.id === 'clinical_note');
    const noteData = noteExtraction ? noteExtraction.extractedData : null;
    
    const items: NoteComparisonItem[] = [];
    
    // Category scores tracker
    const categoryPoints: Record<string, { earned: number; total: number }> = {
        patient_identity: { earned: 0, total: 0 },
        insurance: { earned: 0, total: 0 },
        diagnosis: { earned: 0, total: 0 },
        clinical_findings: { earned: 0, total: 0 },
        treatment: { earned: 0, total: 0 }
    };
    
    for (const fieldDef of COMPARISON_FIELDS) {
        // Extract document value: try mapped record first if provenance is 'ocr' or 'manual'
        let docStr = '';
        const prov = record.provenanceMap?.[fieldDef.path];
        if (prov && (prov.source === 'ocr' || prov.source === 'manual')) {
            const val = getNestedProperty(record, fieldDef.path);
            if (val !== undefined && val !== null) {
                docStr = String(val).trim();
            }
        }
        
        // Fallback to raw OCR extractions if empty
        if (!docStr) {
            let bestDocVal: any = null;
            let bestDocConf = -1;
            for (const ext of docExtractions) {
                const val = fieldDef.extractor(ext.extractedData);
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                    if (ext.confidence > bestDocConf) {
                        bestDocConf = ext.confidence;
                        bestDocVal = val;
                    }
                }
            }
            if (bestDocVal !== null && bestDocVal !== undefined) {
                docStr = String(bestDocVal).trim();
            }
        }
        
        // Extract note value: try raw note extraction first
        let noteStr = '';
        if (noteData) {
            const val = fieldDef.extractor(noteData);
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                noteStr = String(val).trim();
            }
        }
        
        // Fallback to record if provenance says clinical note
        if (!noteStr && prov && prov.source === 'clinical_note') {
            const val = getNestedProperty(record, fieldDef.path);
            if (val !== undefined && val !== null) {
                noteStr = String(val).trim();
            }
        }
        
        let status: 'match' | 'conflict' | 'doc_only' | 'note_only' | 'missing' = 'missing';
        
        if (!docStr && !noteStr) {
            status = 'missing';
        } else if (docStr && !noteStr) {
            status = 'doc_only';
        } else if (!docStr && noteStr) {
            status = 'note_only';
        } else {
            // Apply normalizers and comparison
            const normDoc = fieldDef.normalizeFn ? fieldDef.normalizeFn(docStr) : normalizeString(docStr);
            const normNote = fieldDef.normalizeFn ? fieldDef.normalizeFn(noteStr) : normalizeString(noteStr);
            
            let isMatch = false;
            if (fieldDef.compareFn) {
                isMatch = fieldDef.compareFn(docStr, noteStr);
            } else {
                isMatch = normDoc === normNote || normDoc.includes(normNote) || normNote.includes(normDoc);
            }
            status = isMatch ? 'match' : 'conflict';
        }
        
        // Update category scores if field is not missing on both sides
        if (status !== 'missing') {
            const cat = fieldDef.category;
            categoryPoints[cat].total += 1.0;
            if (status === 'match') {
                categoryPoints[cat].earned += 1.0;
            } else if (status === 'doc_only' || status === 'note_only') {
                categoryPoints[cat].earned += 0.5; // Partial match score
            }
        }
        
        items.push({
            field: fieldDef.path,
            displayName: fieldDef.displayName,
            status,
            document_value: docStr || null,
            note_value: noteStr || null
        });

        // Add legacy mapping for backward compatibility
        const legacyMapping: Record<string, string> = {
            'patient.patientName': 'patient_name',
            'patient.age': 'age',
            'patient.gender': 'gender',
            'insurance.policyNumber': 'policy_number',
            'insurance.insurerName': 'insurer_name'
        };
        if (legacyMapping[fieldDef.path]) {
            items.push({
                field: legacyMapping[fieldDef.path],
                displayName: fieldDef.displayName,
                status: status === 'conflict' ? 'mismatch' : status as any,
                document_value: docStr || null,
                note_value: noteStr || null
            });
        }
    }
    
    // Calculate category scores (handling empty categories via weight redistribution)
    const categoryScores = {
        patient_identity: 100,
        insurance: 100,
        diagnosis: 100,
        clinical_findings: 100,
        treatment: 100
    };
    
    const categoryWeights = {
        patient_identity: 0.10,
        insurance: 0.10,
        diagnosis: 0.25,
        clinical_findings: 0.25,
        treatment: 0.30
    };
    
    let weightedSum = 0;
    let weightDenominator = 0;
    
    for (const key of Object.keys(categoryWeights) as Array<keyof typeof categoryWeights>) {
        const pts = categoryPoints[key];
        if (pts.total > 0) {
            const score = (pts.earned / pts.total) * 100;
            categoryScores[key] = Math.round(score);
            weightedSum += categoryWeights[key] * score;
            weightDenominator += categoryWeights[key];
        } else {
            categoryScores[key] = 100;
        }
    }
    
    const overallScore = weightDenominator > 0 ? Math.round(weightedSum / weightDenominator) : 100;
    
    return {
        items,
        categoryScores,
        overallScore
    };
}

// Backward-compatibility wrapper
export function compareNoteToDocument(noteText: string, documentData: any): NoteComparisonItem[] {
    const mockRecord: Partial<PreAuthRecord> = {
        patient: documentData.patient || {},
        insurance: documentData.insurance || {},
        clinical: {},
        admission: {},
        rawExtractions: [
            {
                id: 'mock_doc',
                extractedData: {
                    patient: {
                        name: documentData.patient?.patientName,
                        age: documentData.patient?.age,
                        gender: documentData.patient?.gender,
                    },
                    insurance: {
                        policy_number: documentData.insurance?.policyNumber,
                        insurance_company: documentData.insurance?.insurerName,
                    }
                },
                confidence: 1.0
            },
            {
                id: 'clinical_note',
                extractedData: {
                    patient: {
                        name: noteText.includes(documentData.patient?.patientName || '') ? documentData.patient?.patientName : null,
                        gender: noteText.toLowerCase().includes('female') ? 'Female' : noteText.toLowerCase().includes('male') ? 'Male' : null,
                    },
                    insurance: {
                        policy_number: noteText.includes(documentData.insurance?.policyNumber || '') ? documentData.insurance?.policyNumber : null,
                        insurance_company: noteText.includes(documentData.insurance?.insurerName || '') ? documentData.insurance?.insurerName : null,
                    }
                },
                confidence: 1.0
            }
        ]
    };
    const report = performNoteDocumentComparison(mockRecord);
    return report.items.map(item => ({
        ...item,
        status: item.status === 'conflict' ? 'mismatch' : item.status // map to expected legacy status
    }));
}

export async function compareNoteToDocumentWithAI(noteText: string, documentData: any): Promise<NoteComparisonItem[]> {
    return compareNoteToDocument(noteText, documentData);
}
