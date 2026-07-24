import { adversarialTestCases } from './adversarialSuiteData';
import { makePreAuthRecord } from './testBattery';
import { extractFromDocument } from '../services/documentExtractionService';
import { reviewEvidence } from '../engine/evidenceReview';
import { lookupICD, assignICDViaModel } from '../services/icdService';
import { runBillingCodingWorkflow } from '../engine/billingCoder';
import { generatePartC } from '../engine/partCGenerator';
import { runDenialReview, DenialItem } from '../engine/denialReview';
import { generateDenialAppeal } from '../engine/denialAppealGenerator';

async function runAdversarialSuite() {
  console.log('🦾 Starting Adversarial Edge Case Suite (N=10)...');
  console.log('--------------------------------------------------');

  let passedCases = 0;

  for (let idx = 0; idx < adversarialTestCases.length; idx++) {
    const tc = adversarialTestCases[idx];
    console.log(`\n👉 [Case ${idx + 1}/10] ID: ${tc.id} - ${tc.diagnosis}`);
    
    try {
      const record = makePreAuthRecord(tc);

      // 1. Extraction
      const extOutput = await extractFromDocument({
        name: 'document.txt',
        type: 'text/plain',
        content: tc.rawDocumentText || '',
      } as any);

      // Update record with extracted fields
      if (extOutput.patientName) record.patient.patientName = extOutput.patientName;
      if (extOutput.patientAge) record.patient.age = extOutput.patientAge;
      if (extOutput.patientGender) record.patient.gender = extOutput.patientGender as any;
      if (extOutput.policyNumber) record.insurance.policyNumber = extOutput.policyNumber;
      if (extOutput.insurerName) record.insurance.insurerName = extOutput.insurerName;
      if (extOutput.treatingDoctor) {
        record.declarations = record.declarations || {};
        record.declarations.doctor = {
          doctorName: extOutput.treatingDoctor.name,
          registrationNumber: extOutput.treatingDoctor.registrationNumber || 'Pending Reg No'
        };
      }

      // 2. Evidence Review
      const reviewOutput = await reviewEvidence(record);

      // 3. ICD Coding
      let code = tc.code;
      const icdMatches = await lookupICD(tc.diagnosis);
      if (icdMatches.length > 0 && icdMatches[0].confidence === 'high') {
        code = icdMatches[0].code;
      } else {
        const aiCode = await assignICDViaModel(tc.diagnosis, tc.chiefComplaints + ' ' + tc.hpi);
        if (aiCode) code = aiCode;
      }

      // 4. Billing
      const billingInput = {
        requestedAmount: tc.cost?.totalEstimatedCost || tc.expectedAnswer?.expectedCost || 150000,
        wardType: record.admission.roomCategory === 'General Ward' ? 'General' as const : 'Private' as const,
        roomRentPerDay: record.admission.roomCategory === 'General Ward' ? 2000 : 8000,
        patientAge: record.patient.age,
        insurerName: record.insurance.insurerName,
        clinicalNote: tc.rawDocumentText,
        sumInsured: record.insurance.sumInsured,
        resolvedICD10: code,
        implantCost: tc.cost?.implantCost || 0,
        medicineCost: tc.cost?.medicineCost || 0,
        expectedLengthOfStay: record.admission.expectedLengthOfStay || 3
      };

      const billingOutput = await runBillingCodingWorkflow(billingInput, {
        provisionalDiagnosis: tc.diagnosis,
        provisionalCode: code,
        suggestedCPT: [],
        validationWarnings: [],
        scrubbingStatus: 'Clean',
        cashlessApproved: tc.cost?.totalEstimatedCost || 150000,
        patientShare: 0,
        copayDeductions: 0,
        copayPercentage: 0,
        nonMedicalDeduction: 0,
        roomRentDeduction: 0
      });

      // Synchronize back
      record.costEstimate = {
        cashlessApproved: billingOutput.cashlessApproved,
        patientShare: billingOutput.patientShare,
        isPackageRate: billingOutput.suggestedCPT.length > 0
      };

      // 5. Part C Form
      const partCOutput = await generatePartC(record, reviewOutput);

      // 6 & 7. Denial review and appeal if simulated denial is active
      let appealOutput: any = null;
      if (tc.simulatedDenialReason) {
        const simulatedDenialItem: DenialItem = {
          id: `DEN-${tc.id}`,
          patientName: record.patient.patientName || 'Test Patient',
          policyNumber: record.insurance.policyNumber || 'POL-123',
          tpaName: record.insurance.tpaName || 'Medi Assist',
          insurerName: record.insurance.insurerName || 'Star Health',
          claimAmount: billingOutput.cashlessApproved,
          denialDate: new Date().toISOString().split('T')[0],
          eobText: tc.simulatedDenialReason,
          status: 'Pending Review',
          daysSinceDenial: 2
        };

        const denialReviewOutput = await runDenialReview(simulatedDenialItem);

        appealOutput = await generateDenialAppeal(
          tc.simulatedDenialReason,
          record,
          reviewOutput
        );
      }

      // GRADING/VERIFICATION
      let casePassed = true;
      let failureReason = '';

      if (tc.id === 50001) {
        // Unilateral vs Bilateral Mismatch
        const hasGap = reviewOutput.mandatoryGaps.includes('Bilateral_Unilateral_Mismatch');
        const isCapped = billingOutput.cashlessApproved <= 200000;
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Bilateral_Unilateral_Mismatch gap; ';
        }
        if (!isCapped) {
          casePassed = false;
          failureReason += `Billing not capped correctly (Approved: ₹${billingOutput.cashlessApproved}); `;
        }
      }

      if (tc.id === 50002) {
        // Waiting Period Day 731
        if (!appealOutput || (!appealOutput.appealText.includes('731') && !appealOutput.appealText.includes('2026') && !appealOutput.appealText.includes('24-month'))) {
          casePassed = false;
          failureReason += 'Appeal text must cite the dates/elapsed days to prove waiting period elapsed; ';
        }
      }

      if (tc.id === 50003) {
        // Mid-admission shift
        const hasGap = reviewOutput.mandatoryGaps.includes('Emergency_Enhancement_Justified');
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Emergency_Enhancement_Justified gap; ';
        }
      }

      if (tc.id === 50004) {
        // Surgical Technique Conflict
        const hasGap = reviewOutput.mandatoryGaps.includes('Surgical_Technique_Conflict');
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Surgical_Technique_Conflict gap; ';
        }
      }

      if (tc.id === 50005) {
        // Incorrect Proportional Deduction
        const hasGap = reviewOutput.mandatoryGaps.includes('Incorrect_Proportional_Deduction');
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Incorrect_Proportional_Deduction gap; ';
        }
        if (billingOutput.roomRentDeduction > 0 && billingOutput.patientShare > 300000) {
          casePassed = false;
          failureReason += `Implants/medicines were not correctly excluded from proportional deductions (Proportional Deduction: ₹${billingOutput.proportionalDeduction}); `;
        }
      }

      if (tc.id === 50006) {
        // Overlapping claim
        const hasGap = reviewOutput.mandatoryGaps.includes('Overlapping_Admission_Alert');
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Overlapping_Admission_Alert gap; ';
        }
      }

      if (tc.id === 50007) {
        // Emergency bypass
        const hasUnwanted = reviewOutput.anticipatedQueries.some(q => 
          q.query.includes('USG') || q.query.includes('Alvarado')
        );
        if (hasUnwanted) {
          casePassed = false;
          failureReason += 'Emergency case incorrectly flagged standard diagnostic gaps; ';
        }
      }

      if (tc.id === 50008) {
        // Policy Age Mismatch
        const hasGap = reviewOutput.mandatoryGaps.includes('Policy_Age_Mismatch');
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Policy_Age_Mismatch gap; ';
        }
      }

      if (tc.id === 50009) {
        // Line of Treatment Mismatch
        const hasGap = reviewOutput.mandatoryGaps.includes('Line_Of_Treatment_Billing_Mismatch');
        if (!hasGap) {
          casePassed = false;
          failureReason += 'Missing Line_Of_Treatment_Billing_Mismatch gap; ';
        }
      }

      if (tc.id === 50010) {
        // Gestational Diabetes
        const hasUnwanted = reviewOutput.anticipatedQueries.some(q => 
          q.query.toLowerCase().includes('pre-existing') || q.query.toLowerCase().includes('ped')
        );
        if (hasUnwanted) {
          casePassed = false;
          failureReason += 'Gestational Diabetes incorrectly flagged as chronic PED / waiting period violation; ';
        }
      }

      if (casePassed) {
        passedCases++;
        console.log('  ✅ PASS');
      } else {
        console.log(`  ❌ FAIL: ${failureReason}`);
      }

    } catch (err: any) {
      console.log(`  ❌ CRASH: ${err.message}\n${err.stack}`);
    }
  }

  console.log('\n==================================================');
  console.log(`Adversarial Suite Result: ${passedCases}/10 cases passed successfully.`);
  console.log('==================================================');
  
  if (passedCases === 10) {
    console.log('🏆 Perfect score! Zero confidently-wrong outputs.');
    process.exit(0);
  } else {
    console.error('❌ Mismatches or failures detected in adversarial suite.');
    process.exit(1);
  }
}

runAdversarialSuite().catch(console.error);
