/**
 * readinessScore.ts
 *
 * Pure utility — no React, no side effects.
 * Computes the live Claim Readiness Score (0-100) and the associated
 * list of missing/gap items from a PreAuthRecord.
 *
 * This is the SINGLE source of truth for the score.  Both the persistent
 * ClaimReadinessRail and the DocumentsGenerateStep import from here.
 * Do NOT alter the deduction rules here — presentation only.
 */

import { PreAuthRecord, WizardDocument } from '../components/PreAuthWizard/types';
import { EvidenceReviewReport } from '../engine/evidenceReview';
import { getRequiredDocuments, isIcdMapped } from './documentRequirements';
import { validateCode } from '../services/icdService';
import { DocumentRequirement } from '../types';
import { compareNoteToDocument, NoteComparisonItem } from '../services/noteDocumentComparison';

export interface ReadinessMissingItem {
    text: string;
    deduction: number;
    step: 1 | 2 | 3 | 4;
    /** One-line why, from the deterministic note-vs-document comparison — set only
     * for the 5 fields that comparison covers (patient name/age/gender, policy
     * number, insurer name). Undefined for gaps the comparison doesn't reach
     * (room category, cost breakdown, etc). */
    reason?: string;
}

const COMPARISON_FIELD_LABELS: Record<string, string> = {
    patient_name: 'Patient Name',
    age: 'Patient Age',
    gender: 'Patient Gender',
    policy_number: 'Policy Number',
    insurer_name: 'Insurer Name',
};

/** Builds the same note text ClinicalDetailsStep.tsx's comparison button uses. */
function buildNoteTextFromRecord(record: Partial<PreAuthRecord>): string {
    const c = record.clinical;
    return [c?.chiefComplaints, c?.historyOfPresentIllness, c?.relevantClinicalFindings]
        .filter(Boolean).join('\n');
}

function reasonForMissing(item: NoteComparisonItem | undefined): string {
    if (item && item.status === 'missing_in_document' && item.note_value) {
        return 'Stated in clinical note but not found in any uploaded document';
    }
    return 'Not found in uploaded documents or clinical note';
}

export interface ReadinessResult {
    score: number;
    missingItems: ReadinessMissingItem[];
    hasInvalidICD: boolean;
    isSurgicalZeroCost: boolean;
    blockingGaps: string[];
    /** docs uploaded vs docs required */
    docsUploaded: number;
    docsRequired: number;
    needsManualReview?: boolean;
}

/**
 * computeReadiness — identical logic to what was in DocumentsGenerateStep.
 * Accepts the parts of the record needed so it can be called from anywhere.
 */
export function computeReadiness(
    record: Partial<PreAuthRecord>,
    tpaReport: EvidenceReviewReport | null,
    /** Optional pre-computed note comparison (e.g. from the Sarvam-enhanced async call).
     *  When provided, skips the internal deterministic compareNoteToDocument call so
     *  richer AI-detected mismatches are reflected in the live readiness score. */
    overrideNoteComparison?: NoteComparisonItem[]
): ReadinessResult {
    const docs = record.uploadedDocuments ?? [];
    const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
    const icdCode = selectedDx?.icd10Code ?? '';

    const hasInvalidICD = !icdCode || icdCode === 'Pending ICD-10' || icdCode === 'Selection required' || !validateCode(icdCode);
    const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical || false;
    const isMedical = record.clinical?.proposedLineOfTreatment?.medical || false;
    const isInvestigation = record.clinical?.proposedLineOfTreatment?.investigation || false;
    
    const isSurgicalZeroCost = isSurgical &&
        ((record.costEstimate?.otCharges ?? 0) === 0 &&
         (record.costEstimate?.surgeonFee ?? 0) === 0 &&
         (record.costEstimate?.totalImplantsCost ?? 0) === 0);

    const missingItems: ReadinessMissingItem[] = [];

    // Deterministic note-vs-document comparison (or Sarvam-enhanced override)
    const noteText = buildNoteTextFromRecord(record);
    const comparison: NoteComparisonItem[] = overrideNoteComparison
        ?? (noteText.trim()
            ? compareNoteToDocument(noteText, { patient: record.patient, insurance: record.insurance })
            : []);
    const comparisonByField = new Map(comparison.map(c => [c.field, c]));

    const isLowConfidenceOCR = record.insurance?.dataSource === 'ocr' && (record.insurance?.ocrConfidence ?? 100) < 70;
    const ocrConfVal = record.insurance?.ocrConfidence;

    // --- CATEGORY 1: PATIENT & INSURANCE (Weight: 20) ---
    const cat1Rules: { id: string; weight: number; check: () => { status: 'PASS' | 'MISSING' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE' | 'CONFLICT'; text: string; reason?: string } }[] = [
        {
            id: 'TPA_OR_INSURER_NAME',
            weight: 2,
            check: () => {
                const val = record.insurance?.insurerName || record.insurance?.tpaName;
                if (!val) return { status: 'MISSING', text: 'Missing Insurer Name or TPA Name' };
                if (isLowConfidenceOCR) {
                    return { status: 'NEEDS_REVIEW', text: `Insurer/TPA: ${val} (Low Confidence ${ocrConfVal}%)`, reason: `AI extraction confidence is ${ocrConfVal}%. Verify insurer/TPA name manually.` };
                }
                return { status: 'PASS', text: `Insurer/TPA: ${val}` };
            }
        },
        {
            id: 'PATIENT_NAME',
            weight: 5,
            check: () => {
                const val = record.patient?.patientName;
                if (!val) return { status: 'MISSING', text: 'Missing Patient Name' };
                if (isLowConfidenceOCR) {
                    return { status: 'NEEDS_REVIEW', text: `Patient Name: ${val} (Low Confidence ${ocrConfVal}%)`, reason: `AI extraction confidence is ${ocrConfVal}%. Verify patient name against ID.` };
                }
                return { status: 'PASS', text: `Patient Name: ${val}` };
            }
        },
        {
            id: 'PATIENT_GENDER',
            weight: 3,
            check: () => {
                const val = record.patient?.gender;
                if (!val) return { status: 'MISSING', text: 'Missing Patient Gender' };
                return { status: 'PASS', text: `Patient Gender: ${val}` };
            }
        },
        {
            id: 'PATIENT_AGE_OR_DOB',
            weight: 4,
            check: () => {
                const age = record.patient?.age;
                const dob = record.patient?.dateOfBirth;
                if (!age && !dob) return { status: 'MISSING', text: 'Missing Patient Age / DOB' };
                return { status: 'PASS', text: `Patient Age/DOB: ${age || dob}` };
            }
        },
        {
            id: 'PATIENT_CONTACT_NUMBER',
            weight: 2,
            check: () => {
                const val = record.patient?.mobileNumber;
                if (!val) return { status: 'MISSING', text: 'Missing Patient Contact Number' };
                return { status: 'PASS', text: `Patient Contact: ${val}` };
            }
        },
        {
            id: 'POLICY_IDENTITY',
            weight: 4,
            check: () => {
                const policy = record.insurance?.policyNumber;
                const card = record.insurance?.tpaIdCardNumber;
                if (!policy && !card) return { status: 'MISSING', text: 'Missing Policy Number or Insured Card ID' };
                if (isLowConfidenceOCR) {
                    return { status: 'NEEDS_REVIEW', text: `Policy ID: ${policy || card} (Low Confidence ${ocrConfVal}%)`, reason: `AI extraction confidence is ${ocrConfVal}%. Verify policy number manually.` };
                }
                return { status: 'PASS', text: `Policy ID: ${policy || card}` };
            }
        },
        {
            id: 'PATIENT_CURRENT_ADDRESS',
            weight: 2,
            check: () => {
                const city = record.patient?.city;
                const state = record.patient?.state;
                if (!city || !state) return { status: 'MISSING', text: 'Missing Patient Current Address' };
                return { status: 'PASS', text: `Address: ${city}, ${state}` };
            }
        },
        {
            id: 'EMPLOYEE_ID',
            weight: 0,
            check: () => {
                const isCorporate = !!record.insurance?.corporateName;
                if (!isCorporate) return { status: 'NOT_APPLICABLE', text: 'Employee ID (Non-Corporate policy)' };
                const empId = record.insurance?.employeeId;
                if (!empId) return { status: 'MISSING', text: 'Missing Corporate Employee ID' };
                return { status: 'PASS', text: `Employee ID: ${empId}` };
            }
        }
    ];

    // --- CATEGORY 2: CLINICAL (Weight: 25) ---
    const cat2Rules: { id: string; weight: number; check: () => { status: 'PASS' | 'MISSING' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE' | 'CONFLICT'; text: string; reason?: string } }[] = [
        {
            id: 'TREATING_DOCTOR_NAME',
            weight: 3,
            check: () => {
                const val = record.declarations?.doctor?.doctorName || record.clinical?.treatingDoctorName;
                if (!val) return { status: 'MISSING', text: 'Missing Treating Doctor Name' };
                return { status: 'PASS', text: `Treating Doctor: ${val}` };
            }
        },
        {
            id: 'NATURE_OF_ILLNESS',
            weight: 5,
            check: () => {
                const val = record.clinical?.chiefComplaints;
                if (!val) return { status: 'MISSING', text: 'Missing Presenting Complaints / Nature of Illness' };
                return { status: 'PASS', text: `Complaints: ${val}` };
            }
        },
        {
            id: 'RELEVANT_CRITICAL_FINDINGS',
            weight: 3,
            check: () => {
                const val = record.clinical?.relevantClinicalFindings;
                if (!val) return { status: 'MISSING', text: 'Missing Relevant Clinical Findings' };
                return { status: 'PASS', text: `Clinical Findings: ${val}` };
            }
        },
        {
            id: 'DURATION_OF_AILMENT',
            weight: 2,
            check: () => {
                const val = record.clinical?.durationOfPresentAilment;
                if (!val) return { status: 'MISSING', text: 'Missing Duration of Present Ailment' };
                return { status: 'PASS', text: `Duration: ${val}` };
            }
        },
        {
            id: 'PROVISIONAL_DIAGNOSIS',
            weight: 5,
            check: () => {
                const val = record.clinical?.diagnoses?.[record.clinical?.selectedDiagnosisIndex ?? 0]?.diagnosis;
                if (!val) return { status: 'MISSING', text: 'Missing Provisional Diagnosis' };
                return { status: 'PASS', text: `Diagnosis: ${val}` };
            }
        },
        {
            id: 'ICD10_CODE_CONFIRMED',
            weight: 2,
            check: () => {
                const diag = record.clinical?.diagnoses?.[record.clinical?.selectedDiagnosisIndex ?? 0];
                if (!diag?.diagnosis) return { status: 'NOT_APPLICABLE', text: 'ICD-10 Code Confirmation' };
                const code = diag?.icd10Code;
                const isValid = code && code !== 'Pending ICD-10' && code !== 'Selection required' && validateCode(code);
                if (!isValid) return { status: 'NEEDS_REVIEW', text: 'Missing Confirmed ICD-10 Code' };
                return { status: 'PASS', text: `ICD-10: ${code}` };
            }
        },
        {
            id: 'LINE_OF_TREATMENT',
            weight: 3,
            check: () => {
                const t = record.clinical?.proposedLineOfTreatment;
                const hasLine = t?.medical || t?.surgical || t?.intensiveCare || t?.investigation || t?.nonAllopathic;
                if (!hasLine) return { status: 'MISSING', text: 'Missing Proposed Line of Treatment' };
                return { status: 'PASS', text: 'Line of Treatment specified' };
            }
        },
        {
            id: 'INVESTIGATION_MGMT_DETAILS',
            weight: 2,
            check: () => {
                if (!isMedical && !isInvestigation) return { status: 'NOT_APPLICABLE', text: 'Investigation/Management details' };
                const val = record.clinical?.treatmentTakenSoFar;
                if (!val) return { status: 'MISSING', text: 'Missing Investigation/Management details' };
                return { status: 'PASS', text: `Management Details: ${val}` };
            }
        },
        {
            id: 'SURGERY_NAME',
            weight: 3,
            check: () => {
                if (!isSurgical) return { status: 'NOT_APPLICABLE', text: 'Surgery Name' };
                const val = record.clinical?.surgeryDetails?.nameOfSurgery;
                if (!val) return { status: 'MISSING', text: 'Missing Surgery Name' };
                return { status: 'PASS', text: `Surgery Name: ${val}` };
            }
        },
        {
            id: 'ICD10_PCS_CODE',
            weight: 2,
            check: () => {
                if (!isSurgical) return { status: 'NOT_APPLICABLE', text: 'Surgery ICD-10 PCS Code' };
                const val = record.clinical?.surgeryDetails?.surgeryIcdCode;
                if (!val) return { status: 'MISSING', text: 'Missing Surgery ICD-10 PCS Code' };
                return { status: 'PASS', text: `Surgery PCS Code: ${val}` };
            }
        }
    ];

    // --- CATEGORY 3: ADMISSION & COST (Weight: 20) ---
    const isICU = record.clinical?.proposedLineOfTreatment?.intensiveCare || false;
    const isPackage = record.costEstimate?.isPackageRate || false;

    const cat3Rules: { id: string; weight: number; check: () => { status: 'PASS' | 'MISSING' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE' | 'CONFLICT'; text: string; reason?: string } }[] = [
        {
            id: 'DATE_OF_ADMISSION',
            weight: 3,
            check: () => {
                const val = record.admission?.dateOfAdmission;
                if (!val) return { status: 'MISSING', text: 'Missing Date of Admission' };
                return { status: 'PASS', text: `Date of Admission: ${val}` };
            }
        },
        {
            id: 'EMERGENCY_OR_PLANNED',
            weight: 2,
            check: () => {
                const val = record.admission?.admissionType;
                if (!val) return { status: 'MISSING', text: 'Missing Admission Type (Emergency/Planned)' };
                return { status: 'PASS', text: `Admission Type: ${val}` };
            }
        },
        {
            id: 'EXPECTED_LOS_DAYS',
            weight: 3,
            check: () => {
                const val = record.admission?.expectedLengthOfStay;
                if (!val) return { status: 'MISSING', text: 'Missing Expected Length of Stay (days)' };
                return { status: 'PASS', text: `LOS: ${val} days` };
            }
        },
        {
            id: 'ROOM_TYPE',
            weight: 2,
            check: () => {
                const val = record.admission?.roomCategory;
                if (!val) return { status: 'MISSING', text: 'Missing Room Category' };
                return { status: 'PASS', text: `Room Category: ${val}` };
            }
        },
        {
            id: 'ROOM_CHARGES_PER_DAY',
            weight: 2,
            check: () => {
                if (isPackage) return { status: 'NOT_APPLICABLE', text: 'Room Rent per day (Package rate applied)' };
                const val = record.costEstimate?.roomRentPerDay;
                if (!val) return { status: 'MISSING', text: 'Missing Room Rent per day' };
                return { status: 'PASS', text: `Room Rent: ₹${val}/day` };
            }
        },
        {
            id: 'INVESTIGATION_DIAGNOSTIC_COST',
            weight: 2,
            check: () => {
                if (isPackage) return { status: 'NOT_APPLICABLE', text: 'Investigation cost (Package rate applied)' };
                const val = record.costEstimate?.investigationsEstimate;
                if (val === undefined || val === null) return { status: 'MISSING', text: 'Missing Investigations / Diagnostic cost estimate' };
                return { status: 'PASS', text: `Investigations: ₹${val}` };
            }
        },
        {
            id: 'ICU_DAYS',
            weight: 2,
            check: () => {
                if (!isICU) return { status: 'NOT_APPLICABLE', text: 'Expected Days in ICU' };
                const val = record.admission?.expectedDaysInICU;
                if (!val) return { status: 'MISSING', text: 'Missing Expected Days in ICU' };
                return { status: 'PASS', text: `ICU Days: ${val}` };
            }
        },
        {
            id: 'ICU_CHARGES',
            weight: 2,
            check: () => {
                if (!isICU) return { status: 'NOT_APPLICABLE', text: 'ICU Charges per day' };
                const val = record.costEstimate?.icuChargesPerDay;
                if (!val) return { status: 'MISSING', text: 'Missing ICU Charges per day' };
                return { status: 'PASS', text: `ICU Charges: ₹${val}/day` };
            }
        },
        {
            id: 'OT_CHARGES',
            weight: 2,
            check: () => {
                if (!isSurgical) return { status: 'NOT_APPLICABLE', text: 'Operating Theatre (OT) charges' };
                const val = record.costEstimate?.otCharges;
                if (val === undefined || val === null) return { status: 'MISSING', text: 'Missing Operating Theatre (OT) charges' };
                return { status: 'PASS', text: `OT Charges: ₹${val}` };
            }
        },
        {
            id: 'PROFESSIONAL_FEES',
            weight: 2,
            check: () => {
                if (isPackage) return { status: 'NOT_APPLICABLE', text: 'Professional fees (Package rate applied)' };
                const val = record.costEstimate?.surgeonFee || record.costEstimate?.consultantFee;
                if (!val) return { status: 'MISSING', text: 'Missing Professional / Surgeon / Consultant fees' };
                return { status: 'PASS', text: `Professional Fees: ₹${val}` };
            }
        },
        {
            id: 'MEDICINES_CONSUMABLES_IMPLANTS',
            weight: 2,
            check: () => {
                if (isPackage) return { status: 'NOT_APPLICABLE', text: 'Medicines / Implants cost (Package rate applied)' };
                const val = (record.costEstimate?.medicinesEstimate ?? 0) + (record.costEstimate?.consumablesEstimate ?? 0) + (record.costEstimate?.totalImplantsCost ?? 0);
                if (val === 0) return { status: 'MISSING', text: 'Missing Medicines / Consumables / Implants cost estimates' };
                return { status: 'PASS', text: `Medicines & Consumables: ₹${val}` };
            }
        },
        {
            id: 'PACKAGE_CHARGES',
            weight: 2,
            check: () => {
                if (!isPackage) return { status: 'NOT_APPLICABLE', text: 'Package charges' };
                const val = record.costEstimate?.packageAmount || record.costEstimate?.packageName;
                if (!val) return { status: 'MISSING', text: 'Missing Package charges name/amount' };
                return { status: 'PASS', text: `Package Charges: ₹${val}` };
            }
        },
        {
            id: 'TOTAL_ESTIMATED_COST',
            weight: 4,
            check: () => {
                const val = record.costEstimate?.totalEstimatedCost;
                if (!val || val === 0) return { status: 'MISSING', text: 'Missing Total Estimated Cost' };
                return { status: 'PASS', text: `Total Estimated Cost: ₹${val}` };
            }
        }
    ];

    // --- CATEGORY 4: DOCUMENT READINESS (Weight: 15) ---
    const cat4Rules: { id: string; weight: number; check: () => { status: 'PASS' | 'MISSING' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE' | 'CONFLICT'; text: string; reason?: string } }[] = [
        {
            id: 'DOCTOR_QUALIFICATION',
            weight: 2,
            check: () => {
                const val = record.declarations?.doctor?.doctorQualification;
                if (!val) return { status: 'MISSING', text: 'Missing Doctor Qualification' };
                return { status: 'PASS', text: `Qualification: ${val}` };
            }
        },
        {
            id: 'DOCTOR_REGISTRATION_NUMBER',
            weight: 3,
            check: () => {
                const val = record.declarations?.doctor?.doctorRegistrationNumber;
                if (!val) return { status: 'MISSING', text: 'Missing Doctor Registration Number' };
                return { status: 'PASS', text: `Registration: ${val}` };
            }
        },
        {
            id: 'HOSPITAL_SEAL_PRESENT',
            weight: 3,
            check: () => {
                const val = record.declarations?.hospital?.hospitalSealApplied;
                if (!val) return { status: 'MISSING', text: 'Missing Hospital Seal declaration' };
                return { status: 'PASS', text: 'Hospital Seal confirmed' };
            }
        },
        {
            id: 'PATIENT_SIGNATURE_PRESENT',
            weight: 3,
            check: () => {
                const val = record.declarations?.patient?.agreedToTerms || record.declarations?.patient?.consentForMedicalDataSharing;
                if (!val) return { status: 'MISSING', text: 'Missing Patient Signature declaration' };
                return { status: 'PASS', text: 'Patient Signature confirmed' };
            }
        },
        {
            id: 'DOCTOR_SIGNATURE_PRESENT',
            weight: 4,
            check: () => {
                const val = record.declarations?.doctor?.confirmed;
                if (!val) return { status: 'MISSING', text: 'Missing Doctor Signature declaration' };
                return { status: 'PASS', text: 'Doctor Signature confirmed' };
            }
        }
    ];

    // --- CATEGORY 5: CONSISTENCY CHECKING (Weight: 20) ---
    const cat5Rules: { id: string; weight: number; check: () => { status: 'PASS' | 'MISSING' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE' | 'CONFLICT'; text: string; reason?: string } }[] = [
        {
            id: 'CONSISTENCY_PATIENT_NAME',
            weight: 4,
            check: () => {
                const item = comparisonByField.get('patient_name');
                if (item?.status === 'mismatch') return { status: 'CONFLICT', text: 'Consistency: Patient Name mismatch', reason: `Note: "${item.note_value}", Doc: "${item.document_value}"` };
                return { status: 'PASS', text: 'Consistency: Patient Name matches' };
            }
        },
        {
            id: 'CONSISTENCY_PATIENT_AGE',
            weight: 4,
            check: () => {
                const item = comparisonByField.get('age');
                if (item?.status === 'mismatch') return { status: 'CONFLICT', text: 'Consistency: Patient Age mismatch', reason: `Note: "${item.note_value}", Doc: "${item.document_value}"` };
                return { status: 'PASS', text: 'Consistency: Patient Age matches' };
            }
        },
        {
            id: 'CONSISTENCY_PATIENT_GENDER',
            weight: 4,
            check: () => {
                const item = comparisonByField.get('gender');
                if (item?.status === 'mismatch') return { status: 'CONFLICT', text: 'Consistency: Patient Gender mismatch', reason: `Note: "${item.note_value}", Doc: "${item.document_value}"` };
                return { status: 'PASS', text: 'Consistency: Patient Gender matches' };
            }
        },
        {
            id: 'CONSISTENCY_POLICY_NUMBER',
            weight: 4,
            check: () => {
                const item = comparisonByField.get('policy_number');
                if (item?.status === 'mismatch') return { status: 'CONFLICT', text: 'Consistency: Policy Number mismatch', reason: `Note: "${item.note_value}", Doc: "${item.document_value}"` };
                return { status: 'PASS', text: 'Consistency: Policy Number matches' };
            }
        },
        {
            id: 'CONSISTENCY_INSURER_NAME',
            weight: 4,
            check: () => {
                const item = comparisonByField.get('insurer_name');
                if (item?.status === 'mismatch') return { status: 'CONFLICT', text: 'Consistency: Insurer Name mismatch', reason: `Note: "${item.note_value}", Doc: "${item.document_value}"` };
                return { status: 'PASS', text: 'Consistency: Insurer Name matches' };
            }
        }
    ];

    // Helper to evaluate and dynamically scale each category score
    const evaluateCategory = (
        rules: typeof cat1Rules,
        maxCategoryScore: number,
        step: 1 | 2 | 3 | 4
    ): number => {
        let totalWeight = 0;
        let earnedWeight = 0;

        for (const rule of rules) {
            const res = rule.check();
            if (res.status === 'NOT_APPLICABLE') {
                continue; // exclude from both denominator and numerator
            }
            totalWeight += rule.weight;
            if (res.status === 'PASS') {
                earnedWeight += rule.weight;
            } else if (res.status === 'NEEDS_REVIEW') {
                earnedWeight += rule.weight * 0.5; // 50% partial score for low-confidence or needs-review fields
                missingItems.push({
                    text: res.text,
                    deduction: Math.ceil(rule.weight * 0.5),
                    step,
                    reason: res.reason || 'Verification required (Low AI Confidence)'
                });
            } else {
                // MISSING or CONFLICT
                missingItems.push({
                    text: res.text,
                    deduction: rule.weight,
                    step,
                    reason: res.reason
                });
            }
        }

        if (totalWeight === 0) return maxCategoryScore;
        return maxCategoryScore * (earnedWeight / totalWeight);
    };

    // Calculate category scores
    const Score_PatientInsurance = evaluateCategory(cat1Rules, 20, 1);
    const Score_Clinical = evaluateCategory(cat2Rules, 25, 2);
    const Score_AdmissionCost = evaluateCategory(cat3Rules, 20, 3);
    const Score_Document = evaluateCategory(cat4Rules, 15, 4);
    const Score_Consistency = evaluateCategory(cat5Rules, 20, 4);

    const finalScore = Math.max(0, Math.min(100, Math.round(Score_PatientInsurance + Score_Clinical + Score_AdmissionCost + Score_Document + Score_Consistency)));

    const blockingGaps = [
        !record.patient?.patientName ? 'Patient Name is required.' : null,
        !selectedDx?.diagnosis ? 'Diagnosis is required.' : null,
        hasInvalidICD ? 'A confirmed, valid ICD-10 code is required.' : null,
        !record.declarations?.doctor?.doctorRegistrationNumber ? 'Doctor Registration Number is required.' : null,
        !record.admission?.dateOfAdmission ? 'Date of Admission is required.' : null,
        isSurgicalZeroCost ? 'Surgical procedure requires Surgeon Fee, OT Charges, or Implants Cost to be non-zero.' : null,
    ].filter(Boolean) as string[];

    const requiredDocs = getRequiredDocuments(selectedDx?.icd10Code ?? selectedDx?.diagnosis ?? '');
    const docsRequired = requiredDocs.filter(r => r.isRequired).length;
    const docsUploaded = requiredDocs.filter(r => r.isRequired && docs.some(d => d.documentCategory === r.category)).length;

    const isMapped = isIcdMapped(selectedDx?.icd10Code ?? selectedDx?.diagnosis ?? '');
    const needsManualReview = !isMapped;

    return {
        score: finalScore,
        missingItems,
        hasInvalidICD,
        isSurgicalZeroCost,
        blockingGaps,
        docsUploaded,
        docsRequired,
        needsManualReview,
    };
}

/** Returns a one-line human summary of the score state for the rail. */
export function readinessStatusLine(score: number, missingCount: number): string {
    if (score >= 95) return 'Ready to submit';
    if (score >= 80) return `Almost ready — resolve ${missingCount} item${missingCount !== 1 ? 's' : ''}`;
    if (score >= 50) return `Requires action — ${missingCount} gap${missingCount !== 1 ? 's' : ''} to fix`;
    return `Critical gaps — ${missingCount} blocking issue${missingCount !== 1 ? 's' : ''}`;
}

/** Score → status color token */
export function scoreColorClass(score: number): {
    stroke: string;
    text: string;
    bg: string;
    border: string;
    label: string;
} {
    if (score >= 80) return {
        stroke: '#22c55e',
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        label: 'Highly Submittable',
    };
    if (score >= 50) return {
        stroke: '#f59e0b',
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        label: 'Requires Action',
    };
    return {
        stroke: '#ef4444',
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        label: 'Critical Gaps',
    };
}
