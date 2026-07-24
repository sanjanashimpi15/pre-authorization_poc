import { PreAuthRecord } from '../components/PreAuthWizard/types';

const baseDeclarations = {
  patient: {
    agreedToTerms: true,
    consentForMedicalDataSharing: true,
    agreesToPayNonPayables: true,
    capturedBy: 'Insurance Desk Officer'
  },
  doctor: {
    doctorId: 'DOC-1',
    doctorName: 'Dr. Ramesh Kumar',
    doctorQualification: 'MBBS, MD',
    doctorRegistrationNumber: 'MCI-12345',
    registrationCouncil: 'Karnataka Medical Council',
    confirmed: true,
    confirmationMethod: 'in_app' as const
  },
  hospital: {
    authorizedSignatoryName: 'Admin Head',
    designation: 'Medical Superintendent',
    hospitalSealApplied: true
  }
};

export const DIABETES_DEMO_RECORD: Partial<PreAuthRecord> = {
  id: 'PA-DEMO-001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'draft',
  version: 1,
  createdBy: 'Insurance Desk',
  patient: {
    patientName: 'Anil Kankriya',
    age: 58,
    gender: 'Male',
    contactNumber: '9876543210',
    email: 'anil.kankriya@example.com'
  },
  insurance: {
    insurerName: 'Star Health Insurance',
    policyNumber: 'POL-992384',
    tpaName: 'Medi Assist TPA',
    sumInsured: 500000,
    policyType: 'Group Health',
    dataSource: 'manual'
  },
  clinical: {
    dataSource: 'manual_entry',
    diagnoses: [
      {
        diagnosis: 'Type 2 diabetes mellitus with hyperglycemia',
        icd10Code: 'E11.9',
        icd10Description: 'Type 2 diabetes mellitus without complications',
        probability: 0.95,
        reasoning: 'Presented with blood glucose levels > 350 mg/dL requiring emergency insulin therapy and hydration.',
        isSelected: true
      }
    ],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'Patient Anil Kankriya presented with high blood sugar levels. Patient complains of polyuria and polydipsia for 3 days.',
    historyOfPresentIllness: 'High blood sugar noted during home tests. Advising emergency glycemic control and stabilization of blood glucose levels.',
    relevantClinicalFindings: 'Blood sugar values: fasting blood glucose is 280 mg/dL and post-prandial blood glucose is 380 mg/dL. Urine ketones: negative. ECG: Normal.',
    vitals: {
      bp: '130/85',
      pulse: '76',
      temp: '98.6',
      spo2: '98',
      rr: '18'
    },
    durationOfPresentAilment: '3 days',
    natureOfIllness: 'Acute',
    proposedLineOfTreatment: {
      medical: true,
      surgical: false,
      intensiveCare: false,
      investigation: true,
      nonAllopathic: false
    },
    treatmentTakenSoFar: '', // TRAP: Empty! No duration/records
    reasonForHospitalisation: 'Required emergency insulin titration and IV fluids to prevent diabetic ketoacidosis (DKA) or hyperosmolar hyperglycemic state (HHS).',
    additionalClinicalNotes: '' // TRAP: Empty!
  },
  admission: {
    admissionType: 'Emergency',
    dateOfAdmission: new Date().toISOString().split('T')[0],
    timeOfAdmission: '10:00',
    roomCategory: 'General Ward',
    expectedLengthOfStay: 3,
    expectedDaysInICU: 0,
    expectedDaysInRoom: 3,
    pastMedicalHistory: {
      diabetes: { present: false }, // TRAP: Marked false, doctor claims no known history, so TPA will raise PED query!
      hypertension: { present: false },
      heartDisease: { present: false },
      asthma: { present: false },
      epilepsy: { present: false },
      cancer: { present: false },
      kidney: { present: false },
      liver: { present: false },
      hiv: { present: false },
      alcoholism: { present: false },
      smoking: { present: false },
      anyOther: { present: false }
    },
    previousHospitalization: { wasHospitalizedBefore: false }
  },
  costEstimate: {
    totalEstimatedCost: 45000,
    amountClaimedFromInsurer: 40000,
    isPackageRate: false,
    roomRentPerDay: 4000,
    breakdown: {
      roomRent: 12000,
      nursingCharges: 3000,
      investigations: 8000,
      medicines: 12000,
      consultation: 5000,
      miscellaneous: 5000
    }
  },
  uploadedDocuments: [
    {
      id: 'DOC-DEMO-1',
      fileName: 'blood_test_report.pdf',
      fileSizeDisplay: '145 KB',
      fileType: 'pdf' as const,
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      base64Data: 'dummy',
      documentCategory: 'cbc' as const, // matches 'default' required doc category cbc
      autoClassified: false,
      isRequired: true
    }
  ],
  declarations: baseDeclarations,
  outputs: {}
};

export const PNEUMONIA_DEMO_RECORD: Partial<PreAuthRecord> = {
  id: 'PA-DEMO-002',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'draft',
  version: 1,
  createdBy: 'Insurance Desk',
  patient: {
    patientName: 'Karan Sharma',
    age: 45,
    gender: 'Male',
    contactNumber: '9911223344',
    email: 'karan.sharma@example.com'
  },
  insurance: {
    insurerName: 'HDFC Ergo General Insurance',
    policyNumber: 'POL-332991',
    tpaName: 'Family Health Plan TPA',
    sumInsured: 300000,
    policyType: 'Individual Health',
    dataSource: 'manual'
  },
  clinical: {
    dataSource: 'manual_entry',
    diagnoses: [
      {
        diagnosis: 'Community-acquired pneumonia',
        icd10Code: 'J18.9',
        icd10Description: 'Pneumonia, unspecified organism',
        probability: 0.90,
        reasoning: 'Clinical presentation of fever and productive cough. Advised admission for antibiotic course.',
        isSelected: true
      }
    ],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'Patient has cough and high fever.',
    historyOfPresentIllness: 'Cough and high fever noticed recently. Chest crackles present.',
    relevantClinicalFindings: '',
    vitals: {
      bp: '120/80',
      pulse: '88',
      temp: '101.5',
      spo2: '', // Missing SpO2 vital!
      rr: '24'
    },
    durationOfPresentAilment: '',
    natureOfIllness: 'Acute',
    proposedLineOfTreatment: {
      medical: true,
      surgical: false,
      intensiveCare: false,
      investigation: true,
      nonAllopathic: false
    },
    treatmentTakenSoFar: '',
    reasonForHospitalisation: 'Advised admission for IV antibiotics.',
    additionalClinicalNotes: ''
  },
  admission: {
    admissionType: 'Emergency',
    dateOfAdmission: new Date().toISOString().split('T')[0],
    timeOfAdmission: '10:00',
    roomCategory: 'General Ward',
    expectedLengthOfStay: 5,
    expectedDaysInICU: 0,
    expectedDaysInRoom: 5,
    pastMedicalHistory: {
      diabetes: { present: false },
      hypertension: { present: false },
      heartDisease: { present: false },
      asthma: { present: false },
      epilepsy: { present: false },
      cancer: { present: false },
      kidney: { present: false },
      liver: { present: false },
      hiv: { present: false },
      alcoholism: { present: false },
      smoking: { present: false },
      anyOther: { present: false }
    },
    previousHospitalization: { wasHospitalizedBefore: false }
  },
  costEstimate: {
    totalEstimatedCost: 35000,
    amountClaimedFromInsurer: 30000,
    isPackageRate: false,
    roomRentPerDay: 3000,
    breakdown: {
      roomRent: 15000,
      nursingCharges: 2500,
      investigations: 5000,
      medicines: 8000,
      consultation: 3000,
      miscellaneous: 1500
    }
  },
  uploadedDocuments: [], // Thin case: NO documents attached!
  declarations: baseDeclarations,
  outputs: {}
};

export const APPENDICITIS_DEMO_RECORD: Partial<PreAuthRecord> = {
  id: 'PA-DEMO-003',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: 'draft',
  version: 1,
  createdBy: 'Insurance Desk',
  patient: {
    patientName: 'Rohan Mehra',
    age: 28,
    gender: 'Male',
    contactNumber: '9988776655',
    email: 'rohan.mehra@example.com'
  },
  insurance: {
    insurerName: 'Niva Bupa Health Insurance',
    policyNumber: 'POL-778812',
    tpaName: 'Raksha TPA',
    sumInsured: 400000,
    policyType: 'Individual Health',
    dataSource: 'manual'
  },
  clinical: {
    dataSource: 'manual_entry',
    diagnoses: [
      {
        diagnosis: 'Acute appendicitis',
        icd10Code: 'K35.8',
        icd10Description: 'Acute appendicitis, other and unspecified',
        probability: 0.98,
        reasoning: 'USG abdomen shows fluid collection, non-compressible appendix 9mm. Patient has classic migratory right lower quadrant abdominal pain, fever, and leukocytosis.',
        isSelected: true
      }
    ],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'Severe pain in the right lower quadrant of abdomen for 18 hours. Patient complains of nausea and low-grade fever.',
    historyOfPresentIllness: 'Pain started around the umbilicus 18 hours ago, then migrated to the right lower quadrant (RLQ). Low-grade fever and vomiting developed later.',
    relevantClinicalFindings: 'Tenderness at McBurney\'s point present, rebound tenderness positive. WBC count is elevated at 14.2 x10^9/L.',
    vitals: {
      bp: '115/75',
      pulse: '92',
      temp: '101.1',
      spo2: '99',
      rr: '20'
    },
    durationOfPresentAilment: '18 hours',
    natureOfIllness: 'Acute',
    proposedLineOfTreatment: {
      medical: false,
      surgical: true,
      intensiveCare: false,
      investigation: true,
      nonAllopathic: false
    },
    treatmentTakenSoFar: 'Oral paracetamol taken for pain, no relief.',
    reasonForHospitalisation: 'Required emergency laparoscopic appendectomy to prevent appendiceal rupture and secondary peritonitis.',
    additionalClinicalNotes: 'Laparoscopic appendectomy planned under general anesthesia today.'
  },
  admission: {
    admissionType: 'Emergency',
    dateOfAdmission: new Date().toISOString().split('T')[0],
    timeOfAdmission: '11:00',
    roomCategory: 'General Ward',
    expectedLengthOfStay: 2,
    expectedDaysInICU: 0,
    expectedDaysInRoom: 2,
    pastMedicalHistory: {
      diabetes: { present: false },
      hypertension: { present: false },
      heartDisease: { present: false },
      asthma: { present: false },
      epilepsy: { present: false },
      cancer: { present: false },
      kidney: { present: false },
      liver: { present: false },
      hiv: { present: false },
      alcoholism: { present: false },
      smoking: { present: false },
      anyOther: { present: false }
    },
    previousHospitalization: { wasHospitalizedBefore: false }
  },
  costEstimate: {
    totalEstimatedCost: 65000,
    amountClaimedFromInsurer: 60000,
    isPackageRate: false,
    roomRentPerDay: 4000,
    breakdown: {
      roomRent: 8000,
      nursingCharges: 2000,
      investigations: 10000,
      medicines: 8000,
      consultation: 4000,
      otCharges: 15000,
      surgeonFee: 12000,
      anesthetistFee: 4000,
      miscellaneous: 2000
    }
  },
  uploadedDocuments: [
    {
      id: 'DOC-DEMO-3A',
      fileName: 'ultrasound_report.pdf',
      fileSizeDisplay: '240 KB',
      fileType: 'pdf' as const,
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      base64Data: 'dummy',
      documentCategory: 'usg_abdomen' as const,
      autoClassified: false,
      isRequired: true
    },
    {
      id: 'DOC-DEMO-3B',
      fileName: 'blood_cbc_report.pdf',
      fileSizeDisplay: '110 KB',
      fileType: 'pdf' as const,
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      base64Data: 'dummy',
      documentCategory: 'cbc' as const,
      autoClassified: false,
      isRequired: true
    }
  ],
  declarations: baseDeclarations,
  outputs: {}
};
