import axios from 'axios';
import { performance } from 'perf_hooks';
import { reviewEvidence } from '../engine/evidenceReview';
import { assignICDViaModel, validateCode } from '../services/icdService';
import { ICD_SYNONYM_MAP } from '../data/icdSynonymMap';

const originalAxiosPost = axios.post;

let lastPromptSent = '';
let lastRawResponse = '';
let currentModel = 'medgemma:4b';

// @ts-ignore
axios.post = async (url, data: any, config) => {
  if (url.includes('11434')) {
    data.model = currentModel;
    if (config) config.timeout = 120000; // Increase timeout to 2 minutes
    lastPromptSent = data.messages.map((m: any) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
    const res = await originalAxiosPost(url, data, config);
    lastRawResponse = res.data?.choices?.[0]?.message?.content || JSON.stringify(res.data);
    return res;
  }
  return originalAxiosPost(url, data, config);
};

async function runPartA() {
  console.log('=============================================');
  console.log('PART A — EVIDENCE ENGINE (3 REAL CASES)');
  console.log('=============================================\n');

  const cases = [
    {
      id: 1,
      diagnosis: "Community-acquired pneumonia",
      admissionType: "Emergency",
      narrative: "45M, cough and fever 3 days, advised admission for IV antibiotics.",
      record: {
        clinical: {
          selectedDiagnosisIndex: 0,
          diagnoses: [{ diagnosis: "Community-acquired pneumonia", icd10Code: "J18.9" }],
          chiefComplaints: "45M, cough and fever 3 days, advised admission for IV antibiotics.",
        },
        admission: { admissionType: "Emergency" }
      }
    },
    {
      id: 2,
      diagnosis: "Type 2 diabetes mellitus with hyperglycemia",
      admissionType: "Emergency",
      narrative: "52F, high blood sugar, admitted for glycemic control.",
      record: {
        clinical: {
          selectedDiagnosisIndex: 0,
          diagnoses: [{ diagnosis: "Type 2 diabetes mellitus with hyperglycemia", icd10Code: "E11.9" }],
          chiefComplaints: "52F, high blood sugar, admitted for glycemic control.",
        },
        admission: { admissionType: "Emergency" }
      }
    },
    {
      id: 3,
      diagnosis: "Acute appendicitis",
      admissionType: "Planned",
      narrative: "28M, 18h RLQ pain, migratory, fever 38.4, WBC 14.2, USG shows non-compressible appendix 9mm with periappendiceal fluid. Surgeon: laparoscopic appendectomy advised.",
      record: {
        clinical: {
          selectedDiagnosisIndex: 0,
          diagnoses: [{ diagnosis: "Acute appendicitis", icd10Code: "K35.8" }],
          chiefComplaints: "28M, 18h RLQ pain, migratory, fever 38.4, WBC 14.2, USG shows non-compressible appendix 9mm with periappendiceal fluid. Surgeon: laparoscopic appendectomy advised.",
        },
        admission: { admissionType: "Planned" }
      }
    }
  ];

  for (const c of cases) {
    if (c.id === 1) {
      console.log(`\n--- CASE ${c.id} (MedGemma Run 1) ---`);
      currentModel = 'medgemma:4b';
      let start = performance.now();
      let report = await reviewEvidence(c.record as any);
      let end = performance.now();
      console.log(`[PROMPT]\n${lastPromptSent}\n`);
      console.log(`[RAW RESPONSE]\n${lastRawResponse}\n`);
      console.log(`[FINAL REPORT]\n${JSON.stringify(report, null, 2)}\n`);
      console.log(`[LATENCY] ${((end - start) / 1000).toFixed(2)}s\n`);

      console.log(`\n--- CASE ${c.id} (MedGemma Run 2 - Stability) ---`);
      start = performance.now();
      report = await reviewEvidence(c.record as any);
      end = performance.now();
      console.log(`[PROMPT]\n${lastPromptSent}\n`);
      console.log(`[RAW RESPONSE]\n${lastRawResponse}\n`);
      console.log(`[FINAL REPORT]\n${JSON.stringify(report, null, 2)}\n`);
      console.log(`[LATENCY] ${((end - start) / 1000).toFixed(2)}s\n`);

      console.log(`\n--- CASE ${c.id} (Qwen2.5:3b-instruct Run) ---`);
      currentModel = 'qwen2.5:3b-instruct';
      start = performance.now();
      report = await reviewEvidence(c.record as any);
      end = performance.now();
      console.log(`[PROMPT]\n${lastPromptSent}\n`);
      console.log(`[RAW RESPONSE]\n${lastRawResponse}\n`);
      console.log(`[FINAL REPORT]\n${JSON.stringify(report, null, 2)}\n`);
      console.log(`[LATENCY] ${((end - start) / 1000).toFixed(2)}s\n`);
    } else {
      console.log(`\n--- CASE ${c.id} (MedGemma Run) ---`);
      currentModel = 'medgemma:4b';
      let start = performance.now();
      let report = await reviewEvidence(c.record as any);
      let end = performance.now();
      console.log(`[PROMPT]\n${lastPromptSent}\n`);
      console.log(`[RAW RESPONSE]\n${lastRawResponse}\n`);
      console.log(`[FINAL REPORT]\n${JSON.stringify(report, null, 2)}\n`);
      console.log(`[LATENCY] ${((end - start) / 1000).toFixed(2)}s\n`);
    }
  }
}

async function runPartB() {
  console.log('\n=============================================');
  console.log('PART B — ICD AI-FALLBACK (REAL MODEL)');
  console.log('=============================================\n');
  currentModel = 'medgemma:4b';

  const dxList = [
    "post-viral fatigue syndrome",
    "perforated duodenal ulcer with peritonitis"
  ];

  for (const dx of dxList) {
    console.log(`\n--- ICD Fallback for: "${dx}" ---`);
    const start = performance.now();
    const result = await assignICDViaModel(dx);
    const end = performance.now();
    
    console.log(`[PROMPT]\n${lastPromptSent}\n`);
    console.log(`[RAW RESPONSE]\n${lastRawResponse}\n`);
    console.log(`[PARSED CANDIDATE]\n${JSON.stringify(result, null, 2)}\n`);
    
    if (result.length > 0) {
       console.log(`[VALIDATION] validateCode("${result[0].code}") -> ${validateCode(result[0].code)}\n`);
    } else {
       console.log(`[VALIDATION] No valid WHO ICD-10 code was extracted.\n`);
    }
    console.log(`[LATENCY] ${((end - start) / 1000).toFixed(2)}s\n`);
  }
}

async function runPartC() {
  console.log('\n=============================================');
  console.log('PART C — SYNONYM MAP RE-VALIDATION');
  console.log('=============================================\n');

  let foundCount = 0;
  const missingCodes = [];

  for (const item of ICD_SYNONYM_MAP) {
    if (validateCode(item.code)) {
      foundCount++;
    } else {
      missingCodes.push(item);
    }
  }

  console.log(`Total Synonyms: ${ICD_SYNONYM_MAP.length}`);
  console.log(`Codes Found in WHO Table: ${foundCount}`);
  console.log(`Codes STILL Missing: ${missingCodes.length}`);
  if (missingCodes.length > 0) {
    console.log(`\nMissing Codes List:`);
    for (const m of missingCodes) {
      console.log(`- "${m.term}" -> ${m.code}`);
    }
  }
}

async function main() {
  await runPartA();
  await runPartB();
  await runPartC();
}

main().catch(console.error);
