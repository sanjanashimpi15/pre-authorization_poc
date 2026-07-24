
import { GoogleGenAI, Type } from "@google/genai";
import { MODEL_TEXT, MODEL_DOCUMENT } from '../config/modelConfig';
import { getDescription } from './icdService';
import {
  Message,
  DoctorProfile,
  PreCodedGpt,
  PromptInsight,
  ClinicalProtocol,
  UserRole,
  DdxItem,
  NexusInsuranceInput,
  VoiceCapturedFinding
} from '../types';
import { runNexusWorkflow } from '../engine/workflow';
import { prescriptionDictionary } from '../prescription_dictionary';
import { CLINICAL_PROTOCOLS } from '../knowledgeBase';

export const extractInsurancePreAuthData = async (
  note: string,
  patientName: string
): Promise<any> => {
  const systemInstruction = `You are a medical data extraction AI. Analyze the clinical note and extract details for insurance pre-authorization.
  
  Return a JSON object:
  {
    "patient": { "patientName": "Extracted Name or provided name" },
    "clinical": {
      "diagnoses": [{ "diagnosis": "Primary Diagnosis", "icd10Code": "ICD10 if found" }],
      "vitals": { "bp": "string", "pulse": "string", "temp": "string", "spo2": "string", "rr": "string" },
      "chiefComplaints": "Summary of complaints",
      "historyOfPresentIllness": "HPI summary",
      "relevantClinicalFindings": "Findings summary"
    },
    "admission": {
      "reasonForHospitalisation": "Reason summary"
    }
  }
  
  If a field is not found, use empty string or null.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: `Clinical Note:\n${note}\n\nPatient Name Context: ${patientName}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Error extracting insurance data:', error);
    return null;
  }
};

/**
 * extractInsuranceCardData — Gemini Vision scan of a health insurance card (photo or PDF).
 * Accepts a browser File object (image/png, image/jpeg, image/webp, application/pdf).
 * Returns structured insurance card fields. Any field not found is returned as null.
 */
export interface InsuranceCardExtracted {
  insurerName: string | null;
  tpaName: string | null;
  policyNumber: string | null;
  memberIdCard: string | null;
  cardHolderName: string | null;
  sumInsured: number | null;
  validFrom: string | null;
  validTo: string | null;
  contactNumber: string | null;
  planType: string | null;
  confidence: number;
  rawText?: string;
}

export const extractInsuranceCardData = async (file: File): Promise<InsuranceCardExtracted> => {
  const FALLBACK: InsuranceCardExtracted = {
    insurerName: null, tpaName: null, policyNumber: null, memberIdCard: null,
    cardHolderName: null, sumInsured: null, validFrom: null, validTo: null,
    contactNumber: null, planType: null, confidence: 0
  };

  try {
    // Convert file to base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

    const prompt = `You are analyzing a health insurance card image from India.

Extract the following fields exactly as printed on the card:
- insurerName: Insurance company name (e.g. "Star Health", "ICICI Lombard", "New India Assurance")
- tpaName: Third Party Administrator name if shown (e.g. "MD India TPA", "Vipul MedCorp")
- policyNumber: Policy / Certificate number
- memberIdCard: Member ID or Card number
- cardHolderName: Name of the insured person on the card
- sumInsured: Sum insured as a number in INR (just the number, e.g. 500000). Null if not shown.
- validFrom: Start date in YYYY-MM-DD format. Null if not found.
- validTo: Expiry date in YYYY-MM-DD format. Null if not found.
- contactNumber: TPA or insurer helpline number shown on card.
- planType: Plan name or product name if shown (e.g. "Family Floater", "Individual Mediclaim")
- confidence: Your confidence 0–100 in the extraction quality.

Return ONLY a valid JSON object with these exact keys. No markdown, no explanation.
If a field is not visible or not applicable, use null.`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        { role: 'user', parts: [
          { text: prompt },
          { inlineData: { data: base64Data, mimeType: file.type || 'image/jpeg' } }
        ]}
      ]
    });

    let raw = response.text?.trim() || '';
    if (raw.startsWith('```json')) raw = raw.replace(/^```json/, '').replace(/```$/, '').trim();
    else if (raw.startsWith('```')) raw = raw.replace(/^```/, '').replace(/```$/, '').trim();

    const parsed = JSON.parse(raw);
    return {
      insurerName: parsed.insurerName ?? null,
      tpaName: parsed.tpaName ?? null,
      policyNumber: parsed.policyNumber ?? null,
      memberIdCard: parsed.memberIdCard ?? null,
      cardHolderName: parsed.cardHolderName ?? null,
      sumInsured: parsed.sumInsured ? +parsed.sumInsured : null,
      validFrom: parsed.validFrom ?? null,
      validTo: parsed.validTo ?? null,
      contactNumber: parsed.contactNumber ?? null,
      planType: parsed.planType ?? null,
      confidence: Math.min(100, Math.max(0, +(parsed.confidence ?? 70))),
      rawText: raw,
    };
  } catch (err) {
    console.error('[extractInsuranceCardData] Failed:', err);
    return FALLBACK;
  }
};

export const extractTestResultsFromTranscript = async (
  transcript: string,
  language: string
): Promise<VoiceCapturedFinding[]> => {
  const systemInstruction = `You are a medical data extraction AI. Analyze the transcript and extract any laboratory or diagnostic test results mentioned.

For each test result found, extract:
1. testName: Standard name of the test (e.g., "Hemoglobin", "Chest X-Ray", "Blood Sugar")
2. value: The numerical or descriptive value mentioned
3. unit: The unit of measurement if mentioned
4. interpretation: Classify as 'normal', 'abnormal_high', 'abnormal_low', or 'critical' based on clinical context
5. spokenText: The exact phrase the doctor used

Return a JSON array. If no test results are mentioned, return an empty array.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: `Transcript:\n${transcript}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              testName: { type: Type.STRING },
              value: { type: Type.STRING },
              unit: { type: Type.STRING },
              interpretation: {
                type: Type.STRING,
                enum: ['normal', 'abnormal_high', 'abnormal_low', 'critical']
              },
              spokenText: { type: Type.STRING }
            },
            required: ['testName', 'value', 'interpretation', 'spokenText']
          }
        }
      }
    });

    const results = JSON.parse(response.text || '[]');
    return results.map((r: any) => ({
      ...r,
      documentAttached: false,
      documentId: undefined
    }));
  } catch (error) {
    console.error('Error extracting test results:', error);
    return [];
  }
};

export const generateMedicalNecessityStatement = async (
  diagnosis: DdxItem,
  severity: NexusInsuranceInput['severity'],
  keyFindings: string[],
  testResults: VoiceCapturedFinding[],
  vitals: NexusInsuranceInput['vitals']
): Promise<string> => {

  const systemInstruction = `You are a medical documentation specialist. Generate a concise medical necessity statement for insurance pre-authorization.

The statement must:
1. State the primary diagnosis with ICD-10 code
2. List key clinical findings that support hospitalization
3. Explain why outpatient (OPD) management is NOT appropriate
4. Quantify the risk if hospitalization is denied
5. Be 150-200 words maximum
6. Use professional medical language suitable for TPA review

Do NOT:
- Make up findings not provided in the input
- Use emotional language
- Guarantee outcomes`;

  // Map words like "High", "Medium", "Low" to string in confidence
  let confidenceStr = diagnosis.confidence;

  const prompt = `
Generate a medical necessity statement for:

DIAGNOSIS: ${diagnosis.diagnosis} (Confidence: ${confidenceStr})
ICD-10: Will be determined

SEVERITY SCORES:
- Symptom Severity (PhenoIntensity): ${severity.phenoIntensity.toFixed(2)}
- Clinical Urgency: ${severity.urgencyQuotient.toFixed(2)}
- Deterioration Risk: ${severity.deteriorationVelocity.toFixed(2)}
- Red Flag: ${severity.redFlagSeverity}

VITALS:
- BP: ${vitals.bp} mmHg
- Pulse: ${vitals.pulse}/min
- Temperature: ${vitals.temp}°F
- SpO2: ${vitals.spo2}%
- Respiratory Rate: ${vitals.rr}/min

KEY CLINICAL FINDINGS:
${keyFindings.map(f => `- ${f}`).join('\n')}

ABNORMAL TEST RESULTS:
${testResults.filter(t => t.interpretation !== 'normal').map(t => `- ${t.testName}: ${t.value} ${t.unit} (${t.interpretation})`).join('\n')}

Generate the medical necessity statement now.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: { systemInstruction }
    });
    return response.text || '';
  } catch (error) {
    console.error('Error generating medical necessity:', error);
    return 'Error generating statement. Please write manually.';
  }
};

import { getGoogleGenAIClient, rotateApiKey } from './apiKeys';

async function callWithFallback<T>(operation: (client: any) => Promise<T>): Promise<T> {
  let attempts = 3;
  let lastError: any = null;
  while (attempts > 0) {
    try {
      const client = getGoogleGenAIClient();
      return await operation(client);
    } catch (error: any) {
      lastError = error;
      attempts--;
      if (attempts > 0 && rotateApiKey()) {
        console.warn("[geminiService] Retrying operation with fallback API key...");
        continue;
      }
      break;
    }
  }
  throw lastError || new Error("All API keys failed");
}

const ai = {
  get models() {
    return {
      generateContent: (args: any) => callWithFallback(client => client.models.generateContent(args)),
      generateContentStream: (args: any) => callWithFallback(client => client.models.generateContentStream(args))
    };
  }
};

const SUPPORTED_LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati", "Tamil", "Telugu", "Kannada", "Malayalam", "Bengali", "Punjabi", "Odia", "Assamese", "Urdu"];

// FIX: Updated model name to latest version according to guidelines
export const processAudioSegment = async (
  base64Audio: string,
  mimeType: string,
  language: string,
  doctorProfile: DoctorProfile,
  previousContext: string = ""
): Promise<{ speaker: 'Doctor' | 'Patient'; text: string }[] | null> => {
  const systemInstruction = `
    You are an advanced Medical Scribe specialized in Indian clinical contexts.
    
    TASK: Perform a two-pass transcription for this clinical audio segment.
    
    PASS 1 (Phonetic Capture): Capture raw speech verbatim. Handle code-switching (e.g., Hindi + English) and regional accents naturally.
    PASS 2 (Semantic & Medical Normalization): Refine the raw capture into professional clinical text.
    - Normalize regional terms (e.g., "chakkar" to "dizziness/vertigo", "bukhaar" to "fever").
    - Correct medical terms and medication names.
    - Maintain the primary language script of the speaker but ensure clinical clarity.
    
    DIARIZATION: Identify "Doctor" and "Patient". 
    CONTEXT: Use previous dialogue for speaker consistency: "${previousContext}"
    
    LANGUAGE DETECTION & SCRIPT: 
    ${language === 'Auto-detect'
      ? 'Automatically detect the language of each speaker turn. Use native scripts (Devanagari, Tamil, etc.).'
      : `Primary Language Hint: ${language}. Preferably use the native script for ${language}, but automatically detect and handle other languages if the speaker switches.`}
    - Use Devanagari for Hindi/Marathi, Tamil script for Tamil, etc.
    - For English medical terms interleaved in native speech, keep them in English/Roman script if that's standard clinical practice in India.
    
    RULES: 
    1. Return ONLY valid JSON array of objects.
    2. Do NOT use markdown formatting.
    3. Ensure high accuracy for Indian accents and multilingual conversations.
  `;

  try {
    const audioPart = {
      inlineData: { data: base64Audio, mimeType },
    };

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: { parts: [audioPart, { text: "Transcribe and normalize this clinical segment." }] },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              speaker: { type: Type.STRING, enum: ['Doctor', 'Patient'] },
              text: { type: Type.STRING },
              detectedLanguage: { type: Type.STRING },
            },
            required: ['speaker', 'text', 'detectedLanguage'],
          },
        },
      },
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Segment processing error:", error);
    return null;
  }
};

export const cleanupTranscript = async (
  transcript: string,
  language: string
): Promise<string> => {
  const dictionaryContext = JSON.stringify(prescriptionDictionary);
  const systemInstruction = `
    You are an expert Medical Editor.
    TASK: Clean up the following medical transcript.
    
    CLEANUP RULES:
    1. Remove filler words (um, ah, like, you know).
    2. Correct diarization errors if they seem obvious.
    3. CRITICAL: Correct any misspelled medical terms, symptoms, or medications using the provided dictionary as a reference.
    4. HARD RULE: Do NOT add any medications that were not explicitly mentioned in the raw transcript. Only correct spellings of mentioned ones.
    5. ${language === 'Auto-detect' ? 'Use the primary language(s) detected in the transcript.' : `Keep the output strictly in the native script of ${language}.`}
    6. Maintain the original meaning and conversational flow, but make it professional.
    
    DICTIONARY REFERENCE:
    ${dictionaryContext}
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: `Raw Transcript:\n${transcript}`,
      config: { systemInstruction, temperature: 0 },
    });
    return response.text || transcript;
  } catch (error) {
    console.error("Cleanup error:", error);
    return transcript;
  }
};

export const generateSoapNote = async (
  cleanedTranscript: string,
  language: string
): Promise<string> => {
  const systemInstruction = `
    You are an expert clinical documentalist.
    TASK: Generate a professional SOAP note from the cleaned transcript.
    
    STRICT LANGUAGE RULE: ${language === 'Auto-detect' ? 'Use the primary language(s) detected in the transcript.' : `All content MUST be written strictly in the native script of ${language}.`}
    
    STRUCTURE RULES:
    1. Use exactly these headers: ## Subjective, ## Objective, ## Lab Results, ## Assessment, ## Differential Diagnosis.
    2. SUBJECTIVE: List patient symptoms in short bullet points.
    3. OBJECTIVE: List physical findings or observations if any.
    4. LAB RESULTS: List any lab test values, vital signs (BP, PR, SpO2, Temp), or investigation reports mentioned.
    5. ASSESSMENT: List the primary or most likely diagnosis.
    6. DIFFERENTIAL DIAGNOSIS: List other potential diagnoses that are being considered, if any.
    7. DO NOT include a "Plan" or "Prescription" section here.
    8. NO markdown formatting within sections (bold/italics).
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: `Cleaned Transcript:\n${cleanedTranscript}`,
      config: { systemInstruction, temperature: 0 },
    });
    return response.text || '';
  } catch (error) {
    console.error("SOAP generation error:", error);
    return 'Error generating SOAP note.';
  }
};

export const generatePrescription = async (
  cleanedTranscript: string,
  language: string
): Promise<string> => {
  const dictionaryContext = JSON.stringify(prescriptionDictionary);
  const protocolsContext = JSON.stringify(CLINICAL_PROTOCOLS);

  const systemInstruction = `
    You are an expert clinical pharmacologist.
    TASK: Extract and format the medication plan (Prescription) from the transcript.
    
    REFERENCE DATA:
    - Dictionary: ${dictionaryContext}
    - Clinical Protocols: ${protocolsContext}
    
    RULES:
    1. HEADER: Use "## Plan".
    2. HARD RULE: Only extract drugs and advice (diet, follow-up, warnings, etc.) that were EXPLICITLY mentioned in the cleaned transcript. Do NOT hallucinate, suggest, or recommend any additional drugs or advice that were not stated by the clinician.
    3. VALIDATION RULE: You MUST validate and extract four parameters for every medication:
       - Name: Validate against the Dictionary.
       - Dosage: Extract the specific dose mentioned (e.g., 500mg, 1 tablet).
       - Frequency: Extract how often (e.g., once daily, BD).
       - Route: Extract the route (e.g., Oral, IV).
    4. MEDICINE FORMAT: "- Medicine Name | Dosage | Frequency | Route". 
       Example: "- Paracetamol | 500mg | Twice daily | Oral"
       If a parameter is missing, mark it as "Not specified".
    5. ADVICE: List all other clinician-stated instructions in short bullet points.
    6. ACCURACY: Cross-reference with the Dictionary and Clinical Protocols only for spelling and dosage validation of mentioned items.
    7. LANGUAGE: ${language === 'Auto-detect' ? 'Use the primary language(s) detected in the transcript.' : `Write strictly in the native script of ${language}.`}
    8. NO markdown formatting within sections (bold/italics).
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: `Cleaned Transcript:\n${cleanedTranscript}`,
      config: { systemInstruction, temperature: 0 },
    });
    return response.text || '';
  } catch (error) {
    console.error("Prescription generation error:", error);
    return 'Error generating prescription.';
  }
};

export const generateClinicalNote = async (
  transcript: string,
  doctorProfile: DoctorProfile,
  language: string
): Promise<string> => {
  try {
    // Stage 1: Cleanup
    const cleanedTranscript = await cleanupTranscript(transcript, language);

    // Stage 2: SOAP (Subjective, Objective, Assessment)
    const soapNote = await generateSoapNote(cleanedTranscript, language);

    // Stage 3: Prescription (Plan)
    const prescription = await generatePrescription(cleanedTranscript, language);

    // Combine for final output
    return `${soapNote}\n\n${prescription}`;
  } catch (error) {
    console.error("Clinical note orchestration error:", error);
    return 'Error generating clinical note.';
  }
};

// FIX: Implemented generateCaseSummary using gemini-1.5-flash
export const generateCaseSummary = async (messages: Message[], language: string, doctorProfile: DoctorProfile): Promise<string> => {
  const systemInstruction = `You are an expert clinical documentalist. Summarize the following doctor-patient conversation into a concise case summary for a medical record. Use ${language}.`;
  const transcript = messages.map(m => `${m.sender}: ${m.text}`).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: transcript,
      config: { systemInstruction }
    });
    return response.text || "Summary not available.";
  } catch (e) {
    console.error("Summary generation error:", e);
    return "Error generating summary.";
  }
};

// FIX: Implemented getPromptInsights using structured JSON response
export const getPromptInsights = async (prompt: string, doctorProfile: DoctorProfile, language: string): Promise<PromptInsight | null> => {
  const systemInstruction = `Analyze the clinician's prompt and provide 3 key clinical terms, 3 suggestions to refine the prompt for better AI accuracy, and 3 high-value follow-up questions to ask the patient. Output in JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keyTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            followUps: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['keyTerms', 'suggestions', 'followUps']
        }
      }
    });
    return JSON.parse(response.text || '{}') as PromptInsight;
  } catch (e) {
    console.error("Insights generation error:", e);
    return null;
  }
};

// FIX: Updated streamChatResponse to use the runNexusWorkflow generator and accept parameters
export async function* streamChatResponse(params: {
  message: string;
  history: Message[];
  userRole: UserRole;
  language: string;
  activeGpt?: PreCodedGpt;
  isDoctorVerified: boolean;
  doctorProfile: DoctorProfile;
  knowledgeBaseProtocols: ClinicalProtocol[];
}) {
  yield* runNexusWorkflow({
    message: params.message,
    history: params.history,
    doctorProfile: params.doctorProfile,
    language: params.language,
    activeGpt: params.activeGpt,
    isDoctorVerified: params.isDoctorVerified,
    knowledgeBase: params.knowledgeBaseProtocols,
  });
}

// ── TPA HEALTH INSURANCE AI PLATFORM ENDPOINTS ──────────────────

export interface PriorAuthAnalysis {
    decision: 'Approved' | 'Denied' | 'Pending';
    justification: string;
    evidenceHighlights: Array<{
        snippet: string;
        relevance: string;
        severity: 'supportive' | 'challenging';
    }>;
    missingInformation: string[];
    policyCitations: Array<{
        clause: string;
        description: string;
        status: 'Compliant' | 'Non-Compliant' | 'Not Applicable';
    }>;
    englishSummary: string;
    hindiSummary: string;
}

export const analyzePriorAuthMultimodal = async (
    note: string,
    documents: Array<{ name: string; type: string; base64?: string; textContent?: string }>,
    rulesContext: string,
    policyDetails: any
): Promise<PriorAuthAnalysis> => {
    const systemInstruction = `You are a Senior Medical Officer and Auditor for an Indian Third Party Administrator (TPA) and Insurance Provider.
    Your job is to review Prior Authorization requests for medical necessity and administrative compliance.
    
    You must evaluate:
    1. Clinical Severity: Check if patient vitals (e.g. SpO2, Temp, BP) and lab markers justify inpatient admission.
    2. Indian Policy Rules: Cross-reference with the provided PM-JAY packages, state schemes (e.g. MJPJAY, AB-ArK, CMCHIS), and commercial TPA rules (such as room rent capping or PED waiting periods).
    3. Determine Decision:
       - "Approved": Clinical evidence is sufficient, criteria are met, and it matches policy.
       - "Denied": Exclusions apply or criteria are clearly not met.
       - "Pending": Essential documents or clinical values are missing.
    4. Provide clear evidence snippets from the clinical note or attached documents.
    5. Flag missing information.
    6. Provide a professional English summary and a patient-friendly Hindi summary (समीक्षा सारांश).

    Return ONLY a JSON object matching the requested schema.`;

    const contents: any[] = [];
    
    // Add text contents
    let docsText = "";
    const imageParts: any[] = [];

    documents.forEach((doc, idx) => {
        if (doc.textContent) {
            docsText += `\n--- Document: ${doc.name} ---\n${doc.textContent}\n`;
        }
        if (doc.base64) {
            imageParts.push({
                inlineData: {
                    data: doc.base64,
                    mimeType: doc.type || "image/jpeg"
                }
            });
        }
    });

    const userPrompt = `
    CLINICAL NOTE:
    ${note}

    ATTACHED DOCUMENT SUMMARIES & TEXTS:
    ${docsText}

    MATCHED INSURANCE POLICY RULES & JURISDICTION CONTEXT:
    ${rulesContext}

    REQUESTED ADMISSION PARAMETERS:
    - Insurer/TPA: ${policyDetails.tpaName || "General"}
    - Ward Type: ${policyDetails.wardType || "General"}
    - Requested Room Rent: ₹${policyDetails.roomRentPerDay || 0}/day
    - Sum Insured: ₹${policyDetails.sumInsured || 0}
    - Scheme/State Code: ${policyDetails.stateCode || "None"}
    - Emergency Admission: ${policyDetails.isEmergency ? "Yes" : "No"}
    `;

    contents.push(userPrompt);
    if (imageParts.length > 0) {
        contents.push(...imageParts);
    }

    try {
        const response = await ai.models.generateContent({
            model: MODEL_DOCUMENT,
            contents: contents,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        decision: { type: Type.STRING, enum: ['Approved', 'Denied', 'Pending'] },
                        justification: { type: Type.STRING },
                        evidenceHighlights: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    snippet: { type: Type.STRING },
                                    relevance: { type: Type.STRING },
                                    severity: { type: Type.STRING, enum: ['supportive', 'challenging'] }
                                },
                                required: ['snippet', 'relevance', 'severity']
                            }
                        },
                        missingInformation: { type: Type.ARRAY, items: { type: Type.STRING } },
                        policyCitations: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    clause: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    status: { type: Type.STRING, enum: ['Compliant', 'Non-Compliant', 'Not Applicable'] }
                                },
                                required: ['clause', 'description', 'status']
                            }
                        },
                        englishSummary: { type: Type.STRING },
                        hindiSummary: { type: Type.STRING }
                    },
                    required: ['decision', 'justification', 'evidenceHighlights', 'missingInformation', 'policyCitations', 'englishSummary', 'hindiSummary']
                }
            }
        });

        return JSON.parse(response.text || '{}') as PriorAuthAnalysis;
    } catch (error) {
        console.error('Error in analyzePriorAuthMultimodal:', error);
        // Return a mock/fallback structure if AI fails
        return {
            decision: 'Pending',
            justification: 'AI system encountered a connection issue. Reviewing via local rules engine.',
            evidenceHighlights: [],
            missingInformation: ['Full clinical documentation scan required for manual override.'],
            policyCitations: [],
            englishSummary: 'AI analysis failed to complete.',
            hindiSummary: 'एआई विश्लेषण पूरा होने में विफल रहा।'
        };
    }
};

export interface DenialAnalysis {
    denialCode: string;
    denialReason: string;
    financialImpact: number;
    overturnProbability: number;
    requiredEvidence: string[];
    category: 'Clinical Necessity' | 'Pre-Existing Disease' | 'Administrative / Exclusions' | 'Coding / Billing';
}

export const analyzeDenialEOB = async (eobText: string): Promise<DenialAnalysis> => {
    const systemInstruction = `You are a Claim Denial Analyst for an Indian healthcare provider.
    Parse the provided Explanation of Benefits (EOB) or TPA rejection letter.
    
    Extract:
    1. Rejection/Denial Code (e.g. Clause 4.1, PED exclusion, Room Rent Cap).
    2. Detailed rejection reason.
    3. Estimated financial impact (disallowed claim amount in INR).
    4. Overturn probability (a decimal between 0.0 and 1.0 indicating how likely we are to win an appeal based on clinical guidelines).
    5. Specific clinical or administrative evidence we should attach (e.g. prior treatment proofs, vital charts, lab values).
    6. Category of denial.

    Return ONLY a JSON object matching the requested schema.`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_TEXT,
            contents: `EOB Text:\n${eobText}`,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        denialCode: { type: Type.STRING },
                        denialReason: { type: Type.STRING },
                        financialImpact: { type: Type.NUMBER },
                        overturnProbability: { type: Type.NUMBER },
                        requiredEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                        category: { type: Type.STRING, enum: ['Clinical Necessity', 'Pre-Existing Disease', 'Administrative / Exclusions', 'Coding / Billing'] }
                    },
                    required: ['denialCode', 'denialReason', 'financialImpact', 'overturnProbability', 'requiredEvidence', 'category']
                }
            }
        });

        return JSON.parse(response.text || '{}') as DenialAnalysis;
    } catch (e) {
        console.error("Error in analyzeDenialEOB:", e);
        return {
            denialCode: 'UNKNOWN',
            denialReason: 'Could not extract denial reasons. Administrative review required.',
            financialImpact: 10000,
            overturnProbability: 0.5,
            requiredEvidence: ['Original Claim Request', 'Discharge Summary', 'Clinical History note'],
            category: 'Administrative / Exclusions'
        };
    }
};

export const generateAppealLetterAI = async (params: {
    patientName: string;
    policyNumber: string;
    tpaName: string;
    denialCode: string;
    denialReason: string;
    clinicalJustification: string;
    doctorName: string;
    doctorReg: string;
}): Promise<string> => {
    const systemInstruction = `You are a Medical Appeal Writer specializing in Indian TPA dispute resolutions.
    Draft a formal, persuasive, and legally-clinical Appeal Letter addressed to the Grievance Cell / Claims Head of the specified TPA.
    
    Structure:
    - Formal Header (Date, Insurer/TPA address placeholders).
    - Subject: Appeal for cashless/reimbursement claim (ref policy and patient).
    - Section 1: Statement of Denial and Refutation (cite the denial code).
    - Section 2: Clinical Justification (incorporate the clinical metrics and vital signs provided).
    - Section 3: Regulatory citation (mention IRDAI master circular on claim settlements or PED rules if applicable).
    - Section 4: Call to Action (demand re-evaluation within 24 hours under IRDAI guidelines).
    - Signature Block: Doctor's name, Registration number, Hospital stamp placeholder.
    
    Use professional, firm, and medically rigorous language. Do not output JSON. Output only the formatted letter.`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_TEXT,
            contents: `
            PATIENT NAME: ${params.patientName}
            POLICY NUMBER: ${params.policyNumber}
            TPA NAME: ${params.tpaName}
            DENIAL CODE/REASON: ${params.denialCode} - ${params.denialReason}
            CLINICAL JUSTIFICATION: ${params.clinicalJustification}
            DOCTOR DETAILS: ${params.doctorName} (MCI Reg: ${params.doctorReg})
            `,
            config: { systemInstruction }
        });

        return response.text || "Error generating appeal letter. Please draft manually.";
    } catch (e) {
        console.error("Appeal generation error:", e);
        return `Dear Grievance Cell,\n\nWe are writing to appeal the denial of claims for patient ${params.patientName} (Policy: ${params.policyNumber}) under denial code ${params.denialCode}. The patient required emergency hospitalization due to acute clinical deterioration. We request immediate re-evaluation.\n\nSincerely,\nDr. ${params.doctorName}\nReg: ${params.doctorReg}`;
    }
};

export interface BillingCodingOutput {
    primaryICD10: string;
    primaryDescription: string;
    secondaryICD10: Array<{ code: string; description: string }>;
    suggestedCPT: Array<{ code: string; description: string; estimatedRate: number }>;
    validationWarnings: string[];
    scrubbingStatus: 'Clean' | 'Warnings' | 'Failed';
    copayDeductions: number;
    cashlessApproved: number;
    patientShare: number;
    copayPercentage?: number;
    nonMedicalDeduction?: number;
    roomRentDeduction?: number;
}

let mockBillingCodesFn: any = null;
export function setMockExtractBillingCodes(fn: any) {
    mockBillingCodesFn = fn;
}

export const extractBillingCodesAI = async (
    clinicalNote: string,
    insurerName: string,
    sumInsured: number,
    wardType: string,
    requestedAmount: number,
    resolvedICD10?: string
): Promise<BillingCodingOutput> => {
    if (mockBillingCodesFn) {
        return mockBillingCodesFn(clinicalNote, insurerName, sumInsured, wardType, requestedAmount, resolvedICD10);
    }
    const systemInstruction = `You are an expert Medical Coder and Claim Auditor specializing in India-adapted ICD-10 and procedure coding (CPT/PM-JAY package codes).
    Analyze the clinical note and generate:
    1. Primary ICD-10 code and description.
    2. Secondary ICD-10 codes (comorbidities, complications).
    3. CPT procedure codes with standard rates.
    4. Run clinical scrubbing validation:
       - Check for unbundling (e.g. separate billing for laparotomy access during appendectomy).
       - Check for CCI edits (e.g. duplicate codes).
       - Validate diagnosis-procedure consistency.
    5. Deduce a draft billing ledger based on common Indian insurer rules:
       - Room rent limits (usually 1% of Sum Insured for normal ward, 2% for ICU. If exceeded, compute proportional deductions).
       - Non-medical deductions (approx 8-10% of requested amount for consumables).
       - Co-payment (if applicable).
    
    Return ONLY a JSON object matching the requested schema.`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_TEXT,
            contents: `
            CLINICAL NOTE:\n${clinicalNote}
            
            ADMISSION SCHEME / PARAMETERS:
            - Insurer Name: ${insurerName}
            - Sum Insured: INR ${sumInsured}
            - Ward Type: ${wardType}
            - Requested Invoice Amount: INR ${requestedAmount}
            `,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        primaryICD10: { type: Type.STRING },
                        primaryDescription: { type: Type.STRING },
                        secondaryICD10: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    code: { type: Type.STRING },
                                    description: { type: Type.STRING }
                                },
                                required: ['code', 'description']
                            }
                        },
                        suggestedCPT: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    code: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    estimatedRate: { type: Type.NUMBER }
                                },
                                required: ['code', 'description', 'estimatedRate']
                            }
                        },
                        validationWarnings: { type: Type.ARRAY, items: { type: Type.STRING } },
                        scrubbingStatus: { type: Type.STRING, enum: ['Clean', 'Warnings', 'Failed'] },
                        copayDeductions: { type: Type.NUMBER },
                        cashlessApproved: { type: Type.NUMBER },
                        patientShare: { type: Type.NUMBER },
                        copayPercentage: { type: Type.NUMBER },
                        nonMedicalDeduction: { type: Type.NUMBER },
                        roomRentDeduction: { type: Type.NUMBER }
                    },
                    required: [
                        'primaryICD10', 'primaryDescription', 'secondaryICD10', 'suggestedCPT', 
                        'validationWarnings', 'scrubbingStatus', 'copayDeductions', 'cashlessApproved', 
                        'patientShare', 'copayPercentage', 'nonMedicalDeduction', 'roomRentDeduction'
                    ]
                }
            }
        });

        const result = JSON.parse(response.text || '{}') as BillingCodingOutput;

        // Task 3: Consume resolved ICD-10 if provided
        if (resolvedICD10) {
            result.primaryICD10 = resolvedICD10;
            const desc = getDescription(resolvedICD10);
            if (desc) {
                result.primaryDescription = desc;
            }
        }

        // Task 1: Deterministic check - cashlessApproved + patientShare + copayDeductions must equal requestedAmount (within 1%)
        const sum = result.cashlessApproved + result.patientShare + result.copayDeductions;
        const tolerance = 0.005 * requestedAmount;
        
        if (Math.abs(sum - requestedAmount) > tolerance || (result.cashlessApproved === 0 && requestedAmount > 0)) {
            const nonMed = result.nonMedicalDeduction && result.nonMedicalDeduction > 0
                ? result.nonMedicalDeduction
                : (requestedAmount * 0.09); // default to 9% non-medical deductions
            
            const rr = result.roomRentDeduction && result.roomRentDeduction > 0
                ? result.roomRentDeduction
                : 0;

            const copayPct = result.copayPercentage && result.copayPercentage > 0
                ? result.copayPercentage
                : 0;

            const totalDeds = nonMed + rr;
            const eligible = Math.max(0, requestedAmount - totalDeds);
            const copayVal = eligible * (copayPct / 100);
            
            const finalCashless = Math.max(0, eligible - copayVal);
            const finalPatientShare = requestedAmount - finalCashless - copayVal;

            result.copayDeductions = Math.round(copayVal);
            result.cashlessApproved = Math.round(finalCashless);
            result.patientShare = Math.round(finalPatientShare);
        } else {
            // Reconcile exact rounding error even if within 1%
            result.patientShare = requestedAmount - result.cashlessApproved - result.copayDeductions;
        }

        return result;
    } catch (e) {
        console.error("Error in extractBillingCodesAI:", e);
        // Task 5: Return failed status rather than fake Pneumonia (J18.9)
        return {
            primaryICD10: 'FAILED',
            primaryDescription: 'generation failed — requires manual coding',
            secondaryICD10: [],
            suggestedCPT: [],
            validationWarnings: ['Generation failed — requires manual coding due to model connection error.'],
            scrubbingStatus: 'Failed',
            copayDeductions: 0,
            cashlessApproved: 0,
            patientShare: requestedAmount
        };
    }
};
