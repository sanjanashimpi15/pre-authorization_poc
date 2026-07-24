import { PreAuthRecord, NecessityStrength } from '../components/PreAuthWizard/types';

export interface StrengthResult {
    strength: NecessityStrength;
    reasons: string[];
    score: number; // 0-100
}

export const scoreNecessityStrength = (record: Partial<PreAuthRecord>): StrengthResult => {
    const reasons: string[] = [];
    let score = 0;

    const clinical = record.clinical;
    const admission = record.admission;
    const cost = record.costEstimate;
    const docs = record.uploadedDocuments ?? [];
    const docReqs = record.documentRequirements ?? [];

    // 1. Diagnosis with ICD-10 (20 pts)
    const hasDiagnosis = clinical?.diagnoses && clinical.diagnoses.length > 0 && clinical.diagnoses[0].icd10Code;
    if (hasDiagnosis) {
        score += 20;
        reasons.push('✅ Diagnosis supported by ICD-10 code');
    } else {
        reasons.push('⚠️ No diagnosis / ICD-10 code selected');
    }

    // 2. Vitals support severity (20 pts)
    const vitals = clinical?.vitals;
    const spo2 = vitals?.spo2 ? parseInt(vitals.spo2) : 100;
    const pulse = vitals?.pulse ? parseInt(vitals.pulse) : 80;
    if (vitals && (spo2 < 94 || pulse > 100)) {
        score += 20;
        reasons.push('✅ Vitals justify severity assessment');
    } else if (vitals && vitals.bp && vitals.pulse && vitals.temp) {
        score += 10;
        reasons.push('✅ Vitals documented');
    } else {
        reasons.push('⚠️ Vitals not documented or within normal limits');
    }

    // 3. OPD contraindication reason (20 pts)
    if (clinical?.reasonForHospitalisation && clinical.reasonForHospitalisation.length > 30) {
        score += 20;
        reasons.push('✅ Clear OPD contraindication reasons documented');
    } else {
        reasons.push('⚠️ Reason for hospitalisation not detailed');
    }

    // 4. Required documents uploaded (20 pts)
    const missingRequired = docReqs.filter(r => r.isRequired && r.status === 'missing_required');
    if (docs.length > 0 && missingRequired.length === 0) {
        score += 20;
        reasons.push('✅ All required documents uploaded');
    } else if (docs.length > 0) {
        score += 10;
        reasons.push(`⚠️ ${missingRequired.length} required document(s) pending`);
    } else {
        reasons.push('⚠️ No supporting documents uploaded');
    }

    // 5. Cost within normal range (20 pts)
    const total = cost?.totalEstimatedCost ?? 0;
    if (total > 0 && !cost?.exceedsSumInsured) {
        score += 20;
        reasons.push('✅ Cost estimate within sum insured');
    } else if (total > 0 && cost?.exceedsSumInsured) {
        score += 10;
        reasons.push('⚠️ Estimate exceeds sum insured');
    } else {
        reasons.push('⚠️ No cost estimate provided');
    }

    const strength: NecessityStrength = score >= 80 ? 'strong' : score >= 50 ? 'moderate' : 'weak';
    return { strength, reasons, score };
};
