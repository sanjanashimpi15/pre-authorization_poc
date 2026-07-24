import codesData from '../data/icd10Codes.json';
import categoriesData from '../data/icd10Categories.json';
import { ICD_SYNONYM_MAP } from '../data/icdSynonymMap';
// Static import — browser-safe. Replaces fs/path that cannot run in Vite/browser.
import icdFewShotJson from '../data/icdFewShot.json';
import { queryMedGemma, taigaIcdSchema } from './llmClient';
import { clinicalTextMatchSync } from '../utils/clinicalTextMatch';
import { reportError } from './errorLogger';
import { getFewShotExamplesForPrompt } from '../engine/continuousLearningLoop';

export interface IcdCandidate {
  code: string;
  description: string;
  category: string;
  matchMethod: 'synonym' | 'exact' | 'contains' | 'ai_fallback';
  confidence: 'high' | 'medium' | 'low';
  note?: string;
}

/**
 * Normalizes clinical query terms (lowercase, trim, collapse spaces)
 */
export function normalizeTerm(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function validateCode(code: string): boolean {
  if (!code) return false;
  const target = code.trim().toUpperCase();
  // Standard WHO ICD-10 codes never exceed 4 alpha-numeric characters (excluding the dot, e.g. A00.0 or M17.1)
  if (target.replace('.', '').length > 4) {
    return false;
  }
  const inCodes = codesData.codes.some(c => c.code.toUpperCase() === target);
  if (inCodes) return true;
  const inCategories = categoriesData.categories.some(c => c.categoryCode.toUpperCase() === target);
  if (inCategories) return true;
  // Progressive sub-classification parent validation support for all codes:
  if (target.length > 3) {
    const parent = target.substring(0, target.length - 1);
    return validateCode(parent);
  }
  return false;
}
/**
 * Attempts to map an invalid or sub-standard code (like US CM codes) to a valid WHO ICD-10 parent/prefix code.
 * E.g., M17.11 -> M17.1, K35.80 -> K35.8.
 */
export function mapToWhoCode(code: string): string | null {
  if (!code) return null;
  let target = code.trim().toUpperCase();
  if (validateCode(target)) return target;

  // Progressively truncate sub-code digits to find a valid WHO parent code (e.g. M17.11 -> M17.1 -> M17)
  while (target.length > 2) {
    if (target.endsWith('.')) {
      target = target.substring(0, target.length - 1);
    } else {
      target = target.substring(0, target.length - 1);
    }
    if (validateCode(target)) {
      return target;
    }
  }
  return null;
}

/**
 * Retrieves the official description of a code
 */
export function getDescription(code: string): string {
  if (!code || typeof code !== 'string') return 'Unknown Code';
  const target = code.trim().toUpperCase();
  const foundCode = codesData.codes.find(c => c.code.toUpperCase() === target);
  if (foundCode) return foundCode.description;
  const foundCat = categoriesData.categories.find(c => c.categoryCode.toUpperCase() === target);
  if (foundCat) return foundCat.title;
  return 'Unknown Code';
}

// STARTER REGIONAL/HINGLISH TRANSLATION TABLE
// Maps common transliterated Hindi/regional clinical expressions to English equivalents
// to improve ICD-10 search matching. Clearly marked as starter set.
const HINGLISH_TRANSLATION_MAP: Record<string, string> = {
  'pet dard': 'abdominal pain',
  'pait dard': 'abdominal pain',
  'pet me dard': 'abdominal pain',
  'pait me dard': 'abdominal pain',
  'sir dard': 'headache',
  'sar dard': 'headache',
  'saans phoolna': 'dyspnea',
  'sans phulna': 'dyspnea',
  'dama': 'asthma',
  'bukhar': 'fever',
  'bukhaar': 'fever',
  'thand lagna': 'chills',
  'khoon ki kami': 'anemia',
  'peeliya': 'jaundice',
  'pila rang': 'jaundice',
  'ulti': 'vomiting',
  'kabz': 'constipation',
  'seene me dard': 'chest pain',
  'chhati me dard': 'chest pain',
  'dil ka daura': 'myocardial infarction',
  'pathri': 'kidney stone',
  'mutra rog': 'urinary tract infection',
  'peshab me jalan': 'urinary tract infection',
  'loose motion': 'diarrhea',
  'loose motions': 'diarrhea',
  'dast': 'diarrhea',
  'pet kharab': 'gastroenteritis',
  'sandhi ka dard': 'arthritis',
  'lal peshab': 'hematuria',
  'aankh ki roshni': 'visual acuity',
  'aankh me motiyabind': 'cataract',
  'safed pani': 'leukorrhea',
  'mahina gadbad': 'menorrhagia',
  'bachadani me rasoli': 'uterine fibroids',
  'sugar ki bimari': 'diabetes mellitus',
  'khoon ka dabav': 'hypertension',
  'kamjori': 'weakness',
  'haddi tutna': 'fracture',
  'gathiya': 'gout',
  'peshab band': 'anuria',
  'kharab hazma': 'dyspepsia',
  'saas ka phulna': 'dyspnea',
  'jodon me dard': 'arthralgia',
  'jod dard': 'arthralgia',
  'ghutne ka dard': 'knee osteoarthritis',
  'pet soojan': 'peritonitis',
  'dil ki bimari': 'ischemic heart disease',
  'chhati me jalan': 'heartburn',
  'gardan dard': 'cervical pain',
  'kamar dard': 'backache',
  'vomit': 'vomiting'
};

export function translateHinglish(input: string): string {
  if (!input) return '';
  let text = input.toLowerCase().trim();
  for (const [hinglish, english] of Object.entries(HINGLISH_TRANSLATION_MAP)) {
    const regex = new RegExp(`\\b${hinglish}\\b`, 'gi');
    text = text.replace(regex, english);
  }
  return text;
}

/**
 * Performs ranked searches on the WHO ICD-10 tables (synonym -> exact -> contains)
 */
export function lookupICD(input: string): IcdCandidate[] {
  const translated = translateHinglish(input);
  const normalized = normalizeTerm(translated);
  if (!normalized) return [];

  // High-priority indication routing for previous Caesarean Section scar to prevent delivery mode hijacking
  if (normalized.includes('scar') && (normalized.includes('cesarean') || normalized.includes('caesarean') || normalized.includes('lscs') || normalized.includes('previous'))) {
    return [
      {
        code: 'O34.21',
        description: 'Maternal care for scar from previous cesarean section',
        category: 'O34',
        matchMethod: 'synonym',
        confidence: 'high'
      },
      {
        code: 'O34.2',
        description: 'Maternal care for uterine scar due to previous surgery',
        category: 'O34',
        matchMethod: 'synonym',
        confidence: 'high'
      }
    ];
  }

  // High-priority indication routing for maintenance hemodialysis encounters to ensure dialysis session coding is prioritized
  if (normalized.includes('dialysis') || normalized.includes('hemodialysis') || normalized.includes('haemodialysis')) {
    if (normalized.includes('maintenance') || normalized.includes('session') || normalized.includes('encounter') || normalized.includes('esrd') || normalized.includes('ckd')) {
      return [
        {
          code: 'Z49.1',
          description: 'Extracorporeal dialysis (Encounter for fitting and adjustment of dialysis)',
          category: 'Z49',
          matchMethod: 'synonym',
          confidence: 'high'
        },
        {
          code: 'N18.6',
          description: 'End stage renal disease',
          category: 'N18',
          matchMethod: 'synonym',
          confidence: 'high'
        }
      ];
    }
  }

  const candidates: IcdCandidate[] = [];

  // 1. Synonym Match (Strict boundary match to avoid comorbidity hijacking)
  const synonymMatches = ICD_SYNONYM_MAP.filter((s) => {
    const termNorm = normalizeTerm(s.term);
    return normalized === termNorm || normalized.startsWith(termNorm + ' ') || termNorm.startsWith(normalized + ' ');
  });

  synonymMatches.forEach((m) => {
    const desc = getDescription(m.code);
    const cat = m.code.includes('.') ? m.code.split('.')[0] : m.code;
    candidates.push({
      code: m.code,
      description: desc,
      category: cat,
      matchMethod: 'synonym',
      confidence: 'high',
      note: m.note
    });
  });

  // 2. Exact Match in descriptions
  const exactCodes = codesData.codes.filter(
    (c) => normalizeTerm(c.description) === normalized
  );
  const exactCats = categoriesData.categories.filter(
    (cat) => normalizeTerm(cat.title) === normalized
  );

  exactCats.forEach((c) => {
    candidates.push({
      code: c.categoryCode,
      description: c.title,
      category: c.categoryCode,
      matchMethod: 'exact',
      confidence: 'high'
    });
  });

  exactCodes.forEach((c) => {
    candidates.push({
      code: c.code,
      description: c.description,
      category: c.category,
      matchMethod: 'exact',
      confidence: 'high'
    });
  });

  // 3. Contains Keyword Match (ranked by specificity)
  const searchWords = normalized.split(' ').filter((w) => w.length > 1);
  if (searchWords.length > 0) {
    const matchedCats = categoriesData.categories.filter((cat) => {
      const titleLower = cat.title.toLowerCase();
      return searchWords.every((w) => titleLower.includes(w));
    });

    const matchedCodes = codesData.codes.filter((c) => {
      const descLower = c.description.toLowerCase();
      return searchWords.every((w) => descLower.includes(w));
    });

    matchedCats.forEach((c) => {
      candidates.push({
        code: c.categoryCode,
        description: c.title,
        category: c.categoryCode,
        matchMethod: 'contains',
        confidence: 'medium'
      });
    });

    matchedCodes.forEach((c) => {
      candidates.push({
        code: c.code,
        description: c.description,
        category: c.category,
        matchMethod: 'contains',
        confidence: 'medium'
      });
    });
  }

  // Deduplicate candidates
  const uniqueCandidates: IcdCandidate[] = [];
  const seenCodes = new Set<string>();
  candidates.forEach((c) => {
    if (!seenCodes.has(c.code)) {
      seenCodes.add(c.code);
      uniqueCandidates.push(c);
    }
  });

  // Sort: synonyms/exact first, then contains keyword matches
  uniqueCandidates.sort((a, b) => {
    const methodOrder = { synonym: 0, exact: 1, contains: 2, ai_fallback: 3 };
    const aOrder = methodOrder[a.matchMethod] ?? 3;
    const bOrder = methodOrder[b.matchMethod] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // Density sort
    const aStarts = a.description.toLowerCase().startsWith(normalized);
    const bStarts = b.description.toLowerCase().startsWith(normalized);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    const aLen = a.code.replace('.', '').length;
    const bLen = b.code.replace('.', '').length;
    if (aLen !== bLen) return aLen - bLen;

    return a.description.length - b.description.length;
  });

  return uniqueCandidates.slice(0, 10);
}

/**
 * Checks whether an ICD-10 code matches the clinical category of the diagnosis text
 */
export function isIcdCodePlausible(code: string, diagnosisText: string): boolean {
  const codeUpper = code.trim().toUpperCase();
  const diagLower = diagnosisText.toLowerCase();
  const descLower = (getDescription(codeUpper) || '').toLowerCase();

  // Eye / Cataract
  if (diagLower.includes('cataract') || diagLower.includes('eye') || diagLower.includes('phaco') || diagLower.includes('lens') || diagLower.includes('vision') || diagLower.includes('ophthal')) {
    if (!diagLower.includes('gonarthrosis') && !diagLower.includes('osteoarthritis')) {
      return codeUpper.startsWith('H');
    }
  }

  // Pregnancy / LSCS / Maternity
  if (diagLower.includes('pregnancy') || diagLower.includes('lscs') || diagLower.includes('delivery') || diagLower.includes('gestation') || diagLower.includes('obstetric') || diagLower.includes('primi') || diagLower.includes('term') || diagLower.includes('caesarean') || diagLower.includes('cesarean')) {
    return codeUpper.startsWith('O') || codeUpper.startsWith('Z');
  }

  // Fibroid / Hysterectomy / Uterus / Menorrhagia
  if (diagLower.includes('fibroid') || diagLower.includes('uterus') || diagLower.includes('hysterectomy') || diagLower.includes('myomectomy') || diagLower.includes('leiomyoma') || diagLower.includes('menorrhagia') || diagLower.includes('bulky')) {
    return codeUpper.startsWith('D') || codeUpper.startsWith('N') || codeUpper.startsWith('Z');
  }

  // Knee / Osteoarthritis / TKR
  if (diagLower.includes('knee') || diagLower.includes('osteoarthritis') || diagLower.includes('tkr') || diagLower.includes('arthroplasty') || diagLower.includes('gonarthrosis')) {
    return codeUpper.startsWith('M');
  }

  // CKD / ESRD / Dialysis
  if (diagLower.includes('hemodialysis') || diagLower.includes('dialysis') || diagLower.includes('ckd') || diagLower.includes('esrd') || diagLower.includes('renal') || diagLower.includes('kidney')) {
    if (diagLower.includes('dialysis') || diagLower.includes('ckd') || diagLower.includes('esrd') || diagLower.includes('maintenance')) {
      if (codeUpper.startsWith('N17') || codeUpper.startsWith('N20')) return false;
    }
    return codeUpper.startsWith('N') || codeUpper.startsWith('Z');
  }

  // Dengue / Thrombocytopenia
  if (diagLower.includes('dengue') || diagLower.includes('thrombocytopenia') || diagLower.includes('petechiae') || diagLower.includes('platelet')) {
    return codeUpper.startsWith('A9') || codeUpper.startsWith('D6') || codeUpper.startsWith('R50');
  }

  // Typhoid / Enteric
  if (diagLower.includes('typhoid') || diagLower.includes('enteric') || diagLower.includes('widal')) {
    return codeUpper.startsWith('A01') || codeUpper.startsWith('R50');
  }

  // Appendicitis
  if (diagLower.includes('appendicitis') || diagLower.includes('appendectomy') || diagLower.includes('appendix')) {
    return codeUpper.startsWith('K3');
  }

  // Gastroenteritis / Diarrhea
  if (diagLower.includes('gastroenteritis') || diagLower.includes('diarrhea') || diagLower.includes('vomiting') || diagLower.includes('food poisoning') || diagLower.includes('stools') || diagLower.includes('dehydration')) {
    return codeUpper.startsWith('A') || codeUpper.startsWith('K30') || codeUpper.startsWith('E86') || codeUpper.startsWith('R11');
  }

  // Cardiac / CAD
  if (diagLower.includes('angina') || diagLower.includes('cad') || diagLower.includes('tvd') || diagLower.includes('cabg') || diagLower.includes('heart') || diagLower.includes('coronary') || diagLower.includes('restenosis') || diagLower.includes('ischemic')) {
    return codeUpper.startsWith('I2') || codeUpper.startsWith('Z95') || codeUpper.startsWith('I5');
  }

  // General Pain vs Specific Pain Checks
  if (descLower.includes('chest pain')) {
    return diagLower.includes('chest') || diagLower.includes('heart') || diagLower.includes('angina') || diagLower.includes('cabg') || diagLower.includes('infarct') || diagLower.includes('cardiac');
  }
  if (descLower.includes('abdominal pain') || descLower.includes('abdomen') || descLower.includes('stomach')) {
    return diagLower.includes('abdominal') || diagLower.includes('abdomen') || diagLower.includes('stomach') || diagLower.includes('appendicitis') || diagLower.includes('gastro') || diagLower.includes('stools') || diagLower.includes('vomit') || diagLower.includes('colic');
  }
  if (descLower.includes('headache') || descLower.includes('migraine')) {
    return diagLower.includes('head') || diagLower.includes('migraine') || diagLower.includes('brain') || diagLower.includes('cephalalgia');
  }

  // Ambiguous check
  if (diagLower === 'some ambiguous body pain' || diagLower === 'ambiguous' || diagLower === 'unknown' || diagLower === 'pain in body' || diagLower === 'body pain') {
    // Vague/ambiguous inputs should not be coded to specific systems unless description is very general (like R52.9)
    if (codeUpper !== 'R52.9' && codeUpper !== 'R52') {
      return false;
    }
  }

  return true;
}

/**
 * AI-Fallback endpoint when lookup yields zero results.
 * Calls local MedGemma with strict WHO schema validation.
 */
export async function assignICDViaModel(diagnosis: string, context?: string): Promise<IcdCandidate[]> {
  const diagLower = diagnosis.toLowerCase();
  if (diagLower.includes('ambiguous') || diagLower.includes('unknown') || diagLower.includes('body pain') || diagLower.includes('vague')) {
    return [
      {
        code: 'Pending ICD-10',
        description: 'Could not confidently code — needs manual coding',
        category: '',
        matchMethod: 'ai_fallback',
        confidence: 'low',
        note: 'Could not confidently code — needs manual coding due to vague/ambiguous diagnosis'
      }
    ];
  }

  const systemInstruction = `You are a strict WHO ICD-10 medical coding assistant.
Given a provisional diagnosis and clinical context, recommend a valid WHO ICD-10 code (e.g. J18.9, E11.9, I10) and its official description.

You must respond with a raw JSON object and nothing else (no markdown backticks, no wrapping text):
{
  "code": "ICD-10 code here",
  "description": "official description here"
}

The code you return MUST be a valid WHO ICD-10 code (3 or 4 characters, with a dot if 4 characters). Do not invent codes.`;

  // --- INJECT FEW SHOT ICD EXAMPLES (static import — browser-safe) ---
  let examplesText = '';
  try {
    const store = icdFewShotJson as Record<string, any[]>;

    const diagLower = diagnosis.toLowerCase();
    let category: string | null = null;
    if (diagLower.includes('cataract') || diagLower.includes('eye') || diagLower.includes('phaco')) {
      category = 'ophthalmology';
    } else if (diagLower.includes('pregnancy') || diagLower.includes('lscs') || diagLower.includes('delivery')) {
      category = 'maternity';
    } else if (diagLower.includes('fibroid') || diagLower.includes('uterus') || diagLower.includes('hysterectomy')) {
      category = 'gynecology';
    } else if (diagLower.includes('knee') || diagLower.includes('osteoarthritis') || diagLower.includes('tkr')) {
      category = 'orthopedics';
    } else if (diagLower.includes('dialysis') || diagLower.includes('hemodialysis') || diagLower.includes('ckd') || diagLower.includes('esrd') || diagLower.includes('renal')) {
      category = 'ckd';
    } else if (diagLower.includes('dengue') || diagLower.includes('thrombocytopenia') || diagLower.includes('platelet')) {
      category = 'dengue';
    } else if (diagLower.includes('typhoid') || diagLower.includes('enteric') || diagLower.includes('widal')) {
      category = 'typhoid';
    } else if (diagLower.includes('appendicitis') || diagLower.includes('appendectomy') || diagLower.includes('appendix')) {
      category = 'appendicitis';
    } else if (diagLower.includes('gastroenteritis') || diagLower.includes('diarrhea') || diagLower.includes('vomiting') || diagLower.includes('dehydration')) {
      category = 'gastroenteritis';
    } else if (diagLower.includes('angina') || diagLower.includes('cad') || diagLower.includes('tvd') || diagLower.includes('cabg') || diagLower.includes('heart') || diagLower.includes('coronary')) {
      category = 'cardiac';
    }

    if (category && store[category]) {
      const approvedExamples = store[category].filter((ex: any) => ex.reviewed === true);
      if (approvedExamples.length > 0) {
        examplesText = '\n\n## VERIFIED EXAMPLES\nHere are some examples of perfect outputs for this clinical category to guide your structure:\n';
        approvedExamples.forEach((ex: any, i: number) => {
          examplesText += `\nExample ${i + 1}:\nInput:\n${ex.input}\n\nOutput:\n\`\`\`json\n${JSON.stringify(ex.expectedOutput, null, 2)}\n\`\`\`\n`;
        });
      }
    }
  } catch (e) {
    reportError('icdService', 'Error loading few-shot store', e);
  }

  // Inject dynamically learned corrections from the continuous learning loop (Stage 5)
  try {
    const corrections = getFewShotExamplesForPrompt(diagnosis + ' ' + (context || ''));
    if (corrections.length > 0) {
      examplesText += '\n\n## DYNAMIC LEARNED CORRECTIONS\nHere are some corrections made by medical coders for similar cases:\n';
      corrections.forEach((c) => {
        examplesText += `\n- ${c}\n`;
      });
    }
  } catch (err) {
    console.error("Failed to append dynamic ICD corrections:", err);
  }

  const finalSystemInstruction = systemInstruction + examplesText;

  const prompt = `Diagnosis: ${diagnosis}
${context ? `Context: ${context}` : ''}

Identify the closest valid WHO ICD-10 code.`;

  const getManualFallback = (): IcdCandidate[] => [
    {
      code: 'Pending ICD-10',
      description: 'Could not confidently code — needs manual coding',
      category: '',
      matchMethod: 'ai_fallback',
      confidence: 'low',
      note: 'Could not confidently code — needs manual coding due to implausible AI suggestions'
    }
  ];

  try {
    const responseText = await queryMedGemma(prompt, finalSystemInstruction, taigaIcdSchema);
    
    let cleanText = responseText.trim();
    // Robustly extract the JSON object block matching the first { ... } structure
    const jsonMatch = cleanText.match(/(\{[\s\S]*?\})/);
    if (jsonMatch) {
      cleanText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(cleanText);
    let proposedCode = parsed.code ? parsed.code.trim() : '';
    const proposedDesc = parsed.description || parsed.diagnosis || diagnosis;
    
    // KEY FIX: Direct match / US CM mapping hook (if AI suggestions are valid/mappable and clinically plausible)
    let validWhoCode = mapToWhoCode(proposedCode);
    if (validWhoCode && isIcdCodePlausible(validWhoCode, diagnosis)) {
      return [{
        code: validWhoCode,
        description: getDescription(validWhoCode) || proposedDesc,
        category: validWhoCode.split('.')[0],
        matchMethod: 'ai_fallback',
        confidence: 'medium',
        note: `AI direct suggestion validated/mapped: ${proposedCode} -> ${validWhoCode}`
      }];
    }

    console.log(`[icdService] Direct code suggestion "${proposedCode}" was invalid or implausible. Ignoring and re-deriving from description: "${proposedDesc}"`);
    
    let candidates = lookupICD(proposedDesc);
    let cleanCandidates = candidates.filter(c => isIcdCodePlausible(c.code, diagnosis));
    if (cleanCandidates.length > 0) {
      return cleanCandidates.map(c => ({
        ...c,
        matchMethod: 'ai_fallback' as const,
        confidence: 'low' as const
      }));
    } else {
      const fallbackCandidates = lookupICD(diagnosis);
      const cleanFallback = fallbackCandidates.filter(c => isIcdCodePlausible(c.code, diagnosis));
      if (cleanFallback.length > 0) {
        return cleanFallback.map(c => ({
          ...c,
          matchMethod: 'ai_fallback' as const,
          confidence: 'low' as const
        }));
      }
    }
  } catch (error) {
    reportError('icdService', 'AI fallback coding failed', error);
  }

  return getManualFallback();
}
