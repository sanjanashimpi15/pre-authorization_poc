// Mock localStorage globally for Node.js context
const store: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k in store) delete store[k]; },
  length: 0,
  key: (index: number) => null,
} as any;

import { reviewEnhancement, EnhancementInput } from '../engine/enhancementReview';
import { logEvent, getAllLogs } from '../utils/auditLog';
import { setMockQuery } from '../services/llmClient';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('🏁 Starting NEXUS Stay Extension / Enhancement Verification Tests...');

  // =========================================================================
  // SCENARIO 1: Insufficient Extension Request
  // =========================================================================
  console.log('\nRunning Scenario 1: Insufficient Extension Request...');
  
  setMockQuery(async () => JSON.stringify({
    challengesConsidered: [
      'why is stay extending?',
      'does clinical status justify extension?'
    ],
    anchors: [
      'Clinical progress notes explaining delay',
      'Current clinical severity scores'
    ],
    discriminators: [
      {
        challenge: 'why is stay extending?',
        evidence: 'Documented delay reason',
        reason: 'To prove stay extension necessity.'
      }
    ]
  }));

  const insufficientInput: EnhancementInput = {
    originalApprovalRef: 'APP-12345',
    originalApprovedAmount: 150000,
    amountUtilizedToDate: 120000,
    trigger: 'extended_stay',
    additionalAmountRequested: 50000,
    dischargeDelayReasons: [], // Blank
    originalDischargeDate: '2026-06-30',
    newDischargeDate: '2026-07-04', // 4 additional days (> 3)
    currentSeverityScores: {
      phenoIntensity: 2, // low (< 3)
      deteriorationVelocity: 2 // low (< 3)
    }
  };

  const report1 = await reviewEnhancement(insufficientInput, 'Acute Cerebrovascular Stroke');
  console.log('Status:', report1.status);
  console.log('Gaps:', report1.gaps);
  console.log('Queries:', report1.anticipatedQueries.map(q => q.query));

  assert(report1.status === 'pending_documents', 'Sufficient evaluation should have failed.');
  assert(report1.gaps.includes('Extension justification / reasons for stay delay are missing.'), 'Should have flagged missing delay reasons.');
  assert(report1.gaps.some(g => g.includes('lacks documented clinical severity justification')), 'Should have flagged low severity for 4-day extension.');
  console.log('✅ Scenario 1 Passed successfully.');

  // =========================================================================
  // SCENARIO 2: Sufficient Extension Request
  // =========================================================================
  console.log('\nRunning Scenario 2: Sufficient Extension Request...');
  
  setMockQuery(async () => JSON.stringify({
    challengesConsidered: [
      'why is stay extending?',
      'does clinical status justify extension?'
    ],
    anchors: [
      'Slow clinical recovery',
      'Awaiting critical laboratory or culture reports'
    ],
    discriminators: [
      {
        challenge: 'why is stay extending?',
        evidence: 'Slow clinical recovery',
        reason: 'To prove stay extension necessity.'
      }
    ]
  }));

  const sufficientInput: EnhancementInput = {
    originalApprovalRef: 'APP-12345',
    originalApprovedAmount: 150000,
    amountUtilizedToDate: 120000,
    trigger: 'extended_stay',
    additionalAmountRequested: 50000,
    dischargeDelayReasons: ['Slow clinical recovery / ongoing wound care', 'Awaiting critical laboratory or culture reports'],
    originalDischargeDate: '2026-06-30',
    newDischargeDate: '2026-07-04', // 4 additional days (> 3)
    currentSeverityScores: {
      phenoIntensity: 6, // high (>= 5)
      deteriorationVelocity: 5 // high (>= 5)
    }
  };

  const report2 = await reviewEnhancement(sufficientInput, 'Acute Cerebrovascular Stroke');
  console.log('Status:', report2.status);
  console.log('Gaps:', report2.gaps);
  console.log('Queries:', report2.anticipatedQueries.map(q => q.query));

  assert(report2.status === 'sufficient', 'Should have evaluated to sufficient.');
  assert(report2.gaps.length === 0, 'Sufficient case should have zero gaps.');
  console.log('✅ Scenario 2 Passed successfully.');

  // =========================================================================
  // SCENARIO 3: ICU Upgrade Insufficient / Sufficient
  // =========================================================================
  console.log('\nRunning Scenario 3: ICU Upgrade Tests...');
  
  setMockQuery(async () => JSON.stringify({
    challengesConsidered: [
      'is ICU upgrade justified?',
      'are deterioration vitals documented?'
    ],
    anchors: [
      'Deterioration vitals',
      'ICU intervention'
    ],
    discriminators: [
      {
        challenge: 'is ICU upgrade justified?',
        evidence: 'Deterioration vitals',
        reason: 'To justify intensive monitoring.'
      }
    ]
  }));

  const icuInsufficient: EnhancementInput = {
    originalApprovalRef: '', // Missing Ref
    originalApprovedAmount: 100000,
    amountUtilizedToDate: 90000,
    trigger: 'icu_upgrade',
    additionalAmountRequested: 0, // Zero cost
    deteriorationDateTime: '2026-06-30T10:00',
    deteriorationVitals: '', // Blank vitals
    icuIntervention: '' // Blank justification
  };

  const report3 = await reviewEnhancement(icuInsufficient, 'Myocardial Infarction');
  assert(report3.status === 'pending_documents', 'ICU insufficient should have failed.');
  assert(report3.gaps.includes('Original approved reference number is missing.'), 'Should flag missing reference.');
  assert(report3.gaps.includes('ICU intervention justification is missing.'), 'Should flag missing intervention justification.');
  assert(report3.gaps.includes('Deterioration vitals / objective clinical findings are missing.'), 'Should flag missing vitals.');
  assert(report3.gaps.includes('Additional requested cost is missing or must be greater than zero.'), 'Should flag non-positive cost.');

  const icuSufficient: EnhancementInput = {
    originalApprovalRef: 'APP-99887',
    originalApprovedAmount: 100000,
    amountUtilizedToDate: 90000,
    trigger: 'icu_upgrade',
    additionalAmountRequested: 80000,
    deteriorationDateTime: '2026-06-30T10:00',
    deteriorationVitals: 'BP 80/50 mmHg, SpO2 85% on room air',
    icuIntervention: 'Intravenous vasopressors and mechanical ventilation initiated'
  };

  const report4 = await reviewEnhancement(icuSufficient, 'Myocardial Infarction');
  assert(report4.status === 'sufficient', 'ICU upgrade should have passed.');
  console.log('✅ Scenario 3 Passed successfully.');

  // =========================================================================
  // SCENARIO 4: Audit Logs Verification
  // =========================================================================
  console.log('\nRunning Scenario 4: Audit Logs Verification...');
  // Log some demo events manually to verify storage read/write
  logEvent('CASE-001', 'evidence_reviewed', {
    status: 'insufficient',
    gapCount: 3,
    mandatoryGapCount: 1,
    insufficientItems: ['SpO2 reading', 'Chest X-ray report']
  });

  logEvent('CASE-001', 'submitted_insufficient', {
    submittabilityStatus: 'pending_documents',
    icdCode: 'E11.9',
    diagnosisName: 'Type 2 diabetes',
    missingItems: ['Patient Date of Birth is missing.'],
    totalEstimatedCost: 45000
  });

  logEvent('CASE-001', 'enhancement_reviewed', {
    status: 'sufficient',
    gapCount: 0,
    insufficientItems: [],
    originalApprovalRef: 'APP-12345',
    additionalAmountRequested: 50000
  });

  const logs = getAllLogs();
  console.log('Total logged events:', logs.length);
  assert(logs.length === 3, 'Expected 3 logged events.');
  assert(logs[0].eventType === 'evidence_reviewed', 'First log should be evidence_reviewed.');
  assert(logs[1].eventType === 'submitted_insufficient', 'Second log should be submitted_insufficient.');
  assert(logs[2].eventType === 'enhancement_reviewed', 'Third log should be enhancement_reviewed.');
  assert((logs[2].payload as any).status === 'sufficient', 'Payload property status mismatch.');
  console.log('✅ Scenario 4 Passed successfully.');

  console.log('\n🎉 ALL STAY EXTENSION / ENHANCEMENT TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch(err => {
  console.error('❌ Tests failed with error:', err);
  process.exit(1);
});
