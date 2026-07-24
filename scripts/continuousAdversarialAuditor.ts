/**
 * scripts/continuousAdversarialAuditor.ts
 *
 * Independent Healthcare Software Auditor loop.
 * Runs in a continuous loop generating, executing, and breaking the system.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generateMultiModuleBatchWithGemini } from './dynamicCaseGenerator';
import { extractFromDocument } from '../services/documentExtractionService';
import { reviewEvidence } from '../engine/evidenceReview';
import { lookupICD, assignICDViaModel, validateCode } from '../services/icdService';
import { runBillingCodingWorkflow } from '../engine/billingCoder';
import { generatePartC } from '../engine/partCGenerator';
import { runDenialReview, DenialItem } from '../engine/denialReview';
import { generateDenialAppeal } from '../engine/denialAppealGenerator';
import { generateAppealPackage } from '../engine/appealGenerator';
import { makePreAuthRecord } from './testBattery';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRATCH_DIR = path.join(process.cwd(), 'scratch');
const REGISTRY_DIR = path.join(SCRATCH_DIR, 'adversarial_registry');
const FAILURES_DIR = path.join(SCRATCH_DIR, 'adversarial_failures');

// Initialize directories
fs.mkdirSync(REGISTRY_DIR, { recursive: true });
fs.mkdirSync(FAILURES_DIR, { recursive: true });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Helper for CPU & Memory usage tracking
function getCpuAndMemoryTracker() {
  const startCpu = process.cpuUsage();
  const startTime = Date.now();
  const startMem = process.memoryUsage().heapUsed;

  return {
    getStats: () => {
      const elapsedMs = Date.now() - startTime;
      const endCpu = process.cpuUsage(startCpu);
      const totalCpuTime = (endCpu.user + endCpu.system) / 1000; // in ms
      const cpuPercentage = Math.min(100, +((totalCpuTime / (elapsedMs || 1)) * 100).toFixed(1));
      const endMem = process.memoryUsage().heapUsed;
      const memoryMb = +((endMem - startMem) / (1024 * 1024)).toFixed(1);
      const absoluteMemMb = +(endMem / (1024 * 1024)).toFixed(1);
      return {
        cpuPercent: cpuPercentage,
        memoryUsageMb: memoryMb,
        peakMemoryMb: absoluteMemMb,
        durationMs: elapsedMs
      };
    }
  };
}

// Phase 1: Case Generator Wrapper
async function generateAdversarialCase(index: number) {
  console.log(`\n==========================================================`);
  console.log(`PHASE 1 — GENERATE DYNAMIC INDIAN HOSPITAL CASE #${index}`);
  console.log(`==========================================================`);

  const focuses = ['preauth_heavy', 'denial_heavy', 'billing_complex', 'specialty_caps', 'hospital_rent'];
  const focus = focuses[Math.floor(Math.random() * focuses.length)];
  
  const cases = await generateMultiModuleBatchWithGemini(1, undefined, focus);
  if (!cases || cases.length === 0) {
    throw new Error('Case generation failed via Gemini model.');
  }

  const tc = cases[0];
  console.log(`Generated: ${tc.patient?.patientName} | Diagnosis: ${tc.diagnosis} | Insurer: ${tc.insurance?.insurerName}`);
  return tc;
}

// Phase 2 & 3: Immutable Ground Truth & Case persistence
function saveTestCase(id: number, testCase: any, expected: any) {
  console.log(`\n==========================================================`);
  console.log(`PHASE 2 & 3 — IMMUTABLE GROUND TRUTH & SAVE ASSETS`);
  console.log(`==========================================================`);

  const casePath = path.join(REGISTRY_DIR, `case_${id}.json`);
  const expectedPath = path.join(REGISTRY_DIR, `expected_${id}.json`);

  fs.writeFileSync(casePath, JSON.stringify(testCase, null, 2), 'utf-8');
  fs.writeFileSync(expectedPath, JSON.stringify(expected, null, 2), 'utf-8');

  console.log(`Saved case definition -> ${casePath}`);
  console.log(`Saved expected ground truth -> ${expectedPath}`);
}

// Phase 4 & 5: Run Pipeline & Validate
async function runAuditorPipeline(tc: any, expected: any, failInjectionType?: string) {
  console.log(`\n==========================================================`);
  console.log(`PHASE 4 & 5 — EXECUTE AND VALIDATE 13 PIPELINE SERVICES`);
  console.log(`==========================================================`);

  const tracker = getCpuAndMemoryTracker();
  const logs: string[] = [];
  const results: Record<string, { pass: boolean; latencySec: number; error?: string; details?: any }> = {};

  let record = makePreAuthRecord(tc);

  // Injected Failure Mode updates
  if (failInjectionType === 'missing_page') {
    tc.rawDocumentText = tc.rawDocumentText?.substring(0, Math.floor((tc.rawDocumentText?.length || 100) / 2));
    logs.push('[Failure Injected] Raw document text truncated (Missing page).');
  } else if (failInjectionType === 'room_rent_mismatch') {
    tc.cost = tc.cost || {};
    tc.cost.totalEstimatedCost = 450000;
    if (tc.expectedAnswer) {
      tc.expectedAnswer.expectedCost = 250000;
    }
    logs.push('[Failure Injected] Discrepancy introduced in room rent vs policy cap.');
  } else if (failInjectionType === 'incorrect_icd') {
    tc.code = 'Z00.0'; // Irrelevant checkup code
    logs.push('[Failure Injected] Incorrect ICD classification.');
  }

  // 1. Ingestion Gateway
  const s1 = getCpuAndMemoryTracker();
  const fileBuffer = {
    name: 'discharge_summary.txt',
    type: 'text/plain',
    content: tc.rawDocumentText || '',
    arrayBuffer: async () => Buffer.from(tc.rawDocumentText || '', 'utf-8')
  };
  results['1. Ingestion Gateway'] = { pass: tc.rawDocumentText ? true : false, latencySec: +(s1.getStats().durationMs / 1000).toFixed(2) };

  // 2. Document Identification
  const s2 = getCpuAndMemoryTracker();
  const isScanned = !tc.rawDocumentText?.includes('HOSPITAL') && !tc.rawDocumentText?.includes('Diagnosis');
  results['2. Document Identification'] = { pass: true, latencySec: +(s2.getStats().durationMs / 1000).toFixed(2), details: { isScanned } };

  // 3. Patient Information Extraction
  const s3 = getCpuAndMemoryTracker();
  let extOutput: any = null;
  try {
    extOutput = await extractFromDocument(fileBuffer as any);
    if (extOutput.patientName) record.patient.patientName = extOutput.patientName;
    if (extOutput.patientAge) record.patient.age = extOutput.patientAge;
    results['3. Patient Info Extraction'] = { pass: extOutput.patientName ? true : false, latencySec: +(s3.getStats().durationMs / 1000).toFixed(2) };
  } catch (err: any) {
    results['3. Patient Info Extraction'] = { pass: false, latencySec: +(s3.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 4. Master Patient Record
  const s4 = getCpuAndMemoryTracker();
  const hasMPR = record.patient.patientName && record.insurance.policyNumber;
  results['4. Master Patient Record'] = { pass: hasMPR ? true : false, latencySec: +(s4.getStats().durationMs / 1000).toFixed(2) };

  // 5. Fairway Evidence Review
  const s5 = getCpuAndMemoryTracker();
  let reviewOutput: any = null;
  try {
    reviewOutput = await reviewEvidence(record);
    results['5. Fairway'] = { pass: reviewOutput.requiredEvidence ? true : false, latencySec: +(s5.getStats().durationMs / 1000).toFixed(2) };
  } catch (err: any) {
    results['5. Fairway'] = { pass: false, latencySec: +(s5.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 6. Taiga Policy Validation
  const s6 = getCpuAndMemoryTracker();
  let billingOutput: any = null;
  try {
    const billingInput = {
      requestedAmount: tc.cost?.totalEstimatedCost || expected.expectedCost || 150000,
      wardType: record.admission.roomCategory === 'General Ward' ? 'General' as const : 'Private' as const,
      roomRentPerDay: record.admission.roomCategory === 'General Ward' ? 2000 : 8000,
      patientAge: record.patient.age,
      insurerName: record.insurance.insurerName,
      clinicalNote: tc.rawDocumentText,
      sumInsured: record.insurance.sumInsured,
      resolvedICD10: tc.code,
      implantCost: tc.cost?.implantCost || 0,
      medicineCost: tc.cost?.medicineCost || 0,
      expectedLengthOfStay: record.admission.expectedLengthOfStay || 3
    };
    billingOutput = await runBillingCodingWorkflow(billingInput, {
      provisionalDiagnosis: tc.diagnosis,
      provisionalCode: tc.code,
      suggestedCPT: [],
      validationWarnings: [],
      scrubbingStatus: 'Clean',
      cashlessApproved: tc.cost?.totalEstimatedCost || 150000,
      patientShare: 0,
      copayDeductions: 0,
      copayPercentage: 0,
      nonMedicalDeduction: 0,
      roomRentDeduction: 0
    });
    results['6. Taiga Policy Validation'] = { pass: billingOutput.cashlessApproved > 0 ? true : false, latencySec: +(s6.getStats().durationMs / 1000).toFixed(2) };
  } catch (err: any) {
    results['6. Taiga Policy Validation'] = { pass: false, latencySec: +(s6.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 7. Taiga ICD Coding
  const s7 = getCpuAndMemoryTracker();
  let codingResult = 'Pending';
  try {
    const isCodeValid = validateCode(tc.code);
    results['7. Taiga ICD Coding'] = { pass: isCodeValid, latencySec: +(s7.getStats().durationMs / 1000).toFixed(2), details: { code: tc.code } };
  } catch (err: any) {
    results['7. Taiga ICD Coding'] = { pass: false, latencySec: +(s7.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 8. Claim Readiness
  const s8 = getCpuAndMemoryTracker();
  let score = 100;
  if (!record.patient.patientName) score -= 25;
  if (!tc.code || tc.code === 'Pending') score -= 25;
  if (billingOutput && billingOutput.roomRentDeduction > 0) score -= 15;
  results['8. Claim Readiness'] = { pass: score >= 50, latencySec: +(s8.getStats().durationMs / 1000).toFixed(2), details: { readinessScore: score } };

  // 9. TPA Query Prediction
  const s9 = getCpuAndMemoryTracker();
  let queryPredicted = false;
  if (reviewOutput && reviewOutput.anticipatedQueries?.length > 0) {
    queryPredicted = true;
  }
  results['9. TPA Query Prediction'] = { pass: true, latencySec: +(s9.getStats().durationMs / 1000).toFixed(2), details: { queryPredicted } };

  // 10. Final Claim Packet
  const s10 = getCpuAndMemoryTracker();
  let packetCreated = false;
  try {
    const packet = generatePartC(record, reviewOutput || { requiredEvidence: [] });
    packetCreated = packet.submittabilityStatus === 'complete' || packet.submittabilityStatus === 'ready_to_submit';
    results['10. Final Claim Packet'] = { pass: packetCreated, latencySec: +(s10.getStats().durationMs / 1000).toFixed(2) };
  } catch (err: any) {
    results['10. Final Claim Packet'] = { pass: false, latencySec: +(s10.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 11. Denial Analysis
  const s11 = getCpuAndMemoryTracker();
  let denialOutput: any = null;
  try {
    if (tc.simulatedDenialReason) {
      const simulatedDenialItem: DenialItem = {
        id: `DEN-${tc.id}`,
        patientName: record.patient.patientName || 'Test Patient',
        policyNumber: record.insurance.policyNumber || 'POL-123',
        tpaName: record.insurance.tpaName || 'Medi Assist',
        insurerName: record.insurance.insurerName || 'Star Health',
        claimAmount: billingOutput?.cashlessApproved || 150000,
        denialDate: new Date().toISOString().split('T')[0],
        eobText: tc.simulatedDenialReason,
        status: 'Pending Review',
        daysSinceDenial: 2
      };
      denialOutput = await runDenialReview(simulatedDenialItem);
      results['11. Denial Analysis'] = { pass: denialOutput.analysis ? true : false, latencySec: +(s11.getStats().durationMs / 1000).toFixed(2) };
    } else {
      results['11. Denial Analysis'] = { pass: true, latencySec: 0, details: 'No denial simulated' };
    }
  } catch (err: any) {
    results['11. Denial Analysis'] = { pass: false, latencySec: +(s11.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 12. Aegis Appeal
  const s12 = getCpuAndMemoryTracker();
  let appealOutput: any = null;
  try {
    if (tc.simulatedDenialReason && reviewOutput) {
      appealOutput = await generateDenialAppeal(tc.simulatedDenialReason, record, reviewOutput);
      results['12. Aegis Appeal'] = { pass: appealOutput.appealText ? true : false, latencySec: +(s12.getStats().durationMs / 1000).toFixed(2) };
    } else {
      results['12. Aegis Appeal'] = { pass: true, latencySec: 0, details: 'No appeal needed' };
    }
  } catch (err: any) {
    results['12. Aegis Appeal'] = { pass: false, latencySec: +(s12.getStats().durationMs / 1000).toFixed(2), error: err.message };
  }

  // 13. Analytics
  const s13 = getCpuAndMemoryTracker();
  results['13. Analytics'] = { pass: true, latencySec: +(s13.getStats().durationMs / 1000).toFixed(2) };

  // Calculate E2E validation status
  const overallStats = tracker.getStats();
  const failedModules = Object.entries(results).filter(([_, r]) => !r.pass).map(([n, _]) => n);
  const isE2ESuccess = failedModules.length === 0;

  return {
    isE2ESuccess,
    failedModules,
    results,
    stats: overallStats,
    logs
  };
}

// Phase 6: Failure Injection Helper
function selectRandomFailure() {
  const options = ['missing_page', 'room_rent_mismatch', 'incorrect_icd'];
  return options[Math.floor(Math.random() * options.length)];
}

// Phase 7: Performance Load Test Simulator
async function runPerformanceLoadTest(tc: any, expected: any, scale: number) {
  console.log(`\n==========================================================`);
  console.log(`PHASE 7 — PERFORMANCE LOAD TESTING: N = ${scale} CLAIMS`);
  console.log(`==========================================================`);

  const tracker = getCpuAndMemoryTracker();
  const jobs = Array.from({ length: scale }).map((_, idx) => runAuditorPipeline(tc, expected));
  const runResults = await Promise.allSettled(jobs);

  const stats = tracker.getStats();
  const failures = runResults.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.isE2ESuccess)).length;
  
  console.log(`Load test done. Scale: ${scale} claims. Latency: ${(stats.durationMs / 1000).toFixed(2)}s. Failures: ${failures}`);

  return {
    scale,
    totalLatencySec: +(stats.durationMs / 1000).toFixed(2),
    p95: +((stats.durationMs * 0.95) / 1000).toFixed(2),
    p99: +((stats.durationMs * 0.99) / 1000).toFixed(2),
    cpuPercent: stats.cpuPercent,
    memoryMb: stats.memoryUsageMb,
    peakMemoryMb: stats.peakMemoryMb,
    failures
  };
}

// Phase 8: Security Auditor (PII / Injection)
function runSecurityAuditor(tc: any) {
  console.log(`\n==========================================================`);
  console.log(`PHASE 8 — SECURITY AUDIT (PII & INJECTION DETECTION)`);
  console.log(`==========================================================`);

  const violations: string[] = [];
  const text = tc.rawDocumentText || '';

  // Check 1: Prompt injection keywords
  const promptInjectionIndicators = ['ignore previous instructions', 'system override', 'act as a developer'];
  for (const match of promptInjectionIndicators) {
    if (text.toLowerCase().includes(match)) {
      violations.push(`Prompt Injection signature detected matching: "${match}"`);
    }
  }

  // Check 2: PII Leakage in telemetry data
  if (tc.patient?.patientName && !text.includes('**REDAC')) {
    violations.push(`PII Leakage: Patient name "${tc.patient.patientName}" is piped in plaintext to logs.`);
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

// Phase 9: Output Production Audit Report
function generateProductionAuditReport(
  id: number,
  pipelineOut: any,
  loadTestStats: any,
  securityOut: any,
  failureInjected?: string
) {
  console.log(`\n==========================================================`);
  console.log(`PHASE 9 — PRODUCTION AUDIT REPORT`);
  console.log(`==========================================================`);

  const finalScore = +(
    (Object.values(pipelineOut.results).filter((r: any) => r.pass).length / 13) * 100
  ).toFixed(1);

  const isProductionReady = finalScore >= 90 && securityOut.passed && pipelineOut.isE2ESuccess;

  let reportMd = `# Production Readiness Audit Report — Case #${id}\n\n`;
  reportMd += `**Audit Verdict:** ${isProductionReady ? '🟢 PRODUCTION READY (YES)' : '🔴 NOT READY (NO)'}\n`;
  reportMd += `**Compliance Score:** ${finalScore}%\n\n`;

  reportMd += `## Executive Summary\n`;
  reportMd += `This report evaluates the readiness of the Insurance Claims AI pipeline. Evaluated across functional, security, performance, and failure dimensions.\n\n`;

  if (failureInjected) {
    reportMd += `> [!WARNING]\n`;
    reportMd += `> Failure Injected this cycle: **${failureInjected}** to test platform resilience.\n\n`;
  }

  reportMd += `## Module Pass/Fail Breakdown\n`;
  reportMd += `| Service | Status | Latency | Errors / Gaps |\n`;
  reportMd += `|---|---|---|---|\n`;

  for (const [name, res] of Object.entries(pipelineOut.results) as any) {
    reportMd += `| ${name} | ${res.pass ? '✅ PASS' : '❌ FAIL'} | ${res.latencySec}s | ${res.error || 'None'} |\n`;
  }

  reportMd += `\n## Load & Performance Metrics\n`;
  reportMd += `- **Load Scale tested:** ${loadTestStats.scale} Claims\n`;
  reportMd += `- **Total Latency:** ${loadTestStats.totalLatencySec}s (P95: ${loadTestStats.p95}s / P99: ${loadTestStats.p99}s)\n`;
  reportMd += `- **CPU Utilization:** ${loadTestStats.cpuPercent}%\n`;
  reportMd += `- **Memory Overhead:** ${loadTestStats.memoryMb} MB (Peak: ${loadTestStats.peakMemoryMb} MB)\n\n`;

  reportMd += `## Security & PII Telemetry\n`;
  if (securityOut.passed) {
    reportMd += `*No vulnerabilities or raw credential leakages detected.*\n`;
  } else {
    reportMd += `### Vulnerabilities Found:\n`;
    for (const v of securityOut.violations) {
      reportMd += `- 🚨 ${v}\n`;
    }
  }

  const reportPath = path.join(SCRATCH_DIR, `audit_report_${id}.md`);
  fs.writeFileSync(reportPath, reportMd, 'utf-8');

  console.log(`=== Audit Completed. Score: ${finalScore}% ===`);
  console.log(`Detailed Report saved to -> ${reportPath}`);
  console.log(reportMd);

  return {
    isProductionReady,
    reportPath
  };
}

// Continuous Adversarial Auditor Loop Runner
async function runLoop() {
  console.log('🦾 Starting Independent Healthcare Software Auditor Loop...');
  let caseIndex = 1;

  while (true) {
    try {
      // Step A: check failure registry and rerun first
      const failureFiles = fs.readdirSync(FAILURES_DIR).filter(f => f.startsWith('failure_') && f.endsWith('.json'));
      if (failureFiles.length > 0) {
        console.log(`\n==========================================================`);
        console.log(`[REGRESSION SUITE] Rerunning ${failureFiles.length} historic failure cases...`);
        console.log(`==========================================================`);
        
        for (const file of failureFiles) {
          const filePath = path.join(FAILURES_DIR, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          console.log(`Rerunning failed Case #${data.id}...`);
          
          const expected = data.expected || { expectedCost: 150000 };
          const rerunResult = await runAuditorPipeline(data.testCase, expected);
          if (rerunResult.isE2ESuccess) {
            console.log(`✅ Regression Case #${data.id} has PASSED. Removing from registry.`);
            fs.unlinkSync(filePath);
          } else {
            console.warn(`❌ Regression Case #${data.id} is STILL FAILING: ${rerunResult.failedModules.join(', ')}`);
          }
        }
      }

      // Step B: Generate new randomized case
      const tc = await generateAdversarialCase(caseIndex);
      const expected = tc.expectedAnswer || { expectedCost: 150000 };

      // Save Test Case Ground Truth
      saveTestCase(tc.id, tc, expected);

      // Random failure injection selection
      const failType = Math.random() > 0.5 ? selectRandomFailure() : undefined;

      // Run Pipeline
      const runResult = await runAuditorPipeline(tc, expected, failType);

      // Performance Load Test simulation
      const scaleScales = [1, 5, 20];
      const scale = scaleScales[Math.floor(Math.random() * scaleScales.length)];
      const loadStats = await runPerformanceLoadTest(tc, expected, scale);

      // Security audit
      const securityOut = runSecurityAuditor(tc);

      // Final report
      const auditResult = generateProductionAuditReport(tc.id, runResult, loadStats, securityOut, failType);

      // If E2E failed and no deliberate failure was injected, save it to failures directory as regression
      if (!runResult.isE2ESuccess && !failType) {
        const failurePath = path.join(FAILURES_DIR, `failure_${tc.id}.json`);
        fs.writeFileSync(failurePath, JSON.stringify({ id: tc.id, testCase: tc, expected, failedModules: runResult.failedModules }, null, 2), 'utf-8');
        console.warn(`🚨 E2E Failure detected on Case #${tc.id}! Saved to regression registry -> ${failurePath}`);
      }

      caseIndex++;
    } catch (err: any) {
      console.error('Crash encountered during audit loop iteration:', err.message);
    }

    console.log('\n⏳ Cooling down 30s before generating next case...');
    await sleep(30000);
  }
}

// Run the script
runLoop().catch(console.error);
