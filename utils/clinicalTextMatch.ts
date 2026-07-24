import { ICD_SYNONYM_MAP } from '../data/icdSynonymMap';
import { CLINICAL_SYNONYMS } from '../config/clinicalSynonyms';
import { getGoogleGenAIClient } from '../services/apiKeys';
import { MODEL_TEXT } from '../config/modelConfig';

const stopWords = new Set([
  'the', 'and', 'for', 'was', 'with', 'from', 'but', 'not', 'have', 'been',
  'has', 'that', 'this', 'our', 'are', 'your', 'will', 'about', 'their', 'there'
]);

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
}

/**
 * Normalizes clinical query terms (lowercase, trim, collapse spaces)
 */
export function normalizeTerm(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Returns all synonyms for a term by merging CLINICAL_SYNONYMS and ICD_SYNONYM_MAP.
 */
export function getSynonyms(term: string): string[] {
  const normalized = normalizeTerm(term);
  const syns = new Set<string>([normalized]);

  // Check CLINICAL_SYNONYMS
  for (const group of CLINICAL_SYNONYMS) {
    const hasKey = group.keys.some(k => normalizeTerm(k) === normalized || normalized.includes(normalizeTerm(k)));
    const hasSyn = group.synonyms.some(s => normalizeTerm(s) === normalized || normalized.includes(normalizeTerm(s)));
    if (hasKey || hasSyn) {
      group.keys.forEach(k => syns.add(normalizeTerm(k)));
      group.synonyms.forEach(s => syns.add(normalizeTerm(s)));
    }
  }

  // Check ICD_SYNONYM_MAP
  for (const item of ICD_SYNONYM_MAP) {
    const itemNorm = normalizeTerm(item.term);
    if (itemNorm === normalized || normalized.includes(itemNorm) || itemNorm.includes(normalized)) {
      syns.add(itemNorm);
      // Map all synonyms sharing the same code
      ICD_SYNONYM_MAP.filter(x => x.code === item.code).forEach(x => syns.add(normalizeTerm(x.term)));
    }
  }

  return Array.from(syns);
}

/**
 * Reusable helper to check if a numeric vital value matches a concept requirement.
 * Handles "Platelets: 62k" matching "platelet count" or "thrombocytopenia severity"
 */
function checkNumericMatch(target: string, source: string): boolean {
  const targetLower = target.toLowerCase();
  const sourceLower = source.toLowerCase();

  // Platelet / Thrombocytopenia matching
  if (
    (targetLower.includes('platelet') || targetLower.includes('thrombocytopenia') || targetLower.includes('plt')) &&
    (sourceLower.includes('platelet') || sourceLower.includes('plt') || sourceLower.includes('thrombocyt'))
  ) {
    // Check if there is a number like 62k or 1.15 Lacs in source
    const numberMatch = sourceLower.match(/(?:[0-9.,]+)\s*(?:k|lac|lakh|thousand|\/cumm)?/i);
    if (numberMatch) {
      return true; // Match found
    }
  }

  // SpO2 matching
  if (
    (targetLower.includes('spo2') || targetLower.includes('oxygen') || targetLower.includes('hypoxia') || targetLower.includes('saturation')) &&
    (sourceLower.includes('spo2') || sourceLower.includes('oxygen') || sourceLower.includes('saturation') || sourceLower.includes('o2'))
  ) {
    const numberMatch = sourceLower.match(/(?:\d+)\s*%/);
    if (numberMatch) {
      return true;
    }
  }

  return false;
}

/**
 * Synchronous matching logic using synonym maps and keyword overlap.
 */
export function clinicalTextMatchSync(target: string, source: string): { matches: boolean; score: number } {
  const normalizedTarget = normalizeTerm(target);
  const normalizedSource = normalizeTerm(source);

  if (normalizedTarget === normalizedSource || normalizedSource.includes(normalizedTarget)) {
    return { matches: true, score: 1.0 };
  }

  // Numeric check
  if (checkNumericMatch(target, source)) {
    return { matches: true, score: 0.9 };
  }

  // Keyword overlap using synonym expansion
  const targetKeywords = extractKeywords(target);
  if (targetKeywords.length === 0) {
    return { matches: false, score: 0.0 };
  }

  let matchedCount = 0;
  for (const kw of targetKeywords) {
    const synonyms = getSynonyms(kw);
    const hasMatch = synonyms.some(syn => normalizedSource.includes(syn));
    if (hasMatch) {
      matchedCount++;
    }
  }

  const score = matchedCount / targetKeywords.length;
  // Threshold matching (e.g. 1 in 5 keywords or 20% match)
  const matches = score >= 0.20;

  return { matches, score };
}

export interface SemanticContext {
  remainingBudget: number;
}

/**
 * Asynchronous matching logic with fallback to a single small Gemini call for ambiguous cases.
 */
export async function clinicalTextMatch(target: string, source: string, context?: SemanticContext): Promise<{ matches: boolean; score: number }> {
  const syncResult = clinicalTextMatchSync(target, source);
  
  // If it's a clear match or clear mismatch, return immediately
  if (syncResult.matches && syncResult.score >= 0.5) {
    return syncResult;
  }
  if (!syncResult.matches && syncResult.score < 0.1) {
    if (context && context.remainingBudget > 0) {
      context.remainingBudget--;
    } else {
      return syncResult;
    }
  }

  // Ambiguous case: score is between 0.1 and 0.5 (or sync matches but is low-confidence)
  // Fallback to a single small Gemini call to check semantic overlap
  try {
    const ai = getGoogleGenAIClient();
    const prompt = `
You are a medical auditor checking if a target clinical concept is addressed/present in a source document text.

Target Concept: "${target}"
Source Text: "${source}"

Determine if the target clinical concept is documented as present/satisfied in the source text (even using synonyms, abbreviations, or numerical values like "Platelets: 62k" for "thrombocytopenia").
Respond with ONLY a JSON object:
{ "matches": true } or { "matches": false }
`;
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const result = JSON.parse(response.text || '{}');
    const matches = !!result.matches;
    return { matches, score: matches ? 0.8 : 0.0 };
  } catch (err) {
    console.error('[clinicalTextMatch] Gemini fallback error:', err);
    // If Gemini fails, fallback to synchronous match result
    return syncResult;
  }
}
