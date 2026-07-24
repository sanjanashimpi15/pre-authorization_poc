/**
 * ============================================================
 * FAILURE INTELLIGENCE DASHBOARD
 * ============================================================
 * Standalone analysis script that reads the permanent failure
 * intelligence log and produces a ranked learning digest.
 *
 * Run with:
 *   npx tsx scripts/failureIntelligenceDashboard.ts
 *   npx tsx scripts/failureIntelligenceDashboard.ts --module coding
 *   npx tsx scripts/failureIntelligenceDashboard.ts --risk critical
 *   npx tsx scripts/failureIntelligenceDashboard.ts --export
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadAllFailures,
  loadRegressionSuite,
  computeFailureDigest,
  FailureRecord,
  RegressionRisk
} from '../engine/failureIntelligence';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// ─── CLI Argument Parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterModule = args.includes('--module') ? args[args.indexOf('--module') + 1] : null;
const filterRisk = args.includes('--risk') ? args[args.indexOf('--risk') + 1] as RegressionRisk : null;
const exportReport = args.includes('--export');
const showResolved = args.includes('--resolved');

// ─── Formatting Helpers ───────────────────────────────────────────────────────

const RISK_EMOJI: Record<RegressionRisk, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢'
};

const BAR_FULL = '█';
const BAR_EMPTY = '░';

function makeBar(value: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return BAR_FULL.repeat(filled) + BAR_EMPTY.repeat(width - filled);
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function printSection(title: string): void {
  const line = '═'.repeat(80);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

async function runDashboard() {
  let failures = loadAllFailures();

  if (!showResolved) {
    failures = failures.filter(f => !f.resolved);
  }

  if (filterModule) {
    failures = failures.filter(f => f.module === filterModule);
  }

  if (filterRisk) {
    failures = failures.filter(f => f.regressionRisk === filterRisk);
  }

  const digest = computeFailureDigest(failures);
  const suite = loadRegressionSuite();

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║         🧠  FAILURE INTELLIGENCE ENGINE — LEARNING DIGEST                  ║');
  console.log('║         India TPA Insurance Copilot | Aivana Production System             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`  Generated: ${new Date().toLocaleString()}`);
  if (filterModule) console.log(`  Filter: Module = ${filterModule}`);
  if (filterRisk) console.log(`  Filter: Risk = ${filterRisk}`);
  if (!showResolved) console.log(`  Showing: Unresolved failures only (use --resolved to include all)`);

  // ── Overview ──────────────────────────────────────────────────────────────
  printSection('📊 FAILURE OVERVIEW');
  console.log(`  Total Failures Captured:    ${digest.totalFailures}`);
  console.log(`  Unresolved:                 ${digest.unresolvedFailures}`);
  console.log(`  Promoted to Regression:     ${digest.promotedToRegression}`);
  console.log(`  Regression Suite Size:      ${suite.totalEntries}`);
  console.log(`  Avg Priority Score:         ${digest.avgPriorityScore}/100`);
  console.log('');
  console.log(`  ${RISK_EMOJI.critical} CRITICAL:  ${String(digest.criticalCount).padStart(4)} failures`);
  console.log(`  ${RISK_EMOJI.high}     HIGH:  ${String(digest.highCount).padStart(4)} failures`);
  console.log(`  ${RISK_EMOJI.medium}   MEDIUM:  ${String(digest.mediumCount).padStart(4)} failures`);
  console.log(`  ${RISK_EMOJI.low}      LOW:  ${String(digest.lowCount).padStart(4)} failures`);

  // ── Root Cause Frequency ─────────────────────────────────────────────────
  printSection('🔍 TOP ROOT CAUSES (Ranked by Frequency)');
  const maxRootCount = digest.topRootCauses[0]?.count ?? 1;
  for (const rc of digest.topRootCauses) {
    const bar = makeBar(rc.count, maxRootCount);
    console.log(`  ${padEnd(rc.code, 35)} [${bar}] ${rc.count}`);
    console.log(`    └─ ${rc.description}`);
  }

  // ── Module Failure Heatmap ────────────────────────────────────────────────
  printSection('🔥 MODULE FAILURE HEATMAP');
  const maxModCount = digest.topModules[0]?.count ?? 1;
  for (const mod of digest.topModules) {
    const bar = makeBar(mod.count, maxModCount);
    console.log(`  ${padEnd(mod.module, 20)} [${bar}] ${mod.count} failures`);
  }

  // ── Diagnosis Failure Frequency ───────────────────────────────────────────
  printSection('🏥 TOP FAILING DIAGNOSES');
  const maxDiagCount = digest.topDiagnoses[0]?.count ?? 1;
  for (const diag of digest.topDiagnoses) {
    const bar = makeBar(diag.count, maxDiagCount);
    console.log(`  ${padEnd(diag.diagnosis.slice(0, 40), 42)} [${bar}] ${diag.count}`);
  }

  // ── Top Priority Failures ─────────────────────────────────────────────────
  printSection('🚨 TOP 15 PRIORITY FAILURES (Ranked by Priority Score)');
  const topFailures = [...failures]
    .filter(f => !f.resolved)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 15);

  for (let i = 0; i < topFailures.length; i++) {
    const f = topFailures[i];
    const risk = RISK_EMOJI[f.regressionRisk];
    console.log(`\n  ${String(i + 1).padStart(2)}. ${risk} [Score: ${f.priorityScore}] Case ${f.caseId} — ${f.module.toUpperCase()}`);
    console.log(`      Diagnosis:    ${f.diagnosis}`);
    console.log(`      Root Cause:   ${f.rootCause.code}`);
    console.log(`      Failure:      ${f.reasonForFailure.slice(0, 120)}${f.reasonForFailure.length > 120 ? '...' : ''}`);
    console.log(`      Fix:          ${f.recommendedFix.slice(0, 120)}${f.recommendedFix.length > 120 ? '...' : ''}`);
    console.log(`      Confidence:   ${f.confidence}% | Recurrence: ${f.caseCount}x | Batch: #${f.batchId}`);
    if (f.missingEvidence.length > 0) {
      console.log(`      Missing Evd:  ${f.missingEvidence.slice(0, 3).join(', ')}`);
    }
    if (f.hallucinatedEvidence.length > 0) {
      console.log(`      Hallucinated: ${f.hallucinatedEvidence.slice(0, 3).join(', ')}`);
    }
  }

  // ── Regression Suite Preview ───────────────────────────────────────────────
  if (suite.entries.length > 0) {
    printSection(`📋 REGRESSION SUITE (${suite.entries.length} entries — never discarded)`);
    console.log(`  Last Updated: ${suite.lastUpdated}`);
    console.log('');
    console.log(`  ${'ID'.padEnd(18)} ${'Module'.padEnd(14)} ${'Risk'.padEnd(10)} ${'Score'.padEnd(7)} ${'Diagnosis'.padEnd(35)} Resolved`);
    console.log(`  ${'-'.repeat(100)}`);
    for (const entry of suite.entries.slice(0, 20)) {
      const risk = RISK_EMOJI[entry.regressionRisk];
      const resolved = entry.resolved ? '✅' : '❌';
      console.log(
        `  ${entry.failureId.padEnd(18)} ${entry.module.padEnd(14)} ${(risk + ' ' + entry.regressionRisk).padEnd(12)} ${String(entry.priorityScore).padEnd(7)} ${entry.diagnosis.slice(0, 33).padEnd(35)} ${resolved}`
      );
    }
    if (suite.entries.length > 20) {
      console.log(`  ... and ${suite.entries.length - 20} more entries`);
    }
  }

  // ── Recommended Action Plan ───────────────────────────────────────────────
  printSection('💡 TOP RECOMMENDED FIXES (From Intelligence Engine)');
  const fixCounts: Record<string, number> = {};
  for (const f of failures) {
    if (f.recommendedFix) {
      const key = f.recommendedFix.slice(0, 100);
      fixCounts[key] = (fixCounts[key] || 0) + 1;
    }
  }
  const topFixes = Object.entries(fixCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topFixes.forEach(([fix, count], i) => {
    console.log(`\n  ${i + 1}. [${count}x] ${fix}`);
  });

  // ── Export Report ──────────────────────────────────────────────────────────
  if (exportReport) {
    const reportPath = path.join(LOGS_DIR, `failure_digest_${Date.now()}.json`);
    const reportData = {
      generatedAt: new Date().toISOString(),
      filters: { module: filterModule, risk: filterRisk, showResolved },
      digest,
      regressionSuite: suite,
      topFailures: topFailures.map(f => ({
        id: f.id,
        caseId: f.caseId,
        module: f.module,
        diagnosis: f.diagnosis,
        regressionRisk: f.regressionRisk,
        priorityScore: f.priorityScore,
        rootCause: f.rootCause,
        reasonForFailure: f.reasonForFailure,
        missingEvidence: f.missingEvidence,
        hallucinatedEvidence: f.hallucinatedEvidence,
        recommendedFix: f.recommendedFix,
        capturedAt: f.capturedAt
      })),
      topRecommendedFixes: topFixes.map(([fix, count]) => ({ fix, count }))
    };
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');
    console.log(`\n\n✅ Report exported to: ${reportPath}`);
  }

  console.log('\n');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(`  Failure log: logs/failure_intelligence.jsonl`);
  console.log(`  Regression:  logs/regression_suite.json`);
  console.log('════════════════════════════════════════════════════════════════════════════════\n');
}

runDashboard().catch(err => {
  console.error('Fatal error running Failure Intelligence Dashboard:', err);
  process.exit(1);
});
