import { getGoogleGenAIClient, getOpenRouterClient, getOllamaVisionClient, rotateApiKey } from './apiKeys';
import { MODEL_TEXT, MODEL_DOCUMENT_OPENROUTER, AI_PROVIDER } from '../config/modelConfig';
import {
  PatientRecord, InsurancePolicyDetails, ClinicalDetails,
  AdmissionDetails, DiagnosisEntry, WizardVoiceFinding
} from '../components/PreAuthWizard/types';

const PROMPT = `You are a medical AI that parses a doctor's dictated clinical notes into a structured JSON for an insurance pre-authorization form.

Extract ALL available information from the transcript and return a JSON object with the following structure.
If a field is not mentioned, use null. Do NOT make up values not in the transcript.
Return ONLY valid JSON, no markdown, no code fences.

{
  "patient": {
    "patientName": "string or null",
    "age": number_or_null,
    "gender": "Male|Female|Other or null",
    "mobileNumber": "string or null",
    "address": "string or null",
    "city": "string or null",
    "occupation": "string or null"
  },
  "insurance": {
    "insurerName": "string or null",
    "policyNumber": "string or null",
    "tpaName": "string or null",
    "sumInsured": number_or_null
  },
  "clinical": {
    "chiefComplaints": "concise summary of main symptoms",
    "durationOfPresentAilment": "e.g. 5 days",
    "natureOfIllness": "Acute|Chronic|Acute on Chronic",
    "historyOfPresentIllness": "full narrative from notes",
    "relevantClinicalFindings": "examination/investigation findings",
    "treatmentTakenSoFar": "prior treatment or null",
    "reasonForHospitalisation": "why OPD is not sufficient",
    "additionalClinicalNotes": "any other relevant info",
    "diagnoses": [
      { "diagnosis": "Full condition name", "icd10Code": "best ICD-10 code", "icd10Description": "ICD-10 description" }
    ],
    "vitals": {
      "bp": "systolic/diastolic e.g. 100/70",
      "pulse": "number string e.g. 118",
      "temp": "degrees F string e.g. 102.8",
      "spo2": "percent string e.g. 86",
      "rr": "per min string e.g. 28"
    },
    "proposedLineOfTreatment": {
      "medical": true_or_false,
      "surgical": true_or_false,
      "intensiveCare": true_or_false,
      "investigation": true_or_false
    }
  },
  "admission": {
    "admissionType": "Emergency|Planned",
    "roomCategory": "General Ward|Semi-Private|Private|ICU|HDU",
    "expectedDaysInRoom": number,
    "expectedDaysInICU": number,
    "expectedLengthOfStay": number,
    "pastMedicalHistory": {
      "diabetes": { "present": true_or_false, "duration": "e.g. 8 years or null" },
      "hypertension": { "present": true_or_false },
      "heartDisease": { "present": true_or_false },
      "asthma": { "present": true_or_false },
      "epilepsy": { "present": true_or_false },
      "cancer": { "present": true_or_false },
      "kidney": { "present": true_or_false },
      "liver": { "present": true_or_false },
      "hiv": { "present": true_or_false },
      "alcoholism": { "present": true_or_false },
      "smoking": { "present": true_or_false },
      "hyperlipidemia": { "present": true_or_false },
      "osteoarthritis": { "present": true_or_false }
    }
  }
}`;

export interface VoiceExtractedData {
  patient: Partial<PatientRecord>;
  insurance: Partial<InsurancePolicyDetails>;
  clinical: Partial<ClinicalDetails>;
  admission: Partial<AdmissionDetails>;
  rawTranscript: string;
}

/**
 * Queries whichever provider AI_PROVIDER selects, returning raw response text.
 * Mirrors the branch pattern in documentExtractionService.ts — 'local' has no
 * text-prompt interface (the standalone pipeline is PDF/OCR-specific), so it
 * shares the 'ollama-vision' branch: same local Ollama connection, no image.
 */
async function queryProvider(fullPrompt: string): Promise<string> {
  if (AI_PROVIDER === 'sarvam') {
    const { getSarvamTextClient } = await import('./apiKeys');
    const { MODEL_SARVAM_TEXT } = await import('../config/modelConfig');
    const client = getSarvamTextClient();
    const model = client.getGenerativeModel({ model: MODEL_SARVAM_TEXT });
    const result = await model.generateContent([{ text: fullPrompt }], { forceJson: true, maxTokens: 4096 });
    return result.response.text();
  }

  if (AI_PROVIDER === 'openrouter') {
    const client = getOpenRouterClient();
    const model = client.getGenerativeModel({ model: MODEL_DOCUMENT_OPENROUTER });
    const result = await model.generateContent([{ text: fullPrompt }], { forceJson: true, maxTokens: 4096 });
    return result.response.text();
  }

  if (AI_PROVIDER === 'local' || AI_PROVIDER === 'ollama-vision') {
    const client = getOllamaVisionClient();
    const { text } = await client.extractFromImage(fullPrompt); // no image — text-only call
    return text;
  }

  // AI_PROVIDER === 'gemini' — native SDK, with the existing key-rotation retry loop
  let attempts = 3;
  let lastError: any = null;
  let result: any = null;
  while (attempts > 0) {
    try {
      const client = getGoogleGenAIClient();
      result = await client.models.generateContent({
        model: MODEL_TEXT,
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: { temperature: 0.1, responseMimeType: 'application/json' }
      });
      break;
    } catch (error) {
      lastError = error;
      attempts--;
      if (attempts > 0 && rotateApiKey()) {
        console.warn("[voiceDictationService] Retrying transcript parsing with fallback API key...");
        continue;
      }
      break;
    }
  }
  if (!result) {
    throw lastError || new Error("Failed to parse transcript: All API keys failed");
  }
  return result.text ?? '{}';
}

export async function parseTranscript(transcript: string): Promise<VoiceExtractedData> {
  const text = await queryProvider(`${PROMPT}\n\nDoctor's transcript:\n"""\n${transcript}\n"""`);
  let parsed: any = {};
  try { parsed = JSON.parse(text); } catch { parsed = {}; }

  const c = parsed.clinical ?? {};
  const a = parsed.admission ?? {};
  const p = parsed.patient ?? {};
  const ins = parsed.insurance ?? {};

  const diagnoses: DiagnosisEntry[] = (c.diagnoses ?? []).map((d: any, i: number) => ({
    diagnosis: d.diagnosis ?? '',
    // ICD codes suggested by the LLM are ALWAYS neutralised here.
    // The description text is preserved so the ICD picker can offer good suggestions,
    // but the actual code string must be confirmed by the user via the WHO table lookup.
    icd10Code: 'Pending ICD-10',
    icd10Description: 'Selection required',
    probability: 0.9,
    reasoning: '',
    isSelected: i === 0,
  }));


  // voiceCapturedFindings is WizardVoiceFinding[] — leave empty, transcript goes to additionalClinicalNotes
  const voiceCapturedFindings: WizardVoiceFinding[] = [];

  const pmh = a.pastMedicalHistory ?? {};
  const defaultCond = { present: false };

  return {
    rawTranscript: transcript,
    patient: {
      patientName: p.patientName ?? undefined,
      age: p.age ?? undefined,
      gender: p.gender ?? undefined,
      mobileNumber: p.mobileNumber ?? undefined,
      address: p.address ?? undefined,
      city: p.city ?? undefined,
      occupation: p.occupation ?? undefined,
    },
    insurance: {
      insurerName: ins.insurerName ?? undefined,
      policyNumber: ins.policyNumber ?? undefined,
      tpaName: ins.tpaName ?? undefined,
      sumInsured: ins.sumInsured ?? undefined,
    },
    clinical: {
      dataSource: 'voice_scribe',
      chiefComplaints: c.chiefComplaints ?? '',
      durationOfPresentAilment: c.durationOfPresentAilment ?? '',
      natureOfIllness: c.natureOfIllness ?? 'Acute',
      historyOfPresentIllness: c.historyOfPresentIllness ?? '',
      relevantClinicalFindings: c.relevantClinicalFindings ?? '',
      treatmentTakenSoFar: c.treatmentTakenSoFar ?? '',
      reasonForHospitalisation: c.reasonForHospitalisation ?? '',
      additionalClinicalNotes: c.additionalClinicalNotes ?? transcript,
      diagnoses,
      selectedDiagnosisIndex: 0,
      vitals: {
        bp: c.vitals?.bp ?? '',
        pulse: c.vitals?.pulse ?? '',
        temp: c.vitals?.temp ?? '',
        spo2: c.vitals?.spo2 ?? '',
        rr: c.vitals?.rr ?? '',
      },
      proposedLineOfTreatment: {
        medical: c.proposedLineOfTreatment?.medical ?? false,
        surgical: c.proposedLineOfTreatment?.surgical ?? false,
        intensiveCare: c.proposedLineOfTreatment?.intensiveCare ?? false,
        investigation: c.proposedLineOfTreatment?.investigation ?? false,
        nonAllopathic: false,
      },
      voiceCapturedFindings,
    },
    admission: {
      admissionType: a.admissionType ?? 'Emergency',
      roomCategory: a.roomCategory ?? 'General Ward',
      expectedDaysInRoom: a.expectedDaysInRoom ?? 0,
      expectedDaysInICU: a.expectedDaysInICU ?? 0,
      expectedLengthOfStay: a.expectedLengthOfStay ?? 0,
      pastMedicalHistory: {
        diabetes: pmh.diabetes ?? defaultCond,
        hypertension: pmh.hypertension ?? defaultCond,
        heartDisease: pmh.heartDisease ?? defaultCond,
        asthma: pmh.asthma ?? defaultCond,
        epilepsy: pmh.epilepsy ?? defaultCond,
        cancer: pmh.cancer ?? defaultCond,
        kidney: pmh.kidney ?? defaultCond,
        liver: pmh.liver ?? defaultCond,
        hiv: pmh.hiv ?? defaultCond,
        alcoholism: pmh.alcoholism ?? defaultCond,
        smoking: pmh.smoking ?? defaultCond,
        hyperlipidemia: pmh.hyperlipidemia ?? defaultCond,
        osteoarthritis: pmh.osteoarthritis ?? defaultCond,
        anyOther: { present: false },
      },
      previousHospitalization: { wasHospitalizedBefore: false },
    },
  };
}
