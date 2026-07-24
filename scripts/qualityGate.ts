import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');

function getLatestSummary() {
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('run_summary_batch_') && f.endsWith('.json'))
    .map(f => ({ name: f, time: fs.statSync(path.join(LOGS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(LOGS_DIR, files[0].name), 'utf-8'));
}

async function runQualityGate() {
  console.log('🤖 Triggering CI Quality Gate Pre-Submission Check...');
  console.log('📦 Launching single batch continuous multi-module audit...');

  // BLIND_MODE: respect caller env, default to true (honest evaluation)
  process.env.SINGLE_RUN = 'true';
  process.env.BATCH_SIZE = process.env.BATCH_SIZE || '10';
  process.env.BLIND_MODE = process.env.BLIND_MODE ?? 'true';
  process.env.STRICT_GRADING = 'false'; // first pass is lenient

  const blindLabel = process.env.BLIND_MODE === 'true' ? 'BLIND (honest)' : 'DEBUG (expected answers visible)';
  console.log(`   Evaluation mode: ${blindLabel}`);

  // ── Lenient run ──────────────────────────────────────────────────────────
  try {
    execSync('npx tsx scripts/continuousMultiAudit.ts', { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Lenient audit execution failed:', err);
    process.exit(1);
  }

  const lenientSummary = getLatestSummary();
  if (!lenientSummary) {
    console.error('❌ No run summary files found after lenient run!');
    process.exit(1);
  }

  // ── Strict run (same BATCH_SIZE, STRICT_GRADING=true) ───────────────────
  console.log('\n🔬 Running strict-grading pass (STRICT_GRADING=true)...');
  process.env.STRICT_GRADING = 'true';
  try {
    execSync('npx tsx scripts/continuousMultiAudit.ts', { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Strict audit execution failed:', err);
    process.exit(1);
  }

  const strictSummary = getLatestSummary();
  if (!strictSummary) {
    console.error('❌ No run summary files found after strict run!');
    process.exit(1);
  }

  const lenientAccuracy = lenientSummary.systemKpis.e2eSuccessRate;
  const strictAccuracy  = strictSummary.systemKpis.e2eSuccessRate;
  const avgProcessingTimeSec = lenientSummary.systemKpis.avgProcessingTimeSec;
  const totalSlaBreaches = lenientSummary.systemKpis.totalSlaBreaches;
  const partCPassRate = lenientSummary.newModuleStats?.partC?.passRate ?? 0;

  // Custom thresholds
  const TARGET_STRICT_ACCURACY  = 70.0;  // honest bar — must pass with strict grading
  const TARGET_LENIENT_ACCURACY = 90.0;  // aspirational bar — lenient grading
  const TARGET_AVG_LATENCY_SEC  = 15.0;

  console.log('\n==================================================');
  console.log('📊 EVALUATING QUALITY GATE CRITERIA:');
  console.log('==================================================');

  let gateFailed = false;

  // Gate 1: Dual Accuracy
  const lenientIcon = lenientAccuracy >= TARGET_LENIENT_ACCURACY ? '✅' : '⚠️';
  const strictIcon  = strictAccuracy  >= TARGET_STRICT_ACCURACY  ? '✅' : '❌';
  console.log(`${lenientIcon} Lenient Accuracy : ${lenientAccuracy}%  (target >= ${TARGET_LENIENT_ACCURACY}% — aspirational)`);
  console.log(`${strictIcon}  Strict Accuracy  : ${strictAccuracy}%  (target >= ${TARGET_STRICT_ACCURACY}% — gate)`);
  if (strictAccuracy < TARGET_STRICT_ACCURACY) {
    console.log(`   ❌ Accuracy Gate: FAIL (Strict: ${strictAccuracy}%, Target: >= ${TARGET_STRICT_ACCURACY}%)`);
    gateFailed = true;
  } else {
    console.log(`   ✅ Accuracy Gate: PASS`);
  }

  // Gate 2: Avg Processing Time
  if (avgProcessingTimeSec <= TARGET_AVG_LATENCY_SEC) {
    console.log(`✅ Latency Gate: PASS (Avg Latency: ${avgProcessingTimeSec}s, Target: <= ${TARGET_AVG_LATENCY_SEC}s)`);
  } else {
    console.log(`❌ Latency Gate: FAIL (Avg Latency: ${avgProcessingTimeSec}s, Target: <= ${TARGET_AVG_LATENCY_SEC}s)`);
    gateFailed = true;
  }

  // Gate 3: Critical SLA breaches
  if (totalSlaBreaches === 0) {
    console.log(`✅ SLA Gate: PASS (Critical breaches: 0)`);
  } else {
    console.log(`❌ SLA Gate: FAIL (Critical breaches: ${totalSlaBreaches}, Target: 0)`);
    gateFailed = true;
  }

  // Gate 4: Extraction & Provenance (Part C)
  if (partCPassRate >= 95.0) {
    console.log(`✅ Extraction & Provenance (Part C) Gate: PASS (Pass Rate: ${partCPassRate}%, Target: >= 95%)`);
  } else {
    console.log(`❌ Extraction & Provenance (Part C) Gate: FAIL (Pass Rate: ${partCPassRate}%, Target: >= 95%)`);
    gateFailed = true;
  }

  console.log('==================================================');
  if (gateFailed) {
    console.error('🚨 QUALITY GATE FAILED. Pre-submission build checks rejected.');
    process.exit(1);
  } else {
    console.log('🎉 ALL QUALITY GATES PASSED! Build is ready for release.');
    process.exit(0);
  }
}

runQualityGate();
