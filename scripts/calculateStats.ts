import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyze() {
  const logPath = path.join(__dirname, '../logs/audit_raw.jsonl');
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\\n');

  let totalCases = 0;
  let hallucinatedCases = 0;
  let codeErrorCases = 0;
  let totalQueries = 0;
  let specificQueries = 0;
  let casesWithMissedGaps = 0;
  let overFlaggingNotes = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const verdict = data.verdict;
      if (!verdict) continue; // skip lines without verdict
      if (data.input?.notes === 'Sanity check case') continue;
      
      totalCases++;

      if ((verdict.factualIssues && verdict.factualIssues.length > 0) || 
          (verdict.authorityIssues && verdict.authorityIssues.length > 0)) {
        hallucinatedCases++;
      }

      if (verdict.codeIssues && verdict.codeIssues.length > 0) {
        codeErrorCases++;
      }

      if (verdict.missedGaps && verdict.missedGaps.length > 0) {
        casesWithMissedGaps++;
      }

      if (verdict.queryQuality && Array.isArray(verdict.queryQuality)) {
        for (const q of verdict.queryQuality) {
          totalQueries++;
          if (q.rating && q.rating.toLowerCase() === 'specific') {
            specificQueries++;
          }
          if (q.notes && q.notes.toLowerCase().includes('over-flag')) {
            overFlaggingNotes++;
          }
        }
      }

    } catch (e) {
      // console.error("Parse error on a line chunk.");
    }
  }

  const results = {
    totalCases,
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
    missedGaps: {
      casesWithMissedGaps,
      percent: (casesWithMissedGaps / totalCases * 100).toFixed(2) + '%'
    },
    overFlaggingNotes
  };

  console.log(JSON.stringify(results, null, 2));
}

analyze().catch(console.error);
