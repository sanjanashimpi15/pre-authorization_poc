/**
 * generateBenchmarkReport.ts
 *
 * Standalone script — generates an Aivana benchmarking report from
 * the accumulated benchmark_metrics.json file without running the QA loop.
 *
 * Usage:
 *   npx tsx scripts/qa/generateBenchmarkReport.ts           # all cases
 *   npx tsx scripts/qa/generateBenchmarkReport.ts 50        # last 50 cases
 *   npx tsx scripts/qa/generateBenchmarkReport.ts 50 100    # cases 50–100
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateBenchmarkReport, CaseMetrics } from '../../utils/benchmarkMetrics';

const METRICS_PATH = path.join(process.cwd(), 'logs', 'benchmark_metrics.json');
const REPORT_DIR   = path.join(process.cwd(), 'logs', 'benchmark_reports');

if (!fs.existsSync(METRICS_PATH)) {
  console.error('❌ No benchmark_metrics.json found. Run the QA loop first.');
  process.exit(1);
}

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

const all: CaseMetrics[] = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8'));

const args   = process.argv.slice(2);
const start  = args[1] ? parseInt(args[1]) - 1 : 0;
const end    = args[0] ? parseInt(args[0]) : all.length;
const subset = all.slice(start, end);

if (subset.length === 0) {
  console.error(`❌ No cases in range [${start + 1}–${end}]. Total in file: ${all.length}`);
  process.exit(1);
}

const oldest = subset[0].caseId;
const newest = subset[subset.length - 1].caseId;
const period = `${oldest} → ${newest}`;
const report = generateBenchmarkReport(subset, period);

console.log(report);

// Save to file
const filename = `report_manual_${subset.length}cases_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
const reportPath = path.join(REPORT_DIR, filename);
fs.writeFileSync(reportPath, report, 'utf-8');
console.log(`\n📄 Report saved → ${reportPath}`);
