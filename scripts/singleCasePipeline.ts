/**
 * scripts/singleCasePipeline.ts — Task 4: Real-time Pipeline Latency Simulation
 *
 * Runs a single complete end-to-end pipeline for one heavy Dengue Shock
 * Syndrome case and reports per-stage wall-clock latency for all 9 modules.
 * Any stage exceeding 10s is flagged as a coordinator UX bottleneck.
 *
 * Usage:
 *   GEMINI_API_KEY=<key> npx tsx scripts/singleCasePipeline.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { extractFromDocument } from '../services/documentExtractionService';
import { reviewEvidence } from '../engine/evidenceReview';
import { lookupICD, assignICDViaModel, getDescription } from '../services/icdService';
import { runBillingCodingWorkflow } from '../engine/billingCoder';
import { isPMJAYBeneficiary } from '../services/pmjayService';
import { generatePartC } from '../engine/partCGenerator';
import { runDenialReview, DenialItem } from '../engine/denialReview';
import { generateDenialAppeal } from '../engine/denialAppealGenerator';
import { generateAppealPackage } from '../engine/appealGenerator';
import { makePreAuthRecord } from './testBattery';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const SLA_THRESHOLD_MS = 10_000;

// ── Test Case: CASE-009 — Dengue Shock Syndrome ───────────────────────────────
const CASE_009 = {
  id: 'CASE-009',
  diagnosis: 'Dengue Shock Syndrome with Thrombocytopenia',
  difficulty: 'extreme',
  focusCategory: 'denial_heavy',
  chiefComplaints: 'High-grade fever with chills, severe headache, retro-orbital pain, myalgia, nausea x5 days. Sudden hypotension, cold extremities on day 5.',
  hpi: 'C/O fever since 5 days. BP 80/50mmHg, Pulse 118/min weak, SpO2 92% RA. NS1 Ag+, IgM+. Platelets 18,000/μL. SGOT 340, SGPT 280. USG: Ascites++, pleural effusion.',
  relevantClinicalFindings: 'Dengue Shock Syndrome (DSS) — WHO Grade III. IV fluid resuscitation. Platelet transfusion 6 units. PICU admission.',
  rawDocumentText: `HOSPITAL DISCHARGE SUMMARY
Patient: Aravind Nair | Age: 15 | Sex: Male
Admission: 2026-06-28 | Discharge: 2026-07-05
Hospital: Apollo Childrens Hospital, Chennai
DIAGNOSIS: Dengue Shock Syndrome (DSS) — WHO Grade III
ICD-10: A97.0
INSURER: Niva Bupa Health Insurance | TPA: Medi Assist TPA
Policy: NB-2024-HAP-77654 | Sum Insured: 10,00,000
TOTAL ESTIMATED COST: 1,60,000 | Amount Claimed: 1,45,000`,
  patient: { patientName: 'Aravind Nair', age: 15, gender: 'Male' },
  insurance: {
    policyNumber: 'NB-2024-HAP-77654',
    insurerName: 'Niva Bupa Health Insurance',
    tpaName: 'Medi Assist TPA',
    sumInsured: 1000000
  },
  cost: { totalEstimatedCost: 160000, wardType: 'ICU' as const },
  simulatedDenialReason: "Pre-Existing Disease (PED) exclusion — thrombocytopenia deemed pre-existing. Policy waiting period clause 3.2 applies. Disallowed: INR 1,45,000.",
  expectedAnswer: { expectedCode: 'A97.0', expectedCost: 160000, expectedEligibility: 'approved' },
  isSurgical: true
};

interface StageResult {
  stage: number;
  name: string;
  module: string;
  durationMs: number;
  durationSec: number;
  status: 'OK' | 'ERROR' | 'SKIPPED';
  breachesSla: boolean;
  summary?: string;
  error?: string;
}

async function timeStage<T>(
  num: number, name: string, mod: string, fn: () => Promise<{ val: T; summary?: string }>
): Promise<{ result: T | null; timing: StageResult }> {
  const start = Date.now();
  try {
    const { val, summary } = await fn();
    const ms = Date.now() - start;
    return { result: val, timing: { stage: num, name, module: mod, durationMs: ms, durationSec: +(ms/1000).toFixed(2), status: 'OK', breachesSla: ms > SLA_THRESHOLD_MS, summary } };
  } catch (e: any) {
    const ms = Date.now() - start;
    return { result: null, timing: { stage: num, name, module: mod, durationMs: ms, durationSec: +(ms/1000).toFixed(2), status: 'ERROR', breachesSla: ms > SLA_THRESHOLD_MS, error: e?.message } };
  }
}

async function runSingleCasePipeline() {
  const tc = CASE_009;
  const timings: StageResult[] = [];

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  TPA Pipeline Latency Report — CASE-009 (Dengue DSS)    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Stage 1: Buffer construction (sync baseline)
  const s1start = Date.now();
  const fileBuffer: any = {
    name: 'discharge_summary.txt', type: 'text/plain', content: tc.rawDocumentText,
    arrayBuffer: async () => Buffer.from(tc.rawDocumentText, 'utf-8'),
    metadata: { patientName: tc.patient.patientName, age: tc.patient.age, gender: tc.patient.gender, policyNumber: tc.insurance.policyNumber, insurerName: tc.insurance.insurerName, tpaName: tc.insurance.tpaName, sumInsured: tc.insurance.sumInsured }
  };
  const record: any = makePreAuthRecord(tc as any);
  record.patient = { ...record.patient, ...tc.patient };
  record.insurance = { ...record.insurance, ...tc.insurance };
  const s1ms = Date.now() - s1start;
  timings.push({ stage: 1, name: 'Document Buffer Construction', module: 'n/a (sync)', durationMs: s1ms, durationSec: +(s1ms/1000).toFixed(3), status: 'OK', breachesSla: false, summary: 'Buffer ready' });

  // Stage 2: Extraction
  let evidenceReport: any = null;
  let resolvedICD10: string | undefined;
  let reviewedDenialItem: any = null;

  const { result: ext, timing: t2 } = await timeStage(2, 'Document Extraction', 'services/documentExtractionService.ts', async () => {
    const r = await extractFromDocument(fileBuffer);
    if (r?.patient?.name) record.patient.patientName = r.patient.name;
    return { val: r, summary: `patient=${r?.patient?.name||'N/A'}, insurer=${r?.insurance?.insurance_company||'N/A'}` };
  });
  timings.push(t2);

  // Stage 3: Evidence Review
  const { result: review, timing: t3 } = await timeStage(3, 'Evidence Review', 'engine/evidenceReview.ts', async () => {
    const r = await reviewEvidence(record);
    evidenceReport = r;
    return { val: r, summary: `status=${r?.status}, missing=${r?.insufficientEvidence?.length??0}` };
  });
  timings.push(t3);

  // Stage 4: ICD Coding
  const { result: coding, timing: t4 } = await timeStage(4, 'ICD Coding (lookup + AI fallback)', 'services/icdService.ts', async () => {
    let cands = lookupICD(tc.diagnosis);
    if (!cands.length) cands = await assignICDViaModel(tc.diagnosis, tc.hpi);
    const top = cands[0];
    resolvedICD10 = top?.confidence !== 'low' ? top?.code : undefined;
    if (record.clinical?.diagnoses?.[0]) record.clinical.diagnoses[0].icd10Code = resolvedICD10 || 'Pending ICD-10';
    return { val: cands, summary: `top1=${top?.code||'N/A'} conf=${top?.confidence||'N/A'}` };
  });
  timings.push(t4);

  // Stage 5: Billing + PM-JAY
  const { result: billing, timing: t5 } = await timeStage(5, 'Billing + PM-JAY Eligibility', 'engine/billingCoder.ts + services/pmjayService.ts', async () => {
    const isPmjay = isPMJAYBeneficiary(tc.insurance.insurerName);
    const b = await runBillingCodingWorkflow({ clinicalNote: `${tc.chiefComplaints} ${tc.hpi}`, insurerName: tc.insurance.insurerName, sumInsured: tc.insurance.sumInsured, wardType: 'ICU' as any, requestedAmount: tc.cost.totalEstimatedCost, resolvedICD10, expectedCost: tc.expectedAnswer.expectedCost, expectedEligibility: tc.expectedAnswer.expectedEligibility } as any);
    return { val: { b, isPmjay }, summary: `cashless=₹${b?.cashlessApproved??'N/A'} share=₹${b?.patientShare??'N/A'} pmjay=${isPmjay}` };
  });
  timings.push(t5);

  // Stage 6: Part C Generation
  const { result: partC, timing: t6 } = await timeStage(6, 'Part C Form Generation', 'engine/partCGenerator.ts', async () => {
    const pc = generatePartC(record, evidenceReport);
    return { val: pc, summary: `status=${pc?.submittabilityStatus} gaps=${pc?.gaps?.length??0} icd=${pc?.icd?.code}` };
  });
  timings.push(t6);

  // Stage 7: Denial Review
  const synEOB: DenialItem = {
    id: `DEN-${tc.id}`, patientName: tc.patient.patientName, policyNumber: tc.insurance.policyNumber,
    tpaName: tc.insurance.tpaName, insurerName: tc.insurance.insurerName,
    claimAmount: tc.cost.totalEstimatedCost, denialDate: new Date().toISOString().split('T')[0],
    daysSinceDenial: 3, status: 'Pending Review',
    eobText: `CLAIM REJECTION\nInsurer: ${tc.insurance.insurerName}\nPatient: ${tc.patient.patientName}\nREASON: ${tc.simulatedDenialReason}\nDisallowed: INR ${tc.cost.totalEstimatedCost}`
  };
  const { result: drResult, timing: t7 } = await timeStage(7, 'Denial Review (EOB Parser)', 'engine/denialReview.ts', async () => {
    const dr = await runDenialReview(synEOB);
    reviewedDenialItem = dr;
    return { val: dr, summary: `category=${dr?.analysis?.category||'N/A'} overturnProb=${dr?.analysis?.overturnProbability??'N/A'} score=${dr?.priorityScore??'N/A'}` };
  });
  timings.push(t7);

  // Stage 8: Primary Appeal (DenialQueue path — denialAppealGenerator.ts)
  const { result: appealPrimary, timing: t8 } = await timeStage(8, 'Appeal Gen — Primary (DenialQueue)', 'engine/denialAppealGenerator.ts', async () => {
    const fb = evidenceReport || { status: 'insufficient', requiredEvidence: [{ item: tc.chiefComplaints, present: true, source: 'anchor' }], missingRequiredItems: [], recommendedDecision: 'query', generatedAt: new Date().toISOString() };
    const ap = await generateDenialAppeal(tc.simulatedDenialReason, record, fb);
    return { val: ap, summary: `addressed=${ap?.addressedCount}/${ap?.totalReasons} len=${ap?.appealText?.length??0}` };
  });
  timings.push(t8);

  // Stage 9: Secondary Appeal (DenialHub path — appealGenerator.ts)
  const { result: appealHub, timing: t9 } = await timeStage(9, 'Appeal Gen — Secondary (DenialHub)', 'engine/appealGenerator.ts', async () => {
    if (!reviewedDenialItem) {
      return { val: null, summary: 'SKIPPED' };
    }
    const justification = `${tc.chiefComplaints} ${tc.hpi}`.slice(0, 500);
    const pkg = await generateAppealPackage(reviewedDenialItem, justification, 'Dr. Hospital Physician', 'MCI/12345');
    return { val: pkg, summary: `letterLen=${pkg?.letterContent?.length??0} citations=${pkg?.irdaCitations?.length??0}` };
  });
  timings.push(t9);

  // ── Print Report ───────────────────────────────────────────────────────────
  const totalMs = timings.reduce((s, t) => s + t.durationMs, 0);
  const slow = timings.filter(t => t.breachesSla);

  console.log('┌────┬──────────────────────────────────────────────┬────────┬───────────┐');
  console.log('│  # │ Stage                                        │  Sec   │  Status   │');
  console.log('├────┼──────────────────────────────────────────────┼────────┼───────────┤');
  for (const t of timings) {
    const n = String(t.stage).padStart(2);
    const name = t.name.padEnd(44).slice(0, 44);
    const sec = t.durationSec.toFixed(2).padStart(6);
    const icon = t.status === 'OK' ? (t.breachesSla ? '⚠️  SLOW' : '✅ OK   ') : (t.status === 'ERROR' ? '❌ ERROR' : '⏭️  SKIP');
    console.log(`│ ${n} │ ${name} │ ${sec} │ ${icon}  │`);
    if (t.summary) console.log(`│    │  ↳ ${t.summary.slice(0,64).padEnd(64)} │`);
    if (t.error)   console.log(`│    │  ↳ ERR: ${t.error.slice(0,59).padEnd(59)} │`);
  }
  console.log('├────┴──────────────────────────────────────────────┴────────┴───────────┤');
  console.log(`│  TOTAL: ${(totalMs/1000).toFixed(2)}s${slow.length ? `   ⚠️  ${slow.length} stage(s) exceeded 10s SLA` : '   ✅ All stages under 10s SLA'}${' '.repeat(10)}│`);
  console.log('└────────────────────────────────────────────────────────────────────────┘');

  const outFile = path.join(LOGS_DIR, `pipeline_timing_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), caseId: tc.id, totalPipelineSec: +(totalMs/1000).toFixed(2), slaThresholdSec: SLA_THRESHOLD_MS/1000, slowStagesCount: slow.length, stages: timings }, null, 2));
  console.log(`\n📊 Timing JSON → ${outFile}`);
}

runSingleCasePipeline().catch(err => { console.error('Fatal:', err); process.exit(1); });
