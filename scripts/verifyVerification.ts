import { assignICDViaModel, isIcdCodePlausible } from '../services/icdService';
import { reviewEnhancement } from '../engine/enhancementReview';

async function testCodingPlausibility() {
  console.log('--- Testing ICD Coding Plausibility ---');

  // 1. Cataract (should only match H-codes)
  const isCataractPlausible = isIcdCodePlausible('J18.9', 'Senile Nuclear Cataract');
  console.log(`Is J18.9 plausible for Cataract? ${isCataractPlausible} (Expected: false)`);
  if (isCataractPlausible !== false) throw new Error('Cataract mapped to J-code');

  const isCataractPlausibleH = isIcdCodePlausible('H25.1', 'Senile Nuclear Cataract');
  console.log(`Is H25.1 plausible for Cataract? ${isCataractPlausibleH} (Expected: true)`);
  if (isCataractPlausibleH !== true) throw new Error('Cataract H-code rejected');

  // 2. LSCS / Maternity (should match O/Z-codes)
  const isLSCSN39 = isIcdCodePlausible('N39.0', 'Pregnancy 39 Weeks - Planned Repeat LSCS');
  console.log(`Is N39.0 plausible for LSCS? ${isLSCSN39} (Expected: false)`);
  if (isLSCSN39 !== false) throw new Error('LSCS mapped to N-code');

  // 3. Ambiguous Diagnosis
  console.log('Testing assignICDViaModel with ambiguous diagnosis "some ambiguous body pain"...');
  const candidates = await assignICDViaModel('some ambiguous body pain');
  console.log('Ambiguous results:', candidates);
  const isPending = candidates.some(c => c.code === 'Pending ICD-10' && c.description.includes('needs manual coding'));
  console.log(`Does it produce "needs manual coding" / Pending ICD-10? ${isPending} (Expected: true)`);
  if (!isPending) throw new Error('Ambiguous diagnosis did not trigger manual coding hold');
}

async function testEnhancementShortStay() {
  console.log('--- Testing Enhancement Short Stay Constraint ---');

  const input18hr = {
    originalApprovalRef: 'APR-TEST',
    originalApprovedAmount: 100000,
    amountUtilizedToDate: 80000,
    trigger: 'extended_stay' as const,
    additionalAmountRequested: 20000,
    dischargeDelayReasons: ['Admitted for 18 hours observation.'],
    originalDischargeDate: '2024-05-22',
    newDischargeDate: '2024-05-25'
  };

  const report = await reviewEnhancement(input18hr, 'Acute Gastroenteritis (18 hours stay)');
  console.log('Report Queries Count:', report.anticipatedQueries.length);
  console.log('Report Status:', report.status);
  console.log('Reasoning Trace:', report.reasoningTrace);
  if (report.anticipatedQueries.length > 0) {
    throw new Error('Short-stay triggered extension queries');
  }
}

async function run() {
  try {
    await testCodingPlausibility();
    await testEnhancementShortStay();
    console.log('✅ ALL MANUAL VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('❌ VERIFICATION FAILED:', err.message);
    process.exit(1);
  }
}

run();
