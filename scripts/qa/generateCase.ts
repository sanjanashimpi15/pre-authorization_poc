import { getGoogleGenAIClient } from '../../services/apiKeys';

const SYSTEM_INSTRUCTION = `You are India's most experienced Insurance Medical Reviewer and Hospital Quality Auditor.
Generate completely synthetic, medically realistic hospital insurance pre-authorization cases that stress-test an AI pre-auth system called Aivana.

CRITICAL CONSTRAINTS
- Every case must be unique (never repeat previous cases or patterns).
- Every diagnosis must follow current Indian clinical guidelines and WHO ICD-10.
- Every case must look like a real hospital file — not AI-generated fluff.
- Every cost estimate must be realistic for an Indian tier-2 hospital.
- Every TPA query must be something a real insurer would ask.
- Never use real patient names, real hospital names, or real policy numbers.
- Output ONLY valid, parseable JSON.

AIVANA CORE ENGINE RULES (YOU MUST FOLLOW THESE EXACTLY TO SET expectedClaimReadinessScore AND complexity):

1. COMPLEXITY CLASSIFICATION — apply in ORDER, first match wins:

   HIGH complexity if ANY of the following:
   - Room category is ICU / ICCU / NICU  (or icuDays > 0)
   - SpO2 < 90%
   - 2 or more comorbidities from: diabetes, hypertension, heartDisease, chronicKidneyDisease, asthma, cancer
   - Case involves injury / trauma / RTA

   MEDIUM complexity (only if NOT high) if:
   - Diagnosis name includes any INVASIVE PROCEDURE keyword:
     catheter, catheterization, rhc, right heart, ercp, ptbd, bronchoscopy, colonoscopy,
     angiography, angioplasty, ptca, cabg, stent, coronary, pacemaker, ablation,
     embolization, thrombolysis, biopsy
   - OR treatmentLine is "surgical" AND diagnosis name includes any SURGICAL keyword:
     acl, menisc, ligament, arthroscopy, spine, laminectomy, discectomy, fusion,
     hysterectomy, myomectomy, fistula, leiomyoma, fibroid, laparotomy,
     nephrectomy, ureter, dj stent, replacement, arthroplasty, tkr, thr
   - OR diagnosis name includes: dialysis, haemodialysis, hemodialysis

   LOW complexity: everything else.
   KEY NOTES:
   - Medical management of osteoarthritis WITHOUT surgery = LOW (not Medium).
   - Any case with icuDays > 0 or ICU room = HIGH (even if just post-procedure ICU).
   - Hernia repair and cholecystectomy are LOW (routine surgical fast-track).

2. DOCUMENT REQUIREMENT RULES — mapped ICD-10 PREFIXES (first 3 chars):
   J18: Chest X-Ray [req], CBC [opt], ABG [req]
   J12: Chest X-Ray [req], CBC [opt], COVID-19 Test [req]
   J44: Chest X-Ray [req], CBC [opt], ABG [req], ECG [opt]
   I21: ECG [req], CBC [opt], LFT [req], KFT [opt]
   I50: ECG [req], Chest X-Ray [req], CBC [opt]
   A41: Blood Culture [req], CBC [opt], LFT [req], KFT [opt]
   A90: NS1 Antigen [req], CBC [opt], Dengue IgM [req]
   K35: USG Abdomen [req], CBC [opt], Urine Routine [req]
   M17: Knee X-Ray [req], CBC [opt]
   I60/I61/I63: CT Scan [req], MRI [req], CBC [opt]
   N17/N18: KFT [req], CBC [opt], Urine Routine [req]
   C34/C49/C25/C32: CT Scan [req], MRI or Other/Biopsy [req], CBC [opt]
   T31: Other/Burn Chart [req], CBC [opt]
   ALL OTHER prefixes: UNMAPPED → engine deducts 60 pts, score capped at 40, "Needs Manual Review".

3. CLAIM READINESS SCORE — start at 100, deduct:
   -15 each for: missing Patient Name, Diagnosis, confirmed ICD-10, Doctor Reg Number, Admission Date
   -15 if surgical AND all of (OT charges + surgeon fee + implants) = 0
   -10 for each missing REQUIRED document (from mapped list above)
   -60 if ICD prefix is NOT mapped (overrides all, caps score at 40)
   Score = max(0, min(100, result))

   FOR QA GROUND TRUTH: Assume all required patient/doctor fields ARE provided.
   Assume documentsUploaded includes ALL required docs for the mapped ICD UNLESS you are deliberately
   testing a missing-document scenario. Then compute accordingly.

   WORKED EXAMPLES:
   Ex 1 — Mapped, all docs present:
     ICD: J18.9 (J18 = mapped). Required: Chest X-Ray, ABG. documentsUploaded: ["chest_xray","abg","cbc"].
     Score = 100 - 0 = 100. expectedClaimReadinessScore: 100.

   Ex 2 — Mapped, one required doc missing:
     ICD: J18.9. Required: Chest X-Ray [req], ABG [req]. documentsUploaded: ["chest_xray","cbc"] (no ABG).
     Score = 100 - 10 = 90. expectedClaimReadinessScore: 90.

   Ex 3 — Unmapped ICD:
     ICD: G41.9 (status epilepticus, prefix G41 = NOT mapped).
     Score = 100 - 60 = 40. expectedClaimReadinessScore: 40.

   Ex 4 — Mapped, ICU (High complexity), all docs present:
     ICD: I21.4 (MI, mapped). icuDays: 2, complexity: "high". documentsUploaded: ["ecg","lft","cbc"].
     Score = 100 - 0 = 100 (ICU affects complexity, not readiness score). expectedClaimReadinessScore: 100.

Request format — JSON object with these fields:
{
  "caseId": "SYN-[DATE]-[RANDOM]",
  "specialty": "cardiology|neurology|ortho|surgery|pulmo|nephro|ent|ophtho|obgyn|peds|onco|icu|trauma|burns|gastro|endo|infectious",
  "complexity": "low|medium|high",
  "difficulty": "1-10",
  "patient": {
    "name": "string",
    "age": number,
    "gender": "M|F",
    "occupationCategory": "professional|labour|farmer|retired|housewife|student",
    "aadharLast4": "string",
    "mobileNumber": "string",
    "address": "string"
  },
  "insurance": {
    "insurer": "Apollo|Aditya Birla|ICICI|HDFC|Star|Reliance|Max|SBI|NTPC|Axis",
    "tpa": "string",
    "policyNumber": "string",
    "policyType": "individual|group|corporate",
    "sumInsured": number,
    "bufferRemaining": "string",
    "waitingPeriod": "0 days|30 days|90 days|2 years",
    "waitingPeriodViolation": boolean,
    "exclusions": "string",
    "activeSince": "YYYY-MM-DD",
    "claimHistory": "string"
  },
  "admission": {
    "admissionDate": "YYYY-MM-DD",
    "admissionType": "planned|emergency",
    "hospital": "string",
    "department": "string",
    "consultantName": "string",
    "consultantRegistration": "string"
  },
  "clinical": {
    "chiefComplaint": "string",
    "hpi": "string",
    "pasterMedicalHistory": {
      "diabetes": boolean,
      "hypertension": boolean,
      "heartDisease": boolean,
      "chronicKidneyDisease": boolean,
      "asthma": boolean,
      "cancer": boolean,
      "priorSurgeries": "string",
      "medications": "string"
    },
    "familyHistory": "string",
    "drugAllergies": "string",
    "vitals": {
      "temp": "string",
      "bp": "string",
      "hr": "string",
      "rr": "string",
      "spo2": "string"
    },
    "physicalExamination": "string",
    "provisionalDiagnosis": "[WHO ICD-10 code]:[diagnosis name]",
    "diagnosisCertainty": "definite|probable|suspected",
    "comorbidities": "string"
  },
  "investigations": {
    "labReports": [{ "test": "string", "result": "string", "normalRange": "string", "status": "normal|abnormal|critical" }],
    "imagingReports": [{ "type": "CT|MRI|XRay|Ultrasound|ECG", "findings": "string", "relevance": "string" }]
  },
  "proposedTreatment": {
    "treatmentLine": "medical|surgical|both",
    "justification": "string",
    "conservativeManagementAttempted": boolean,
    "surgery": { "name": "string", "icdProcedureCode": "string", "expectedDuration": "string", "anesthesia": "string", "implants": "string" },
    "expectedStay": number,
    "icuDays": number,
    "expectedCost": {
      "roomRent": number, "roomDays": number, "icuCharges": number,
      "surgeonFees": number, "anesthesiaFees": number, "operationTheaterCost": number,
      "investigations": number, "medications": number, "implants": number,
      "consumables": number, "totalEstimate": number
    }
  },
  "documentation": {
    "documentsUploaded": ["chest_xray|cbc|abg|ecg|ct_scan|mri|ultrasound|blood_culture|urine_routine|lft|kft|covid_test|ns1_antigen|dengue_igm|usg_abdomen|xray_knee|other"],
    "documentsMissing": "string",
    "ocrAccuracy": "100%|95%|85%|70%"
  },
  "groundTruth": {
    "expectedClaimReadinessScore": number,
    "expectedMissingFields": ["string"],
    "expectedTPAQueries": [
      { "query": "string", "severity": "high|medium|low", "reason": "string", "requiredDocumentation": "string" }
    ],
    "expectedValidationErrors": ["string"],
    "expectedBusinessRuleViolations": ["string"],
    "approvalProbability": "string",
    "predictedOutcome": "likely_approve|likely_query|likely_deny"
  },
  "edgeCasesAndTricks": "string"
}`;

export async function generateSyntheticCase(
  recentCases: any[],
  targetDifficulty: "low" | "medium" | "high",
  targetSpecialty: string
): Promise<any> {
    const ai = getGoogleGenAIClient();
    
    const recentSummaries = recentCases.map(c => `- ID: ${c.caseId}, Diagnosis: ${c.diagnosis}, Complexity: ${c.difficulty}`).join('\n');
    
    const prompt = `Generate a brand new synthetic insurance case with complexity level: "${targetDifficulty}" and specialty: "${targetSpecialty}".
    
    Avoid duplicating the following recent cases:
    ${recentSummaries || "None"}
    
    IMPORTANT: Follow the AIVANA CORE ENGINE RULES above EXACTLY to compute complexity and expectedClaimReadinessScore.
    Show your reasoning in "edgeCasesAndTricks" — list which rule(s) fired for complexity and how you computed the score.
    
    Return the output strictly in the requested JSON format.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            temperature: 0.7
        }
    });
    
    if (!response.text) {
        throw new Error("No response text received from Gemini case generator");
    }
    
    return JSON.parse(response.text.trim());
}
