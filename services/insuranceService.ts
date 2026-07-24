import {
    NexusInsuranceInput,
    PreAuthSubmission,
    VoiceCapturedFinding,
    UploadedDocument,
    IRDAIPreAuthForm
} from '../types';
import { validateCode } from './icdService';

/**
 * Generates specific justification for why OPD management is not appropriate
 * Used directly within the IRDAI form's Section 4.
 */
export const generateOPDJustification = (
    input: NexusInsuranceInput
): string => {
    const { vitals, severity } = input;

    const severityJustification = [];
    if (severity.phenoIntensity > 0.7) severityJustification.push('Severe symptom presentation');
    if (severity.urgencyQuotient > 0.7) severityJustification.push('Time-critical intervention required');
    if (severity.deteriorationVelocity > 0.7) severityJustification.push('High risk of rapid deterioration');
    if (vitals.spo2 && parseInt(vitals.spo2) < 94) severityJustification.push(`Hypoxia (SpO2 ${vitals.spo2}%)`);

    const opdContraindications = [];
    if (vitals.spo2 && parseInt(vitals.spo2) < 94) opdContraindications.push('Oxygen requirement cannot be safely met at home');
    if (severity.phenoIntensity > 0.6) opdContraindications.push('Severity of symptoms precludes safe outpatient management');
    opdContraindications.push('Need for continuous clinical monitoring and IV management');

    return `Hospitalization is Medically Necessary due to:
${severityJustification.length > 0 ? severityJustification.map(s => `• ${s}`).join('\n') : '• Moderate severity requiring un-interrupted inpatient care'}

Why Outpatient (OPD) Management is NOT appropriate:
${opdContraindications.map(c => `• ${c}`).join('\n')}`;
};

/**
 * Generates full medical necessity statement (legacy unstructured format)
 */
export const generateMedicalNecessityStatement = (
    input: NexusInsuranceInput,
    selectedDx: NexusInsuranceInput['ddx'][0],
    voiceFindings: VoiceCapturedFinding[]
): string => {
    const { vitals, severity } = input;

    // Extract abnormal findings
    const abnormalFindings = voiceFindings
        .filter(f => f.interpretation !== 'normal')
        .map(f => `${f.testName}: ${f.value}`)
        .join('; ');

    // Build severity justification
    const severityJustification = [];
    if (severity.phenoIntensity > 0.7) {
        severityJustification.push('severe symptom presentation');
    }
    if (severity.urgencyQuotient > 0.7) {
        severityJustification.push('time-critical intervention required');
    }
    if (severity.deteriorationVelocity > 0.7) {
        severityJustification.push('high risk of rapid deterioration');
    }
    if (vitals.spo2 && parseInt(vitals.spo2) < 94) {
        severityJustification.push(`hypoxia (SpO2 ${vitals.spo2}%)`);
    }

    // Build OPD contraindication reasons
    const opdContraindications = [];
    if (vitals.spo2 && parseInt(vitals.spo2) < 94) {
        opdContraindications.push('oxygen requirement cannot be met at home');
    }
    if (severity.phenoIntensity > 0.6) {
        opdContraindications.push('severity precludes safe outpatient management');
    }
    opdContraindications.push('need for IV medications and continuous monitoring');

    return `
MEDICAL NECESSITY STATEMENT

Diagnosis: ${selectedDx.diagnosis}
Diagnostic Confidence: ${selectedDx.confidence}

CLINICAL PRESENTATION:
${selectedDx.rationale}

KEY FINDINGS:
${abnormalFindings || 'As documented in attached reports'}

VITAL SIGNS AT PRESENTATION:
BP: ${vitals.bp} mmHg | Pulse: ${vitals.pulse}/min | Temp: ${vitals.temp}°F
SpO2: ${vitals.spo2}% | RR: ${vitals.rr}/min

SEVERITY ASSESSMENT:
Clinical indicators: ${severityJustification.join(', ') || 'Moderate severity requiring inpatient care'}

MEDICAL NECESSITY JUSTIFICATION:
Hospitalization is medically necessary due to:
${severityJustification.map(s => `• ${s.charAt(0).toUpperCase() + s.slice(1)}`).join('\n')}

OPD MANAGEMENT NOT APPROPRIATE BECAUSE:
${opdContraindications.map(c => `• ${c.charAt(0).toUpperCase() + c.slice(1)}`).join('\n')}

PROPOSED MANAGEMENT:
• Admission to: General Ward / ICU (as clinically indicated)
• Expected length of stay: 5-7 days
• Treatment plan: IV antibiotics, supportive care, monitoring
  `.trim();
};

/**
 * Generates the full pre-auth submission object
 */
export const createPreAuthSubmission = (
    input: NexusInsuranceInput,
    selectedDxIndex: number,
    severityOverride: { original: number; overridden: number; justification: string } | null,
    clinicalNotes: string,
    uploadedDocuments: UploadedDocument[],
    voiceFindings: VoiceCapturedFinding[],
    doctorName: string,
    doctorLicense: string
): PreAuthSubmission => {
    const selectedDx = input.ddx[selectedDxIndex];

    // Determine pending documents
    const pendingFindings = voiceFindings.filter(
        f => !f.documentAttached
    );

    // Determine status
    const hasPendingRequired = pendingFindings.length > 0;

    return {
        primaryDiagnosis: selectedDx,
        icd10Code: 'Pending', // Hardcoded if not in Nexus output
        severityScores: input.severity,
        keyFindings: input.keyFindings,
        testResults: voiceFindings,
        uploadedDocuments: uploadedDocuments,
        clinicalNotes: clinicalNotes,
        documentationStatus: hasPendingRequired ? 'pending_documents' : 'complete',
        pendingDocuments: pendingFindings.map(f => f.testName),

        severityOverride: severityOverride ? {
            overridden: true,
            newSeverity: severityOverride.overridden.toString(),
            justification: severityOverride.justification,
        } : undefined,

        doctorConfirmation: {
            confirmed: true,
            confirmedAt: new Date().toISOString(),
            doctorName: doctorName,
            doctorLicense: doctorLicense,
        },

        medicalNecessityStatement: generateMedicalNecessityStatement(
            input,
            selectedDx,
            voiceFindings
        ),

        disclaimer: 'This request is system generated and not verified.'
    };
};

/**
 * Formats pre-auth for TPA submission (plain text)
 */
export const formatPreAuthForTPA = (submission: PreAuthSubmission): string => {
    const pendingDocsWarning = submission.documentationStatus === 'pending_documents'
        ? `
⚠️ PENDING DOCUMENTS WARNING ⚠️
This pre-authorization has supporting documents pending upload.
Please request the following from the hospital:
${submission.pendingDocuments.map(f => `• ${f}`).join('\n')}
────────────────────────────────────────
`
        : '';

    return `
PRE-AUTHORIZATION REQUEST
Reference: PA-${Date.now()}
Status: ${submission.documentationStatus === 'complete' ? '✓ COMPLETE' : '⚠ PENDING DOCUMENTS'}

${pendingDocsWarning}
${submission.medicalNecessityStatement}

────────────────────────────────────────
SUPPORTING DOCUMENTS
────────────────────────────────────────
Attached: ${submission.uploadedDocuments.length} document(s)
${submission.uploadedDocuments.map(d => `• ${d.fileName}`).join('\n') || '• None'}

Pending: ${submission.pendingDocuments.length} document(s)
${submission.pendingDocuments.map(f => `• ${f} - PENDING`).join('\n') || '• None'}

────────────────────────────────────────
DISCLAIMER
────────────────────────────────────────
This pre-authorization request was generated using Aivana Clinical 
Documentation System based on clinical findings reported by the 
treating physician. Aivana does not independently verify test results 
or clinical observations. 

The treating physician (${submission.doctorConfirmation.doctorName}, 
License: ${submission.doctorConfirmation.doctorLicense}) has confirmed 
the accuracy of the information contained herein.

Confirmed at: ${new Date(submission.doctorConfirmation.confirmedAt).toLocaleString('en-IN')}
  `.trim();
};

/**
 * Generates IRDAI-compliant Pre-Authorization Form output
 */
export const generateIRDAIPreAuthForm = (
    formData: IRDAIPreAuthForm
): string => {
    return `
════════════════════════════════════════════════════════════════════════════════
                    REQUEST FOR CASHLESS HOSPITALISATION
PRE - AUTHORIZATION FORM – PART C(REVISED)
════════════════════════════════════════════════════════════════════════════════
Pre - Auth Request ID: ${formData.metadata.preAuthRequestId}
Date & Time: ${new Date(formData.metadata.generatedAt).toLocaleString('en-IN')}
Status: ${formData.section7_Declarations.patientDeclaration.agreedToTerms ? 'SUBMITTED' : 'DRAFT'}

────────────────────────────────────────────────────────────────────────────────
SECTION 1: TPA / INSURER / HOSPITAL DETAILS
────────────────────────────────────────────────────────────────────────────────
Insurance Company: ${formData.section1_TpaInsurer.insuranceCompanyName}
TPA Name: ${formData.section1_TpaInsurer.tpaName}
TPA ID: ${formData.section1_TpaInsurer.tpaId}

Hospital Name: ${formData.section1_TpaInsurer.hospitalName}
Hospital Address: ${formData.section1_TpaInsurer.hospitalAddress}
                       ${formData.section1_TpaInsurer.hospitalCity}, ${formData.section1_TpaInsurer.hospitalState} - ${formData.section1_TpaInsurer.hospitalPincode}
Hospital ROHINI ID: ${formData.section1_TpaInsurer.hospitalRohiniId}
NABH Accredited: ${formData.section1_TpaInsurer.nabhAccredited ? 'Yes' : 'No'}
NABL Accredited: ${formData.section1_TpaInsurer.nablAccredited ? 'Yes' : 'No'}

Nodal Officer: ${formData.section1_TpaInsurer.nodalOfficerName}
Contact: ${formData.section1_TpaInsurer.nodalOfficerPhone}
Email: ${formData.section1_TpaInsurer.nodalOfficerEmail}

────────────────────────────────────────────────────────────────────────────────
SECTION 2: POLICY / INSURED DETAILS
────────────────────────────────────────────────────────────────────────────────
Policy Number: ${formData.section2_PolicyDetails.policyNumber}
Policy Type: ${formData.section2_PolicyDetails.policyType}
Policy Period: ${formData.section2_PolicyDetails.policyStartDate} to ${formData.section2_PolicyDetails.policyEndDate}
Sum Insured: ₹${formData.section2_PolicyDetails.sumInsured?.toLocaleString('en-IN')}

Proposer Name: ${formData.section2_PolicyDetails.proposerName}
Insured Name: ${formData.section2_PolicyDetails.insuredName}
Relationship: ${formData.section2_PolicyDetails.relationshipWithProposer}
TPA ID Card No.      : ${formData.section2_PolicyDetails.tpaIdCardNumber}
${formData.section2_PolicyDetails.employeeId ? `Employee ID          : ${formData.section2_PolicyDetails.employeeId}` : ''}
${formData.section2_PolicyDetails.corporateName ? `Corporate Name       : ${formData.section2_PolicyDetails.corporateName}` : ''}

Other Health Policy: ${formData.section2_PolicyDetails.hasOtherHealthPolicy ? 'Yes - ' + formData.section2_PolicyDetails.otherPolicyDetails : 'No'}

────────────────────────────────────────────────────────────────────────────────
SECTION 3: PATIENT PERSONAL DETAILS
────────────────────────────────────────────────────────────────────────────────
Patient Name: ${formData.section3_PatientDetails.patientName}
Date of Birth: ${formData.section3_PatientDetails.dateOfBirth}
Age: ${formData.section3_PatientDetails.age} ${formData.section3_PatientDetails.ageUnit === 'months' ? 'months' : 'years'}
Gender: ${formData.section3_PatientDetails.gender}
Marital Status: ${formData.section3_PatientDetails.maritalStatus}
Occupation: ${formData.section3_PatientDetails.occupation}

Address: ${formData.section3_PatientDetails.address}
                       ${formData.section3_PatientDetails.city}, ${formData.section3_PatientDetails.state} - ${formData.section3_PatientDetails.pincode}
Mobile: ${formData.section3_PatientDetails.mobileNumber}
Email: ${formData.section3_PatientDetails.email}

${formData.section3_PatientDetails.aadhaarNumber ? `Aadhaar No.          : ${formData.section3_PatientDetails.aadhaarNumber}` : ''}
${formData.section3_PatientDetails.abhaId ? `ABHA ID              : ${formData.section3_PatientDetails.abhaId}` : ''}

────────────────────────────────────────────────────────────────────────────────
SECTION 4: CLINICAL DETAILS(Filled by Treating Doctor)
────────────────────────────────────────────────────────────────────────────────
Chief Complaints: ${formData.section4_ClinicalDetails.chiefComplaints}
Duration: ${formData.section4_ClinicalDetails.durationOfPresentAilment}
Nature of Illness: ${formData.section4_ClinicalDetails.natureOfIllness}

Relevant Clinical Findings:
${formData.section4_ClinicalDetails.relevantClinicalFindings}

PROVISIONAL DIAGNOSIS: ${formData.section4_ClinicalDetails.provisionalDiagnosis}
ICD - 10 CODE: ${(() => {
    const rawIcd = formData.section4_ClinicalDetails.icd10Code;
    const rawDesc = formData.section4_ClinicalDetails.icd10Description;
    if (!rawIcd || !validateCode(rawIcd)) return 'Pending ICD-10 — Selection required';
    return `${rawIcd} - ${rawDesc}`;
})()}

Proposed Line of Treatment:
[${formData.section4_ClinicalDetails.proposedLineOfTreatment.medical ? 'X' : ' '}] Medical Management
[${formData.section4_ClinicalDetails.proposedLineOfTreatment.surgical ? 'X' : ' '}] Surgical Management
[${formData.section4_ClinicalDetails.proposedLineOfTreatment.intensiveCare ? 'X' : ' '}] Intensive Care
[${formData.section4_ClinicalDetails.proposedLineOfTreatment.investigation ? 'X' : ' '}] Investigation Only

${formData.section4_ClinicalDetails.surgeryDetails ? `
Surgery Details:
  Name of Surgery    : ${formData.section4_ClinicalDetails.surgeryDetails.nameOfSurgery}
  Route of Surgery   : ${formData.section4_ClinicalDetails.surgeryDetails.routeOfSurgery}
` : ''
        }

${formData.section4_ClinicalDetails.injuryDetails?.isInjury ? `
Injury Details:
  Date of Injury     : ${formData.section4_ClinicalDetails.injuryDetails.dateOfInjury}
  Cause of Injury    : ${formData.section4_ClinicalDetails.injuryDetails.causeOfInjury}
  Is MLC             : ${formData.section4_ClinicalDetails.injuryDetails.isMLC ? 'Yes' : 'No'}
` : ''
        }

${formData.section4_ClinicalDetails.medicalNecessityJustification ? `
--- MEDICAL NECESSITY & OPD CONTRAINDICATION -----------------------------------
${formData.section4_ClinicalDetails.medicalNecessityJustification}
--------------------------------------------------------------------------------
` : ''}

────────────────────────────────────────────────────────────────────────────────
SECTION 5: ADMISSION & HOSPITALIZATION DETAILS
────────────────────────────────────────────────────────────────────────────────
Date of Admission: ${formData.section5_AdmissionDetails.dateOfAdmission}
Time of Admission: ${formData.section5_AdmissionDetails.timeOfAdmission}
Type of Admission: ${formData.section5_AdmissionDetails.admissionType}
Room Category: ${formData.section5_AdmissionDetails.roomCategory}

Expected Length of Stay: ${formData.section5_AdmissionDetails.expectedLengthOfStay} days
    - Days in Room / Ward: ${formData.section5_AdmissionDetails.expectedDaysInRoom} days
        - Days in ICU      : ${formData.section5_AdmissionDetails.expectedDaysInICU} days

PAST MEDICAL HISTORY:
Diabetes: ${formData.section5_AdmissionDetails.pastMedicalHistory.diabetes.present ? `Yes (${formData.section5_AdmissionDetails.pastMedicalHistory.diabetes.duration})` : 'No'}
Hypertension: ${formData.section5_AdmissionDetails.pastMedicalHistory.hypertension.present ? `Yes (${formData.section5_AdmissionDetails.pastMedicalHistory.hypertension.duration})` : 'No'}
  Heart Disease: ${formData.section5_AdmissionDetails.pastMedicalHistory.heartDisease.present ? `Yes (${formData.section5_AdmissionDetails.pastMedicalHistory.heartDisease.duration})` : 'No'}
Asthma: ${formData.section5_AdmissionDetails.pastMedicalHistory.asthma.present ? `Yes (${formData.section5_AdmissionDetails.pastMedicalHistory.asthma.duration})` : 'No'}
Hyperlipidemia: ${formData.section5_AdmissionDetails.pastMedicalHistory.hyperlipidemia?.present ? `Yes (${formData.section5_AdmissionDetails.pastMedicalHistory.hyperlipidemia.duration || 'unknown'})` : 'No'}
Osteoarthritis: ${formData.section5_AdmissionDetails.pastMedicalHistory.osteoarthritis?.present ? `Yes (${formData.section5_AdmissionDetails.pastMedicalHistory.osteoarthritis.duration || 'unknown'})` : 'No'}


────────────────────────────────────────────────────────────────────────────────
SECTION 6: ESTIMATED COST BREAK - UP
────────────────────────────────────────────────────────────────────────────────
Room Charges: ₹${formData.section6_CostEstimate.roomRentPerDay}/day × ${formData.section6_CostEstimate.expectedRoomDays} days = ₹${formData.section6_CostEstimate.totalRoomCharges?.toLocaleString('en-IN')}
Nursing Charges: ₹${formData.section6_CostEstimate.totalNursingCharges?.toLocaleString('en-IN')}
ICU Charges: ₹${formData.section6_CostEstimate.icuChargesPerDay}/day × ${formData.section6_CostEstimate.expectedIcuDays} days = ₹${formData.section6_CostEstimate.totalIcuCharges?.toLocaleString('en-IN')}
OT Charges: ₹${formData.section6_CostEstimate.otCharges?.toLocaleString('en-IN')}

Professional Fees:
- Surgeon          : ₹${formData.section6_CostEstimate.professionalFees.surgeonFee?.toLocaleString('en-IN')}
- Anesthetist      : ₹${formData.section6_CostEstimate.professionalFees.anesthetistFee?.toLocaleString('en-IN')}
- Consultant       : ₹${formData.section6_CostEstimate.professionalFees.consultantFee?.toLocaleString('en-IN')}

Investigations: ₹${formData.section6_CostEstimate.investigationsEstimate?.toLocaleString('en-IN')}
Medicines: ₹${formData.section6_CostEstimate.medicinesEstimate?.toLocaleString('en-IN')}
Consumables: ₹${formData.section6_CostEstimate.consumablesEstimate?.toLocaleString('en-IN')}
${formData.section6_CostEstimate.totalImplantsCost ? `Implants             : ₹${formData.section6_CostEstimate.totalImplantsCost.toLocaleString('en-IN')}` : ''}
Misc Charges: ₹${formData.section6_CostEstimate.miscCharges?.toLocaleString('en-IN')}

════════════════════════════════════════════════════════════════════════════════
TOTAL ESTIMATED COST: ₹${formData.section6_CostEstimate.totalEstimatedCost?.toLocaleString('en-IN')}
AMOUNT CLAIMED: ₹${formData.section6_CostEstimate.amountClaimedFromInsurer?.toLocaleString('en-IN')}
════════════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────────────────
SECTION 7: DECLARATIONS
────────────────────────────────────────────────────────────────────────────────

PATIENT / INSURED DECLARATION:
I hereby declare that the information furnished above is true and correct.I 
authorize the insurance company / TPA and the hospital to share my medical
records / information for the purpose of processing this claim.I agree to pay 
any non - payable items as per policy terms.

[${formData.section7_Declarations.patientDeclaration.agreedToTerms ? 'X' : ' '}] I agree to the above declaration
Date: ${formData.section7_Declarations.patientDeclaration.signatureDate}

────────────────────────────────────────────────────────────────────────────────

TREATING DOCTOR'S DECLARATION:
I hereby declare that the information provided above is accurate and the 
proposed treatment / investigation is necessary for the patient based on my 
clinical judgment.

Doctor Name: ${formData.section7_Declarations.doctorDeclaration.doctorName}
Qualification: ${formData.section7_Declarations.doctorDeclaration.doctorQualification}
Registration No.     : ${formData.section7_Declarations.doctorDeclaration.doctorRegistrationNumber}
Date: ${formData.section7_Declarations.doctorDeclaration.signatureDate}

────────────────────────────────────────────────────────────────────────────────

HOSPITAL DECLARATION:
We hereby declare that the above information is true and correct.The hospital 
is empaneled with the TPA / Insurance company and agrees to abide by the terms 
of the agreement.

Authorized Signatory: ${formData.section7_Declarations.hospitalDeclaration.authorizedSignatoryName}
Designation: ${formData.section7_Declarations.hospitalDeclaration.designation}
Hospital Seal: ${formData.section7_Declarations.hospitalDeclaration.hospitalSealApplied ? 'Applied' : 'Pending'}
Date: ${formData.section7_Declarations.hospitalDeclaration.signatureDate}

════════════════════════════════════════════════════════════════════════════════
                              END OF PRE - AUTHORIZATION FORM
════════════════════════════════════════════════════════════════════════════════

DISCLAIMER: This pre - authorization form was generated using Aivana Clinical 
Documentation System.Aivana does not independently verify the clinical or 
financial information provided.The treating physician and hospital are 
responsible for the accuracy of all information submitted.

Generated by: Aivana Insurance Intelligence Module v1.0
Reference: ${formData.metadata.preAuthRequestId}
`.trim();
};
