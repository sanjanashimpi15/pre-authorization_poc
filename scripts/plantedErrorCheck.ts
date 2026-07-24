import { GroundedTestCase } from './groundedBattery';
import { checkCaseWithGemini } from './geminiChecker';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPlantedErrorCheck() {
  console.log('🏁 Starting Planted Error Sanity Check...');

  // Mock Test Case
  const mockTestCase: GroundedTestCase = {
    id: 999,
    category: 'A',
    diagnosis: 'Osteoarthritis of knee',
    code: 'M17.1',
    chiefComplaints: 'Knee pain',
    hpi: 'Patient has had knee pain for 2 years.',
    relevantClinicalFindings: 'X-ray shows severe OA.',
    expected: {
      mustFlag: [],
      mustNotFlag: [],
      shouldGenerate: true,
    },
    notes: 'Sanity check case',
    realGap: 'Missing X-ray Knee (AP/Lat) report showing severe joint space narrowing.',
    sourceReasoning: 'TPA Rule: TKR must be justified with severe radiological findings.'
  };

  // Mock Engine Output (Planted Errors: CM code M17.11 instead of WHO M17.1, and a fabricated auto-reject rule)
  const mockEngineOutput = {
    status: 'insufficient',
    assignedIcdCode: 'M17.11', 
    diagnosisName: 'Bilateral primary osteoarthritis knee',
    gaps: [
      'Missing MRI report.',
      'Auto-reject: TPA rules state all knee replacements must be rejected if patient is under 60.' 
    ],
    anticipatedQueries: [
      { query: 'Please provide patient age.', reason: 'To check if patient is under 60.' }
    ]
  };

  console.log('Testing with mock engine output containing planted errors (M17.11 and fabricated auto-reject)...');
  
  const verdict = await checkCaseWithGemini(mockTestCase, mockEngineOutput, 1);

  if (!verdict) {
    console.error('❌ Gemini check failed or returned null (is GEMINI_API_KEY set?)');
    process.exit(1);
  }

  console.log('\nGEMINI VERDICT:');
  console.log(JSON.stringify(verdict, null, 2));

  let passed = true;
  
  if (verdict.codeIssues.length === 0 || !verdict.codeIssues.some(i => i.includes('M17.11') || i.includes('CM'))) {
    console.error('❌ FAILED: Gemini did not flag the CM code M17.11 issue.');
    passed = false;
  } else {
    console.log('✅ Gemini correctly flagged the CM code issue.');
  }

  if (verdict.authorityIssues.length === 0 || !verdict.authorityIssues.some(i => i.toLowerCase().includes('auto-reject') || i.toLowerCase().includes('under 60'))) {
    console.error('❌ FAILED: Gemini did not flag the hallucinated auto-reject authority issue.');
    passed = false;
  } else {
    console.log('✅ Gemini correctly flagged the hallucinated authority issue.');
  }

  if (verdict.overallPass) {
    console.error('❌ FAILED: Gemini marked overallPass as true despite planted errors.');
    passed = false;
  } else {
    console.log('✅ Gemini correctly marked overallPass as false.');
  }

  if (passed) {
    console.log('\n🎉 PLANTED ERROR SANITY CHECK PASSED SUCCESSFULLY! 🎉');
    
    // Ensure logs directory exists
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Append to audit_raw.jsonl
    fs.appendFileSync(
      path.join(logsDir, 'audit_raw.jsonl'),
      JSON.stringify({ input: mockTestCase, output: mockEngineOutput, verdict }) + '\n'
    );
    console.log(`✅ Logged finding to logs/audit_raw.jsonl`);
  } else {
    process.exit(1);
  }
}

runPlantedErrorCheck().catch(err => {
  console.error('Error during planted error check:', err);
  process.exit(1);
});
