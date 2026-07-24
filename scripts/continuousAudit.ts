import { reviewEvidence } from '../engine/evidenceReview';
import { groundedCases, GroundedTestCase } from './groundedBattery';
import { generateBatchWithGemini } from './dynamicCaseGenerator';
import { makePreAuthRecord } from './testBattery';
import { checkCaseWithGemini } from './geminiChecker';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// Metrics to track in run_meta.json
interface RunMetrics {
  startTime: string;
  totalEvaluated: number;
  totalPassed: number;
  totalFailed: number;
  factualIssuesCount: number;
  codeIssuesCount: number;
  authorityIssuesCount: number;
  missedGapsCount: number;
  // Data source counters (Task 3)
  liveGeminiCalls: number;
  cachedGroundedCases: number;
  demoFallbackCases: number;
}

// Utility: Shuffle array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Utility: Sleep for exponential backoff or rate limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function continuousAudit() {
  // ── Runtime controls via env vars (Task 5) ──────────────────────────────
  const BATCH_LIMIT = parseInt(process.env.AUDIT_BATCH || '0', 10); // 0 = unlimited
  const DURATION_MINS = parseInt(process.env.AUDIT_DURATION_MINS || '0', 10);
  const DURATION_HOURS = parseInt(process.env.AUDIT_DURATION_HOURS || '0', 10);

  const DURATION_MS = DURATION_MINS > 0
    ? DURATION_MINS * 60 * 1000
    : DURATION_HOURS > 0
      ? DURATION_HOURS * 60 * 60 * 1000
      : 8 * 60 * 60 * 1000; // default: 8 hours

  const shortMode = BATCH_LIMIT > 0 || DURATION_MINS > 0;
  console.log(`🚀 Starting Continuous Testing + Gemini Audit Loop`);
  console.log(`   Mode:     ${shortMode ? `SHORT (${BATCH_LIMIT > 0 ? `max ${BATCH_LIMIT} cases` : 'unlimited cases'}, ${Math.round(DURATION_MS / 60000)} min)` : '8-HOUR FULL RUN'}`);

  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const rawLogPath = path.join(LOGS_DIR, 'audit_raw.jsonl');
  const findingsPath = path.join(LOGS_DIR, 'audit_findings.md');
  const summaryPath = path.join(LOGS_DIR, 'audit_summary.md');
  const metaPath = path.join(LOGS_DIR, 'run_meta.json');

  const apiKey = process.env.GEMINI_API_KEY;
  const skipGemini = !apiKey;

  if (skipGemini) {
    console.warn('⚠️ GEMINI_API_KEY is not set. The loop will run the engine but SKIP Gemini evaluation.');
  } else {
    console.log('✅ GEMINI_API_KEY detected. Independent audit enabled.');
  }

  const endTime = Date.now() + DURATION_MS;
  let iterationCounter = 1;
  let totalCasesRun = 0; // for BATCH_LIMIT enforcement

  let metrics: RunMetrics = {
    startTime: new Date().toISOString(),
    totalEvaluated: 0,
    totalPassed: 0,
    totalFailed: 0,
    factualIssuesCount: 0,
    codeIssuesCount: 0,
    authorityIssuesCount: 0,
    missedGapsCount: 0,
    liveGeminiCalls: 0,
    cachedGroundedCases: 0,
    demoFallbackCases: 0
  };

  // Initialize markdown logs
  fs.writeFileSync(findingsPath, '# Continuous Audit Findings\\n\\n', 'utf-8');

  while (Date.now() < endTime) {
    console.log(`\\n--- Starting Iteration Set ${iterationCounter} ---`);

    let currentBatch: GroundedTestCase[];
    if (iterationCounter === 1 || skipGemini) {
      console.log('Using static grounded cases for this iteration.');
      currentBatch = [...groundedCases];
      metrics.cachedGroundedCases += groundedCases.length;
    } else {
      console.log('Synthesizing a dynamic batch of 20 authentic cases using Gemini...');
      let newCases = null;
      try {
        newCases = await generateBatchWithGemini(20);
      } catch (err) {
        console.error('Error generating dynamic cases:', err);
      }

      if (newCases && newCases.length > 0) {
        console.log(`✅ Synthesized ${newCases.length} new dynamic cases.`);
        currentBatch = newCases;
      } else {
        console.warn('⚠️ Dynamic generation failed or returned null. Falling back to static grounded cases.');
        currentBatch = [...groundedCases];
        metrics.demoFallbackCases += groundedCases.length;
      }
    }

    const shuffledCases = shuffleArray(currentBatch);

    for (const tc of shuffledCases) {
      if (Date.now() >= endTime) {
        console.log('⏱️ Time limit reached. Stopping continuous audit.');
        break;
      }
      if (BATCH_LIMIT > 0 && totalCasesRun >= BATCH_LIMIT) {
        console.log(`🛑 Batch limit of ${BATCH_LIMIT} cases reached. Stopping.`);
        break;
      }
      totalCasesRun++;

      console.log(`Running Case ${tc.id} (${tc.diagnosis})...`);
      const record = makePreAuthRecord(tc);

      let engineOutput;
      try {
        engineOutput = await reviewEvidence(record);
      } catch (err) {
        console.error(`Error running engine for Case ${tc.id}:`, err);
        continue;
      }

      let verdict = null;
      if (!skipGemini) {
        let retries = 0;
        let success = false;

        while (!success && retries < 3) {
          try {
            verdict = await checkCaseWithGemini(tc, engineOutput, iterationCounter);
            success = true;
          } catch (err: any) {
            if (err.status === 429) {
              console.log(`Rate limited (429). Sleeping for 15s before retry...`);
              await sleep(15000);
              retries++;
            } else {
              console.error(`Failed Gemini check for Case ${tc.id}:`, err);
              break;
            }
          }
        }
      }

      // Log raw outputs
      fs.appendFileSync(
        rawLogPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          iteration: iterationCounter,
          caseId: tc.id,
          engineOutput,
          verdict
        }) + '\n'
      );

      // Log findings if Gemini gave a verdict
      if (verdict) {
        metrics.totalEvaluated++;
        metrics.liveGeminiCalls++;
        if (verdict.overallPass) {
          metrics.totalPassed++;
        } else {
          metrics.totalFailed++;
          metrics.factualIssuesCount += verdict.factualIssues.length;
          metrics.codeIssuesCount += verdict.codeIssues.length;
          metrics.authorityIssuesCount += verdict.authorityIssues.length;
          metrics.missedGapsCount += verdict.missedGaps.length;

          // Append to Markdown
          const mdContent = `
### Case ${tc.id} | Iteration ${iterationCounter}
**Status:** ❌ Failed
- **Factual Issues:** ${verdict.factualIssues.length > 0 ? verdict.factualIssues.join('; ') : 'None'}
- **Code Issues:** ${verdict.codeIssues.length > 0 ? verdict.codeIssues.join('; ') : 'None'}
- **Authority Issues:** ${verdict.authorityIssues.length > 0 ? verdict.authorityIssues.join('; ') : 'None'}
- **Missed Gaps:** ${verdict.missedGaps.length > 0 ? verdict.missedGaps.join('; ') : 'None'}
`;
          fs.appendFileSync(findingsPath, mdContent);
        }

        // Rewrite summary metrics
        fs.writeFileSync(metaPath, JSON.stringify(metrics, null, 2), 'utf-8');

        // Build audit_summary.md with Data Source block at the top
        const totalSeen = metrics.liveGeminiCalls + metrics.cachedGroundedCases + metrics.demoFallbackCases;
        const liveP = totalSeen > 0 ? ((metrics.liveGeminiCalls / totalSeen) * 100).toFixed(1) : '0.0';
        const cacheP = totalSeen > 0 ? ((metrics.cachedGroundedCases / totalSeen) * 100).toFixed(1) : '0.0';
        const demoP = totalSeen > 0 ? ((metrics.demoFallbackCases / totalSeen) * 100).toFixed(1) : '0.0';

        fs.writeFileSync(summaryPath, `
# Audit Summary

## ⚠️ Data Source — MUST READ BEFORE INTERPRETING RESULTS
> A run with 0% live calls cannot be trusted as a true reflection of current model behavior.

| Source | Cases | % |
|---|---|---|
| 🟢 Live Gemini judge calls | ${metrics.liveGeminiCalls} | ${liveP}% |
| 🟡 Static grounded cases (no judge) | ${metrics.cachedGroundedCases} | ${cacheP}% |
| 🔵 Demo fallback (generation failed) | ${metrics.demoFallbackCases} | ${demoP}% |
| **Total processed** | **${totalSeen}** | **100%** |

## Run Statistics
- **Start Time:** ${metrics.startTime}
- **Total Cases Evaluated (with Gemini verdict):** ${metrics.totalEvaluated}
- **Total Passed:** ${metrics.totalPassed}
- **Total Failed:** ${metrics.totalFailed}
- **Pass Rate:** ${((metrics.totalPassed / Math.max(1, metrics.totalEvaluated)) * 100).toFixed(2)}%

### Issue Breakdown
- **Factual Issues:** ${metrics.factualIssuesCount}
- **Code Issues:** ${metrics.codeIssuesCount}
- **Authority Issues:** ${metrics.authorityIssuesCount}
- **Missed Gaps:** ${metrics.missedGapsCount}
        `.trim(), 'utf-8');
      }

      // Sleep briefly between cases to avoid hitting rate limits instantly
      await sleep(2000);
    }

    iterationCounter++;
  }

  console.log('✅ Continuous Audit Loop completed.');
}

continuousAudit().catch(err => {
  console.error('Fatal error in continuous audit:', err);
});
