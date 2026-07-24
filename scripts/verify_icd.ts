import codesData from '../data/icd10Codes.json';
import categoriesData from '../data/icd10Categories.json';
import { ICD_SYNONYM_MAP } from '../data/icdSynonymMap';
import { lookupICD, validateCode, getDescription, assignICDViaModel } from '../services/icdService';
import { checkDiagnosisCoding } from '../engine/evidenceReview';
import { setMockQuery } from '../services/llmClient';

// Mock localStorage globally for Node.js test environment
(global as any).localStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value.toString();
  },
  clear() {
    this.store = {};
  }
};

async function main() {
  console.log('=== CHECK 1: DATA REALLY LOADED (WHO 2019) ===');
  console.log(`Codes count: ${codesData.codes.length}`);
  console.log(`Categories count: ${categoriesData.categories.length}`);

  console.log('\n=== CHECK 2: SYNONYM MAP CROSS-REFERENCE ===');
  console.log(`Synonym map count: ${ICD_SYNONYM_MAP.length}`);
  const invalidSynonyms = [];
  for (const item of ICD_SYNONYM_MAP) {
    if (!validateCode(item.code)) {
      invalidSynonyms.push(item);
    }
  }
  console.log(`Synonyms NOT in WHO database: ${invalidSynonyms.length}`);
  if (invalidSynonyms.length > 0) {
    console.log(JSON.stringify(invalidSynonyms, null, 2));
  } else {
    console.log('All synonym codes are validated and exist in the WHO dataset!');
  }

  console.log('\n=== CHECK 3: LOOKUP BEHAVIOR (CONTAINS PATHS) ===');
  const containsTerms = ['viral fever', 'bronchitis', 'fracture femur', 'appendicitis'];
  for (const term of containsTerms) {
    const res = lookupICD(term);
    console.log(`\nInput: "${term}" -> Candidates count: ${res.length}`);
    console.log(JSON.stringify(res, null, 2));
  }

  console.log('\n=== CHECK 6: AI FALLBACK GATING, PARSING & VALIDATION ===');
  
  // 6a. Gated AI test (normal mock)
  setMockQuery(async () => '{"code": "J18.9", "description": "Pneumonia, unspecified organism"}');
  const fallbackRes = await assignICDViaModel('some lung condition');
  console.log('Valid AI fallback result:', JSON.stringify(fallbackRes));

  // 6b. Messy response containing conversational and reasoning text
  const messyResponse = `Reasoning: The patient has a respiratory infection with fluid build up.
This is classified under category J18.
The most specific code is J18.9.

\`\`\`json
{
  "code": "J18.9",
  "description": "Pneumonia, unspecified organism"
}
\`\`\`
Hope this helps!`;

  setMockQuery(async () => messyResponse);
  const messyRes = await assignICDViaModel('some severe lung infection');
  console.log('Messy AI fallback result:', JSON.stringify(messyRes));

  // 6c. Invalid AI proposal (should be discarded)
  setMockQuery(async () => '{"code": "Z99.999", "description": "Imaginary Disease"}');
  const invalidRes = await assignICDViaModel('some weird symptom');
  console.log('Invalid AI proposal result (expect empty array):', JSON.stringify(invalidRes));

  // Clean mock
  setMockQuery(null);
}

main().catch(console.error);
