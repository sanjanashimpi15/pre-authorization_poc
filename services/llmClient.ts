import axios from 'axios';
import { Type } from '@google/genai';
import { DEMO_FALLBACKS } from '../data/demoFallbacks';
import { getGoogleGenAIClient } from './apiKeys';
import { MODEL_TEXT } from '../config/modelConfig';
import { loadFewShotStore, getCategoryForDiagnosis } from './continuousLearningLoop';

export interface LlmReasoningOutput {
  challengesConsidered: string[];
  anchors: string[];
  discriminators: Array<{
    challenge: string;
    evidence: string;
    reason: string;
  }>;
}

export const fairwaySchema = {
  type: Type.OBJECT,
  properties: {
    challengesConsidered: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    anchors: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    discriminators: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          challenge: { type: Type.STRING },
          evidence: { type: Type.STRING },
          reason: { type: Type.STRING }
        },
        required: ['challenge', 'evidence', 'reason']
      }
    }
  },
  required: ['challengesConsidered', 'anchors', 'discriminators']
};

export const taigaIcdSchema = {
  type: Type.OBJECT,
  properties: {
    code: { type: Type.STRING },
    description: { type: Type.STRING }
  },
  required: ['code', 'description']
};

export const aegisAppealSchema = {
  type: Type.OBJECT,
  properties: {
    citedEvidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          denialReason: { type: Type.STRING },
          evidenceItem: { type: Type.STRING },
          source: { type: Type.STRING },
          forChallenge: { type: Type.STRING }
        },
        required: ['denialReason', 'evidenceItem', 'source']
      }
    },
    stillMissing: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          denialReason: { type: Type.STRING },
          explanation: { type: Type.STRING }
        },
        required: ['denialReason', 'explanation']
      }
    },
    appealTextBody: { type: Type.STRING }
  },
  required: ['citedEvidence', 'stillMissing', 'appealTextBody']
};

export const tpaQuerySchema = {
  type: Type.OBJECT,
  properties: {
    predictedQueries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          queryText: { type: Type.STRING },
          reason: { type: Type.STRING },
          severity: { type: Type.STRING },
          mitigation: { type: Type.STRING }
        },
        required: ['category', 'queryText', 'reason', 'severity', 'mitigation']
      }
    }
  },
  required: ['predictedQueries']
};

let mockQueryOverride: ((prompt: string, systemInstruction?: string) => Promise<string>) | null = null;

export function setMockQuery(fn: typeof mockQueryOverride) {
  mockQueryOverride = fn;
}

/**
 * Queries the MedGemma LLM.
 * If VITE_MEDGEMMA_ENDPOINT_URL is set, queries the specified custom endpoint (e.g. Vertex AI or Ollama).
 * Otherwise, falls back to the main Gemini model (MODEL_TEXT) from config.
 */
export async function queryMedGemma(prompt: string, systemInstruction?: string, schema?: any): Promise<string> {
  if (mockQueryOverride) {
    return mockQueryOverride(prompt, systemInstruction);
  }

  const qwenUrl = (import.meta as any).env?.VITE_QWEN_ENDPOINT_URL || process.env.VITE_QWEN_ENDPOINT_URL;
  const endpointUrl = qwenUrl || (import.meta as any).env?.VITE_MEDGEMMA_ENDPOINT_URL || process.env.VITE_MEDGEMMA_ENDPOINT_URL;

  if (endpointUrl) {
    let attempts = 1;
    let lastError: any = null;
    // Brief 3: configurable model name — VITE_QWEN_MODEL_NAME overrides the default
    // so cloud Cerebras hosts (which use a different model ID) work without breaking local Ollama
    const qwenModelDefault = 'qwen2.5:7b';
    const qwenModelOverride = (import.meta as any).env?.VITE_QWEN_MODEL_NAME || process.env.VITE_QWEN_MODEL_NAME;
    const modelName = qwenUrl
      ? (qwenModelOverride || qwenModelDefault)
      : 'medgemma:4b';
    const logPrefix = qwenUrl ? 'qwen_endpoint' : 'medgemma_endpoint';
    // Brief 3: Bearer token for Cerebras (and any other hosted endpoint that requires auth)
    // Local Ollama does not require Authorization and silently ignores this header
    const qwenApiKey = (import.meta as any).env?.VITE_QWEN_API_KEY || process.env.VITE_QWEN_API_KEY || '';

    while (attempts > 0) {
      try {
        const response = await axios.post(endpointUrl, {
          model: modelName,
          messages: [
            ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          stream: false
        }, {
          timeout: 600000, // 10 mins
          ...(qwenApiKey && { headers: { Authorization: `Bearer ${qwenApiKey}` } })
        });

        if (response.data?.choices?.[0]?.message?.content) {
          console.log(`[llmClient] [PATH: ${logPrefix}] Query served successfully.`);
          return response.data.choices[0].message.content.trim();
        }
        throw new Error(`Malformed response structure from ${modelName} endpoint`);
      } catch (error: any) {
        attempts--;
        lastError = error;
        console.warn(`[llmClient] Custom ${modelName} endpoint call failed (attempts remaining: ${attempts}): ${error.message}`);
      }
    }
    console.warn(`[llmClient] [PATH: gemini_fallback] ${modelName} endpoint failed after attempts. Falling back silently to Gemini.`);
  }

  // Fall back to Gemini reasoning client if no dedicated MedGemma endpoint is active or it failed
  try {
    const ai = getGoogleGenAIClient();
    const isJson = (systemInstruction?.toLowerCase().includes('json') || prompt.toLowerCase().includes('json') || schema);
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction,
        ...(isJson && { responseMimeType: 'application/json' }),
        ...(schema && { responseSchema: schema })
      }
    });
    console.log(`[llmClient] [PATH: gemini_fallback] Query served via Gemini fallback${endpointUrl ? ' after endpoint timeout.' : '.'}`);
    return response.text || '';
  } catch (error: any) {
    console.error("[llmClient] Gemini fallback for MedGemma failed:", error);
    throw new Error(`MedGemma fallback to Gemini failed: ${error.message}`);
  }
}

let mockOverride: ((diagnosis: string, admissionType: string, clinicalNarrative: string) => Promise<LlmReasoningOutput>) | null = null;

export function setMockReasoning(fn: typeof mockOverride) {
  mockOverride = fn;
}

export async function getReasoningFromMedGemma(
  diagnosis: string,
  admissionType: string,
  clinicalNarrative: string
): Promise<LlmReasoningOutput> {
  if (mockOverride) {
    return mockOverride(diagnosis, admissionType, clinicalNarrative);
  }

  const lowerDx = diagnosis.toLowerCase();
  let demoKey: 'diabetes' | 'pneumonia' | 'appendicitis' | null = null;
  if (lowerDx.includes('diabetes')) {
    demoKey = 'diabetes';
  } else if (lowerDx.includes('pneumonia')) {
    demoKey = 'pneumonia';
  } else if (lowerDx.includes('appendicitis')) {
    demoKey = 'appendicitis';
  }

  const isDemoMode = (typeof window !== 'undefined' && (window as any).VITE_DEMO_MODE === true) || (import.meta as any).env?.VITE_DEMO_MODE === 'true' || process.env.VITE_DEMO_MODE === 'true';

  // Return canned demo feedback immediately if explicitly in demo mode
  if (isDemoMode && demoKey) {
    console.log(`[llmClient] [PATH: demo_data] Demo mode active. Returning pre-captured demo fallback for ${demoKey}.`);
    return DEMO_FALLBACKS[demoKey];
  }

  const systemInstruction = `You are an experienced TPA (Third Party Administrator) senior medical reviewer conducting a pre-authorization documentation sufficiency audit. Your role is to assess whether the clinical note adequately justifies the hospitalization and stated diagnosis from a reviewer's perspective — NOT to suggest a diagnosis or treatment.

THE TREATING DOCTOR'S DIAGNOSIS IS THE GIVEN INPUT. You only assess whether the documentation supports it.

## YOUR REASONING PROTOCOL (internal use only — do NOT output these stages verbatim)

Work through these five stages before producing your output:

**STAGE 1 — SIGNAL HORIZON**
Inventory what clinical facts ARE present in the note: symptoms, examination findings, vitals, history, disease duration, comorbidities, investigations, treatment already taken. Then explicitly note what is ABSENT from each of those categories.

**STAGE 2 — PATTERN CONSTELLATION**
Does the documented picture coherently fit the stated diagnosis? Identify any red flags (e.g., findings inconsistent with the diagnosis) or notable absences that weaken the picture. Do NOT suggest an alternative diagnosis — only note whether the documentation is coherent and complete.

**STAGE 3 — HYPOTHESIS FORGE**
Identify what questions an experienced TPA reviewer would raise:
- Could this be managed as OPD rather than inpatient? What EVIDENCE ANCHORS would justify inpatient admission, and which are missing?
- Could this be a pre-existing condition? What historical documentation would establish or rule out PED status, and is it present?
- Is the stated diagnosis sufficiently supported by objective findings and investigations? Which DISCRIMINATORS (lab values, imaging, vitals readings) are documented vs absent?

**STAGE 4 — DECISION NEXUS (documentation-justification only)**
IMPORTANT: Do NOT recommend any treatment, drug name, or dose. Instead, identify what JUSTIFICATION a reviewer expects to see already documented for the management chosen by the treating doctor:
- Why inpatient rather than OPD?
- Why this procedure / intervention?
- Why now (acuity / urgency)?
Flag missing justification — never a treatment decision.

**STAGE 5 — METACOGNITIVE LOOP (self-check)**
Before finalising: re-read each query you plan to raise. If the note ALREADY answers it, drop that query. Only keep queries that are genuinely unanswered by the documented text. Do not invent requirements. Do not raise a query you cannot directly tie to something absent.

## OUTPUT RULES

1. Output ONLY the raw JSON below — no markdown backticks, no prose, no wrapper text.
2. NO treatment recommendations, drug names, or doses anywhere in the output.
3. NO "TPA auto-rejects X" — phrase as "a reviewer would likely query…" or "provide X to establish Y."
4. NO ICD codes in the output.
5. NO computed probability numbers — qualitative queries only.
6. Every discriminator must be tied to one of the challenges in challengesConsidered.
7. EXPLICIT SUFFICIENCY BAR: If the note contains definitive, clinically-confirmed findings (e.g., imaging/USG confirming the exact diagnosis), do NOT demand extraneous baseline labs (like CBC) or routine vitals unless the note specifically suggests a complication. Do NOT over-flag a sufficient case.

## JSON SCHEMA (output exactly this structure)

{
  "challengesConsidered": ["challenge 1", "challenge 2", "challenge 3"],
  "anchors": ["required finding or document 1", "required finding or document 2"],
  "discriminators": [
    {
      "challenge": "exact challenge string from challengesConsidered",
      "evidence": "the exact clinical finding, value, or symptom required to satisfy the challenge (do NOT use broad categorical names like 'lab reports' or 'imaging')",
      "reason": "why this evidence is needed to address the challenge"
    }
  ]
}

Always include at minimum these three challenges:
1. "could this be managed as OPD?"
2. "could this be a pre-existing condition?"
3. "is the stated diagnosis supported by documented findings?"

Tailor anchors and discriminators specifically to the diagnosis: "${diagnosis}". Keep output compact — target ≤ 5 anchors and ≤ 5 discriminators total.`;

  const category = getCategoryForDiagnosis(diagnosis);
  let examplesText = '';
  if (category) {
    const store = loadFewShotStore();
    const examples = store[category];
    if (examples && examples.length > 0) {
      console.log(`[llmClient] Injecting ${examples.length} few-shot examples for category: ${category}`);
      examplesText = '\n\n## EXAMPLES\nHere are some examples of perfect outputs for this clinical category to guide your structure:\n';
      examples.forEach((ex, i) => {
        examplesText += `\nExample ${i + 1}:\nInput:\n${ex.input}\n\nOutput:\n\`\`\`json\n${JSON.stringify(ex.expectedOutput, null, 2)}\n\`\`\`\n`;
      });
    }
  }

  const finalSystemInstruction = systemInstruction + examplesText;

  const prompt = `Provisional Diagnosis: ${diagnosis}
Admission Decision: ${admissionType}
Clinical Narrative:
${clinicalNarrative}

Apply the five-stage NEXUS protocol internally, then output ONLY the raw JSON. Raise queries only for evidence that is genuinely absent from the note above.`;

  let responseText = '';
  try {
    responseText = await queryMedGemma(prompt, finalSystemInstruction, fairwaySchema);
  } catch (error: any) {
    if (isDemoMode && demoKey) {
      console.warn(`[llmClient] MedGemma query failed: ${error.message}. Returning pre-captured demo fallback for ${demoKey}.`);
      return DEMO_FALLBACKS[demoKey];
    }
    throw error;
  }

  // Clean markdown block wrappers if the model returned them
  let cleanText = responseText.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.substring(7);
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.substring(3);
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  cleanText = cleanText.trim();

  try {
    const parsed = JSON.parse(cleanText);
    if (
      Array.isArray(parsed.challengesConsidered) &&
      Array.isArray(parsed.anchors) &&
      Array.isArray(parsed.discriminators)
    ) {
      parsed.challengesConsidered = parsed.challengesConsidered.filter((x: any) => typeof x === 'string' && x.trim() !== '');
      parsed.anchors = parsed.anchors.filter((x: any) => typeof x === 'string' && x.trim() !== '');
      parsed.discriminators = parsed.discriminators.filter((x: any) => 
        x && typeof x.challenge === 'string' && typeof x.evidence === 'string' && typeof x.reason === 'string'
      );
      return parsed as LlmReasoningOutput;
    }
    throw new Error("Parsed JSON structure does not match expected schema");
  } catch (error) {
    if (isDemoMode && demoKey) {
      console.warn(`[llmClient] Failed to parse model output as JSON. Returning pre-captured demo fallback for ${demoKey}.`);
      return DEMO_FALLBACKS[demoKey];
    }
    console.error("[llmClient] Failed to parse model output as JSON. Raw output:", responseText);
    throw new Error("Malformed JSON from LLM: " + error);
  }
}
