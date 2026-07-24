import { ProtocolMetadata } from '../types';

// Define the shape of our policy rules to match ClinicalProtocol pattern where possible
export interface InsurancePolicyRule {
  id: string;
  title: string;
  metadata: ProtocolMetadata;
  preconditions: string[];
  scope: string;
  canonical_sources: { name: string; url?: string }[];
  documentation_requirements: string[]; // List of required documents/reports
  clinical_criteria: string[];          // List of clinical findings required
}

/**
 * STARTER SEED DATASET FOR INDIAN HEALTH INSURANCE & PM-JAY POLICIES
 * NOTE: This is a starter seed library containing common procedures and medical necessity rules.
 * In a production setting, this library should be expanded with comprehensive insurer/TPA/PM-JAY circulars
 * and policy documents.
 */
export const INSURANCE_POLICY_RULES: InsurancePolicyRule[] = [
  // (a) PM-JAY Covered Procedures (8-10 Procedures)
  {
    id: 'PMJAY-CATARACT-001',
    title: 'PM-JAY Senile Cataract Surgery (HBP Package)',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['National Health Authority (NHA)'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National', 'State Schemes'],
      scope: 'Surgical management of senile cataract under package rate guidelines.',
      use_if_conditions: ['Senile Cataract with visual impairment'],
      canonical_sources: [{ name: 'NHA Health Benefit Packages Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. R. Verma (Ophthalmology)', date: '2024-08-30', comments: 'Approved' }]
    },
    preconditions: ['Visual acuity in affected eye is < 6/12 or patient reports significant functional impairment.'],
    scope: 'Cataract Surgery',
    canonical_sources: [{ name: 'NHA Health Benefit Packages Guidelines' }],
    documentation_requirements: ['vision acuity', 'A-scan', 'biometry'],
    clinical_criteria: ['Visual acuity impairment', 'Lens opacity on slit-lamp examination']
  },
  {
    id: 'PMJAY-APPENDECTOMY-002',
    title: 'PM-JAY Acute Appendectomy Guideline',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['National Health Authority (NHA)'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Emergency appendectomy for acute appendicitis.',
      use_if_conditions: ['Acute appendicitis clinical features', 'Radiological confirmation'],
      canonical_sources: [{ name: 'NHA General Surgery Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. S. Nair (General Surgery)', date: '2024-08-30', comments: 'Approved' }]
    },
    preconditions: ['Acute onset of lower right quadrant abdominal pain.'],
    scope: 'Appendectomy',
    canonical_sources: [{ name: 'NHA General Surgery Guidelines' }],
    documentation_requirements: ['ultrasound', 'CT scan', 'cbc'],
    clinical_criteria: ['Appendiceal diameter > 6mm on ultrasound/CT', 'Leukocytosis (WBC > 11,000/mcL)']
  },
  {
    id: 'PMJAY-CHOLECYSTECTOMY-003',
    title: 'PM-JAY Laparoscopic Cholecystectomy Guideline',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['National Health Authority (NHA)'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Cholecystectomy for cholelithiasis or acute cholecystitis.',
      use_if_conditions: ['Cholelithiasis with biliary colic', 'Acute Cholecystitis'],
      canonical_sources: [{ name: 'NHA General Surgery Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. S. Nair (General Surgery)', date: '2024-08-30', comments: 'Approved' }]
    },
    preconditions: ['Ultrasound evidence of gallstones or gall bladder wall thickening.'],
    scope: 'Cholecystectomy',
    canonical_sources: [{ name: 'NHA General Surgery Guidelines' }],
    documentation_requirements: ['ultrasound', 'lft', 'cbc'],
    clinical_criteria: ['Gallstones identified on ultrasound', 'Gallbladder wall thickness > 3mm']
  },
  {
    id: 'PMJAY-CABG-004',
    title: 'PM-JAY Coronary Artery Bypass Grafting (CABG)',
    metadata: {
      version: '1.2.0',
      date_effective: '2023-06-01',
      last_reviewed: '2024-08-15',
      authors: ['NHA Cardiology Panel'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Surgical revascularization for coronary artery disease.',
      use_if_conditions: ['Multi-vessel coronary artery disease', 'Left Main stenosis'],
      canonical_sources: [{ name: 'NHA Cardiology Package Circulars' }],
      reviewer_signoff: [{ name: 'Dr. H. Jha (CTVS)', date: '2024-08-10', comments: 'Aligned with PM-JAY HBP 2.2' }]
    },
    preconditions: ['Patient has significant CAD limiting quality of life or survival.'],
    scope: 'CABG Surgery',
    canonical_sources: [{ name: 'NHA Cardiology Package Circulars' }],
    documentation_requirements: ['angiography', 'ecg', 'echocardiogram'],
    clinical_criteria: ['Triple vessel disease (TVD) or Left Main disease (>50% stenosis)', 'LVEF assessment']
  },
  {
    id: 'PMJAY-TKR-005',
    title: 'PM-JAY Total Knee Arthroplasty (TKR)',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['NHA Orthopedics Panel'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Total Knee Replacement for severe osteoarthritis.',
      use_if_conditions: ['Severe Osteoarthritis of Knee (KL Grade 3-4)'],
      canonical_sources: [{ name: 'NHA Orthopedics Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. M. Mehta (Orthopedics)', date: '2024-08-25', comments: 'Approved' }]
    },
    preconditions: ['Severe joint pain and loss of function refractory to conservative treatment.'],
    scope: 'Total Knee Replacement',
    canonical_sources: [{ name: 'NHA Orthopedics Guidelines' }],
    documentation_requirements: ['xray_knee', 'prescription', 'physiotherapy'],
    clinical_criteria: ['Severe joint space narrowing on X-Ray', 'KL Grade 3 or 4 osteoarthritis', 'Documented conservative management trial of at least 3 months']
  },
  {
    id: 'PMJAY-HEMODIALYSIS-006',
    title: 'PM-JAY Maintenance Hemodialysis',
    metadata: {
      version: '1.1.0',
      date_effective: '2023-01-01',
      last_reviewed: '2024-07-20',
      authors: ['NHA Nephrology Committee'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Maintenance hemodialysis for End-Stage Renal Disease (ESRD).',
      use_if_conditions: ['ESRD', 'Chronic Kidney Disease Stage 5'],
      canonical_sources: [{ name: 'NHA Dialysis Package Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. K. Gowda (Nephrology)', date: '2024-07-15', comments: 'Aligned with PM-JAY guidelines' }]
    },
    preconditions: ['ESRD requiring hemodialysis therapy.'],
    scope: 'Hemodialysis',
    canonical_sources: [{ name: 'NHA Dialysis Package Guidelines' }],
    documentation_requirements: ['kft', 'nephrologist referral', 'viral screening'],
    clinical_criteria: ['eGFR < 15 ml/min/1.73m2', 'Serum Creatinine persistently elevated']
  },
  {
    id: 'PMJAY-DENGUE-007',
    title: 'PM-JAY Dengue Medical Management Guideline',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['NHA Medicine Committee'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Inpatient medical management for severe dengue fever.',
      use_if_conditions: ['Dengue Fever with warning signs or severe thrombocytopenia'],
      canonical_sources: [{ name: 'NHA Medical Management Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. P. Sharma (Internal Medicine)', date: '2024-08-30', comments: 'Approved' }]
    },
    preconditions: ['Positive serology for Dengue.'],
    scope: 'Dengue Management',
    canonical_sources: [{ name: 'NHA Medical Management Guidelines' }],
    documentation_requirements: ['ns1_antigen', 'cbc'],
    clinical_criteria: ['Platelet count < 50,000/mcL', 'Dengue NS1 Antigen or IgM positive']
  },
  {
    id: 'PMJAY-TYPHOID-008',
    title: 'PM-JAY Enteric/Typhoid Fever Guideline',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['NHA Medicine Committee'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Inpatient medical management of Typhoid/Enteric Fever.',
      use_if_conditions: ['Complicated or severe Enteric/Typhoid fever'],
      canonical_sources: [{ name: 'NHA Medical Management Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. P. Sharma (Internal Medicine)', date: '2024-08-30', comments: 'Approved' }]
    },
    preconditions: ['Clinical fever and positive diagnostic markers.'],
    scope: 'Typhoid Management',
    canonical_sources: [{ name: 'NHA Medical Management Guidelines' }],
    documentation_requirements: ['blood_culture', 'urine_routine', 'cbc'],
    clinical_criteria: ['Fever > 101°F refractory to oral medication', 'Positive blood culture for Salmonella Typhi or Widal positive']
  },
  {
    id: 'PMJAY-SPINE-009',
    title: 'PM-JAY Herniated Disc Laminectomy Guideline',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['NHA Ortho & Neuro Committee'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Surgical decompression for disc herniation.',
      use_if_conditions: ['Herniated Disc with radiculopathy or neurological deficit'],
      canonical_sources: [{ name: 'NHA Spine Surgery Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. M. Mehta (Orthopedics)', date: '2024-08-25', comments: 'Approved' }]
    },
    preconditions: ['Neurological signs of nerve root compression.'],
    scope: 'Laminectomy / Discectomy',
    canonical_sources: [{ name: 'NHA Spine Surgery Guidelines' }],
    documentation_requirements: ['mri', 'prescription'],
    clinical_criteria: ['MRI scan showing disc herniation with nerve root impingement', 'Failure of conservative management for at least 6 weeks']
  },
  {
    id: 'PMJAY-MATERNITY-010',
    title: 'PM-JAY Cesarean Section (LSCS) Guideline',
    metadata: {
      version: '1.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-01',
      authors: ['NHA OBGYN Committee'],
      institution: 'Ayushman Bharat PM-JAY',
      jurisdiction: ['National'],
      scope: 'Inpatient cesarean delivery.',
      use_if_conditions: ['Emergency or indicated planned Cesarean Section'],
      canonical_sources: [{ name: 'NHA Obstetric Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. A. Rao (OBGYN)', date: '2024-08-30', comments: 'Approved' }]
    },
    preconditions: ['Pregnancy at term requiring surgical delivery.'],
    scope: 'Cesarean Delivery',
    canonical_sources: [{ name: 'NHA Obstetric Guidelines' }],
    documentation_requirements: ['ultrasound', 'cbc'],
    clinical_criteria: ['Indication for C-Section (e.g., fetal distress, breech, repeat LSCS)', 'Obstetric USG report']
  },

  // (b) Commercial Insurers Medical-Necessity Clause Patterns (2-3 Policies)
  {
    id: 'COMM-CARDIAC-PTCA',
    title: 'Commercial Insurer Medical Necessity for Coronary Angioplasty (PTCA)',
    metadata: {
      version: '2.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-15',
      authors: ['Standard Commercial Underwriting Ruleset'],
      institution: 'Major Indian Commercial Insurers',
      jurisdiction: ['Commercial Cashless'],
      scope: 'Approval criteria for Percutaneous Transluminal Coronary Angioplasty (PTCA).',
      use_if_conditions: ['Coronary Artery Disease requiring angioplasty'],
      canonical_sources: [{ name: 'Standard Health Policy Underwriting Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. S. Patel (Cardiology)', date: '2024-09-10', comments: 'Standard medical necessity criteria' }]
    },
    preconditions: ['Clinical symptoms of angina or equivalent, refractory to optimal medical therapy.'],
    scope: 'Angioplasty / PTCA',
    canonical_sources: [{ name: 'Standard Health Policy Underwriting Guidelines' }],
    documentation_requirements: ['angiography', 'ecg', 'prescription'],
    clinical_criteria: ['Angiogram report showing > 70% stenosis in a major coronary artery (> 50% for Left Main)', 'Clinical symptoms of angina (CCS Grade II-IV)']
  },
  {
    id: 'COMM-ORTHO-THR',
    title: 'Commercial Insurer Medical Necessity for Total Hip Replacement (THR)',
    metadata: {
      version: '2.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-15',
      authors: ['Standard Commercial Underwriting Ruleset'],
      institution: 'Major Indian Commercial Insurers',
      jurisdiction: ['Commercial Cashless'],
      scope: 'Approval criteria for Total Hip Replacement.',
      use_if_conditions: ['Severe Hip Joint Disease (Osteoarthritis, AVN)'],
      canonical_sources: [{ name: 'Standard Health Policy Underwriting Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. M. Mehta (Orthopedics)', date: '2024-09-10', comments: 'Standard medical necessity criteria' }]
    },
    preconditions: ['Severe hip joint space narrowing or avascular necrosis causing functional disability.'],
    scope: 'Total Hip Replacement',
    canonical_sources: [{ name: 'Standard Health Policy Underwriting Guidelines' }],
    documentation_requirements: ['mri', 'ct_scan', 'prescription', 'physiotherapy'],
    clinical_criteria: ['Severe osteoarthritis or avascular necrosis Grade III/IV confirmed by MRI/CT/X-ray', 'Documentation of pain and functional impairment unresponsive to conservative management (NSAIDs, physiotherapy) for at least 3 months']
  },
  {
    id: 'COMM-GENSURG-HERNIA',
    title: 'Commercial Insurer Medical Necessity for Laparoscopic Hernia Repair',
    metadata: {
      version: '2.0.0',
      date_effective: '2024-01-01',
      last_reviewed: '2024-09-15',
      authors: ['Standard Commercial Underwriting Ruleset'],
      institution: 'Major Indian Commercial Insurers',
      jurisdiction: ['Commercial Cashless'],
      scope: 'Approval criteria for Laparoscopic Hernia Repair.',
      use_if_conditions: ['Abdominal or Inguinal Hernia'],
      canonical_sources: [{ name: 'Standard Health Policy Underwriting Guidelines' }],
      reviewer_signoff: [{ name: 'Dr. S. Nair (General Surgery)', date: '2024-09-10', comments: 'Standard medical necessity criteria' }]
    },
    preconditions: ['Documented hernia with clinical symptoms.'],
    scope: 'Hernia Repair',
    canonical_sources: [{ name: 'Standard Health Policy Underwriting Guidelines' }],
    documentation_requirements: ['ultrasound', 'prescription'],
    clinical_criteria: ['Clinical presentation of pain, discomfort, or swelling in hernia region', 'Hernia confirmation via abdominal/pelvic ultrasound showing fascial defect']
  }
];
