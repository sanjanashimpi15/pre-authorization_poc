import { PreAuthRecord, InsurancePolicyDetails, HospitalConfig, PatientRecord, EvidenceSuggestion } from '../components/PreAuthWizard/types';
import { EvidenceReviewReport } from './evidenceReview';
import { validateCode, getDescription } from '../services/icdService';

// ============================================
// PART C OUTPUT TYPES
// ============================================

export type SubmittabilityStatus = 'complete' | 'pending_documents';

export interface PartCGap {
  field: string;
  reason: string;
  severity: 'blocking' | 'advisory';
}

export interface PartCIcdDetails {
  code: string;
  description: string;
  isValidWho: boolean;
  matchMethod?: string;
}

export interface PartCOutput {
  // Submittability
  submittabilityStatus: SubmittabilityStatus;
  gaps: PartCGap[];
  warnings: string[];
  isDraftPendingData: boolean;

  // Hospital section
  hospitalName: string;
  rohiniId: string;
  nabhAccredited: boolean;
  nablAccredited: boolean;
  nodalOfficerName: string;
  nodalOfficerPhone: string;

  // Doctor section
  treatingDoctorName: string;
  treatingDoctorQualification: string;
  treatingDoctorRegNo: string;
  registrationCouncil: string;

  // Patient & policy section
  patientName: string;
  patientAge: number | null;
  patientAgeUnit?: 'years' | 'months';
  patientGender: string;
  policyNumber: string;
  insurerName: string;
  tpaName: string;

  // Clinical section
  icd: PartCIcdDetails;
  diagnosisName: string;
  admissionType: string;
  dateOfAdmission: string;
  expectedLos: number;
  roomCategory: string;
  lineOfTreatment: string[];
  reasonForHospitalisation: string;
  surgeryName?: string;

  // Cost section
  totalEstimatedCost: number;
  amountClaimedFromInsurer: number;
  costBreakdown: Record<string, number>;

  // Evidence section (from engine)
  evidenceStatus: 'sufficient' | 'insufficient';
  insufficientEvidence: string[];
  anticipatedQueries: Array<{
    query: string;
    severity: string;
    source: 'rule' | 'suggestion';
    reason?: string;
    relatedChallenge?: string;
  }>;
  policyChecks: string[];

  // Declaration section
  patientConsentGiven: boolean;
  doctorDeclarationConfirmed: boolean;
  hospitalSealApplied: boolean;

  // Suggest & confirm fields (Bucket 2)
  relevantClinicalFindings?: string;
  pastHistory?: string;
  firstConsultationDate?: string;
  isInjury?: boolean;
  alcoholInvolvement?: boolean;
  hasOtherHealthPolicy?: boolean;
  familyPhysicianName?: string;

  // Metadata
  generatedAt: string;
  formVersion: string;
  sourceTraceability?: Record<string, string>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getLineOfTreatment(record: Partial<PreAuthRecord>): string[] {
  const lines: string[] = [];
  const lot = record.clinical?.proposedLineOfTreatment;
  if (!lot) return ['Not specified'];
  if (lot.medical) lines.push('Medical Management');
  if (lot.surgical) lines.push('Surgical Intervention');
  if (lot.intensiveCare) lines.push('Intensive Care');
  if (lot.investigation) lines.push('Diagnostic Investigation');
  if (lot.nonAllopathic) lines.push('Non-Allopathic Treatment');
  return lines.length > 0 ? lines : ['Not specified'];
}

function buildCostBreakdown(record: Partial<PreAuthRecord>): Record<string, number> {
  const ce = record.costEstimate;
  if (!ce) return {};
  return {
    'Room Charges': ce.totalRoomCharges ?? 0,
    'Nursing Charges': ce.totalNursingCharges ?? 0,
    'ICU Charges': ce.totalIcuCharges ?? 0,
    'OT Charges': ce.otCharges ?? 0,
    'Surgeon Fee': ce.surgeonFee ?? 0,
    'Anesthetist Fee': ce.anesthetistFee ?? 0,
    'Consultant Fee': ce.consultantFee ?? 0,
    'Investigations': ce.investigationsEstimate ?? 0,
    'Medicines': ce.medicinesEstimate ?? 0,
    'Consumables': ce.consumablesEstimate ?? 0,
    'Implants': ce.totalImplantsCost ?? 0,
    'Ambulance': ce.ambulanceCharges ?? 0,
    'Miscellaneous': ce.miscCharges ?? 0,
  };
}

// ============================================
// CORE GENERATOR
// ============================================

/**
 * Generates a structured IRDAI Part C output from a PreAuthRecord and EvidenceReviewReport.
 * Returns a machine-readable PartCOutput with submittability status and all gaps enumerated.
 */
export function generatePartC(
  record: Partial<PreAuthRecord>,
  evidenceReport: EvidenceReviewReport | null,
  suggestions: EvidenceSuggestion[] = []
): PartCOutput {
  const docs = record.uploadedDocuments ?? [];
  const getCitationForField = (
    fieldKey: string,
    value: any
  ): string => {
    if (value === undefined || value === null || value === '' || value === '[TO FILL]') {
      return '';
    }
    
    // 1. First check in suggestions (Bucket 2 clinical fields)
    const sug = suggestions.find(s => s.field === fieldKey);
    if (sug && sug.verified && sug.sourcePage) {
      return ` [p.${sug.sourcePage}]`;
    }
    
    // 2. Fallback to scanning all document pages for exact substring of the value
    const strVal = String(value).toLowerCase().trim();
    if (strVal.length > 2) {
      for (const doc of docs) {
        if (doc.pages && doc.pages.length > 0) {
          for (const p of doc.pages) {
            if (p.ocrText && p.ocrText.toLowerCase().includes(strVal)) {
              return ` [p.${p.index}]`;
            }
          }
        }
      }
    }
    
    return '';
  };

  const gaps: PartCGap[] = [];

  // ─── ICD-10 ────────────────────────────────────────────────────
  const selectedDx = record.clinical?.diagnoses?.[record.clinical.selectedDiagnosisIndex ?? 0];
  const rawCode = selectedDx?.icd10Code ?? '';
  const diagnosisName = selectedDx?.diagnosis ?? 'Unspecified';
  const isValidWho = rawCode ? validateCode(rawCode) : false;
  const officialDescription = isValidWho ? getDescription(rawCode) : 'Code not confirmed';

  const icd: PartCIcdDetails = {
    // Never expose an unvalidated code in the generated output
    code: isValidWho ? rawCode : 'Pending ICD-10',
    description: isValidWho ? officialDescription : 'Selection required — confirm via ICD picker',
    isValidWho,
    matchMethod: selectedDx?.icd10MatchMethod,
  };

  if (!rawCode || rawCode === 'Pending ICD-10') {
    gaps.push({ field: 'ICD-10 Code', reason: 'No ICD-10 code has been assigned to the stated diagnosis.', severity: 'blocking' });
  } else if (!isValidWho) {
    gaps.push({ field: 'ICD-10 Code', reason: `Code "${rawCode}" is not a valid WHO ICD-10 code. Must be corrected before submission.`, severity: 'blocking' });
  }

  // ─── Doctor declaration ──────────────────────────────────────────
  const doctorDecl = record.declarations?.doctor;
  const treatingDoctorRegNo = doctorDecl?.doctorRegistrationNumber ?? '';
  const doctorDeclarationConfirmed = doctorDecl?.confirmed ?? false;

  if (!treatingDoctorRegNo || treatingDoctorRegNo.trim() === '') {
    gaps.push({ field: 'Doctor Registration Number', reason: 'SMC/MCI registration number is mandatory for Part C submission.', severity: 'blocking' });
  }
  if (!doctorDeclarationConfirmed) {
    gaps.push({ field: 'Doctor Declaration', reason: 'Treating doctor has not confirmed the declaration.', severity: 'blocking' });
  }

  // ─── Patient consent ────────────────────────────────────────────
  const patientDecl = record.declarations?.patient;
  const patientConsentGiven = patientDecl?.agreedToTerms ?? false;
  if (!patientConsentGiven) {
    gaps.push({ field: 'Patient Consent', reason: 'Patient consent / terms agreement has not been captured.', severity: 'blocking' });
  }

  // ─── Hospital seal ──────────────────────────────────────────────
  const hospDecl = record.declarations?.hospital;
  const hospitalSealApplied = hospDecl?.hospitalSealApplied ?? false;
  if (!hospitalSealApplied) {
    gaps.push({ field: 'Hospital Seal', reason: 'Hospital seal has not been applied on the pre-authorization form.', severity: 'blocking' });
  }

  // ─── Cost estimate ───────────────────────────────────────────────
  const totalEstimatedCost = record.costEstimate?.totalEstimatedCost ?? 0;
  const amountClaimedFromInsurer = record.costEstimate?.amountClaimedFromInsurer ?? 0;
  if (totalEstimatedCost <= 0) {
    gaps.push({ field: 'Cost Estimate', reason: 'Itemized cost estimate is missing or total is zero.', severity: 'blocking' });
  }

  // ─── Evidence engine gaps ────────────────────────────────────────
  const evidenceStatus = evidenceReport?.status ?? 'insufficient';
  const insufficientEvidence = evidenceReport?.insufficientEvidence ?? [];
  const anticipatedQueries = (evidenceReport?.anticipatedQueries ?? []).map(q => ({
    query: q.query,
    severity: q.severity,
    source: q.source,
    reason: q.reason,
    relatedChallenge: q.relatedChallenge,
  }));
  const policyChecks = evidenceReport?.policyChecks ?? [];

  if (evidenceStatus === 'insufficient' && insufficientEvidence.length > 0) {
    gaps.push({
      field: 'Clinical Evidence',
      reason: `${insufficientEvidence.length} required evidence item(s) are missing: ${insufficientEvidence.slice(0, 3).join('; ')}${insufficientEvidence.length > 3 ? '...' : ''}`,
      severity: 'blocking',
    });
  }

  // ─── Advisory: mandatory documents ──────────────────────────────
  if (evidenceReport?.mandatoryGaps && evidenceReport.mandatoryGaps.length > 0) {
    for (const mg of evidenceReport.mandatoryGaps) {
      if (!gaps.some(g => g.reason === mg)) {
        gaps.push({ field: 'Mandatory Requirement', reason: mg, severity: 'blocking' });
      }
    }
  }

  // ─── Patient compliance (Advisory/Required-for-Complete) ─────────────────
  const requiredFields: Array<{ key: keyof PatientRecord | keyof InsurancePolicyDetails, section: 'patient' | 'insurance', label: string }> = [
    { key: 'dateOfBirth', section: 'patient', label: 'Patient Date of Birth' },
    { key: 'address', section: 'patient', label: 'Patient Address' },
    { key: 'uhid', section: 'patient', label: 'UHID (Hospital ID)' },
    { key: 'proposerName', section: 'insurance', label: 'Proposer Name' },
    { key: 'insuredName', section: 'insurance', label: 'Insured Name' },
  ];

  let hasMissingRequiredComplete = false;
  requiredFields.forEach(f => {
    const val = f.section === 'patient' 
      ? record.patient?.[f.key as keyof PatientRecord] 
      : record.insurance?.[f.key as keyof InsurancePolicyDetails];
    if (!val || String(val).trim() === '') {
      hasMissingRequiredComplete = true;
      gaps.push({
        field: f.label,
        reason: `${f.label} is missing. While not blocking the draft, this is required for a complete cashless submission.`,
        severity: 'advisory'
      });
    }
  });

  if (!record.insurance?.policyNumber) {
    hasMissingRequiredComplete = true;
    gaps.push({ field: 'Policy Number', reason: 'Policy Number is required for complete cashless submission.', severity: 'advisory' });
  }
  if (!record.insurance?.insurerName) {
    hasMissingRequiredComplete = true;
    gaps.push({ field: 'Insurer Name', reason: 'Insurer Name is required for complete cashless submission.', severity: 'advisory' });
  }
  if (!record.insurance?.tpaName) {
    hasMissingRequiredComplete = true;
    gaps.push({ field: 'TPA Name', reason: 'TPA Name is required for complete cashless submission.', severity: 'advisory' });
  }
  if (!record.insurance?.sumInsured) {
    hasMissingRequiredComplete = true;
    gaps.push({ field: 'Sum Insured', reason: 'Sum Insured is required for complete cashless submission.', severity: 'advisory' });
  }

  // ─── Warnings (Internal Consistency Checks) ──────────────────────
  const warnings: string[] = [];

  const cost = record.costEstimate;
  const admission = record.admission;

  if (cost && admission) {
    // 1. Room rent vs (per-day room rate x expected days)
    const expectedRoomDays = cost.expectedRoomDays ?? admission.expectedDaysInRoom ?? 0;
    const roomRentPerDay = cost.roomRentPerDay ?? 0;
    const totalRoomCharges = cost.totalRoomCharges ?? (roomRentPerDay * expectedRoomDays);
    if (Math.abs(totalRoomCharges - (roomRentPerDay * expectedRoomDays)) > 1) {
      warnings.push(`Room Rent mismatch: Stated Room Charges (₹${totalRoomCharges.toLocaleString('en-IN')}) does not equal Daily Room Rent (₹${roomRentPerDay.toLocaleString('en-IN')}) × Expected Ward Days (${expectedRoomDays}).`);
    }

    // 2. ICU Charges vs (per-day ICU rate x expected ICU days)
    const expectedIcuDays = cost.expectedIcuDays ?? admission.expectedDaysInICU ?? 0;
    const icuChargesPerDay = cost.icuChargesPerDay ?? 0;
    const totalIcuCharges = cost.totalIcuCharges ?? (icuChargesPerDay * expectedIcuDays);
    if (Math.abs(totalIcuCharges - (icuChargesPerDay * expectedIcuDays)) > 1) {
      warnings.push(`ICU Charges mismatch: Stated ICU Charges (₹${totalIcuCharges.toLocaleString('en-IN')}) does not equal Daily ICU Rent (₹${icuChargesPerDay.toLocaleString('en-IN')}) × Expected ICU Days (${expectedIcuDays}).`);
    }

    // 3. Nursing charges vs (per-day nursing rate x expected days)
    const nursingChargesPerDay = cost.nursingChargesPerDay ?? 0;
    const totalNursingCharges = cost.totalNursingCharges ?? (nursingChargesPerDay * expectedRoomDays);
    if (Math.abs(totalNursingCharges - (nursingChargesPerDay * expectedRoomDays)) > 1) {
      warnings.push(`Nursing Charges mismatch: Stated Nursing Charges (₹${totalNursingCharges.toLocaleString('en-IN')}) does not equal Daily Nursing Rate (₹${nursingChargesPerDay.toLocaleString('en-IN')}) × Expected Ward Days (${expectedRoomDays}).`);
    }

    // 4. Sum of cost line items vs stated total
    const calculatedSum =
      (cost.totalRoomCharges ?? 0) +
      (cost.totalNursingCharges ?? 0) +
      (cost.totalIcuCharges ?? 0) +
      (cost.otCharges ?? 0) +
      (cost.surgeonFee ?? 0) +
      (cost.anesthetistFee ?? 0) +
      (cost.consultantFee ?? 0) +
      (cost.otherDoctorFees ?? 0) +
      (cost.investigationsEstimate ?? 0) +
      (cost.medicinesEstimate ?? 0) +
      (cost.consumablesEstimate ?? 0) +
      (cost.totalImplantsCost ?? 0) +
      (cost.ambulanceCharges ?? 0) +
      (cost.miscCharges ?? 0);
    if (!cost.isPackageRate && Math.abs((cost.totalEstimatedCost ?? 0) - calculatedSum) > 10) {
      warnings.push(`Total Cost mismatch: Stated Total (₹${(cost.totalEstimatedCost ?? 0).toLocaleString('en-IN')}) does not match the sum of itemized line items (₹${calculatedSum.toLocaleString('en-IN')}).`);
    }

    // 5. Surgical case with ₹0 implants/surgeon/OT -> flag warning
    const isSurgical = record.clinical?.proposedLineOfTreatment?.surgical || false;
    if (isSurgical) {
      const otVal = cost.otCharges ?? 0;
      const surgVal = cost.surgeonFee ?? 0;
      const implVal = cost.totalImplantsCost ?? 0;
      if (otVal === 0 && surgVal === 0 && implVal === 0) {
        warnings.push(`Cost breakdown looks incomplete for a surgical procedure: Surgeon Fee, OT Charges, and Implants Cost are all ₹0.`);
      }
    }
  }

  // 6. Admission date sanity for planned cases
  if (admission?.admissionType === 'Planned' && admission.dateOfAdmission) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (admission.dateOfAdmission < todayStr) {
      warnings.push(`Planned admission date (${admission.dateOfAdmission}) cannot be in the past (today is ${todayStr}).`);
    }
  }

  // ─── Submittability status ───────────────────────────────────────
  const blockingGaps = gaps.filter(g => g.severity === 'blocking');
  const submittabilityStatus: SubmittabilityStatus =
    blockingGaps.length === 0 ? 'complete' : 'pending_documents';

  const isDraftPendingData = hasMissingRequiredComplete || blockingGaps.length > 0;

  // ─── Assemble output ─────────────────────────────────────────────
  const sourceTraceability: Record<string, string> = {
    hospitalName: (record as any).hospitalConfig?.hospitalName ? "Hospital Registration Credentials" : "[TO FILL]",
    rohiniId: (record as any).hospitalConfig?.hospitalRohiniId ? "ROHINI Registry Database" : "[TO FILL]",
    treatingDoctorName: doctorDecl?.doctorName ? "Consultation Doctor Declaration" : "[TO FILL]",
    treatingDoctorRegNo: treatingDoctorRegNo ? "Medical Council of India Registration" : "[TO FILL]",
    patientName: record.patient?.patientName ? "Admission Sheet / ID Proof Page 1" : "[TO FILL]",
    patientAge: record.patient?.age ? "Admission Sheet Page 1" : "[TO FILL]",
    policyNumber: record.insurance?.policyNumber ? "Insurance Card Page 1" : "[TO FILL]",
    insurerName: record.insurance?.insurerName ? "Insurance Policy Page 1" : "[TO FILL]",
    tpaName: record.insurance?.tpaName ? "Medi Assist TPA Portal" : "[TO FILL]",
    diagnosisName: selectedDx?.diagnosis ? "Clinical Admission Summary Page 1" : "[TO FILL]",
    icd: (isValidWho && rawCode) ? "ICD-10 Chapter Code Master" : "[TO FILL]",
    totalEstimatedCost: totalEstimatedCost > 0 ? "Cost Estimate breakdown form" : "[TO FILL]"
  };

  // ─── Assemble output ─────────────────────────────────────────────
  return {
    submittabilityStatus,
    gaps,
    warnings,
    isDraftPendingData,

    // Hospital (populated from HospitalConfig in full integration; placeholder here)
    hospitalName: (record as any).hospitalConfig?.hospitalName ?? '[TO FILL]',
    rohiniId: (record as any).hospitalConfig?.hospitalRohiniId ?? '[TO FILL]',
    nabhAccredited: (record as any).hospitalConfig?.nabhAccredited ?? false,
    nablAccredited: (record as any).hospitalConfig?.nablAccredited ?? false,
    nodalOfficerName: (record as any).hospitalConfig?.nodalOfficerName ?? '[TO FILL]',
    nodalOfficerPhone: (record as any).hospitalConfig?.nodalOfficerPhone ?? '[TO FILL]',

    // Doctor
    treatingDoctorName: doctorDecl?.doctorName ?? '[TO FILL]',
    treatingDoctorQualification: doctorDecl?.doctorQualification ?? '[TO FILL]',
    treatingDoctorRegNo: treatingDoctorRegNo || '[TO FILL]',
    registrationCouncil: doctorDecl?.registrationCouncil ?? '[TO FILL]',

    // Patient & policy
    patientName: (record.patient?.patientName ?? '[TO FILL]') + getCitationForField('patient.patientName', record.patient?.patientName),
    patientAge: record.patient?.age ?? null,
    patientAgeUnit: record.patient?.ageUnit ?? 'years',
    patientGender: record.patient?.gender ?? '[TO FILL]',
    policyNumber: (record.insurance?.policyNumber ?? '[TO FILL]') + getCitationForField('insurance.policyNumber', record.insurance?.policyNumber),
    insurerName: (record.insurance?.insurerName ?? '[TO FILL]') + getCitationForField('insurance.insurerName', record.insurance?.insurerName),
    tpaName: (record.insurance?.tpaName ?? '[TO FILL]') + getCitationForField('insurance.tpaName', record.insurance?.tpaName),

    // Clinical
    icd: {
      ...icd,
      code: icd.code === 'Pending ICD-10' ? icd.code : (icd.code + getCitationForField('clinical.diagnoses.icd10Code', rawCode))
    },
    diagnosisName: (diagnosisName || '[TO FILL]') + getCitationForField('clinical.diagnoses', diagnosisName),
    admissionType: record.admission?.admissionType ?? '[TO FILL]',
    dateOfAdmission: record.admission?.dateOfAdmission ?? '[TO FILL]',
    expectedLos: record.admission?.expectedLengthOfStay ?? 0,
    roomCategory: record.admission?.roomCategory ?? '[TO FILL]',
    lineOfTreatment: getLineOfTreatment(record),
    reasonForHospitalisation: record.clinical?.reasonForHospitalisation ?? '[TO FILL]',
    surgeryName: record.clinical?.surgeryDetails?.nameOfSurgery ?? '[TO FILL]',

    // Cost
    totalEstimatedCost,
    amountClaimedFromInsurer,
    costBreakdown: buildCostBreakdown(record),

    // Evidence
    evidenceStatus,
    insufficientEvidence,
    anticipatedQueries,
    policyChecks,

    // Declarations
    patientConsentGiven,
    doctorDeclarationConfirmed,
    hospitalSealApplied,

    // Suggest & confirm fields (Bucket 2)
    relevantClinicalFindings: (record.clinical?.relevantClinicalFindings || '[TO FILL]') + getCitationForField('clinical.relevantClinicalFindings', record.clinical?.relevantClinicalFindings),
    pastHistory: (record.clinical?.historyOfPresentIllness || '[TO FILL]') + getCitationForField('clinical.historyOfPresentIllness', record.clinical?.historyOfPresentIllness),
    firstConsultationDate: (record.clinical?.firstConsultationDate || '[TO FILL]') + getCitationForField('clinical.firstConsultationDate', record.clinical?.firstConsultationDate),
    isInjury: record.clinical?.injuryDetails?.isInjury,
    alcoholInvolvement: record.clinical?.injuryDetails?.alcoholInvolvement,
    hasOtherHealthPolicy: record.insurance?.hasOtherHealthPolicy,
    familyPhysicianName: (record.patient?.familyPhysicianName || '[TO FILL]') + getCitationForField('patient.familyPhysicianName', record.patient?.familyPhysicianName),

    // Metadata
    generatedAt: new Date().toISOString(),
    formVersion: 'IRDAI-Part-C-v1.0',
    sourceTraceability
  };
}

// ============================================
// HUMAN-READABLE TEXT FORMATTER
// ============================================

/**
 * Renders a PartCOutput as formatted text suitable for display, print, or
 * pasting into the IRDAI pre-auth portal.
 */
export function generatePartCText(partC: PartCOutput): string {
  const sep = '─'.repeat(60);
  const lines: string[] = [];

  const draftWatermark = '*** DRAFT — PENDING DATA (NOT FOR SUBMISSION) ***';

  if (partC.isDraftPendingData) {
    lines.push(sep);
    lines.push(draftWatermark.padStart(draftWatermark.length + Math.round((60 - draftWatermark.length) / 2)));
    lines.push(sep);
    lines.push('');
  }

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║         IRDAI CASHLESS PRE-AUTHORIZATION — PART C            ║');
  lines.push('║              (Hospital / Treating Physician Section)          ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Status badge
  const statusLabel = partC.submittabilityStatus === 'complete'
    ? '✅ READY FOR SUBMISSION — All mandatory fields complete'
    : `⚠️  PENDING DOCUMENTS — ${partC.gaps.filter(g => g.severity === 'blocking').length} blocking issue(s) must be resolved`;
  lines.push(statusLabel);
  lines.push('');

  // Hospital
  lines.push(sep);
  lines.push('SECTION 1 — HOSPITAL DETAILS');
  lines.push(sep);
  lines.push(`Hospital Name       : ${partC.hospitalName}`);
  lines.push(`Rohini ID           : ${partC.rohiniId || 'Not configured'}`);
  lines.push(`NABH Accredited     : ${partC.nabhAccredited ? 'Yes' : 'No'}`);
  lines.push(`NABL Accredited     : ${partC.nablAccredited ? 'Yes' : 'No'}`);
  lines.push(`Nodal Officer       : ${partC.nodalOfficerName} | ${partC.nodalOfficerPhone}`);
  lines.push('');

  // Doctor
  lines.push(sep);
  lines.push('SECTION 2 — TREATING DOCTOR');
  lines.push(sep);
  lines.push(`Name                : ${partC.treatingDoctorName}`);
  lines.push(`Qualification       : ${partC.treatingDoctorQualification}`);
  lines.push(`Reg. No. (SMC/MCI)  : ${partC.treatingDoctorRegNo || '⛔ MISSING — Required'}`);
  lines.push(`Registration Council: ${partC.registrationCouncil}`);
  lines.push(`Declaration Status  : ${partC.doctorDeclarationConfirmed ? '✅ Confirmed' : '⛔ Not Confirmed'}`);
  lines.push('');

  // Patient & Policy
  lines.push(sep);
  lines.push('SECTION 3 — PATIENT & POLICY');
  lines.push(sep);
  lines.push(`Patient Name        : ${partC.patientName}`);
  lines.push(`Age / Gender        : ${partC.patientAge !== null && partC.patientAge !== undefined ? `${partC.patientAge}${partC.patientAgeUnit === 'months' ? 'M' : 'Y'}` : '—'} / ${partC.patientGender}`);
  lines.push(`Policy Number       : ${partC.policyNumber}`);
  lines.push(`Insurer             : ${partC.insurerName}`);
  lines.push(`TPA                 : ${partC.tpaName}`);
  lines.push(`Patient Consent     : ${partC.patientConsentGiven ? '✅ Obtained' : '⛔ MISSING'}`);
  lines.push(`Other Health Policy : ${partC.hasOtherHealthPolicy === true ? 'Yes' : partC.hasOtherHealthPolicy === false ? 'No' : '—'}`);
  lines.push(`Family Physician    : ${partC.familyPhysicianName || '—'}`);
  lines.push('');

  // Past History & Relevant Findings
  lines.push(sep);
  lines.push('SECTION 4 — ADDITIONAL CLINICAL HISTORY');
  lines.push(sep);
  lines.push(`1st Consultation Dt : ${partC.firstConsultationDate || '—'}`);
  lines.push(`Past History        : ${partC.pastHistory || '—'}`);
  lines.push(`Relevant Findings   : ${partC.relevantClinicalFindings || '—'}`);
  lines.push(`Is Injury?          : ${partC.isInjury === true ? 'Yes' : partC.isInjury === false ? 'No' : '—'}`);
  if (partC.isInjury) {
    lines.push(`Alcohol Involved?   : ${partC.alcoholInvolvement === true ? 'Yes' : partC.alcoholInvolvement === false ? 'No' : '—'}`);
  }
  lines.push('');

  // Clinical & ICD
  lines.push(sep);
  lines.push('SECTION 5 — CLINICAL DETAILS');
  lines.push(sep);
  lines.push(`Provisional Diagnosis: ${partC.diagnosisName}`);
  lines.push(`ICD-10 Code          : ${partC.icd.code} — ${partC.icd.description}`);
  lines.push(`WHO Validation       : ${partC.icd.isValidWho ? '✅ Valid WHO ICD-10' : '⛔ INVALID — Must be corrected'}`);
  lines.push(`Admission Type       : ${partC.admissionType}`);
  lines.push(`Date of Admission    : ${partC.dateOfAdmission}`);
  lines.push(`Expected LOS         : ${partC.expectedLos} day(s)`);
  lines.push(`Room Category        : ${partC.roomCategory}`);
  lines.push(`Line of Treatment    : ${partC.lineOfTreatment.join(', ')}`);
  lines.push(`Reason for Admission : ${partC.reasonForHospitalisation}`);
  if (partC.surgeryName) lines.push(`Planned Surgery      : ${partC.surgeryName}`);
  lines.push('');

  // Evidence
  lines.push(sep);
  lines.push('SECTION 6 — TPA EVIDENCE SUFFICIENCY');
  lines.push(sep);
  const evLabel = partC.evidenceStatus === 'sufficient' ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT';
  lines.push(`Evidence Status     : ${evLabel}`);
  if (partC.insufficientEvidence.length > 0) {
    lines.push('Missing Evidence:');
    partC.insufficientEvidence.forEach(e => lines.push(`  • ${e}`));
  }
  
  const rules = partC.anticipatedQueries.filter(q => q.source === 'rule');
  const suggestions = partC.anticipatedQueries.filter(q => q.source === 'suggestion');

  if (rules.length > 0) {
    lines.push('');
    lines.push('REQUIRED TPA JUSTIFICATIONS (Deterministic Rules):');
    rules.forEach(q => {
      lines.push(`  • [Required for ${partC.diagnosisName} per "${q.reason}"]`);
      lines.push(`    Action Needed: ${q.query}`);
    });
  }

  if (suggestions.length > 0) {
    lines.push('');
    lines.push('CLINICAL EVIDENCE SUGGESTIONS (Model-Suggested Observations):');
    suggestions.forEach(q => {
      lines.push(`  • [Possible gap — review]`);
      lines.push(`    Observation: ${q.query}`);
    });
  }

  if (partC.policyChecks && partC.policyChecks.length > 0) {
    lines.push('');
    lines.push('POLICY VERIFICATIONS NEEDED (Desk Checklist):');
    partC.policyChecks.forEach(pc => {
      lines.push(`  • [Policy check needed (not verifiable from clinical data)]: ${pc}`);
    });
  }
  lines.push('');

  // Cost
  lines.push(sep);
  lines.push('SECTION 7 — COST ESTIMATE');
  lines.push(sep);
  Object.entries(partC.costBreakdown).forEach(([label, amount]) => {
    if (amount > 0) lines.push(`  ${label.padEnd(22)}: ₹${amount.toLocaleString('en-IN')}`);
  });
  lines.push(`  ${'─'.repeat(36)}`);
  lines.push(`  ${'Total Estimated'.padEnd(22)}: ₹${partC.totalEstimatedCost.toLocaleString('en-IN')}`);
  lines.push(`  ${'Claimed from Insurer'.padEnd(22)}: ₹${partC.amountClaimedFromInsurer.toLocaleString('en-IN')}`);
  lines.push('');

  // Declarations
  lines.push(sep);
  lines.push('SECTION 8 — DECLARATIONS');
  lines.push(sep);
  lines.push(`Doctor Declaration  : ${partC.doctorDeclarationConfirmed ? '✅ Confirmed' : '⛔ Pending'}`);
  lines.push(`Patient Consent     : ${partC.patientConsentGiven ? '✅ Obtained' : '⛔ Pending'}`);
  lines.push(`Hospital Seal       : ${partC.hospitalSealApplied ? '✅ Applied' : '⛔ Pending'}`);
  lines.push('');

  // Gaps summary
  if (partC.gaps.length > 0) {
    lines.push(sep);
    lines.push(`PENDING ITEMS (${partC.gaps.length} total)`);
    lines.push(sep);
    partC.gaps.forEach((g, i) => {
      lines.push(`${String(i + 1).padStart(2, ' ')}. [${g.severity === 'blocking' ? '⛔ BLOCKING' : '⚠️  ADVISORY'}] ${g.field}: ${g.reason}`);
    });
    lines.push('');
  }

  // Warnings (Consistency Checks)
  if (partC.warnings && partC.warnings.length > 0) {
    lines.push(sep);
    lines.push('SECTION 9 — INTERNAL CONSISTENCY WARNINGS');
    lines.push(sep);
    partC.warnings.forEach(w => lines.push(`⚠️  ${w}`));
    lines.push('');
  }

  // Footer
  lines.push(sep);
  lines.push(`Generated by Aivana™ | Form Version: ${partC.formVersion}`);
  lines.push(`Generated at: ${new Date(partC.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  lines.push(sep);

  if (partC.isDraftPendingData) {
    lines.push('');
    lines.push(sep);
    lines.push(draftWatermark.padStart(draftWatermark.length + Math.round((60 - draftWatermark.length) / 2)));
    lines.push(sep);
  }

  return lines.join('\n');
}

