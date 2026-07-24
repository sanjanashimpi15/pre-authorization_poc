import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyze() {
  const logPath = path.join(__dirname, '../logs/audit_raw.jsonl');
  const fileStream = fs.createReadStream(logPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let totalCases = 0;
  let casesWithRealGap = 0;
  let realGapMissed = 0;

  const conditionStats: Record<string, { total: number; missed: number }> = {};
  const gapTypeStats: Record<string, { total: number; missed: number }> = {};

  let controlCases = 0;
  let falsePositives = 0;

  let hallucinatedCases = 0;
  let codeErrorCases = 0;

  let totalQueries = 0;
  let specificQueries = 0;

  const caseOutputs: Record<string, string[]> = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.input.notes === 'Sanity check case') continue; // Skip planted error checks
      
      totalCases++;
      const input = data.input;
      const verdict = data.verdict;
      const output = data.output;

      const condition = input.diagnosis || 'Unknown';
      const realGap = input.realGap || 'None';

      // 1. Catch Rate
      if (realGap !== 'None') {
        casesWithRealGap++;
        if (!conditionStats[condition]) conditionStats[condition] = { total: 0, missed: 0 };
        conditionStats[condition].total++;

        // Categorize gap type loosely
        let gapType = 'Other';
        const rgLower = realGap.toLowerCase();
        if (rgLower.includes('duration') || rgLower.includes('lmp') || rgLower.includes('edd')) gapType = 'Missing Duration/Dates (PED/Waiting)';
        else if (rgLower.includes('conservative') || rgLower.includes('medical necessity') || rgLower.includes('opd')) gapType = 'Medical Necessity / Conservative Tx';
        else if (rgLower.includes('report') || rgLower.includes('serology') || rgLower.includes('widal') || rgLower.includes('culture') || rgLower.includes('ns1')) gapType = 'Missing Investigations';

        if (!gapTypeStats[gapType]) gapTypeStats[gapType] = { total: 0, missed: 0 };
        gapTypeStats[gapType].total++;

        // Did the engine miss it?
        const isMissed = verdict.missedGaps && verdict.missedGaps.length > 0;
        if (isMissed) {
          realGapMissed++;
          conditionStats[condition].missed++;
          gapTypeStats[gapType].missed++;
        }
      } else {
        // 2. False Positives (Control Cases)
        controlCases++;
        if (output.gaps && output.gaps.length > 0) {
          falsePositives++;
        }
      }

      // 3. Hallucination Rate
      if ((verdict.factualIssues && verdict.factualIssues.length > 0) || 
          (verdict.authorityIssues && verdict.authorityIssues.length > 0)) {
        hallucinatedCases++;
      }

      // 4. Code Standard
      if (verdict.codeIssues && verdict.codeIssues.length > 0) {
        codeErrorCases++;
      }

      // 5. Query Specificity
      if (verdict.queryQuality && Array.isArray(verdict.queryQuality)) {
        for (const q of verdict.queryQuality) {
          totalQueries++;
          if (q.rating && q.rating.toLowerCase() === 'specific') {
            specificQueries++;
          }
        }
      }

      // 6. Consistency
      if (!caseOutputs[input.id]) caseOutputs[input.id] = [];
      caseOutputs[input.id].push(JSON.stringify(output.gaps || []));

    } catch (e) {}
  }

  // Calculate Consistency
  let inconsistentCases = 0;
  let casesWithMultipleRuns = 0;
  for (const id in caseOutputs) {
    if (caseOutputs[id].length > 1) {
      casesWithMultipleRuns++;
      const first = caseOutputs[id][0];
      const isConsistent = caseOutputs[id].every(x => x === first);
      if (!isConsistent) inconsistentCases++;
    }
  }

  const results = {
    totalCases,
    catchRate: {
      totalGaps: casesWithRealGap,
      caught: casesWithRealGap - realGapMissed,
      percentCaught: ((casesWithRealGap - realGapMissed) / casesWithRealGap * 100).toFixed(2) + '%'
    },
    gapTypeStats,
    conditionStats,
    falsePositiveRate: {
      totalControls: controlCases,
      falsePositives,
      percentFP: (falsePositives / controlCases * 100).toFixed(2) + '%'
    },
    hallucinationRate: {
      hallucinatedCases,
      percent: (hallucinatedCases / totalCases * 100).toFixed(2) + '%'
    },
    codeErrorRate: {
      codeErrorCases,
      percent: (codeErrorCases / totalCases * 100).toFixed(2) + '%'
    },
    querySpecificity: {
      totalQueries,
      specificQueries,
      percentSpecific: totalQueries > 0 ? (specificQueries / totalQueries * 100).toFixed(2) + '%' : '0%'
    },
    consistency: {
      casesWithMultipleRuns,
      inconsistentCases,
      percentConsistent: casesWithMultipleRuns > 0 ? ((casesWithMultipleRuns - inconsistentCases) / casesWithMultipleRuns * 100).toFixed(2) + '%' : 'N/A'
    }
  };

  console.log(JSON.stringify(results, null, 2));
}

analyze().catch(console.error);
