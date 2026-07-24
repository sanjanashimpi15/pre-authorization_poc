// ============================================
// CORE ENUMS AND LITERALS
// ============================================

export type PreAuthStatus =
    | 'draft'
    | 'pending_documents'
    | 'ready_to_submit'
    | 'submitted'
    | 'query_raised'
    /** TPA received a response to their query — awaiting final decision */
    | 'query_received'
    | 'approved'
    | 'denied'
    /** AI-generated citation-backed appeal is ready to submit */
    | 'appeal_drafted'
    | 'enhancement_requested'
    | 'closed';

export type EntryPath = 'scan_card' | 'manual' | 'search_existing';
export type ClinicalDataSource = 'voice_scribe' | 'manual_entry';

export type RoomCategory =
    | 'General Ward'
    | 'Semi-Private'
    | 'Private'
    | 'Deluxe'
    | 'ICU'
    | 'ICCU'
    | 'NICU'
    | 'HDU';

export type WizardDocCategory =
    | 'insurance_card_front' | 'insurance_card_back' | 'id_proof' | 'pan_card'
    | 'policy_copy' | 'admission_letter' | 'chest_xray' | 'xray_knee' | 'cbc' | 'abg'
    | 'ecg' | 'ct_scan' | 'mri' | 'ultrasound' | 'blood_culture'
    | 'urine_routine' | 'lft' | 'kft' | 'covid_test' | 'ns1_antigen'
    | 'dengue_igm' | 'usg_abdomen' | 'prescription' | 'discharge_summary' | 'other';

export type NecessityStrength = 'strong' | 'moderate' | 'weak';

export type TPAProvider =
    | 'MDIndia' | 'HealthIndia' | 'Raksha' | 'Paramount' | 'MediAssist'
    | 'Vidal' | 'FHPL' | 'GoodHealth' | 'Heritage' | 'Other';

// ============================================
// HOSPITAL CONFIGURATION
// ============================================

export interface HospitalConfig {
    hospitalName: string;
    hospitalAddress: string;
    hospitalCity: string;
    hospitalState: string;
    hospitalPincode: string;
    hospitalPhoneNumber: string;
    hospitalEmail: string;
    hospitalRohiniId: string;
    nabhAccredited: boolean;
    nablAccredited: boolean;
    nodalOfficerName: string;
    nodalOfficerPhone: string;
    nodalOfficerEmail: string;
    authorizedSignatoryName: string;
    authorizedSignatoryDesignation: string;
}

export interface DoctorProfile {
    id: string;
    name: string;
    qualification: string;
    registrationNumber: string;
    registrationCouncil: string;
    department: string;
    specialization: string;
    phone: string;
    email: string;
    isActive: boolean;
}

export interface RateCardEntry {
    roomCategory: RoomCategory;
    roomRentPerDay: number;
    nursingChargesPerDay: number;
    icuChargesPerDay: number;
    defaultStayDays: number;
}

// ============================================
// OCR RESULT
// ============================================

export interface OCRResult {
    extractedData: {
        patientName?: string;
        dateOfBirth?: string;
        age?: number;
        gender?: 'Male' | 'Female' | 'Other';
        policyNumber?: string;
        insurerName?: string;
        tpaName?: string;
        tpaIdCardNumber?: string;
        sumInsured?: number;
        policyStartDate?: string;
        policyEndDate?: string;
        proposerName?: string;
        insuredName?: string;
        relationship?: string;
        employeeId?: string;
        corporateName?: string;
    };
    fieldConfidence: Record<string, number>;
    overallConfidence: number;
    cardImageFront?: string;
    cardImageBack?: string;
}

// ============================================
// PATIENT RECORD
// ============================================

export interface PatientRecord {
    id: string;
    createdAt: string;
    updatedAt: string;
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
    contactNumber?: string;
    email: string;
    uhid?: string;
    aadhaarNumber?: string;
    panNumber?: string;
    abhaId?: string;
    familyPhysicianName?: string;
    lastKnownPolicyNumber?: string;
    lastKnownInsurer?: string;
    lastKnownTPA?: string;
}

// ============================================
// INSURANCE / POLICY DETAILS
// ============================================

export interface InsurancePolicyDetails {
    policyNumber: string;
    policyType: string;
    policyStartDate: string;
    policyEndDate: string;
    sumInsured: number;
    balanceSumInsured?: number;
    insurerName: string;
    tpaName: string;
    tpaId?: string;
    tpaIdCardNumber: string;
    proposerName: string;
    insuredName: string;
    relationshipWithProposer: string;
    employeeId?: string;
    corporateName?: string;
    hasOtherHealthPolicy: boolean;
    otherPolicyDetails?: string;
    dataSource: 'ocr' | 'manual' | 'existing_record';
    ocrConfidence?: number;
    cardImages?: { front?: string; back?: string };
}

// ============================================
// CLINICAL DETAILS
// ============================================

export interface WizardVoiceFinding {
    id: string;
    testName: string;
    result: string;
    interpretation: 'normal' | 'abnormal_high' | 'abnormal_low' | 'critical';
    rawTranscript: string;
    evidenceStatus: 'pending' | 'uploaded' | 'not_required';
    linkedDocumentId?: string;
}

export interface WizardVitals {
    bp: string;
    pulse: string;
    temp: string;
    spo2: string;
    rr: string;
}

export interface DiagnosisEntry {
    diagnosis: string;
    icd10Code: string;
    icd10Description: string;
    icd10MatchMethod?: string;
    probability: number;
    reasoning: string;
    isSelected: boolean;
}

export interface SeverityAssessment {
    phenoIntensity: number;
    urgencyQuotient: number;
    deteriorationVelocity: number;
    overallRisk: 'Low' | 'Moderate' | 'High' | 'Critical';
    mustNotMiss: boolean;
    overrideJustification?: string;
    isOverridden?: boolean;
}

export interface ClinicalDetails {
    dataSource: ClinicalDataSource;
    nexusSessionId?: string;
    chiefComplaints: string;
    durationOfPresentAilment: string;
    natureOfIllness: 'Acute' | 'Chronic' | 'Acute on Chronic';
    historyOfPresentIllness: string;
    relevantClinicalFindings: string;
    treatmentTakenSoFar: string;
    vitals: WizardVitals;
    diagnoses: DiagnosisEntry[];
    selectedDiagnosisIndex: number;
    severity: SeverityAssessment;
    proposedLineOfTreatment: {
        medical: boolean;
        surgical: boolean;
        intensiveCare: boolean;
        investigation: boolean;
        nonAllopathic: boolean;
    };
    reasonForHospitalisation: string;
    surgeryDetails?: {
        nameOfSurgery: string;
        surgeryIcdCode?: string;
        routeOfSurgery: 'Open' | 'Laparoscopic' | 'Endoscopic' | 'Robotic' | 'Other';
    };
    injuryDetails?: {
        isInjury: boolean;
        dateOfInjury?: string;
        causeOfInjury?: string;
        isMLC: boolean;
        reportedToPolice?: boolean;
        firNumber?: string;
        alcoholInvolvement?: boolean;
    };
    maternityDetails?: {
        isMaternity: boolean;
        gravida?: number;
        para?: number;
        lmp?: string;
        edd?: string;
        deliveryType?: 'Normal' | 'Cesarean' | 'Assisted';
    };
    voiceCapturedFindings: WizardVoiceFinding[];
    additionalClinicalNotes: string;
    firstConsultationDate?: string;
    matchedPackageData?: {
        hbp_code: string;
        package_name: string;
        package_rate_inr: number;
    };
}

// ============================================
// ADMISSION DETAILS
// ============================================

export interface PastCondition {
    present: boolean;
    duration?: string;
}

export interface PastMedicalHistory {
    diabetes?: PastCondition;
    hypertension?: PastCondition;
    heartDisease?: PastCondition;
    asthma?: PastCondition;
    epilepsy?: PastCondition;
    cancer?: PastCondition;
    kidney?: PastCondition;
    liver?: PastCondition;
    hiv?: PastCondition;
    alcoholism?: PastCondition;
    smoking?: PastCondition;
    hyperlipidemia?: PastCondition;
    osteoarthritis?: PastCondition;
    anyOther?: PastCondition & { details?: string };
}

export interface AdmissionDetails {
    dateOfAdmission: string;
    timeOfAdmission: string;
    admissionType: 'Emergency' | 'Planned';
    roomCategory: RoomCategory;
    expectedLengthOfStay: number;
    expectedDaysInICU: number;
    expectedDaysInRoom: number;
    pastMedicalHistory: PastMedicalHistory;
    previousHospitalization: {
        wasHospitalizedBefore: boolean;
        details?: string;
        dateOfLastHospitalization?: string;
    };
}

// ============================================
// COST ESTIMATION
// ============================================

export interface ImplantEntry { implantName: string; implantCost: number; }

export interface CostEstimate {
    roomRentPerDay: number;
    expectedRoomDays: number;
    totalRoomCharges: number;
    nursingChargesPerDay: number;
    totalNursingCharges: number;
    icuChargesPerDay: number;
    expectedIcuDays: number;
    totalIcuCharges: number;
    otCharges: number;
    surgeonFee: number;
    anesthetistFee: number;
    consultantFee: number;
    otherDoctorFees: number;
    investigationsEstimate: number;
    medicinesEstimate: number;
    consumablesEstimate: number;
    implants: ImplantEntry[];
    totalImplantsCost: number;
    ambulanceCharges: number;
    miscCharges: number;
    packageName?: string;
    packageCode?: string;
    packageAmount?: number;
    isPackageRate: boolean;
    totalEstimatedCost: number;
    breakdown?: any;
    amountClaimedFromInsurer: number;
    patientResponsibility: number;
    exceedsSumInsured: boolean;
    excessAmount: number;
    copayPercentage?: number;
    copayAmount?: number;
}

// ============================================
// UPLOADED DOCUMENTS
// ============================================

export interface WizardDocument {
    id: string;
    fileName: string;
    fileSizeDisplay: string;
    fileType: 'pdf' | 'image';
    mimeType: string;
    uploadedAt: string;
    base64Data: string;
    documentCategory: WizardDocCategory;
    autoClassified: boolean;
    linkedFindingId?: string;
    isRequired: boolean;
    description?: string;
    duplicateWarning?: string;
    expiryWarning?: string;
    readabilityWarning?: string;
    readabilityConfidence?: number;
    pageCount?: number;
    pages?: Array<{ index: number; base64Data: string; ocrText?: string; }>;
}

export interface WizardDocumentRequirement {
    category: WizardDocCategory;
    displayName: string;
    isRequired: boolean;
    description: string;
    status: 'uploaded' | 'missing_required' | 'missing_optional' | 'skipped';
    linkedDocumentId?: string;
}

// ============================================
// MEDICAL NECESSITY
// ============================================

export interface MedicalNecessityStatement {
    generatedText: string;
    editedText?: string;
    wasEdited: boolean;
    strength: NecessityStrength;
    strengthReasons: string[];
    generatedAt: string;
}

// ============================================
// DECLARATIONS
// ============================================

export interface PatientDeclarationData {
    agreedToTerms: boolean;
    consentForMedicalDataSharing: boolean;
    agreesToPayNonPayables: boolean;
    capturedBy: string;
}

export interface DoctorDeclarationData {
    doctorId: string;
    doctorName: string;
    doctorQualification: string;
    doctorRegistrationNumber: string;
    registrationCouncil: string;
    confirmed: boolean;
    confirmationMethod: 'in_app' | 'verbal';
}

export interface HospitalDeclarationData {
    authorizedSignatoryName: string;
    designation: string;
    hospitalSealApplied: boolean;
}

// ============================================
// ============================================
// EVIDENCE AUTO-FILL SUGGESTIONS
// ============================================

export interface EvidenceSuggestion {
    field: string;
    displayName: string;
    suggestedValue: string;
    sourceSnippet: string;
    sourceDocName: string;
    confidence: number;
    verified?: boolean;
    sourcePage?: number;
}

// ============================================
// FULL PRE-AUTH RECORD
// ============================================

export type CaseComplexity = 'Low' | 'Medium' | 'High';

export interface PreAuthRecord {
    id: string;
    createdAt: string;
    updatedAt: string;
    status: PreAuthStatus;
    version: number;
    createdBy: string;
    patient: Partial<PatientRecord>;
    insurance: Partial<InsurancePolicyDetails>;
    clinical: Partial<ClinicalDetails>;
    admission: Partial<AdmissionDetails>;
    costEstimate: Partial<CostEstimate>;
    uploadedDocuments: WizardDocument[];
    documentRequirements: WizardDocumentRequirement[];
    medicalNecessity?: MedicalNecessityStatement;
    declarations: {
        patient: Partial<PatientDeclarationData>;
        doctor: Partial<DoctorDeclarationData>;
        hospital: Partial<HospitalDeclarationData>;
    };
    outputs: {
        irdaiText?: string;
        jsonData?: string;
    };
    tpaEvidenceReview?: any;
    tpaResponse?: {
        respondedAt: string;
        status: 'approved' | 'denied' | 'query' | 'partial_approved';
        approvedAmount?: number;
        denialReason?: string;
        queryDetails?: string;
    };
    complexity?: CaseComplexity;
    complexityReason?: string;
    evidenceSuggestions?: EvidenceSuggestion[];
    acceptedSuggestions?: string[]; // Field names list (e.g. ['clinical.relevantClinicalFindings'])
}

// ============================================
// WIZARD STATE
// ============================================

export interface WizardState {
    currentStep: 1 | 2 | 3 | 4;
    entryPath: EntryPath | null;
    clinicalDataSource: ClinicalDataSource | null;
}
