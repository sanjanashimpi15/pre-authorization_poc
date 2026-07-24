import React from 'react';

export enum UserRole {
  DOCTOR = 'Doctor',
}

export type Sender = 'USER' | 'AI';

export interface Citation {
  uri: string;
  title: string;
}

export interface DoctorProfile {
  qualification: 'MBBS' | 'BAMS' | 'BHMS';
  canPrescribeAllopathic: 'yes' | 'limited' | 'no';
}

// Types for Structured AI Responses
export interface DdxItem {
  diagnosis: string;
  rationale: string;
  confidence: 'High' | 'Medium' | 'Low';
}

// Doctor-specific types
export interface LabParameter {
  parameter: string;
  value: string;
  referenceRange: string;
  interpretation: string;
  urgency: 'Normal' | 'Abnormal' | 'Critical';
}

export interface LabResultAnalysis {
  overallInterpretation: string;
  results: LabParameter[];
}

export interface MedicalCode {
  code: string;
  description: string;
}

export interface MedicalCodeResult {
  query: string;
  codes: MedicalCode[];
}

export interface HandoutSection {
  heading: string;
  content: string;
}

export interface PatientHandout {
  title: string;
  introduction: string;
  sections: HandoutSection[];
  disclaimer: string;
}

export interface RiskAssessmentResult {
  riskLevel: 'Low' | 'Medium' | 'High';
  riskFactors: string[];
  recommendations: string[];
  summary: string;
}

export type LabParameterInput = {
  name: string;
  value: string;
  units: string;
  referenceRange: string;
};


export type StructuredDataType =
  | { type: 'ddx'; data: DdxItem[]; summary: string; questions?: string[] }
  | { type: 'lab'; data: LabResultAnalysis; summary: string }
  | { type: 'billing'; data: MedicalCodeResult; summary: string }
  | { type: 'handout'; data: PatientHandout; summary: string }
  | { type: 'risk-assessment'; data: RiskAssessmentResult; summary: string };


export interface Message {
  id: string;
  sender: Sender;
  text: string;
  citations?: Citation[];
  structuredData?: StructuredDataType;
  feedback?: 'good' | 'bad' | null;
  // --- Safety & Audit Fields ---
  source_protocol_id?: string;
  source_protocol_last_reviewed?: string;
  action_type?: 'Informational' | 'Requires Clinician Confirmation';
  is_confirmed?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  userRole: UserRole;
  gptId?: string;
}

export interface PreCodedGpt {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  roles: UserRole[];
  customComponentId?: 'PregnancyRiskAssessment' | 'LabResultAnalysis' | 'DifferentialDiagnosis';
}

// Types for Scribe Session
export type ScribeInsightCategory = 'Differential Diagnosis' | 'Questions to Ask' | 'Labs to Consider' | 'General Note';

export interface ScribeInsightBlock {
  category: ScribeInsightCategory;
  points: string[];
}

export interface TranscriptEntry {
  id: string;
  speaker: 'Doctor' | 'Patient' | 'AI';
  text: string;
  segmentIndex?: number;
}

export interface PromptInsight {
  keyTerms: string[];
  suggestions: string[];
  followUps: string[];
}

// --- Clinical Knowledge Base Schema ---

export interface ProtocolReviewer {
  name: string;
  date: string;
  comments: string;
}

export interface ProtocolMetadata {
  version: string;
  date_effective: string;
  last_reviewed: string;
  authors: string[];
  institution: string;
  jurisdiction: string[];
  scope: string;
  'use_if_conditions': string[];
  canonical_sources: { name: string; url?: string }[];
  reviewer_signoff: ProtocolReviewer[];
  related_protocols?: string[];
}

export interface ProtocolStep {
  id: string;
  timing: string;
  title: string;
  actions: string[];
  is_critical: boolean;
  troubleshooting?: string[];
}

export interface DosingInfo {
  drug_name: string;
  brand_names_india: string[];
  available_strengths: string[];
  formula: string;
  route: string;
  dilution_instructions: string;
  administration_details: string;
  max_dose?: string;
  monitoring: string[];
  contraindications?: string[];
  reversal_agent?: string;
}

export interface EscalationTrigger {
  condition: string;
  action: string;
  requires_confirmation: boolean;
}

export interface MonitoringParameter {
  parameter: string;
  frequency: string;
  normal_range?: string;
}

export interface MonitoringTemplate {
  title: string;
  parameters: MonitoringParameter[];
  alert_triggers: { condition: string, action: string }[];
}


export interface ClinicalProtocol {
  id: string;
  title: string;
  metadata: ProtocolMetadata;
  preconditions: string[];
  settings: ('Primary' | 'Secondary' | 'Tertiary' | 'Emergency' | 'ICU' | 'Ward' | 'Community')[];
  stepwise_actions: ProtocolStep[];
  dosing_table: DosingInfo[];
  monitoring_template: MonitoringTemplate;
  contraindications_general: string[];
  escalation_triggers: EscalationTrigger[];
  references: { citation: string; url?: string }[];
}

// --- IPD Foundation Types ---

export interface IPDCase {
  ipd_case_id: string;
  patient_id: string;
  linked_opd_session_id: string;
  admitting_doctor_id: string;
  admission_date: string; // ISO Timestamp
  admission_type: 'Emergency' | 'Planned';
  current_ipd_day: number;
  status: 'Active' | 'Discharged';
  ward_type: 'General' | 'ICU' | 'HDU';
  created_at: string;
}

export interface IPDDay {
  ipd_day: number;
  date: string; // YYYY-MM-DD
  nursing_entries_count: number;
  doctor_notes_count: number;
}

export interface VoiceCapturedFinding {
  testName: string;
  value: string;
  unit: string;
  interpretation: 'normal' | 'abnormal_high' | 'abnormal_low' | 'critical';
  spokenText: string;
  documentAttached: boolean;
  documentId?: string;
}

export interface PatientInfo {
  name: string;
  age: number;
  ageUnit?: 'years' | 'months';
  gender: 'Male' | 'Female' | 'Other';
  uhid: string;
  policyNumber?: string;
  tpaName?: string;
}

export interface ConsultationInfo {
  date: string;
  doctorName: string;
  doctorLicense: string;
  department: string;
}

export interface NexusInsuranceInput {
  ddx: DdxItem[];
  severity: {
    phenoIntensity: number;
    urgencyQuotient: number;
    deteriorationVelocity: number;
    mustNotMiss: boolean;
    redFlagSeverity: 'none' | 'minor' | 'moderate' | 'critical';
  };
  keyFindings: string[];
  vitals: {
    bp: string;
    pulse: string;
    temp: string;
    spo2: string;
    rr: string;
  };
  voiceCapturedFindings: VoiceCapturedFinding[];
}

export type DocumentCategory =
  | 'chest_xray'
  | 'xray_knee'
  | 'cbc'
  | 'abg'
  | 'ecg'
  | 'ct_scan'
  | 'mri'
  | 'ultrasound'
  | 'blood_culture'
  | 'urine_routine'
  | 'lft'
  | 'kft'
  | 'covid_test'
  | 'ns1_antigen'
  | 'dengue_igm'
  | 'usg_abdomen'
  | 'other';

export interface DocumentRequirement {
  category: DocumentCategory;
  displayName: string;
  isRequired: boolean;
  description: string;
}

export interface UploadedDocument {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: 'pdf' | 'image';
  uploadedAt: string;
  linkedToTest?: string;
  base64Data?: string;
  extractionStatus?: 'processing' | 'success' | 'error';
  extractionError?: string;
  extractedData?: {
    document_type: string;
    confidence: number;
    patient?: Record<string, any>;
    insurance?: Record<string, any>;
  };
}

export interface PreAuthSubmission {
  primaryDiagnosis: DdxItem;
  icd10Code: string;
  severityScores: NexusInsuranceInput['severity'];
  severityOverride?: {
    overridden: boolean;
    newSeverity: string;
    justification: string;
  };
  keyFindings: string[];
  testResults: VoiceCapturedFinding[];
  uploadedDocuments: UploadedDocument[];
  clinicalNotes: string;
  medicalNecessityStatement: string;
  documentationStatus: 'complete' | 'pending_documents';
  pendingDocuments: string[];
  doctorConfirmation: {
    confirmed: boolean;
    confirmedAt: string;
    doctorName: string;
    doctorLicense: string;
  };
  disclaimer: string;
}

// IRDAI Standard Pre-Authorization Form Structure
export interface IRDAIPreAuthForm {
  // Section 1: TPA / Insurer / Hospital Details
  section1_TpaInsurer: {
    insuranceCompanyName: string;
    tpaName: string;
    tpaId: string;
    hospitalName: string;
    hospitalAddress: string;
    hospitalCity: string;
    hospitalState: string;
    hospitalPincode: string;
    hospitalPhoneNumber: string;
    hospitalEmail: string;
    hospitalRohiniId: string;        // ROHINI ID (mandatory for network hospitals)
    nabhAccredited: boolean;
    nablAccredited: boolean;
    nodalOfficerName: string;
    nodalOfficerPhone: string;
    nodalOfficerEmail: string;
  };

  // Section 2: Policy / Insured Details
  section2_PolicyDetails: {
    policyNumber: string;
    policyType: 'Individual' | 'Floater' | 'Corporate' | 'Group';
    policyStartDate: string;
    policyEndDate: string;
    sumInsured: number;
    proposerName: string;
    insuredName: string;
    relationshipWithProposer: string;
    tpaIdCardNumber: string;
    employeeId?: string;              // For corporate policies
    corporateName?: string;
    hasOtherHealthPolicy: boolean;
    otherPolicyDetails?: string;
  };

  // Section 3: Patient Personal Details
  section3_PatientDetails: {
    patientName: string;
    dateOfBirth: string;
    age: number;
    ageUnit?: 'years' | 'months';
    gender: 'Male' | 'Female' | 'Other';
    maritalStatus: 'Single' | 'Married' | 'Widowed' | 'Divorced';
    occupation: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    mobileNumber: string;
    email: string;
    aadhaarNumber?: string;
    panNumber?: string;
    abhaId?: string;                  // Ayushman Bharat Health Account
    familyPhysicianName?: string;
    familyPhysicianContact?: string;
  };

  // Section 4: Clinical Details (Treating Doctor fills this)
  section4_ClinicalDetails: {
    chiefComplaints: string;
    durationOfPresentAilment: string;
    natureOfIllness: 'Acute' | 'Chronic' | 'Acute on Chronic';
    relevantClinicalFindings: string;
    provisionalDiagnosis: string;
    icd10Code: string;
    icd10Description: string;
    medicalNecessityJustification?: string;

    proposedLineOfTreatment: {
      medical: boolean;
      surgical: boolean;
      intensiveCare: boolean;
      investigation: boolean;
      nonAllopathic: boolean;
    };

    // If surgical
    surgeryDetails?: {
      nameOfSurgery: string;
      surgeryIcdCode?: string;
      routeOfSurgery: 'Open' | 'Laparoscopic' | 'Endoscopic' | 'Robotic' | 'Other';
    };

    // If injury/accident
    injuryDetails?: {
      isInjury: boolean;
      dateOfInjury?: string;
      causeOfInjury?: string;
      isMLC: boolean;                 // Medico-Legal Case
      reportedToPolice?: boolean;
      firNumber?: string;
    };

    // If maternity
    maternityDetails?: {
      isMaternity: boolean;
      gravida?: number;
      para?: number;
      lmp?: string;
      edd?: string;
      deliveryType?: 'Normal' | 'Cesarean' | 'Assisted';
    };
  };

  // Section 5: Admission & Hospitalization Details
  section5_AdmissionDetails: {
    dateOfAdmission: string;
    timeOfAdmission: string;
    admissionType: 'Emergency' | 'Planned';
    roomCategory: 'General Ward' | 'Semi-Private' | 'Private' | 'Deluxe' | 'ICU' | 'ICCU' | 'NICU' | 'HDU';
    expectedLengthOfStay: number;     // in days
    expectedDaysInICU: number;
    expectedDaysInRoom: number;

    pastMedicalHistory: {
      diabetes: { present: boolean; duration?: string };
      hypertension: { present: boolean; duration?: string };
      heartDisease: { present: boolean; duration?: string };
      asthma: { present: boolean; duration?: string };
      epilepsy: { present: boolean; duration?: string };
      cancer: { present: boolean; duration?: string };
      kidney: { present: boolean; duration?: string };
      liver: { present: boolean; duration?: string };
      alcoholism: { present: boolean; duration?: string };
      smoking: { present: boolean; duration?: string };
      hyperlipidemia?: { present: boolean; duration?: string };
      osteoarthritis?: { present: boolean; duration?: string };
      anyOther: { present: boolean; details?: string };
    };

    previousHospitalization?: {
      wasHospitalizedBefore: boolean;
      details?: string;
      dateOfLastHospitalization?: string;
    };
  };

  // Section 6: Estimated Cost Break-up
  section6_CostEstimate: {
    roomRentPerDay: number;
    expectedRoomDays: number;
    totalRoomCharges: number;

    nursingChargesPerDay: number;
    totalNursingCharges: number;

    icuChargesPerDay: number;
    expectedIcuDays: number;
    totalIcuCharges: number;

    otCharges: number;

    professionalFees: {
      surgeonFee: number;
      anesthetistFee: number;
      consultantFee: number;
      otherDoctorFees: number;
    };

    investigationsEstimate: number;
    medicinesEstimate: number;
    consumablesEstimate: number;

    implants?: {
      implantName: string;
      implantCost: number;
    }[];
    totalImplantsCost: number;

    ambulanceCharges: number;
    miscCharges: number;

    packageName?: string;             // If package rate applicable
    packageAmount?: number;

    totalEstimatedCost: number;
    amountClaimedFromInsurer: number;

    isEmergency: boolean;
    emergencyContactAtHospital?: string;
  };

  // Section 7: Declarations
  section7_Declarations: {
    patientDeclaration: {
      agreedToTerms: boolean;
      consentForMedicalDataSharing: boolean;
      agreesToPayNonPayables: boolean;
      signatureDate: string;
      signatureTime: string;
    };

    doctorDeclaration: {
      doctorName: string;
      doctorQualification: string;
      doctorRegistrationNumber: string;  // State Medical Council registration
      hospitalName: string;
      declarationText: string;
      signatureDate: string;
    };

    hospitalDeclaration: {
      authorizedSignatoryName: string;
      designation: string;
      hospitalSealApplied: boolean;
      signatureDate: string;
    };
  };

  // Metadata
  metadata: {
    formVersion: string;
    generatedAt: string;
    generatedBy: string;              // System identifier
    preAuthRequestId: string;
    submissionChannel: 'Online' | 'Email' | 'Physical';
  };
}

// TPA-specific form variations
export type TPAProvider =
  | 'MDIndia'
  | 'HealthIndia'
  | 'Raksha'
  | 'Paramount'
  | 'MediAssist'
  | 'Vidal'
  | 'FHPL'
  | 'Other';

export interface TPAFormConfig {
  tpaName: TPAProvider;
  formDownloadUrl?: string;
  portalUrl?: string;
  specificFields?: string[];         // TPA-specific additional fields
}