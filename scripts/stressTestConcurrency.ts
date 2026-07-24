/**
 * scripts/stressTestConcurrency.ts
 * Tests CONCURRENCY levels 3, 5, 8, 10 with BATCH_SIZE=15 and reports a comparison table.
 * Usage: npm run test:concurrency:stress
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.join(__dirname, '..', 'logs');
const CONCURRENCY_LEVELS = [3, 5, 8, 10];
const BATCH_SIZE = process.env.BATCH_SIZE || '15';

interface StressResult { concurrency:number; avgLatencySec:number; slaBreaches:number; accuracy:number; errorCount:number; durationSec:number; }

function getLatestSummary(): any|null {
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f=>f.startsWith('run_summary_batch_')&&f.endsWith('.json'))
    .map(f=>({name:f,time:fs.statSync(path.join(LOGS_DIR,f)).mtimeMs}))
    .sort((a,b)=>b.time-a.time);
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(LOGS_DIR,files[0].name),'utf-8'));
}

async function runLevel(concurrency:number):Promise<StressResult> {
  console.log(`\n${'='.repeat(60)}\n🔬 CONCURRENCY=${concurrency}  BATCH_SIZE=${BATCH_SIZE}\n${'='.repeat(60)}`);
  const env = {...process.env, CONCURRENCY:String(concurrency), BATCH_SIZE, SINGLE_RUN:'true', BLIND_MODE:'true', STRICT_GRADING:'false'};
  const start = Date.now();
  let errorCount = 0;
  try { execSync('npx tsx scripts/continuousMultiAudit.ts',{stdio:'inherit',env}); }
  catch(err){ console.error(`[stress] run failed:`,err); errorCount++; }
  const durationSec=(Date.now()-start)/1000;
  const s=getLatestSummary();
  if (!s) return {concurrency,avgLatencySec:-1,slaBreaches:-1,accuracy:-1,errorCount:errorCount+1,durationSec};
  return {concurrency,avgLatencySec:s.systemKpis?.avgProcessingTimeSec??-1,slaBreaches:s.systemKpis?.totalSlaBreaches??-1,accuracy:s.systemKpis?.e2eSuccessRate??-1,errorCount,durationSec};
}

function printTable(results:StressResult[]) {
  console.log('\n'+'='.repeat(75));
  console.log('📊 CONCURRENCY STRESS TEST RESULTS');
  console.log('='.repeat(75));
  console.log('CONCURRENCY'.padEnd(14)+'AVG_LAT(s)'.padEnd(14)+'SLA_BREACHES'.padEnd(14)+'ACCURACY%'.padEnd(12)+'ERRORS'.padEnd(10)+'TOTAL(s)');
  console.log('-'.repeat(75));
  for (const r of results) {
    const l=r.avgLatencySec>=0?r.avgLatencySec.toFixed(1):'N/A';
    const b=r.slaBreaches>=0?String(r.slaBreaches)+(r.slaBreaches>0?' ⚠️':''):'N/A';
    const a=r.accuracy>=0?r.accuracy.toFixed(1)+'%':'N/A';
    console.log(String(r.concurrency).padEnd(14)+l.padEnd(14)+b.padEnd(14)+a.padEnd(12)+String(r.errorCount).padEnd(10)+r.durationSec.toFixed(1));
  }
  console.log('='.repeat(75));
  const best=results.filter(r=>r.accuracy>=0&&r.slaBreaches===0).sort((a,b)=>a.avgLatencySec-b.avgLatencySec)[0];
  if (best) console.log(`\n✅ Recommended CONCURRENCY=${best.concurrency} (lowest latency, zero SLA breaches)`);
  else { const ls=results.filter(r=>r.slaBreaches>=0).sort((a,b)=>a.slaBreaches-b.slaBreaches)[0]; console.log(`\n⚠️  No zero-breach level found. Fewest breaches at CONCURRENCY=${ls?.concurrency}`); }
}

async function main() {
  const results:StressResult[]=[];
  for (const level of CONCURRENCY_LEVELS) {
    results.push(await runLevel(level));
    if (level!==CONCURRENCY_LEVELS[CONCURRENCY_LEVELS.length-1]) { console.log('\n⏳ Cooling down 10s...'); await new Promise(r=>setTimeout(r,10000)); }
  }
  printTable(results);
}

main().catch(err=>{ console.error('Fatal:',err); process.exit(1); });
