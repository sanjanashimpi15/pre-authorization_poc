// Static import — browser-safe. Node fs/path cannot run in Vite/browser context.
import fewShotStoreJson from '../data/fewShotStore.json';
import { LlmReasoningOutput } from './llmClient';

export interface FewShotExample {
  input: string;
  expectedOutput: LlmReasoningOutput;
}

export interface FewShotStore {
  [category: string]: FewShotExample[];
}

// In-memory mutable copy seeded from the static JSON import.
// Changes made at runtime (promoteToFewShot) persist for the session only.
let _inMemoryStore: FewShotStore | null = null;

/**
 * Loads the few-shot store. Returns the statically-imported JSON on first call,
 * then returns the in-memory copy for subsequent calls (so runtime promotions
 * are reflected without needing a file write).
 */
export function loadFewShotStore(): FewShotStore {
  if (_inMemoryStore === null) {
    // Deep-clone so mutations don't corrupt the module-level import cache.
    _inMemoryStore = JSON.parse(JSON.stringify(fewShotStoreJson)) as FewShotStore;
  }
  return _inMemoryStore;
}

/**
 * Persists the few-shot store.
 * In browser environments (Vite) file writes are impossible — this is a no-op
 * that keeps the in-memory cache consistent for the current session.
 */
function saveFewShotStore(store: FewShotStore) {
  // Update in-memory state so the session benefits from the promotion.
  _inMemoryStore = store;
  // NOTE: File persistence is not possible in the browser.
  // To persist across sessions, send this to a backend API endpoint instead.
  console.log('[ContinuousLearningLoop] saveFewShotStore: in-memory store updated (browser — no file write).');
}

/**
 * Given a diagnosis, identifies the relevant ICD-10 chapter category.
 */
export function getCategoryForDiagnosis(diagnosisText: string): string | null {
  const diagLower = diagnosisText.toLowerCase();

  if (diagLower.includes('cataract') || diagLower.includes('eye') || diagLower.includes('phaco') || diagLower.includes('lens') || diagLower.includes('vision') || diagLower.includes('ophthal')) {
    if (!diagLower.includes('gonarthrosis') && !diagLower.includes('osteoarthritis')) {
      return 'ophthalmology';
    }
  }

  if (diagLower.includes('pregnancy') || diagLower.includes('lscs') || diagLower.includes('delivery') || diagLower.includes('gestation') || diagLower.includes('obstetric') || diagLower.includes('primi') || diagLower.includes('term') || diagLower.includes('caesarean') || diagLower.includes('cesarean')) {
    return 'maternity';
  }

  if (diagLower.includes('fibroid') || diagLower.includes('uterus') || diagLower.includes('hysterectomy') || diagLower.includes('myomectomy') || diagLower.includes('leiomyoma') || diagLower.includes('menorrhagia') || diagLower.includes('bulky')) {
    return 'gynecology';
  }

  if (diagLower.includes('knee') || diagLower.includes('osteoarthritis') || diagLower.includes('tkr') || diagLower.includes('arthroplasty') || diagLower.includes('gonarthrosis')) {
    return 'orthopedics';
  }

  return null;
}

/**
 * Promotes a human-corrected reasoning output to the few-shot store to prevent future hallucinations.
 * Keeps a maximum of 3 examples per category to prevent prompt bloat.
 */
export function promoteToFewShot(diagnosis: string, admissionDecision: string, correctedOutput: LlmReasoningOutput) {
  const category = getCategoryForDiagnosis(diagnosis);
  if (!category) {
    console.log(`[ContinuousLearningLoop] No predefined category found for diagnosis: "${diagnosis}". Not promoting.`);
    return;
  }

  const store = loadFewShotStore();
  if (!store[category]) {
    store[category] = [];
  }

  const newExample: FewShotExample = {
    input: `Provisional Diagnosis: ${diagnosis}\nAdmission Decision: ${admissionDecision}`,
    expectedOutput: correctedOutput
  };

  // Add to the front and limit to 3 to prevent prompt token bloat
  store[category].unshift(newExample);
  if (store[category].length > 3) {
    store[category] = store[category].slice(0, 3);
  }

  saveFewShotStore(store);
  console.log(`[ContinuousLearningLoop] Promoted new corrected example to few-shot store for category: ${category}. Total examples: ${store[category].length}`);
}
