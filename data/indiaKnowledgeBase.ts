export interface PmjayPackage {
    code: string;
    name: string;
    category: 'Cardiology' | 'Orthopaedics' | 'General Surgery' | 'General Medicine' | 'Oncology' | 'Urology';
    baseRate: number;
    requiresPreAuth: boolean;
    mandatoryDiagnostics: string[];
    minHospitalDays: number;
}

export interface TpaPolicy {
    tpaName: string;
    roomRentLimitNormalPercent: number; // e.g. 1% of Sum Insured
    roomRentLimitIcuPercent: number;    // e.g. 2% of Sum Insured
    pedWaitingYears: number;            // standard Pre-Existing Disease waiting period
    copayPercentage: number;            // standard co-payment percentage
    cashlessNetworkHospitalOnly: boolean;
    nonMedicalChargesExcluded: string[];
}

export interface StateScheme {
    stateCode: string;
    schemeName: string;
    mandatoryRegistration: string;      // e.g. "ROHINI", "ABHA"
    emergencyPreAuthGraceHours: number;  // hours allowed to submit pre-auth after emergency admission
    additionalExclusions: string[];
}

export const PMJAY_PACKAGES: PmjayPackage[] = [
    {
        code: "SG001",
        name: "Laparoscopic Cholecystectomy (Gallbladder Removal)",
        category: "General Surgery",
        baseRate: 22000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["Ultrasound Abdomen showing Cholelithiasis/Cholecystitis", "Complete Blood Count (CBC)", "Liver Function Test (LFT)"],
        minHospitalDays: 2
    },
    {
        code: "SG002",
        name: "Laparoscopic Appendectomy",
        category: "General Surgery",
        baseRate: 18000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["Ultrasound or CT Abdomen confirming Appendicitis", "CBC with Leukocytosis", "Urine Routine to rule out UTI"],
        minHospitalDays: 2
    },
    {
        code: "CD001",
        name: "Coronary Artery Bypass Grafting (CABG)",
        category: "Cardiology",
        baseRate: 120000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["Coronary Angiography (CAG) report showing significant blockages", "Echocardiography (ECHO) showing LVEF", "ECG", "Troponin I/T"],
        minHospitalDays: 7
    },
    {
        code: "CD002",
        name: "PTCA (Percutaneous Transluminal Coronary Angioplasty) - Single Stent",
        category: "Cardiology",
        baseRate: 85000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["Coronary Angiography report", "ECG showing STEMI or ischemic changes", "Cardiac Troponins"],
        minHospitalDays: 3
    },
    {
        code: "OR001",
        name: "Total Knee Replacement (TKR) - Unilateral",
        category: "Orthopaedics",
        baseRate: 90000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["Weight-bearing X-ray of knee showing Kellgren-Lawrence Grade 3 or 4 osteoarthritis", "Rheumatoid Factor / CRP", "MRI Knee (optional)"],
        minHospitalDays: 5
    },
    {
        code: "GM001",
        name: "Conservative Management for Dengue Hemorrhagic Fever",
        category: "General Medicine",
        baseRate: 15000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["NS1 Antigen Positive or Dengue IgM Positive", "Daily CBC showing Platelet Count < 50,000/mcL or rapid drop", "Hematocrit tracking"],
        minHospitalDays: 3
    },
    {
        code: "GM002",
        name: "Management of Diabetic Ketoacidosis (DKA)",
        category: "General Medicine",
        baseRate: 20000,
        requiresPreAuth: true,
        mandatoryDiagnostics: ["Blood Glucose > 250 mg/dL", "Arterial Blood Gas (ABG) showing pH < 7.3 or Bicarbonate < 15 mEq/L", "Urine Ketones Positive (3+ or 4+)"],
        minHospitalDays: 4
    }
];

export const TPA_GUIDELINES: TpaPolicy[] = [
    {
        tpaName: "Medi Assist TPA",
        roomRentLimitNormalPercent: 1.0,
        roomRentLimitIcuPercent: 2.0,
        pedWaitingYears: 3,
        copayPercentage: 10,
        cashlessNetworkHospitalOnly: false,
        nonMedicalChargesExcluded: ["Admission Fee", "Registration Fee", "Gloves/Surgical Consumables in excess", "Dietician Charges", "Hygiene Kits"]
    },
    {
        tpaName: "Paramount Health Services TPA",
        roomRentLimitNormalPercent: 1.0,
        roomRentLimitIcuPercent: 2.0,
        pedWaitingYears: 4,
        copayPercentage: 15,
        cashlessNetworkHospitalOnly: true,
        nonMedicalChargesExcluded: ["Aseptic Solution", "Nebulizer Kit charges", "Pulse Oximeter disposable probes", "Medical Waste Management fee"]
    },
    {
        tpaName: "MDIndia Health Insurance TPA",
        roomRentLimitNormalPercent: 1.5,
        roomRentLimitIcuPercent: 3.0,
        pedWaitingYears: 3,
        copayPercentage: 0,
        cashlessNetworkHospitalOnly: false,
        nonMedicalChargesExcluded: ["Thermometer charges", "Hand Sanitizer bottles", "Discharge File charges", "Service Taxes/Admin Fees"]
    },
    {
        tpaName: "Heritage Health TPA",
        roomRentLimitNormalPercent: 1.0,
        roomRentLimitIcuPercent: 2.0,
        pedWaitingYears: 4,
        copayPercentage: 20,
        cashlessNetworkHospitalOnly: true,
        nonMedicalChargesExcluded: ["Admission charges", "Patient relative meals", "Baby utility kits", "Spit mugs/Urinals"]
    }
];

export const STATE_SCHEME_VARIATIONS: StateScheme[] = [
    {
        stateCode: "MH",
        schemeName: "Mahatma Jyotirao Phule Jan Arogya Yojana (MJPJAY)",
        mandatoryRegistration: "ROHINI ID",
        emergencyPreAuthGraceHours: 72,
        additionalExclusions: ["Implants not sourced through government empanelled distributors", "Cosmetic modifications"]
    },
    {
        stateCode: "KA",
        schemeName: "Ayushman Bharat - Arogya Karnataka (AB-ArK)",
        mandatoryRegistration: "ABHA Card & Referral Code from Public Hospital (unless Emergency)",
        emergencyPreAuthGraceHours: 48,
        additionalExclusions: ["Outpatient diagnostic scans done outside hospital campus", "Non-scheme surgical consumables"]
    },
    {
        stateCode: "TN",
        schemeName: "Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS)",
        mandatoryRegistration: "Smart Card ID / ABHA Card",
        emergencyPreAuthGraceHours: 24,
        additionalExclusions: ["Specialist consultation charges not pre-registered in pre-auth packages"]
    },
    {
        stateCode: "UP",
        schemeName: "Ayushman Bharat - Pradhan Mantri Jan Arogya Yojana (UP-PMJAY)",
        mandatoryRegistration: "Ayushman Card (Golden Card) & Aadhaar",
        emergencyPreAuthGraceHours: 72,
        additionalExclusions: ["Private room upgrades (strict general ward rule applies unless ICU)"]
    }
];

export const IRDAI_REGULATORY_CLAUSES = [
    {
        id: "IRDAI-SEC-39",
        title: "Waiting Period for Pre-Existing Diseases (PED)",
        description: "According to the master circular of 2024, insurers cannot exceed a maximum waiting period of 36 months (3 years) for Pre-Existing Diseases. Any policy renewed continuously for 60 months (5 years) becomes incontestable on grounds of PED.",
        citation: "IRDAI/HLT/REG/CIR/2024/039"
    },
    {
        id: "IRDAI-SEC-45",
        title: "Cashless Authorization TAT (Turnaround Time)",
        description: "Insurer/TPA must communicate authorization decisions (Approve, Query, Deny) within 1 hour of receiving all required documents from the hospital. Discharge pre-auth must be processed within 3 hours.",
        citation: "IRDAI/HLT/MISC/CIR/2024/112"
    },
    {
        id: "IRDAI-SEC-58",
        title: "No Proportionate Deduction on ICU Charges",
        description: "Insurers cannot apply proportionate deduction on medical bills if the patient occupies an ICU room that exceeds their policy capping limit, as ICU expenses are standard and lifesaving.",
        citation: "IRDAI/HLT/REG/2016/58"
    }
];
