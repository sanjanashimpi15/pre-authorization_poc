import { getGoogleGenAIClient } from '../services/apiKeys';
import { MODEL_TEXT } from '../config/modelConfig';
import { GroundedTestCase } from './groundedBattery';

export async function generateBatchWithGemini(count: number = 20, modelName: string = MODEL_TEXT): Promise<GroundedTestCase[] | null> {
  const ai = getGoogleGenAIClient();

  const prompt = `
You are a highly experienced Indian clinical documentation specialist and TPA claims expert.
Your task is to generate an array of ${count} highly realistic, completely fictional patient cases based on common Indian inpatient conditions.

CRITICAL INSTRUCTION: You must bias case generation heavily toward the following specific scenario types to test edge cases:
1. Cataract/Ophthalmic surgery (must test that ICD-10 chapter lock assigns H-codes correctly).
2. LSCS/obstetric/maternity cases (must test that ICD-10 chapter lock assigns O/Z-codes correctly).
3. Hysterectomy/fibroid/gynecological cases (must test that ICD-10 chapter lock assigns D/N/Z-codes correctly).
4. Dengue-vs-Typhoid clinical confusion (to test clinical indicators and proper differentiation).
5. TVD/CABG cardiology cases (to test cardiology coding).
6. Denial appeal cases that explicitly need to cite comorbidities present in the clinical notes (such as a history of hypertension, a prior stent placed months earlier, or documented bleeding).

CONDITIONS TO USE: Dengue Fever, Typhoid Fever, Ischemic Heart Disease / Planned CABG, Senile Cataract, Maintenance Hemodialysis, Acute Appendicitis, Osteoarthritis / Planned TKR, Acute Gastroenteritis, Maternity (LSCS), Uterine Fibroids / Hysterectomy.

For each case, construct a JSON object matching this TypeScript interface exactly:
interface GroundedTestCase {
  id: number;
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  diagnosis: string;
  code: string; // Valid WHO ICD-10 code (e.g. A97.0, A01.0, etc.)
  chiefComplaints: string;
  hpi: string;
  relevantClinicalFindings: string;
  additionalClinicalNotes?: string;
  duration?: string;
  treatmentTakenSoFar?: string;
  reasonForHospitalisation?: string;
  uploadedDocuments?: string[]; // array of strings like 'doctor_notes', 'blood_test_reports', 'ecg'
  patientName?: string;
  patient?: {
    patientName?: string;
    age?: number;
    gender?: 'Male' | 'Female' | 'Other';
    mobileNumber?: string;
  };
  insurance?: {
    policyNumber?: string;
    insurerName?: string;
    tpaName?: string;
    sumInsured?: number;
    balanceSumInsured?: number;
    tpaIdCardNumber?: string;
  };
  vitals?: { bp?: string; pulse?: string; temp?: string; spo2?: string; rr?: string };
  expected: { mustFlag: string[]; mustNotFlag: string[]; shouldGenerate: boolean; };
  notes: string;
  realGap: string; // The explicit, real-world TPA gap this case is designed to trigger (e.g., "Missing NS1 Antigen", "Lack of medical necessity (OPD manageable)")
  sourceReasoning: string; // The IRDAI/TPA rule justifying the gap.
}

INSTRUCTIONS:
1. Generate unique patient presentations, ages, and vitals for every case.
2. Ensure realistic gaps: e.g., missing CAG for CABG, missing LMP/EDD for maternity, missing exact symptom duration for TKR, missing Widal for typhoid.
3. Also include some "Control" cases where there are NO gaps (perfect documentation) and realGap is "None", to test over-flagging.
4. Output ONLY a valid JSON array of ${count} objects. Do not include markdown code blocks.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) {
        throw new Error("Empty response text from Gemini dynamic generation");
    }
    
    let generatedCases = JSON.parse(text) as GroundedTestCase[];
    
    // Assign random unique IDs to avoid collisions
    const baseId = Math.floor(Math.random() * 10000) + 5000;
    generatedCases = generatedCases.map((tc, idx) => ({
      ...tc,
      id: baseId + idx
    }));

    return generatedCases;
  } catch (error) {
    console.error(`[DynamicCaseGenerator] Error synthesizing cases:`, error);
    return null;
  }
}

export interface MultiModuleTestCase extends GroundedTestCase {
  rawDocumentText?: string;
  simulatedDenialReason?: string;
  difficulty?: 'medium' | 'high' | 'extreme';
  focusCategory?: 'preauth_heavy' | 'denial_heavy' | 'billing_complex' | 'all';
  expectedAnswer?: {
    expectedExtraction?: {
      patientName?: string | null;
      age?: number | null;
      gender?: 'Male' | 'Female' | 'Other' | null;
      policyNumber?: string | null;
      insurerName?: string | null;
    } | null;
    expectedReview?: {
      mustFlag: string[];
      mustNotFlag: string[];
      shouldGenerate: boolean;
    } | null;
    expectedCode?: string | null;
    expectedCost?: number | null;
    expectedEligibility?: 'approved' | 'denied' | 'query' | 'partial_approved' | null;
    expectedAppealCitations?: string[] | null;
  } | null;
}

export async function generateMultiModuleBatchWithGemini(
  count: number = 20,
  modelName: string = MODEL_TEXT,
  focusMode: string = 'all'
): Promise<MultiModuleTestCase[] | null> {
  const ai = getGoogleGenAIClient();

  const focusPrompt = focusMode && focusMode !== 'all' ? `
CRITICAL FOCUS MODE ACTIVE: You MUST generate cases matching the focus category "${focusMode}" for ALL generated cases:
- preauth_heavy: Focus heavily on medical necessity queries, multiple comorbidities (e.g. chronic kidney disease, uncontrolled hypertension, history of stenting), joint replacement criteria, and oncology staging documents.
- denial_heavy: Focus on cases starting with complex simulated TPA denials (e.g. denied due to non-surgical treatment trials not attempted, or missing clinical rationale), requiring robust clinical evidence reviews and appeal letters.
- billing_complex: Focus on multi-procedure surgeries (e.g. laparotomy with cholecystectomy), package rate validation warnings, room rent capping excesses with patient-share calculations, and PM-JAY package exclusions.
- insurer_rules: Focus heavily on insurer-specific policy validation rules (e.g. Star Health, Care Health, HDFC ERGO) and verifying documentary evidence.
- specialty_caps: Focus heavily on medical specialty codes (ophthalmology/H-codes, maternity/O-codes, orthopedics/M-codes, gynecology/D-N-Z codes) to test ICD-10 chapter locks.
- diagnosis_codes: Focus on clinical differentiation scenarios (e.g., Dengue Fever vs Typhoid Fever, or appendicitis) to test diagnostic accuracy.
- hospital_rent: Focus heavily on room rent capping (Normal vs ICU), stayed duration audits, and proportional room rent deductions.
` : '';

  const seed = Date.now() + Math.random().toString(36).substring(7);

  const prompt = `
You are a highly experienced Indian clinical documentation specialist and TPA claims expert.
Your task is to generate an array of ${count} highly realistic, completely fictional patient cases based on common Indian inpatient conditions.
Dynamic Randomization Seed: ${seed}

CRITICAL INSTRUCTIONS:
1. You must bias case generation heavily toward the following specific scenario types to test edge cases:
   - Cataract/Ophthalmic surgery (must test that ICD-10 chapter lock assigns H-codes correctly).
   - LSCS/obstetric/maternity cases (must test that ICD-10 chapter lock assigns O/Z-codes correctly).
   - Hysterectomy/fibroid/gynecological cases (must test that ICD-10 chapter lock assigns D/N/Z-codes correctly).
   - Dengue-vs-Typhoid clinical confusion (to test clinical indicators and proper differentiation).
   - TVD/CABG cardiology cases (to test cardiology coding).
   - Denial appeal cases that explicitly need to cite comorbidities present in the clinical notes (such as a history of hypertension, a prior stent placed months earlier, or documented bleeding).
   - Acute Myocardial Infarction (Acute MI) and Community-acquired Pneumonia (Pneumonia) cases.

2. **ICD-10 CODE COMPLIANCE**:
   - For all diagnoses, you MUST use strictly valid WHO-compliant ICD-10 codes (3 or 4 characters, e.g. H25.1, J18.9, M17.1, O34.2).
   - DO NOT use US-specific ICD-10-CM codes with lateralization/clinical modification suffixes (such as H25.11, M17.11, O34.21, I25.10).
   - Ensure the expected ICD code maps to the correct category lock:
     * Ophthalmology/Cataract must map to H codes (e.g. H25.1, H25.9, not H25.11).
     * Maternity/LSCS/Delivery must map to O or Z codes (e.g. O82, O34.2, not O34.21).
     * Gynecology/Hysterectomy must map to D, N, or Z codes.
     * Orthopedics/Osteoarthritis/TKR must map to M codes (e.g. M17.1, not M17.11).

${focusPrompt}

CONDITIONS TO USE: Dengue Fever, Typhoid Fever, Ischemic Heart Disease / Planned CABG, Acute Myocardial Infarction (Acute MI), Community-acquired Pneumonia (Pneumonia), Senile Cataract, Maintenance Hemodialysis, Acute Appendicitis, Osteoarthritis / Planned TKR, Acute Gastroenteritis, Maternity (LSCS), Uterine Fibroids / Hysterectomy.

For each case, construct a JSON object matching this TypeScript interface exactly:
interface MultiModuleTestCase {
  id: number;
  category: 'A' | 'B' | 'C' | 'D' | 'E';
  difficulty: 'medium' | 'high' | 'extreme';
  focusCategory: 'preauth_heavy' | 'denial_heavy' | 'billing_complex';
  diagnosis: string;
  code: string; // Valid 3 or 4-digit WHO ICD-10 code (e.g. J18.9, E11.9, H25.1, M17.1)
  chiefComplaints: string;
  hpi: string;
  relevantClinicalFindings: string;
  additionalClinicalNotes?: string;
  duration?: string;
  treatmentTakenSoFar?: string;
  reasonForHospitalisation?: string;
  uploadedDocuments?: string[]; // array of strings like 'doctor_notes', 'blood_test_reports', 'ecg'
  patientName?: string;
  patient?: {
    patientName?: string;
    age?: number;
    gender?: 'Male' | 'Female' | 'Other';
    mobileNumber?: string;
  };
  insurance?: {
    policyNumber?: string;
    insurerName?: string;
    tpaName?: string;
    sumInsured?: number;
    balanceSumInsured?: number;
    tpaIdCardNumber?: string;
  };
  vitals?: { bp?: string; pulse?: string; temp?: string; spo2?: string; rr?: string };
  expected: { mustFlag: string[]; mustNotFlag: string[]; shouldGenerate: boolean; };
  notes: string;
  realGap: string; // The explicit, real-world TPA gap this case is designed to trigger
  sourceReasoning: string; // The IRDAI/TPA rule justifying the gap.
  rawDocumentText: string; // Full realistic unstructured document text (like a discharge summary or doctor letter) that contains all the patient name, age, gender, policy number, insurer name, diagnoses and findings. Integrate real Indian clinic/physician names and scanned medical jargon/short hands.
  simulatedDenialReason?: string; // Attach a simulated TPA denial/query reason text (e.g. "prior authorization denied as medical necessity not established for normal ward stay", "unbundled modifier missing for surgeon package charges", "short stay observation under 24 hours is not admissible for inpatient pre-auth") for roughly 30-40% of cases. Otherwise, leave null or omit.
  expectedAnswer: {
    expectedExtraction: {
      patientName: string | null;
      age: number | null;
      gender: 'Male' | 'Female' | 'Other' | null;
      policyNumber: string | null;
      insurerName: string | null;
    } | null;
    expectedReview: {
      mustFlag: string[];
      mustNotFlag: string[];
      shouldGenerate: boolean;
    } | null;
    expectedCode: string | null; // The exact expected 3 or 4-digit WHO ICD-10 code (no CM lateralization suffixes like H25.11, M17.11)
    expectedCost: number | null; // Expected total cost in INR (numerical)
    expectedEligibility: 'approved' | 'denied' | 'query' | 'partial_approved' | null; // expected outcome
    expectedAppealCitations: string[] | null; // key findings/excerpts that must be cited in an appeal if denialReason is present
  };
}

INSTRUCTIONS:
1. Generate unique patient presentations, ages, and vitals for every case.
2. For the expectedAnswer, leave fields null if a given case is not designed to exercise that module.
3. Keep rawDocumentText medically realistic and comprehensive.
4. Output ONLY a valid JSON array of ${count} objects. Do not include markdown code blocks.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response text from Gemini dynamic generation");
    }

    let generatedCases = JSON.parse(text) as MultiModuleTestCase[];

    // Assign random unique IDs to avoid collisions
    const baseId = Math.floor(Math.random() * 10000) + 15000;
    generatedCases = generatedCases.map((tc, idx) => ({
      ...tc,
      id: baseId + idx
    }));

    return generatedCases;
  } catch (error) {
    console.error(`[DynamicCaseGenerator] Error synthesizing multi-module cases, using static highPainTestCases as fallback:`, error);
    return highPainTestCases.slice(0, count);
  }
}

export const highPainTestCases: MultiModuleTestCase[] = [
  {
    id: 22959,
    category: 'A',
    difficulty: "high",
    focusCategory: "preauth_heavy",
    diagnosisText: "Senile Nuclear Cataract right eye",
    diagnosis: "Senile Nuclear Cataract right eye with visual acuity 6/60",
    code: "H25.1",
    chiefComplaints: "C/O gradual diminution of vision RE for 8 months.",
    hpi: "C/O gradual diminution of vision RE for 8 months. A/H/O DM 12 years on OHA.",
    relevantClinicalFindings: "O/E VA RE 6/60, LE 6/18. Slit lamp: Nuclear sclerosis grade III. Fundus: hazy view.",
    additionalClinicalNotes: "Advised Phaco + IOL under LA. Pre-op ECG and sugar control required.",
    uploadedDocuments: ["doctor_notes", "blood_test_reports"],
    patientName: "Ramesh Sharma",
    patient: { patientName: "Ramesh Sharma", age: 68, gender: "Male" },
    insurance: { policyNumber: "STAR-987654", insurerName: "Star Health and Allied Insurance Co Ltd", tpaName: "Medi Assist", sumInsured: 500000 },
    simulatedDenialReason: "Pre-authorization denied due to missing pre-operative blood sugar control documentation and ECG report.",
    rawDocumentText: "PATIENT: Ramesh Sharma, Age: 68, Gender: Male. Policy Number: STAR-987654, Insurer: Star Health and Allied Insurance Co Ltd, TPA: Medi Assist. Clinical Notes: gradual diminution of vision RE for 8 months. DM 12 years on OHA. VA RE 6/60, LE 6/18. Slit lamp: Nuclear sclerosis grade III. Phaco + IOL under LA. Requested Room: General. Estimated Cost: 85000.",
    cost: { totalEstimatedCost: 85000, wardType: "General" } as any,
    expected: { mustFlag: ["Sugar Control"], mustNotFlag: [], shouldGenerate: true },
    notes: "Cataract pre-op checks required",
    realGap: "Missing blood sugar control documentation",
    sourceReasoning: "Standard ophthalmic pre-op checklist rules",
    expectedAnswer: {
      expectedExtraction: {
        patientName: "Ramesh Sharma",
        age: 68,
        gender: "Male",
        policyNumber: "STAR-987654",
        insurerName: "Star Health and Allied Insurance Co Ltd"
      },
      expectedReview: null,
      expectedCode: "H25.1",
      expectedCost: 85000,
      expectedEligibility: "query",
      expectedAppealCitations: ["DM 12 years", "Nuclear sclerosis grade III"]
    }
  },
  {
    id: 22960,
    category: 'B',
    difficulty: "extreme",
    focusCategory: "denial_heavy",
    focusCategory_simulated: "denial_heavy",
    diagnosisText: "Maternal care for uterine scar from previous surgery",
    diagnosis: "Previous LSCS with scar, now G2P1L1 at 37 weeks for elective repeat LSCS",
    code: "O34.2",
    chiefComplaints: "Pain abdomen since morning. A/H/O LSCS 4 years back.",
    hpi: "G2P1L1 at 37 weeks. C/O pain abdomen since morning. Scar tenderness present.",
    relevantClinicalFindings: "USG: Single live fetus, cephalic, AFI adequate.",
    additionalClinicalNotes: "Advised elective repeat LSCS. Previous scar noted.",
    uploadedDocuments: ["doctor_notes", "usg_report"],
    patientName: "Priya Patel",
    patient: { patientName: "Priya Patel", age: 32, gender: "Female" },
    insurance: { policyNumber: "CARE-456789", insurerName: "Care Health Insurance", tpaName: "MDIndia", sumInsured: 300000 },
    simulatedDenialReason: "Claim denied as previous LSCS scar not documented as high-risk factor in initial pre-auth submission.",
    rawDocumentText: "PATIENT: Priya Patel, Age: 32, Gender: Female. Policy Number: CARE-456789, Insurer: Care Health Insurance, TPA: MDIndia. Clinical Notes: Previous LSCS 4 years back. Pain abdomen since morning. Scar tenderness present. Elective repeat LSCS. Expected Package: 125000.",
    cost: { totalEstimatedCost: 125000, wardType: "Private" } as any,
    expected: { mustFlag: ["Scar tenderness"], mustNotFlag: [], shouldGenerate: true },
    notes: "LSCS repeat scar tenderness",
    realGap: "Scar tenderness verification",
    sourceReasoning: "Maternity high risk guidelines",
    expectedAnswer: {
      expectedExtraction: {
        patientName: "Priya Patel",
        age: 32,
        gender: "Female",
        policyNumber: "CARE-456789",
        insurerName: "Care Health Insurance"
      },
      expectedReview: null,
      expectedCode: "O34.2",
      expectedCost: 125000,
      expectedEligibility: "approved",
      expectedAppealCitations: ["Scar tenderness present", "Previous LSCS 4 years back"]
    }
  },
  {
    id: 22961,
    category: 'C',
    difficulty: "high",
    focusCategory: "billing_complex",
    diagnosisText: "Primary osteoarthritis of knee",
    diagnosis: "Bilateral Primary Gonarthrosis with severe pain, planned TKR right knee",
    code: "M17.1",
    chiefComplaints: "C/O bilateral knee pain for 5 years, worse on right.",
    hpi: "Varus deformity, crepitus present. X-ray: Grade IV OA.",
    relevantClinicalFindings: "Grade IV osteoarthritis of knee.",
    additionalClinicalNotes: "Advised right TKR. Implant cost ₹1.8 lakh. Room rent capping applies.",
    uploadedDocuments: ["doctor_notes", "xray_report"],
    patientName: "Suresh Rao",
    patient: { patientName: "Suresh Rao", age: 62, gender: "Male" },
    insurance: { policyNumber: "HDFC-112233", insurerName: "HDFC ERGO General Insurance Co Ltd", tpaName: "Paramount Healthcare", sumInsured: 800000 },
    simulatedDenialReason: "Room rent capping applied. Implant cost above package limit.",
    rawDocumentText: "PATIENT: Suresh Rao, Age: 62, Gender: Male. Policy Number: HDFC-112233, Insurer: HDFC ERGO General Insurance Co Ltd, TPA: Paramount Healthcare. Clinical Notes: bilateral knee pain for 5 years. Varus deformity, crepitus. Grade IV OA. Right TKR planned. Implant cost: 1.8 lakh. Expected Cost: 450000.",
    cost: { totalEstimatedCost: 450000, wardType: "Private" } as any,
    expected: { mustFlag: ["Varus deformity"], mustNotFlag: [], shouldGenerate: true },
    notes: "TKR implant costing and caps",
    realGap: "Implant cost caps check",
    sourceReasoning: "HDFC policy limits rules",
    expectedAnswer: {
      expectedExtraction: {
        patientName: "Suresh Rao",
        age: 62,
        gender: "Male",
        policyNumber: "HDFC-112233",
        insurerName: "HDFC ERGO General Insurance Co Ltd"
      },
      expectedReview: null,
      expectedCode: "M17.1",
      expectedCost: 450000,
      expectedEligibility: "partial_approved",
      expectedAppealCitations: ["Grade IV OA", "bilateral knee pain for 5 years"]
    }
  }
];

export default highPainTestCases;
