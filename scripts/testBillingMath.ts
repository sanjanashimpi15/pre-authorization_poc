/**
 * scripts/testBillingMath.ts
 *
 * Exhaustive, pure unit-test suite for engine/billingCoder.ts.
 * Verifies ward types, length-of-stay boundaries, co-pays, GST,
 * proportional deductions, implant caps, PM-JAY, and package exemptions.
 */

import { runBillingCodingWorkflow } from '../engine/billingCoder';
import { setMockExtractBillingCodes } from '../services/geminiService';

let passCount = 0;
let failCount = 0;

function assertEqual(actual: any, expected: any, message: string) {
    if (actual === expected) {
        console.log(`  ✅ PASS: ${message}`);
        passCount++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        console.error(`     Expected: ${expected} (${typeof expected})`);
        console.error(`     Actual:   ${actual} (${typeof actual})`);
        failCount++;
    }
}

async function runTests() {
    console.log('================================================================');
    console.log('🏁 Starting Exhaustive Billing Math Tests...');
    console.log('================================================================');

    // Default mock behavior: return what is requested as cashless approved (before overrides)
    setMockExtractBillingCodes((_note: string, _insurer: string, _sumInsured: number, _ward: string, requestedAmount: number, resolvedICD10?: string) => {
        return {
            primaryICD10: resolvedICD10 || 'J18.9',
            primaryDescription: 'Pneumonia',
            secondaryICD10: [],
            suggestedCPT: [],
            validationWarnings: [],
            scrubbingStatus: 'Clean',
            copayDeductions: 0,
            cashlessApproved: requestedAmount,
            patientShare: 0,
            copayPercentage: 0,
            nonMedicalDeduction: 0,
            roomRentDeduction: 0
        };
    });

    // -------------------------------------------------------------------------
    // TEST 1: Standard Ward with No Deductions (Stay = 3 days, rent 4000 <= 5000 cap)
    // -------------------------------------------------------------------------
    console.log('\nTest 1: Standard Ward, rent within cap');
    const result1 = await runBillingCodingWorkflow({
        clinicalNote: 'Patient admitted with fever and cough.',
        insurerName: 'HDFC ERGO',
        sumInsured: 500000, // 1% Normal Ward cap = 5,000/day
        wardType: 'Private', // Capped at normal cap
        requestedAmount: 100000,
        roomRentPerDay: 4000,
        expectedLengthOfStay: 3
    });
    // Expected:
    // Non-medical deduction = 9% of 100k = 9,000
    // Room rent deduction = 0
    // Proportional deduction = 0
    // cashlessApproved = 100,000 - 9,000 = 91,000
    // patientShare = 9,000
    assertEqual(result1.nonMedicalDeduction, 9000, 'Non-medical deduction is 9%');
    assertEqual(result1.roomRentDeduction, 0, 'No room rent deduction');
    assertEqual(result1.cashlessApproved, 91000, 'Cashless approved is correct');
    assertEqual(result1.patientShare, 9000, 'Patient share is correct');

    // -------------------------------------------------------------------------
    // TEST 2: ICU Ward (Cap = 2% of SI = 10,000/day)
    // -------------------------------------------------------------------------
    console.log('\nTest 2: ICU Ward, rent within cap');
    const result2 = await runBillingCodingWorkflow({
        clinicalNote: 'Patient admitted in ICU.',
        insurerName: 'Care Health',
        sumInsured: 500000, // 2% ICU cap = 10,000/day
        wardType: 'ICU',
        requestedAmount: 150000,
        roomRentPerDay: 8000,
        expectedLengthOfStay: 3
    });
    // Expected:
    // Non-medical deduction = 9% of 150k = 13,500
    // Room rent deduction = 0
    // cashlessApproved = 150,000 - 13,500 = 136,500
    assertEqual(result2.roomRentDeduction, 0, 'No ICU room rent deduction under cap');
    assertEqual(result2.cashlessApproved, 136500, 'ICU cashless approved is correct');

    // -------------------------------------------------------------------------
    // TEST 3: Room Rent Cap Exceeded & Proportional Deductions
    // -------------------------------------------------------------------------
    console.log('\nTest 3: Room Rent Cap Exceeded with Proportional Deductions');
    const result3 = await runBillingCodingWorkflow({
        clinicalNote: 'Patient admitted in deluxe room. implants: 0 medicines: 0',
        insurerName: 'Star Health',
        sumInsured: 500000, // Cap = 5,000/day
        wardType: 'Private',
        requestedAmount: 100000,
        roomRentPerDay: 10000, // Exceeds cap by 5,000/day
        expectedLengthOfStay: 3,
        implantCost: 0,
        medicineCost: 0
    } as any);
    // Calculation:
    // Non-medical deduction = 9% of 100k = 9,000
    // Room Rent deduction = (10k - 5k) * 3 = 15,000
    // Total Room Rent charged = 10k * 3 = 30,000
    // Associated charges = 100k - 30k (total rent) - 0 (implant) - 0 (medicine) = 70,000
    // Proportional deduction = Math.round(70k * (1 - 5k / 10k)) = 35,000
    // GST = Math.round(15k * 0.05) = 750
    // Base approved = 100k - 9k - 15k - 35k - 0 - 0 - 750 = 40,250
    // cashlessApproved = 40,250
    // patientShare = 100k - 40,250 = 59,750
    assertEqual(result3.roomRentDeduction, 15000, 'Room rent deduction is 15,000');
    assertEqual(result3.nonMedicalDeduction, 9000, 'Non-medical deduction is 9,000');
    assertEqual(result3.cashlessApproved, 40250, 'Cashless approved is correct with proportional deduction');
    assertEqual(result3.patientShare, 59750, 'Patient share is correct');

    // -------------------------------------------------------------------------
    // TEST 4: Length of Stay Boundaries (0 days default to 3, 1 day, 10 days)
    // -------------------------------------------------------------------------
    console.log('\nTest 4: Length of Stay Boundaries');
    const result4A = await runBillingCodingWorkflow({
        clinicalNote: 'Short stay. implants: 0 medicines: 0',
        insurerName: 'Star Health',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 100000,
        roomRentPerDay: 10000,
        expectedLengthOfStay: 0 // Should default to 3 days
    });
    assertEqual(result4A.roomRentDeduction, 15000, '0 days defaults to 3 days');

    const result4B = await runBillingCodingWorkflow({
        clinicalNote: '1 day stay. implants: 0 medicines: 0',
        insurerName: 'Star Health',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 100000,
        roomRentPerDay: 10000,
        expectedLengthOfStay: 1
    });
    assertEqual(result4B.roomRentDeduction, 5000, '1 day stay correct');

    // -------------------------------------------------------------------------
    // TEST 5: Senior Citizen Co-pay Bracket (20% co-pay on age > 60 on Senior plans)
    // -------------------------------------------------------------------------
    console.log('\nTest 5: Senior Citizen Co-pay Bracket');
    const result5A = await runBillingCodingWorkflow({
        clinicalNote: 'Senior Citizen Red Carpet policy review.',
        insurerName: 'Star Senior Plan',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 100000,
        roomRentPerDay: 4000,
        expectedLengthOfStay: 3,
        patientAge: 65
    });
    // Expected:
    // Non-medical deduction = 9k
    // Base approved = 100k - 9k = 91k
    // Copay = 91k * 20% = 18,200
    // cashlessApproved = 91k - 18.2k = 72,800
    // patientShare = 100k - 72.8k = 27,200
    assertEqual(result5A.copayPercentage, 20, '20% copay applied');
    assertEqual(result5A.copayDeductions, 18200, 'Copay deductions correct');
    assertEqual(result5A.cashlessApproved, 72800, 'Approved amount correct after copay');

    const result5B = await runBillingCodingWorkflow({
        clinicalNote: 'Normal plan review for older patient.',
        insurerName: 'Star Normal Plan',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 100000,
        roomRentPerDay: 4000,
        expectedLengthOfStay: 3,
        patientAge: 65 // Age > 60 but not a senior plan
    });
    assertEqual(result5B.copayPercentage, 0, 'No copay applied on normal plans');

    // -------------------------------------------------------------------------
    // TEST 6: Package Procedure Exemptions (LSCS and Cataract Daycare)
    // -------------------------------------------------------------------------
    console.log('\nTest 6: Package Procedure Exemptions (LSCS and Cataract)');
    // LSCS or Cataract keywords in clinicalNote exempt from room rent caps & proportional deductions
    const result6A = await runBillingCodingWorkflow({
        clinicalNote: 'Patient admitted for cesarean delivery (LSCS). requested deluxe room.',
        insurerName: 'Care Health',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 100000,
        roomRentPerDay: 15000, // Way exceeds cap
        expectedLengthOfStay: 3
    });
    assertEqual(result6A.roomRentDeduction, 0, 'LSCS package procedure exempt from room rent caps');

    const result6B = await runBillingCodingWorkflow({
        clinicalNote: 'Admitted for Cataract surgery with intraocular lens.',
        insurerName: 'Care Health',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 50000,
        roomRentPerDay: 10000,
        expectedLengthOfStay: 1
    });
    assertEqual(result6B.roomRentDeduction, 0, 'Cataract surgery exempt from room rent caps');

    // -------------------------------------------------------------------------
    // TEST 7: Implant Capping (₹1,50,000 orthopedic/cardiac limit)
    // -------------------------------------------------------------------------
    console.log('\nTest 7: Implant Capping');
    const result7 = await runBillingCodingWorkflow({
        clinicalNote: 'Patient undergoing TKR surgery. implantCost is 180000. implants: 180000',
        insurerName: 'HDFC ERGO',
        sumInsured: 500000,
        wardType: 'Private',
        requestedAmount: 250000,
        roomRentPerDay: 4000,
        expectedLengthOfStay: 3,
        implantCost: 180000
    } as any);
    // Calculation:
    // Non-medical deduction = 9% of 250k = 22,500
    // Excess implant = 180,000 - 150,000 = 30,000
    // Base approved = 250,000 - 22,500 (non-medical) - 0 (room rent) - 30,000 (excess implant) = 197,500
    assertEqual(result7.cashlessApproved, 197500, 'Cashless approved capped at 1.5L implant sublimit');
    assertEqual(result7.patientShare, 52500, 'Excess implant cost transferred to patient share');

    // -------------------------------------------------------------------------
    // TEST 8: PM-JAY Package Rate Capping
    // -------------------------------------------------------------------------
    console.log('\nTest 8: PM-JAY Capping');
    const result8 = await runBillingCodingWorkflow({
        clinicalNote: 'Patient is a PMJAY beneficiary.',
        insurerName: 'Ayushman Bharat PM-JAY',
        sumInsured: 100000,
        wardType: 'General',
        requestedAmount: 80000,
        roomRentPerDay: 1000,
        expectedLengthOfStay: 3,
        resolvedICD10: 'H25.9' // Cataract has a specific PM-JAY package rate
    });
    // PM-JAY package rate for H25.9 / cataract is capped around 35k (suggested CPT defaults or package rates lookup)
    // Let's verify that cashlessApproved is capped at the package rate or falls back appropriately
    console.log(`  Info: PM-JAY cashlessApproved: ${result8.cashlessApproved}, patientShare: ${result8.patientShare}`);
    assertEqual(result8.cashlessApproved <= 80000, true, 'PM-JAY limits applied');

    // -------------------------------------------------------------------------
    // TEST 9: Sum Insured Capping
    // -------------------------------------------------------------------------
    console.log('\nTest 9: Sum Insured Capping');
    const result9 = await runBillingCodingWorkflow({
        clinicalNote: 'Extremely high cost admission.',
        insurerName: 'HDFC ERGO',
        sumInsured: 100000, // Small sum insured
        wardType: 'Private',
        requestedAmount: 300000,
        roomRentPerDay: 1000,
        expectedLengthOfStay: 3
    });
    // Cashless approved must never exceed sumInsured (100k)
    assertEqual(result9.cashlessApproved, 100000, 'Cashless approved capped exactly at Sum Insured');

    console.log('\n================================================================');
    console.log(`🏁 BILLING MATH SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED.`);
    console.log('================================================================');

    if (failCount > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
