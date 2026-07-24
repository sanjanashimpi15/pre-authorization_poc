// ============================================================================
// PRE-AUTH DOCUMENT GENERATOR — With ICD Cost Database Integration
// ============================================================================

import { calculateCost, findConditionByICD, CostEstimateResult } from './costEstimationService';
import { calculateTotals } from '../utils/costCalculator';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface PreAuthInput {
    patient: {
        name: string;
        age: number;
        gender: 'Male' | 'Female' | 'Other';
        dob?: string;
        address?: string;
        phone?: string;
        uhid?: string;
        abha_id?: string;
    };
    insurance: {
        policy_number: string;
        insurance_company: string;
        tpa_name: string;
        tpa_card_no?: string;
        sum_insured?: number;
        policy_type?: string;
        is_pmjay: boolean;
    };
    clinical: {
        chief_complaints: string;
        duration: string;
        clinical_findings: string;
        diagnosis: string;
        icd_code: string;
        is_surgical: boolean;
        vitals: {
            bp: string;
            pulse: number;
            temp: number;
            spo2: number;
            rr: number;
        };
        medical_necessity_statement: string;
        proposed_treatment: string[];
    };
    admission: {
        date: string;
        time: string;
        type: 'Emergency' | 'Planned';
        room_category: 'General Ward' | 'Semi-Private' | 'Private' | 'ICU';
    };
    hospital: {
        name: string;
        address: string;
        rohini_id?: string;
    };
    doctor: {
        name: string;
        registration_no: string;
        specialty: string;
    };
}

export interface PreAuthDocument {
    ref_no: string;
    generated_at: string;
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
    patient_details: {
        name: string;
        age: number;
        gender: string;
        dob: string;
        address: string;
        phone: string;
        uhid: string;
        abha_id: string;
    };
    insurance_details: {
        insurance_company: string;
        tpa_name: string;
        tpa_card_no: string;
        policy_number: string;
        policy_type: string;
        sum_insured: number;
        is_pmjay: boolean;
    };
    clinical_details: {
        chief_complaints: string;
        duration: string;
        nature_of_illness: string;
        clinical_findings: string;
        provisional_diagnosis: string;
        icd_code: string;
        icd_description: string;
        vitals: {
            bp: string;
            pulse: number;
            temp: number;
            spo2: number;
            rr: number;
        };
        treatment_type: {
            medical: boolean;
            surgical: boolean;
            icu: boolean;
            investigation: boolean;
        };
        medical_necessity: string;
        proposed_treatment: string[];
    };
    admission_details: {
        date: string;
        time: string;
        type: string;
        room_category: string;
        expected_los: {
            total: number;
            ward: number;
            icu: number;
        };
    };
    cost_estimate: {
        source: 'PMJAY' | 'Private';
        pmjay_package: {
            hbp_code: string;
            package_name: string;
            package_rate: number;
        } | null;
        breakdown: {
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
        };
        total_estimated: number;
        claimed_amount: number;
    };
    declarations: {
        doctor: {
            name: string;
            registration: string;
            confirmed: boolean;
        };
        patient_consent: boolean;
        hospital_signatory: {
            name: string;
            designation: string;
        };
    };
}

// -----------------------------------------------------------------------------
// GENERATE PRE-AUTH DOCUMENT
// -----------------------------------------------------------------------------

export function generatePreAuthDocument(input: PreAuthInput): PreAuthDocument {
    const refNo = `PA-AIVANA-${formatDate(new Date())}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // Look up condition in cost database
    const condition = findConditionByICD(input.clinical.icd_code);

    // Calculate costs from ICD cost database
    const costEstimate: CostEstimateResult = calculateCost(
        input.clinical.icd_code,
        input.admission.room_category,
        input.insurance.is_pmjay,
    );

    return {
        ref_no: refNo,
        generated_at: new Date().toISOString(),
        status: 'DRAFT',

        insurance_details: {
            insurance_company: input.insurance.insurance_company || 'N/A',
            tpa_name: input.insurance.tpa_name || 'N/A',
            tpa_card_no: input.insurance.tpa_card_no || 'N/A',
            policy_number: input.insurance.policy_number || 'N/A',
            policy_type: input.insurance.policy_type || 'N/A',
            sum_insured: input.insurance.sum_insured || 0,
            is_pmjay: input.insurance.is_pmjay,
        },

        patient_details: {
            name: input.patient.name || 'N/A',
            age: input.patient.age,
            gender: input.patient.gender,
            dob: input.patient.dob || 'N/A',
            address: input.patient.address || 'N/A',
            phone: input.patient.phone || 'N/A',
            uhid: input.patient.uhid || 'N/A',
            abha_id: input.patient.abha_id || 'N/A',
        },

        clinical_details: {
            chief_complaints: input.clinical.chief_complaints,
            duration: input.clinical.duration,
            nature_of_illness: 'Acute',
            clinical_findings: input.clinical.clinical_findings,
            provisional_diagnosis: input.clinical.diagnosis,
            icd_code: input.clinical.icd_code,
            icd_description: condition?.condition || input.clinical.diagnosis,
            vitals: input.clinical.vitals,
            treatment_type: {
                medical: !input.clinical.is_surgical,
                surgical: input.clinical.is_surgical,
                icu: costEstimate.los.icu_days > 0,
                investigation: true,
            },
            medical_necessity: input.clinical.medical_necessity_statement,
            proposed_treatment: input.clinical.proposed_treatment,
        },

        admission_details: {
            date: input.admission.date,
            time: input.admission.time,
            type: input.admission.type,
            room_category: input.admission.room_category,
            expected_los: {
                total: costEstimate.los.total_days,
                ward: costEstimate.los.ward_days,
                icu: costEstimate.los.icu_days,
            },
        },

        cost_estimate: {
            source: costEstimate.source,
            pmjay_package: costEstimate.pmjay_details ?? null,
            breakdown: costEstimate.breakdown,
            total_estimated: costEstimate.total_estimated,
            claimed_amount: costEstimate.claimed_amount,
        },

        declarations: {
            doctor: {
                name: input.doctor.name || 'N/A',
                registration: input.doctor.registration_no || 'N/A',
                confirmed: false,
            },
            patient_consent: false,
            hospital_signatory: {
                name: 'N/A',
                designation: 'N/A',
            },
        },
    };
}

// -----------------------------------------------------------------------------
// HELPER
// -----------------------------------------------------------------------------

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
}

// -----------------------------------------------------------------------------
// 9-PAGE PRE-AUTH HTML GENERATOR (Full Part C Template without score or gaps)
// -----------------------------------------------------------------------------

export function generateFull9PagePreAuthHtml(record: any): string {
    const patient = record.patient ?? {};
    const ins = record.insurance ?? {};
    const clinical = record.clinical ?? {};
    const admission = record.admission ?? {};
    const cost = record.costEstimate ?? {};
    const declDoctor = record.declarations?.doctor ?? {};
    const declHospital = record.declarations?.hospital ?? {};
    const selectedDx = clinical.diagnoses?.[clinical.selectedDiagnosisIndex ?? 0];

    const escapeHtml = (v: any): string => {
        if (v === null || v === undefined || String(v).trim() === '') return '—';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    const renderValue = (val: string | number | null | undefined, emptyLabel: string = '—') => {
        if (val === null || val === undefined || String(val).trim() === '') {
            return `<span class="field-value empty">${emptyLabel}</span>`;
        }
        return `<span class="field-value">${escapeHtml(val)}</span>`;
    };

    const costTotals = calculateTotals({
        roomRentPerDay: cost.roomRentPerDay,
        expectedRoomDays: cost.expectedRoomDays,
        nursingChargesPerDay: cost.nursingChargesPerDay,
        icuChargesPerDay: cost.icuChargesPerDay,
        expectedIcuDays: cost.expectedIcuDays,
        otCharges: cost.otCharges,
        surgeonFee: cost.surgeonFee,
        anesthetistFee: cost.anesthetistFee,
        consultantFee: cost.consultantFee,
        investigationsEstimate: cost.investigationsEstimate,
        medicinesEstimate: cost.medicinesEstimate,
        consumablesEstimate: cost.consumablesEstimate,
        ambulanceCharges: cost.ambulanceCharges,
        miscCharges: cost.miscCharges,
        packageName: cost.packageName,
        isPackageRate: cost.isPackageRate,
        packageAmount: cost.packageAmount
    }, ins.sumInsured ?? 0);

    const activeLine = clinical.proposedLineOfTreatment?.surgical ? 'surgical'
        : clinical.proposedLineOfTreatment?.intensiveCare ? 'icu'
        : clinical.proposedLineOfTreatment?.investigation ? 'investigation'
        : clinical.proposedLineOfTreatment?.nonAllopathic ? 'nonAllopathic'
        : 'medical';

    const lineOfTreatmentText = [
        clinical.proposedLineOfTreatment?.medical ? 'Medical Management' : null,
        clinical.proposedLineOfTreatment?.surgical ? 'Surgical Management' : null,
        clinical.proposedLineOfTreatment?.intensiveCare ? 'Intensive Care' : null,
        clinical.proposedLineOfTreatment?.investigation ? 'Investigation' : null,
        clinical.proposedLineOfTreatment?.nonAllopathic ? 'Non-allopathic Treatment' : null,
    ].filter(Boolean).join(', ') || 'Medical Management';

    const surgicalBlock = (activeLine === 'surgical' || clinical.surgeryDetails) ? `
    <tr>
      <td class="field-label">&nbsp;&nbsp;&nbsp;i. Surgery / Procedure Name</td>
      <td>${renderValue(clinical.surgeryDetails?.nameOfSurgery)}</td>
    </tr>
    <tr>
      <td class="field-label">&nbsp;&nbsp;&nbsp;ii. Surgery ICD-10-PCS Code</td>
      <td>${renderValue(clinical.surgeryDetails?.surgeryIcdCode)}</td>
    </tr>` : '';

    const injuryBlock = clinical.injuryDetails?.isInjury ? `
    <tr>
      <td class="field-label">&nbsp;&nbsp;&nbsp;i. Injury / Accident Date &amp; Cause</td>
      <td>${renderValue(clinical.injuryDetails?.dateOfInjury)} &bull; ${renderValue(clinical.injuryDetails?.causeOfInjury)}</td>
    </tr>
    <tr>
      <td class="field-label">&nbsp;&nbsp;&nbsp;ii. Medico-Legal Case (MLC)</td>
      <td><span class="field-value">${clinical.injuryDetails?.isMLC ? 'Yes' : 'No'}</span></td>
    </tr>` : '';

    const maternityBlock = clinical.maternityDetails?.isMaternity ? `
    <tr>
      <td class="field-label">&nbsp;&nbsp;&nbsp;i. Maternity Expected Delivery Date</td>
      <td>${renderValue(clinical.maternityDetails?.edd)}</td>
    </tr>
    <tr>
      <td class="field-label">&nbsp;&nbsp;&nbsp;ii. Gravida / Para Status</td>
      <td><span class="field-value">G: ${clinical.maternityDetails?.gravida ?? '—'} / P: ${clinical.maternityDetails?.para ?? '—'}</span></td>
    </tr>` : '';

    const pmh = admission.pastMedicalHistory ?? {};
    const pastIllnesses = [
        pmh.diabetes?.present ? `Diabetes (${pmh.diabetes.duration || 'duration N/A'})` : null,
        pmh.hypertension?.present ? `Hypertension (${pmh.hypertension.duration || 'duration N/A'})` : null,
        pmh.heartDisease?.present ? `Heart Disease` : null,
        pmh.asthma?.present ? `Asthma` : null,
        pmh.epilepsy?.present ? `Epilepsy` : null,
        pmh.cancer?.present ? `Cancer` : null,
        pmh.kidney?.present ? `Kidney Disease` : null,
        pmh.liver?.present ? `Liver Disease` : null,
        pmh.hiv?.present ? `HIV / STD` : null,
        pmh.alcoholism?.present ? `Alcoholism` : null,
        pmh.smoking?.present ? `Smoking` : null,
        pmh.anyOther?.present ? (pmh.anyOther.details || 'Other past illness') : null,
    ].filter(Boolean).join(', ');

    const caseIdDisplay = record.id ? escapeHtml(record.id) : `PA-AIVANA-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-0000`;
    const nowDisplay = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Pre-Authorization Summary — Part C Full Format — ${caseIdDisplay}</title>
<style>
  @page {
    size: A4;
    margin: 16mm 14mm 16mm 14mm;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 9px;
      color: #666;
    }
  }
  * { box-sizing: border-box; }
  html, body {
    background-color: #ffffff !important;
    color: #1a1a1a !important;
    font-family: "Times New Roman", Georgia, serif !important;
    font-size: 10.5px !important;
    line-height: 1.45 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .page-break { page-break-before: always !important; break-before: page !important; }
  .doc-title { text-align: center; margin-bottom: 4px; }
  .doc-title h1 { font-size: 13px; text-decoration: underline; margin: 0 0 2px 0; }
  .doc-title h2 { font-size: 11.5px; text-decoration: underline; margin: 0; }
  .doc-title .note { font-size: 9px; font-style: italic; margin-top: 3px; }
  .case-meta {
    display: flex; justify-content: space-between; font-size: 9px; color: #444;
    border-bottom: 1px solid #999; padding-bottom: 4px; margin: 6px 0 12px 0;
  }
  .section { margin-bottom: 12px; break-inside: avoid; }
  .section-title { font-size: 11px; font-weight: bold; text-decoration: underline; margin-bottom: 6px; }
  .section-subtitle { font-size: 10.5px; font-weight: bold; text-decoration: underline; text-align: center; margin: 4px 0 10px 0; }
  table.field-table { width: 100%; border-collapse: collapse; }
  table.field-table td { padding: 3px 6px; vertical-align: top; border-bottom: 1px dotted #ccc; }
  .field-label { width: 42%; color: #333; }
  .field-value { font-weight: 600; border-bottom: 1px solid #333; min-height: 14px; display: inline-block; width: 100%; }
  .field-value.empty { color: #999; font-weight: normal; font-style: italic; border-bottom: none; }
  .field-value.pending { color: #999; font-weight: normal; border-bottom: none; }
  .checkbox { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; }
  .checkbox .box { width: 11px; height: 11px; border: 1px solid #333; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: bold; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
  .treatment-list { list-style: none; padding: 0; margin: 4px 0 0 0; }
  .treatment-list li { display: flex; align-items: center; gap: 6px; padding: 2px 0; font-size: 10px; }
  .cost-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .cost-table td { padding: 3px 6px; font-size: 10px; border-bottom: 1px dotted #ccc; }
  .cost-table td.amount { text-align: right; font-weight: 600; width: 110px; }
  .cost-table tr.total td { border-top: 1.5px solid #333; border-bottom: none; font-weight: bold; padding-top: 6px; }
  .legal-list { list-style: none; padding: 0; margin: 6px 0; }
  .legal-list li { display: flex; gap: 6px; font-size: 9.5px; margin-bottom: 7px; text-align: justify; }
  .legal-list li .letter { font-weight: bold; min-width: 14px; }
  .sign-row { display: flex; justify-content: space-between; margin-top: 30px; }
  .sign-box { width: 44%; }
  .sign-box .box-outline { border: 1px solid #333; height: 55px; margin-bottom: 4px; }
  .sign-box .label { font-size: 9.5px; text-align: center; }
  .info-table { width: 100%; border-collapse: collapse; border: 1px solid #999; margin-top: 6px; }
  .info-table td { border: 1px solid #999; padding: 4px 6px; font-size: 9.5px; vertical-align: top; }
  .info-table td.k { color: #444; width: 42%; }
  .auth-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .auth-table th, .auth-table td { border: 1px solid #999; padding: 4px 6px; font-size: 9px; text-align: left; }
  .auth-table th { background: #e8e8e8; }
  .terms-list { list-style: decimal; padding-left: 18px; margin: 6px 0; }
  .terms-list li { font-size: 9.5px; margin-bottom: 6px; text-align: justify; }
  .page-num { text-align: center; font-size: 9px; color: #888; margin-top: 4px; }
</style>
</head>
<body>

<!-- ================= PAGE 1: TITLE + SECTION A + SECTION B ================= -->
<div class="doc-title">
  <h1>Request for Cashless Hospitalisation for Health Insurance</h1>
  <h2>Policy Part &ndash; C (Revised) &mdash; Pre-Authorization Summary</h2>
  <div class="note">Generated from extracted case data &mdash; structurally mapped to Pre-Auth Part C (Revised)</div>
</div>
<div class="case-meta">
  <span>Case ID: ${caseIdDisplay}</span>
  <span>Generated: ${nowDisplay}</span>
</div>

<div class="section">
  <div class="section-title">Details of the Third Party Administrator / Insurer / Hospital</div>
  <table class="field-table">
    <tr><td class="field-label">a. Name of TPA / Insurance Company</td><td>${renderValue(ins.insurerName || ins.tpaName)}</td></tr>
    <tr><td class="field-label">b. Toll Free Phone Number</td><td><span class="field-value empty">&mdash;</span></td></tr>
    <tr><td class="field-label">c. Toll Free Fax</td><td><span class="field-value empty">&mdash;</span></td></tr>
    <tr><td class="field-label">d. Name of Hospital</td><td>${renderValue(declHospital.authorizedSignatoryName ? `${declHospital.authorizedSignatoryName} Hospital` : 'Apex Hospital, Kamareddy')}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;i. Address</td><td>${renderValue(patient.city ? `${patient.city}, ${patient.state || ''}` : null)}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;ii. Rohini ID</td><td><span class="field-value empty">&mdash;</span></td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;iii. E-mail ID</td><td>${renderValue(patient.email)}</td></tr>
  </table>
</div>

<div class="section-subtitle">To Be Filled By Insured / Patient</div>
<div class="section">
  <table class="field-table">
    <tr><td class="field-label">A. Name of the Patient</td><td>${renderValue(patient.patientName)}</td></tr>
    <tr><td class="field-label">B. Gender</td><td>${renderValue(patient.gender)}</td></tr>
    <tr><td class="field-label">C. Age</td><td>${renderValue(patient.age ? `${patient.age} Years` : null)}</td></tr>
    <tr><td class="field-label">D. Date of Birth</td><td>${renderValue(patient.dateOfBirth, 'Not confirmed')}</td></tr>
    <tr><td class="field-label">E. Contact Number</td><td>${renderValue(patient.mobileNumber || patient.contactNumber)}</td></tr>
    <tr><td class="field-label">F. Contact Number of Attending Relative</td><td><span class="field-value empty">&mdash;</span></td></tr>
    <tr><td class="field-label">G. Insured Card ID Number</td><td>${renderValue(ins.tpaIdCardNumber || ins.policyNumber)}</td></tr>
    <tr><td class="field-label">H. Policy Number / Name of Corporate</td><td>${renderValue(ins.policyNumber || ins.corporateName)}</td></tr>
    <tr><td class="field-label">I. Employee ID</td><td>${renderValue(ins.employeeId, 'Not applicable')}</td></tr>
    <tr><td class="field-label">J. Other Mediclaim / Health Insurance</td><td>${renderValue(ins.hasOtherHealthPolicy ? (ins.otherPolicyDetails || 'Yes') : null, 'Not disclosed')}</td></tr>
    <tr><td class="field-label">K. Family Physician</td><td>${renderValue(patient.familyPhysicianName ? 'Yes' : null, 'Not disclosed')}</td></tr>
    <tr><td class="field-label">L. Name of Family Physician</td><td>${renderValue(patient.familyPhysicianName)}</td></tr>
    <tr><td class="field-label">M. Contact Number</td><td><span class="field-value empty">&mdash;</span></td></tr>
    <tr><td class="field-label">N. Current Address of Insured Patient</td><td>${renderValue([patient.address, patient.city, patient.state, patient.pincode].filter(Boolean).join(', '))}</td></tr>
    <tr><td class="field-label">O. Occupation of Insured Patient</td><td>${renderValue(patient.occupation)}</td></tr>
  </table>
</div>
<div class="page-num">Page 1 of 9</div>

<!-- ================= PAGE 2: SECTION C — CLINICAL ================= -->
<div class="page-break">
<div class="section-subtitle">To Be Filled By Treating Doctor / Hospital</div>
<div class="section">
  <table class="field-table">
    <tr><td class="field-label">A. Name of the Treating Doctor</td><td>${renderValue(declDoctor.doctorName)}</td></tr>
    <tr><td class="field-label">B. Contact Number</td><td>${renderValue(declDoctor.registrationCouncil ? `Reg: ${declDoctor.doctorRegistrationNumber}` : null)}</td></tr>
    <tr><td class="field-label">C. Nature of Illness / Presenting Complaint</td><td>${renderValue(clinical.natureOfIllness ? `${clinical.natureOfIllness} — ${clinical.chiefComplaints || ''}` : clinical.chiefComplaints)}</td></tr>
    <tr><td class="field-label">D. Relevant Critical Findings</td><td>${renderValue(clinical.relevantClinicalFindings)}</td></tr>
    <tr><td class="field-label">E. Duration of Present Ailment</td><td>${renderValue(clinical.durationOfPresentAilment)}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;i. Date of First Consultation</td><td>${renderValue(clinical.firstConsultationDate)}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;ii. Past History of Present Ailment</td><td>${renderValue(clinical.historyOfPresentIllness || clinical.treatmentTakenSoFar)}</td></tr>
    <tr><td class="field-label">F. Provisional Diagnosis</td><td>${renderValue(selectedDx?.diagnosis || clinical.chiefComplaints)}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;i. ICD-10 Code</td><td>${renderValue(selectedDx?.icd10Code ? `${selectedDx.icd10Code} — ${selectedDx.icd10Description || ''}` : null, 'Pending confirmation')}</td></tr>
    ${surgicalBlock}
    ${injuryBlock}
    ${maternityBlock}
  </table>

  <div style="margin-top:6px; font-size:10px;"><strong>G. Proposed Line of Treatment</strong></div>
  <ul class="treatment-list">
    <li><span class="checkbox"><span class="box">${activeLine === 'medical' ? 'X' : ''}</span> Medical Management</span></li>
    <li><span class="checkbox"><span class="box">${activeLine === 'surgical' ? 'X' : ''}</span> Surgical Management</span></li>
    <li><span class="checkbox"><span class="box">${activeLine === 'icu' ? 'X' : ''}</span> Intensive Care</span></li>
    <li><span class="checkbox"><span class="box">${activeLine === 'investigation' ? 'X' : ''}</span> Investigation</span></li>
    <li><span class="checkbox"><span class="box">${activeLine === 'nonAllopathic' ? 'X' : ''}</span> Non-allopathic Treatment</span></li>
  </ul>

  <table class="field-table" style="margin-top:8px;">
    <tr><td class="field-label">H. Investigation / Medical Management Details</td><td>${renderValue(clinical.additionalClinicalNotes || clinical.reasonForHospitalisation)}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;i. Route of Drug Administration</td><td><span class="field-value">Oral / IV fluids as needed</span></td></tr>
  </table>
</div>
<div class="page-num">Page 2 of 9</div>
</div>

<!-- ================= PAGE 3: SECTION D — ADMISSION & COST ================= -->
<div class="page-break">
<div class="section-subtitle">Details of Patient Admitted</div>
<div class="section">
  <div class="two-col">
    <table class="field-table">
      <tr><td class="field-label">A. Date of Admission</td><td>${renderValue(admission.dateOfAdmission)}</td></tr>
      <tr><td class="field-label">B. Time of Admission</td><td>${renderValue(admission.timeOfAdmission)}</td></tr>
      <tr><td class="field-label">C. Emergency / Planned</td><td>${renderValue(admission.admissionType)}</td></tr>
      <tr><td class="field-label">E. Expected Length of Stay</td><td>${renderValue(admission.expectedLengthOfStay ? `${admission.expectedLengthOfStay} Days` : null)}</td></tr>
    </table>
    <table class="field-table">
      <tr><td class="field-label">G. Room Type</td><td>${renderValue(admission.roomCategory)}</td></tr>
      <tr><td class="field-label">F. Days in ICU</td><td>${renderValue(admission.expectedDaysInICU ? `${admission.expectedDaysInICU} Days` : null, 'Not applicable')}</td></tr>
    </table>
  </div>

  <div style="margin-top:6px; font-size:10px;"><strong>D. Mandatory Past History of Chronic Illness</strong></div>
  <div class="field-value ${pastIllnesses ? '' : 'empty'}" style="border:none; margin-top:2px;">${pastIllnesses || 'None reported'}</div>

  <table class="cost-table" style="margin-top:10px;">
    <tr><td>H. Room Rent / day (incl. nursing &amp; service charges)</td><td class="amount">${cost.roomRentPerDay ? `₹ ${Number(cost.roomRentPerDay).toLocaleString('en-IN')}` : '<span class="field-value empty">&mdash;</span>'}</td></tr>
    <tr><td>I. Investigation / Diagnostic Cost</td><td class="amount">${cost.investigationsEstimate ? `₹ ${Number(cost.investigationsEstimate).toLocaleString('en-IN')}` : '<span class="field-value empty">&mdash;</span>'}</td></tr>
    <tr><td>J. ICU Charges</td><td class="amount">${cost.icuChargesPerDay ? `₹ ${Number(cost.icuChargesPerDay).toLocaleString('en-IN')}/day` : '<span class="field-value pending">Not applicable</span>'}</td></tr>
    <tr><td>K. OT Charges</td><td class="amount">${cost.otCharges ? `₹ ${Number(cost.otCharges).toLocaleString('en-IN')}` : '<span class="field-value pending">Not applicable</span>'}</td></tr>
    <tr><td>L. Professional Fees (Surgeon / Anaesthetist / Consultation)</td><td class="amount">${(cost.surgeonFee || cost.consultantFee) ? `₹ ${((cost.surgeonFee ?? 0) + (cost.consultantFee ?? 0) + (cost.anesthetistFee ?? 0)).toLocaleString('en-IN')}` : '<span class="field-value empty">&mdash;</span>'}</td></tr>
    <tr><td>M. Medicines / Consumables / Implants</td><td class="amount">${(cost.medicinesEstimate || cost.consumablesEstimate) ? `₹ ${((cost.medicinesEstimate ?? 0) + (cost.consumablesEstimate ?? 0)).toLocaleString('en-IN')}` : '<span class="field-value empty">&mdash;</span>'}</td></tr>
    <tr><td>N. Other Hospital Expenses</td><td class="amount">${cost.miscCharges ? `₹ ${Number(cost.miscCharges).toLocaleString('en-IN')}` : '<span class="field-value empty">&mdash;</span>'}</td></tr>
    <tr><td>O. All-inclusive Package Charges</td><td class="amount">${cost.packageAmount ? `₹ ${Number(cost.packageAmount).toLocaleString('en-IN')}` : '<span class="field-value pending">Not applicable</span>'}</td></tr>
    <tr class="total"><td>P. Sum Total Expected Cost of Hospitalization</td><td class="amount">₹ ${costTotals.totalEstimatedCost.toLocaleString('en-IN')}</td></tr>
  </table>
</div>
<div class="page-num">Page 3 of 9</div>
</div>

<!-- ================= PAGE 4: SECTION E — DECLARATION (DOCTOR) ================= -->
<div class="page-break">
<div class="section-subtitle">Declaration<br><span style="font-size:9px; font-weight:normal;">(Please read very carefully)</span></div>
<div class="section" style="font-size:9.5px;">
  We confirm having read, understood and agreed to the declarations of this form.
  <table class="field-table" style="margin-top:8px;">
    <tr><td class="field-label">a. Name of the Treating Doctor</td><td>${renderValue(declDoctor.doctorName)}</td></tr>
    <tr><td class="field-label">b. Qualification</td><td>${renderValue(declDoctor.doctorQualification)}</td></tr>
    <tr><td class="field-label">c. Registration Number with State Code</td><td>${renderValue(declDoctor.doctorRegistrationNumber)}</td></tr>
  </table>

  <div class="sign-row">
    <div class="sign-box">
      <div class="box-outline"></div>
      <div class="label">Hospital Seal (Must include Hospital ID)</div>
    </div>
    <div class="sign-box">
      <div class="box-outline"></div>
      <div class="label">Patient / Insured Name and Sign</div>
    </div>
  </div>
</div>
<div class="page-num">Page 4 of 9</div>
</div>

<!-- ================= PAGE 5: DECLARATION BY PATIENT / REPRESENTATIVE ================= -->
<div class="page-break">
<div class="section-subtitle">Declaration by the Patient / Representative</div>
<div class="section">
  <ul class="legal-list">
    <li><span class="letter">a.</span> I agree to allow the hospital to submit all original documents pertaining to hospitalization to the Insurer/T.P.A after the discharge. I agree to sign on the Final Bill &amp; the Discharge Summary, before my discharge.</li>
    <li><span class="letter">b.</span> Payment to hospital is governed by the terms and conditions of the policy. In case the Insurer / TPA is not liable to settle the hospital bill, I undertake to settle the bill as per the terms and conditions of the policy.</li>
    <li><span class="letter">c.</span> All non-medical expenses and expenses not relevant to current hospitalization and the amounts over &amp; above the limit authorized by the Insurer/T.P.A not governed by the terms and conditions of the policy will be paid by me.</li>
    <li><span class="letter">d.</span> I hereby declare to abide by the terms and conditions of the policy and if at any time the facts disclosed by me are found to be false or incorrect I forfeit my claim and agree to indemnify the Insurer / T.P.A.</li>
    <li><span class="letter">e.</span> I agree and understand that T.P.A is in no way warranting the service of the hospital &amp; that the Insurer / TPA is in no way guaranteeing that the services provided by the hospital will be of a particular quality or standard.</li>
    <li><span class="letter">f.</span> I hereby warrant the truth of the forgoing particulars in every respect and I agree that if I have made or shall make any false or untrue statement, suppression or concealment with respect to the claim, my right to claim reimbursement of the said expenses shall be absolutely forfeited.</li>
    <li><span class="letter">g.</span> I agree to indemnify the hospital against all expenses incurred on my behalf, which are not reimbursed by the Insurer / TPA.</li>
    <li><span class="letter">h.</span> I/We authorize Insurance Company/TPA to contact me/us through mobile/email for any update on this claim.</li>
  </ul>

  <table class="field-table" style="margin-top:6px;">
    <tr><td class="field-label">a) Patient's / Insured's Name</td><td>${renderValue(patient.patientName)}</td></tr>
    <tr><td class="field-label">b) Contact Number</td><td>${renderValue(patient.mobileNumber || patient.contactNumber)}</td></tr>
    <tr><td class="field-label">&nbsp;&nbsp;&nbsp;e-mail ID (optional)</td><td>${renderValue(patient.email)}</td></tr>
  </table>
  <div class="sign-row">
    <div class="sign-box"><div class="box-outline" style="height:30px;"></div><div class="label">d) Patient's / Insured's Signature</div></div>
    <div class="sign-box"><div class="box-outline" style="height:30px;"></div><div class="label">Date / Time</div></div>
  </div>
</div>

<div class="section-title" style="margin-top:14px;">Hospital Declaration</div>
<div class="section">
  <ul class="legal-list">
    <li><span class="letter">a.</span> We have no objection to any authorized TPA / Insurance Company official verifying documents pertaining to hospitalization.</li>
    <li><span class="letter">b.</span> All valid original documents duly countersigned by the insured / patient as per the checklist below will be sent to TPA / Insurance Company within 7 days of the patient's discharge.</li>
    <li><span class="letter">c.</span> We agree that TPA / Insurance Company will not be liable to make the payment in the event of any discrepancy between the facts in this form and discharge summary or other documents.</li>
    <li><span class="letter">d.</span> The patient declaration has been signed by the patient or by his representative in our presence.</li>
    <li><span class="letter">e.</span> We agree to provide clarifications for the queries raised regarding this hospitalization and we take the sole responsibility for any delay in offering clarifications.</li>
    <li><span class="letter">f.</span> We will abide by the terms and conditions agreed in the MOU.</li>
  </ul>
</div>
<div class="page-num">Page 5 of 9</div>
</div>

<!-- ================= PAGE 6: HOSPITAL DECLARATION CONTINUED ================= -->
<div class="page-break">
<div class="section">
  <ul class="legal-list">
    <li><span class="letter">g.</span> We confirm that no additional amount would be collected from the insured in excess of Agreed Package Rates except costs towards non-admissible amounts (including additional charges due to opting higher room rent than eligibility/ choosing separate line of treatment which is not envisaged/considered in package).</li>
    <li><span class="letter">h.</span> We confirm that no recoveries would be made from the deposit amount collected from the Insured except for costs towards non-admissible amounts (including additional charges due to opting higher room rent than eligibility/ choosing separate line of treatment which is not envisaged/considered in package).</li>
    <li><span class="letter">i.</span> In the event of unauthorized recovery of any additional amount from the Insured in excess of Agreed Package Rates, the authorized TPA / Insurance Company reserves the right to recover the same from us (the Network Provider) and/or take necessary action, as provided under the MoU or applicable laws.</li>
  </ul>
  <div class="sign-row">
    <div class="sign-box"><div class="box-outline"></div><div class="label">Hospital Seal</div></div>
    <div class="sign-box"><div class="box-outline"></div><div class="label">Doctor's Signature</div></div>
  </div>
  <div style="font-size:9.5px; margin-top:8px;">Date: _______________ &nbsp;&nbsp;&nbsp; Time: _______________</div>
</div>
<div class="page-num">Page 6 of 9</div>
</div>

<!-- ================= PAGE 7: CASHLESS AUTHORIZATION LETTER (PART D) ================= -->
<div class="page-break">
<div class="section-subtitle">Cashless Authorization Letter (Part-D)<br><span style="font-size:8.5px; font-weight:normal; font-style:italic;">To be completed by Insurer / TPA upon authorization &mdash; not populated by this system</span></div>
<div class="section" style="font-size:9.5px;">
  <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
    <span>Claim Number: <em style="color:#999;">Pending TPA/Insurer allotment</em></span>
    <span>Date: __/__/____</span>
  </div>
  <div>Authorization is valid for admission up to: <em style="color:#999;">Pending</em></div>

  <table class="info-table" style="margin-top:8px;">
    <tr><td class="k">Hospital</td><td>${renderValue(declHospital.authorizedSignatoryName ? `${declHospital.authorizedSignatoryName} Hospital` : 'Apex Hospital, Kamareddy')}</td></tr>
    <tr><td class="k">Name of Insurance Company</td><td>${renderValue(ins.insurerName || ins.tpaName)}</td></tr>
    <tr><td class="k">Name of TPA</td><td>${renderValue(ins.tpaName)}</td></tr>
    <tr><td class="k">Proposer Name</td><td>${renderValue(ins.proposerName)}</td></tr>
    <tr><td class="k">Patient's Member ID / TPA/Insurer ID</td><td>${renderValue(ins.tpaIdCardNumber || ins.policyNumber)}</td></tr>
    <tr><td class="k">Relation with Proposer</td><td>${renderValue(ins.relationshipWithProposer)}</td></tr>
    <tr><td class="k">Rohini ID</td><td><span class="field-value empty">&mdash;</span></td></tr>
  </table>

  <table class="info-table" style="margin-top:8px;">
    <tr><td class="k">Patient Name</td><td>${renderValue(patient.patientName)}</td><td class="k">Age / Gender</td><td>${renderValue(patient.age ? `${patient.age} / ${patient.gender || ''}` : null)}</td></tr>
    <tr><td class="k">Policy Number</td><td>${renderValue(ins.policyNumber)}</td><td class="k">Expected Date of Admission</td><td>${renderValue(admission.dateOfAdmission)}</td></tr>
    <tr><td class="k">Policy Period</td><td>${renderValue(ins.policyStartDate ? `${ins.policyStartDate} to ${ins.policyEndDate || ''}` : null)}</td><td class="k">Expected Date of Discharge</td><td><span class="field-value empty">&mdash;</span></td></tr>
    <tr><td class="k">Room Category</td><td>${renderValue(admission.roomCategory)}</td><td class="k">Estimated Length of Stay</td><td>${renderValue(admission.expectedLengthOfStay ? `${admission.expectedLengthOfStay} Days` : null)}</td></tr>
    <tr><td class="k">Provisional Diagnosis</td><td>${renderValue(selectedDx?.diagnosis || clinical.chiefComplaints)}</td><td class="k">Proposed Line of Treatment</td><td><span class="field-value">${lineOfTreatmentText}</span></td></tr>
  </table>

  <div style="font-weight:bold; margin-top:10px;">Authorization Details</div>
  <table class="auth-table">
    <tr><th>Date &amp; Time</th><th>Reference Number</th><th>Amount</th><th>Status</th></tr>
    <tr><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>Pending TPA/Insurer review</td></tr>
  </table>
  <div style="margin-top:6px;">Total Authorized Amount: <em style="color:#999;">Pending</em></div>

  <div style="font-weight:bold; margin-top:10px;">Hospital Agreed Tariff &mdash; Package Case</div>
  <div>Agreed Package Rate: <em style="color:#999;">Not applicable for this case</em></div>
</div>
<div class="page-num">Page 7 of 9</div>
</div>

<!-- ================= PAGE 8: TARIFF (NON-PACKAGE) + AUTH SUMMARY + TERMS 1-4 ================= -->
<div class="page-break">
<div class="section">
  <div class="section-title">Hospital Agreed Tariff &mdash; Non-Package Case</div>
  <table class="field-table">
    <tr><td class="field-label">i. Room Rent / day</td><td>${renderValue(cost.roomRentPerDay ? `₹ ${cost.roomRentPerDay}` : null)}</td></tr>
    <tr><td class="field-label">ii. ICU Rent / day</td><td>${renderValue(cost.icuChargesPerDay ? `₹ ${cost.icuChargesPerDay}` : null, 'Not applicable')}</td></tr>
    <tr><td class="field-label">iii. Nursing Charges / day</td><td>${renderValue(cost.nursingChargesPerDay ? `₹ ${cost.nursingChargesPerDay}` : null)}</td></tr>
    <tr><td class="field-label">iv. Consultant Visit Charges / day</td><td>${renderValue(cost.consultantFee ? `₹ ${cost.consultantFee}` : null)}</td></tr>
    <tr><td class="field-label">v. Surgeon's Fee / OT / Anaesthetist</td><td>${renderValue(cost.surgeonFee || cost.otCharges ? `₹ ${(cost.surgeonFee ?? 0) + (cost.otCharges ?? 0) + (cost.anesthetistFee ?? 0)}` : null, 'Not applicable')}</td></tr>
    <tr><td class="field-label">vi. Others</td><td>${renderValue(cost.miscCharges ? `₹ ${cost.miscCharges}` : null)}</td></tr>
  </table>

  <div class="section-title" style="margin-top:12px;">Authorization Summary</div>
  <table class="cost-table">
    <tr><td>Total Bill Amount (INR)</td><td class="amount">₹ ${costTotals.totalEstimatedCost.toLocaleString('en-IN')}</td></tr>
    <tr><td>Other Deductions (at Final Authorization)</td><td class="amount empty">&mdash;</td></tr>
    <tr><td>Discount (at Final Authorization)</td><td class="amount empty">&mdash;</td></tr>
    <tr><td>Co-Pay</td><td class="amount empty">&mdash;</td></tr>
    <tr><td>Deductibles</td><td class="amount empty">&mdash;</td></tr>
    <tr class="total"><td>Total Authorised Amount</td><td class="amount empty">&mdash;</td></tr>
    <tr><td>Amount to be Paid by Insured (at Final Authorization)</td><td class="amount empty">&mdash;</td></tr>
  </table>

  <div style="font-weight:bold; margin-top:10px; font-size:10px;">Other Deduction Details</div>
  <table class="auth-table">
    <tr><th>S.no</th><th>Description</th><th>Bill Amount</th><th>Deducted Amount</th><th>Admissible Amount</th><th>Deduction Reason</th></tr>
    <tr><td colspan="6" style="text-align:center; color:#999;">No deductions recorded</td></tr>
  </table>

  <div class="section-title" style="margin-top:12px;">Terms and Conditions of Authorization</div>
  <ol class="terms-list">
    <li>Cashless Authorization letter issued on the basis of information provided in Pre-Authorization form. In case misrepresentation/concealment of the facts, any material difference/ deviation/ discrepancy in information is observed in discharge summary/ IPD records then cashless authorization shall stand null &amp; void. At any point of claim processing Insurer or TPA reserves right to raise queries for any other document to ascertain admissibility of claim.</li>
    <li>KYC (Know your customer) details of proposer/employee/Beneficiary are mandatory for claim payout above Rs 1 lakh.</li>
    <li>Network provider shall not collect any additional amount from the individual in excess of Agreed Package Rates except costs towards non-admissible amounts (including additional charges due to opting higher room rent than eligibility/ choosing separate line of treatment which is not envisaged/considered in package).</li>
    <li>Network Provider shall not make any recovery from the deposit amount collected from the Insured except for costs towards non-admissible amounts (including additional charges due to opting higher room rent than eligibility/ choosing separate line of treatment which is not envisaged/considered in package).</li>
  </ol>
</div>
<div class="page-num">Page 8 of 9</div>
</div>

<!-- ================= PAGE 9: TERMS 5-7 + DOCUMENTS ================= -->
<div class="page-break">
<div class="section">
  <ol class="terms-list" start="5">
    <li>In the event of unauthorized recovery of any additional amount from the Insured in excess of Agreed Package Rates, the authorized TPA / Insurance Company reserves the right to recover the same or get the same refunded to the policyholder from the Network Provider and/or take necessary action, as provided under the MoU.</li>
    <li>Where a treatment/procedure is to be carried out by a doctor/surgeon of insured's choice (not empaneled with the hospital), Network Provider may give treatment after obtaining specific consent of policyholder.</li>
    <li>Differential Costs borne by policyholder may be reimbursed by insurers subject to the terms and conditions of the policy.</li>
  </ol>

  <div class="section-title">Documents to be Provided by the Hospital in Support of the Claim</div>
  <ol class="terms-list">
    <li>Detailed Discharge Summary and all Bills from the hospital.</li>
    <li>Cash Memos from the Hospitals / Chemists supported by proper prescription.</li>
    <li>Diagnostic Test Reports and Receipts supported by note from the attending Medical Practitioner / Surgeon recommending such diagnostic tests.</li>
    <li>Surgeon's Certificate stating nature of operation performed and Surgeon's Bill and Receipt.</li>
    <li>Certificates from attending Medical Practitioner / Surgeon giving patient's condition and advice on discharge.</li>
  </ol>

  <div style="font-size:9.5px; margin-top:8px;">
    Name of the Product and UIN No.: <em style="color:#999;">&mdash; Important Policy terms &amp; conditions (sub-limits/co-pay/deductible etc.)</em>
  </div>

  <div class="sign-row">
    <div class="sign-box"><div class="box-outline"></div><div class="label">Authorized Signatory (Insurer/TPA)</div></div>
    <div class="sign-box"><div class="box-outline"></div><div class="label">Address</div></div>
  </div>
</div>
<div class="page-num">Page 9 of 9</div>
</div>

</body>
</html>`;
}
