import { reviewEvidence } from '../engine/evidenceReview';
import { PreAuthRecord } from '../components/PreAuthWizard/types';
import * as llmClient from '../services/llmClient';
import { validateCode, lookupICD } from '../services/icdService';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock localStorage globally for Node context (required for logging tests)
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

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

// Mock helper to simulate LLM responses
function mockLlmResponse(response: llmClient.LlmReasoningOutput) {
  llmClient.setMockReasoning(async () => response);
}

// Mock helper to simulate LLM failure
function mockLlmFailure() {
  llmClient.setMockReasoning(async () => {
    throw new Error('Local Ollama server connection refused');
  });
}


// Standard valid compliance declarations to satisfy deterministic rules
const validDeclarationsAndCosts = {
  declarations: {
    patient: {
      agreedToTerms: true,
      consentForMedicalDataSharing: true,
      agreesToPayNonPayables: true,
      capturedBy: 'Insurance Desk Officer'
    },
    doctor: {
      doctorId: 'DOC-1',
      doctorName: 'Dr. Ramesh Kumar',
      doctorQualification: 'MBBS, MD',
      doctorRegistrationNumber: 'MCI-12345',
      registrationCouncil: 'Karnataka Medical Council',
      confirmed: true,
      confirmationMethod: 'in_app' as const
    },
    hospital: {
      authorizedSignatoryName: 'Admin Head',
      designation: 'Medical Superintendent',
      hospitalSealApplied: true
    }
  },
  costEstimate: {
    totalEstimatedCost: 45000,
    amountClaimedFromInsurer: 40000,
    isPackageRate: false,
    roomRentPerDay: 4000
  },
  uploadedDocuments: [
    {
      id: 'DOC-DS',
      fileName: 'discharge_summary.pdf',
      fileSizeDisplay: '120 KB',
      fileType: 'pdf' as const,
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      base64Data: 'dummy',
      documentCategory: 'discharge_summary' as const,
      autoClassified: false,
      isRequired: true
    }
  ]
};

async function runTests() {
  console.log('🏁 Starting NEXUS Evidence Review Engine Tests...');

  // =========================================================================
  // TEST case 1: Pneumonia Admission with Gaps (No SpO2, no duration)
  // =========================================================================
  console.log('\nRunning Test 1: Pneumonia Admission with Gaps...');
  
  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Fever or elevated body temperature',
      'Productive cough',
      'Chest X-Ray showing lung infiltrate or consolidation'
    ],
    discriminators: [
      {
        challenge: 'could this be managed as OPD?',
        evidence: 'Oxygen saturation (SpO2) < 90% or clinical signs of respiratory distress',
        reason: 'To establish severity of pneumonia and justify continuous inpatient oxygen therapy.'
      },
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Documented onset and short duration of acute respiratory symptoms (< 7 days)',
        reason: 'To rule out chronic respiratory illness exclusions.'
      }
    ]
  });

  const pneumoniaGapsRecord: Partial<PreAuthRecord> = {
    id: 'PA-TEST-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    clinical: {
      dataSource: 'manual_entry',
      chiefComplaints: 'Patient has cough and high fever.',
      historyOfPresentIllness: 'Cough and high fever noticed recently. Chest crackles present.',
      vitals: {
        bp: '120/80',
        pulse: '88',
        temp: '101.5',
        spo2: '', // Missing SpO2!
        rr: '24'
      },
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'J18.9',
          icd10Description: 'Pneumonia, unspecified organism',
          probability: 0.9,
          reasoning: 'Clinical findings indicate lower respiratory tract infection',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0
    },
    admission: {
      admissionType: 'Emergency',
      dateOfAdmission: new Date().toISOString().split('T')[0],
      timeOfAdmission: '10:00',
      roomCategory: 'General Ward',
      expectedLengthOfStay: 5,
      expectedDaysInICU: 0,
      expectedDaysInRoom: 5,
      pastMedicalHistory: {
        diabetes: { present: false },
        hypertension: { present: false },
        heartDisease: { present: false },
        asthma: { present: false },
        epilepsy: { present: false },
        cancer: { present: false },
        kidney: { present: false },
        liver: { present: false },
        hiv: { present: false },
        alcoholism: { present: false },
        smoking: { present: false },
        anyOther: { present: false }
      },
      previousHospitalization: { wasHospitalizedBefore: false }
    },
    ...validDeclarationsAndCosts
  };

  const report1 = await reviewEvidence(pneumoniaGapsRecord);
  
  assert(report1.status === 'insufficient', 'Status should be insufficient');
  assert(report1.challengesConsidered.includes('could this be managed as OPD?'), 'OPD challenge should be raised');
  assert(report1.challengesConsidered.includes('could this be a pre-existing condition?'), 'Pre-existing challenge should be raised');
  
  // Verify missing SpO2 query
  const opdQuery = report1.anticipatedQueries.find(q => q.relatedChallenge.includes('OPD'));
  assert(!!opdQuery, 'OPD query should be generated');
  assert(opdQuery!.query.includes('SpO2') || opdQuery!.query.includes('saturation'), 'OPD query must target SpO2');
  assert(opdQuery!.severity === 'high', 'OPD query severity should be high');

  // Verify missing duration query
  const preExistingQuery = report1.anticipatedQueries.find(q => q.relatedChallenge.includes('pre-existing'));
  assert(!!preExistingQuery, 'Pre-existing query should be generated');
  assert(preExistingQuery!.query.includes('onset') || preExistingQuery!.query.includes('duration'), 'Pre-existing query must target onset/duration');

  console.log('✅ Test 1 Passed: Gapped Pneumonia case correctly reviewed.');

  // =========================================================================
  // TEST case 2: Diabetes Admission with Gaps (No duration / past papers)
  // =========================================================================
  console.log('\nRunning Test 2: Diabetes Admission with Gaps...');

  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Hyperglycemia (elevated blood glucose > 200 mg/dL)',
      'Polyuria or polydipsia'
    ],
    discriminators: [
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Documented history of diabetes and medication log or past-treatment papers',
        reason: 'To establish if condition is pre-existing and calculate waiting period compliance.'
      }
    ]
  });

  const diabetesRecord: Partial<PreAuthRecord> = {
    id: 'PA-TEST-002',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    clinical: {
      dataSource: 'manual_entry',
      chiefComplaints: 'High blood sugar levels.',
      historyOfPresentIllness: 'High blood sugar noted during home tests.',
      vitals: {
        bp: '130/85',
        pulse: '76',
        temp: '98.6',
        spo2: '98',
        rr: '18'
      },
      diagnoses: [
        {
          diagnosis: 'Diabetes Mellitus',
          icd10Code: 'E11.9',
          icd10Description: 'Type 2 diabetes mellitus without complications',
          probability: 0.9,
          reasoning: 'Elevated glucose levels require evaluation',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0
    },
    admission: {
      admissionType: 'Emergency',
      dateOfAdmission: new Date().toISOString().split('T')[0],
      timeOfAdmission: '11:00',
      roomCategory: 'General Ward',
      expectedLengthOfStay: 3,
      expectedDaysInICU: 0,
      expectedDaysInRoom: 3,
      pastMedicalHistory: {
        diabetes: { present: false }, // Doctor states no history or leaves it blank
        hypertension: { present: false },
        heartDisease: { present: false },
        asthma: { present: false },
        epilepsy: { present: false },
        cancer: { present: false },
        kidney: { present: false },
        liver: { present: false },
        hiv: { present: false },
        alcoholism: { present: false },
        smoking: { present: false },
        anyOther: { present: false }
      },
      previousHospitalization: { wasHospitalizedBefore: false }
    },
    ...validDeclarationsAndCosts
  };

  const report2 = await reviewEvidence(diabetesRecord);
  assert(report2.status === 'insufficient', 'Status should be insufficient');
  
  const historyQuery = report2.anticipatedQueries.find(q => q.relatedChallenge.includes('pre-existing'));
  assert(!!historyQuery, 'Pre-existing query should be generated for Diabetes');
  assert(historyQuery!.query.includes('treatment') || historyQuery!.query.includes('history') || historyQuery!.query.includes('past'), 'Query must request history / past-treatment papers');

  console.log('✅ Test 2 Passed: Gapped Diabetes case correctly reviewed.');

  // =========================================================================
  // TEST case 3: Well-documented Case (Sufficient)
  // =========================================================================
  console.log('\nRunning Test 3: Well-documented Sufficient Case...');

  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Fever or elevated body temperature',
      'Productive cough'
    ],
    discriminators: [
      {
        challenge: 'could this be managed as OPD?',
        evidence: 'Oxygen saturation (SpO2) < 90%',
        reason: 'To establish need for inpatient oxygenation.'
      },
      {
        challenge: 'could this be a pre-existing condition?',
        evidence: 'Documented acute onset of symptoms with short duration (< 7 days)',
        reason: 'To rule out chronic/pre-existing exclusion.'
      }
    ]
  });

  const sufficientRecord: Partial<PreAuthRecord> = {
    id: 'PA-TEST-003',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Insurance Desk',
    clinical: {
      dataSource: 'manual_entry',
      chiefComplaints: 'Productive cough and high fever for 3 days.',
      historyOfPresentIllness: 'Acute onset productive cough and fever started 3 days ago. Patient is tachypneic.',
      vitals: {
        bp: '110/70',
        pulse: '98',
        temp: '102.1',
        spo2: '88', // Hypoxia documented!
        rr: '28'
      },
      durationOfPresentAilment: '3 days',
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'J18.9',
          icd10Description: 'Pneumonia, unspecified organism',
          probability: 0.95,
          reasoning: 'High fever, hypoxia, and productive cough support pneumonia admission',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0
    },
    admission: {
      admissionType: 'Emergency',
      dateOfAdmission: new Date().toISOString().split('T')[0],
      timeOfAdmission: '10:00',
      roomCategory: 'General Ward',
      expectedLengthOfStay: 5,
      expectedDaysInICU: 0,
      expectedDaysInRoom: 5,
      pastMedicalHistory: {
        diabetes: { present: false },
        hypertension: { present: false },
        heartDisease: { present: false },
        asthma: { present: false },
        epilepsy: { present: false },
        cancer: { present: false },
        kidney: { present: false },
        liver: { present: false },
        hiv: { present: false },
        alcoholism: { present: false },
        smoking: { present: false },
        anyOther: { present: false }
      },
      previousHospitalization: { wasHospitalizedBefore: false }
    },
    ...validDeclarationsAndCosts
  };

  const report3 = await reviewEvidence(sufficientRecord);
  assert(report3.status === 'sufficient', 'Status should be sufficient');
  assert(report3.anticipatedQueries.length === 0, 'Should raise 0 anticipated queries');
  assert(report3.reasoningTrace.some(line => line.includes('Status: "SUFFICIENT"')), 'Reasoning trace should include SUFFICIENT status log');

  console.log('✅ Test 3 Passed: Well-documented case marked sufficient.');

  // =========================================================================
  // TEST case 4: Accident Case without MLC
  // =========================================================================
  console.log('\nRunning Test 4: Accident Case without MLC...');

  const accidentNoMlcRecord: Partial<PreAuthRecord> = {
    ...sufficientRecord,
    id: 'PA-TEST-004',
    clinical: {
      ...sufficientRecord.clinical,
      injuryDetails: {
        isInjury: true,
        isMLC: false, // Accident case, but MLC is false!
        causeOfInjury: 'Self fall from bike',
        dateOfInjury: new Date().toISOString().split('T')[0]
      }
    }
  };

  const report4 = await reviewEvidence(accidentNoMlcRecord);
  assert(report4.status === 'insufficient', 'Accident without MLC should make case insufficient');
  assert(report4.mandatoryGaps.some(g => g.includes('MLC') || g.includes('FIR')), 'MLC gap should be flagged in mandatoryGaps');

  console.log('✅ Test 4 Passed: Accident without MLC flagged deterministically.');

  // =========================================================================
  // TEST case 5: Local LLM Failure and Graceful Degradation
  // =========================================================================
  console.log('\nRunning Test 5: LLM Failure Graceful Degradation...');

  mockLlmFailure();

  const report5 = await reviewEvidence(pneumoniaGapsRecord);
  // Should not crash, and should degrade to rule-based fallback check
  assert(report5.status === 'insufficient', 'Should still be insufficient');
  assert(report5.challengesConsidered.length > 0, 'Challenges list should be populated by fallback');
  assert(report5.reasoningTrace.some(line => line.includes('Ollama') || line.includes('degrad') || line.includes('rules-based')), 'Audit trace should record fallback degradation');

  console.log('✅ Test 5 Passed: Graceful degradation correctly processed local LLM failure.');

  // =========================================================================
  // TEST case 6: ICD-10 Search & Synonym Matches
  // =========================================================================
  console.log('\nRunning Test 6: ICD-10 Search & Synonym Matches...');
  const { lookupICD, validateCode } = await import('../services/icdService');

  // Test synonym lookups
  const miLookup = lookupICD('MI');
  assert(miLookup.length > 0 && miLookup[0].code === 'I21.9' && miLookup[0].matchMethod === 'synonym', 'MI should resolve to I21.9 via synonym');

  const sugarLookup = lookupICD('sugar');
  assert(sugarLookup.length > 0 && sugarLookup[0].code === 'E11.9' && sugarLookup[0].matchMethod === 'synonym', 'sugar should resolve to E11.9 via synonym');

  const highBpLookup = lookupICD('high BP');
  assert(highBpLookup.length > 0 && highBpLookup[0].code === 'I10' && highBpLookup[0].matchMethod === 'synonym', 'high BP should resolve to I10 via synonym');

  // Test contains lookup
  const pneumoniaLookup = lookupICD('pneumonia');
  assert(pneumoniaLookup.length > 0 && pneumoniaLookup.some(c => c.code.startsWith('J18')), 'pneumonia should return J18 codes');

  // Test validation
  assert(validateCode('J18.9') === true, 'J18.9 should be valid');
  assert(validateCode('E11.9') === true, 'E11.9 should be valid');
  assert(validateCode('I10') === true, 'I10 should be valid');
  assert(validateCode('NONSENSE') === false, 'NONSENSE code should be invalid');

  console.log('✅ Test 6 Passed: ICD-10 lookup & synonyms resolve correctly.');

  // =========================================================================
  // TEST case 7: ICD-10 Coding compliance validation in reviewEvidence
  // =========================================================================
  console.log('\nRunning Test 7: ICD-10 Coding Compliance Validation...');
  mockLlmResponse({
    challengesConsidered: [],
    anchors: [],
    discriminators: []
  });

  // 7a. Missing coding
  const missingCodingRecord: Partial<PreAuthRecord> = {
    ...sufficientRecord,
    clinical: {
      ...sufficientRecord.clinical,
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'Pending ICD-10',
          icd10Description: 'Selection required',
          probability: 0.9,
          reasoning: '',
          isSelected: true
        }
      ]
    }
  };
  const codingReport1 = await reviewEvidence(missingCodingRecord);
  assert(codingReport1.status === 'insufficient', 'Missing coding should flag insufficient');
  assert(codingReport1.mandatoryGaps.some(g => g.includes('not coded')), 'Should flag not coded gap');

  // 7b. Invalid coding
  const invalidCodingRecord: Partial<PreAuthRecord> = {
    ...sufficientRecord,
    clinical: {
      ...sufficientRecord.clinical,
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'INVALID-CODE',
          icd10Description: 'Bad description',
          probability: 0.9,
          reasoning: '',
          isSelected: true
        }
      ]
    }
  };
  const codingReport2 = await reviewEvidence(invalidCodingRecord);
  assert(codingReport2.status === 'insufficient', 'Invalid coding should flag insufficient');
  assert(codingReport2.mandatoryGaps.some(g => g.includes('not a valid WHO')), 'Should flag invalid WHO code gap');

  // 7c. Inconsistent category coding (J18 with no respiratory findings)
  const inconsistentCodingRecord: Partial<PreAuthRecord> = {
    ...sufficientRecord,
    clinical: {
      ...sufficientRecord.clinical,
      chiefComplaints: 'Leg fracture after self fall',
      historyOfPresentIllness: 'Patient fell off motorcycle yesterday',
      relevantClinicalFindings: 'Pain and swelling in right tibia',
      diagnoses: [
        {
          diagnosis: 'Pneumonia',
          icd10Code: 'J18.9',
          icd10Description: 'Pneumonia, unspecified organism',
          probability: 0.9,
          reasoning: '',
          isSelected: true
        }
      ]
    }
  };
  const codingReport3 = await reviewEvidence(inconsistentCodingRecord);
  assert(codingReport3.status === 'insufficient', 'Inconsistent coding should flag insufficient');
  assert(codingReport3.mandatoryGaps.some(g => g.includes('category "J18" (Pneumonia) is inconsistent')), 'Should flag inconsistency gap');

  console.log('✅ Test 7 Passed: Coding compliance (missing/invalid/mismatch) correctly verified.');

  // =========================================================================
  // TEST case 8: Deterministic clinical-gap rules validation
  // =========================================================================
  console.log('\nRunning Test 8: Deterministic Clinical-Gap Rules...');

  const tkrCaseRecord: Partial<PreAuthRecord> = {
    ...validDeclarationsAndCosts,
    patient: {
      patientName: 'Jane Doe',
      age: 65,
      gender: 'Female',
      dateOfBirth: '1961-05-15',
      address: '123 Main St, Bangalore',
      uhid: 'UHID-999'
    },
    insurance: {
      policyNumber: 'POL-777',
      insurerName: 'Care Health Insurance',
      tpaName: 'Medi Assist TPA',
      sumInsured: 500000,
      proposerName: 'John Doe',
      insuredName: 'Jane Doe'
    },
    admission: {
      admissionType: 'Planned',
      dateOfAdmission: '2026-07-10',
      expectedDaysInRoom: 4,
      pastMedicalHistory: {
        diabetes: { present: true },
        hypertension: { present: true }
      }
    },
    clinical: {
      durationOfPresentAilment: 'N/A', // Trigger blank duration
      chiefComplaints: 'Severe bilateral knee pain, difficulty walking',
      historyOfPresentIllness: 'Bilateral knee pain for past few years, now severe',
      relevantClinicalFindings: 'Severe crepitus, restricted range of motion in both knees',
      proposedLineOfTreatment: {
        surgical: true,
        medical: false,
        intensiveCare: false,
        investigation: false,
        nonAllopathic: false
      },
      diagnoses: [
        {
          diagnosis: 'Bilateral Knee Osteoarthritis',
          icd10Code: 'M17.0',
          icd10Description: 'Bilateral primary osteoarthritis of knee',
          probability: 0.9,
          reasoning: '',
          isSelected: true
        }
      ]
    },
    costEstimate: {
      totalEstimatedCost: 200000,
      amountClaimedFromInsurer: 180000,
      isPackageRate: false,
      surgeonFee: 0, // Trigger surgical cost implausibility
      otCharges: 0,
      totalImplantsCost: 0
    }
  };

  mockLlmResponse({
    challengesConsidered: [
      'could this be managed as OPD?',
      'could this be a pre-existing condition?',
      'is the stated diagnosis actually supported by the documented findings?'
    ],
    anchors: [
      'Knee radiograph showing joint space narrowing'
    ],
    discriminators: []
  });

  const tkrReport = await reviewEvidence(tkrCaseRecord);
  assert(tkrReport.status === 'insufficient', 'Bilateral TKR case with gaps should be marked insufficient');
  
  // Verify Blank Duration
  const durationFlag = tkrReport.anticipatedQueries.find(q => q.reason.includes('Disease duration not documented'));
  assert(!!durationFlag, 'Should flag Blank Duration query');
  assert(durationFlag?.severity === 'high', 'Blank Duration query must be high severity');
  assert(durationFlag?.source === 'rule', 'Blank Duration query source must be rule');

  // Verify Conservative Management
  const conservativeFlag = tkrReport.anticipatedQueries.find(q => q.reason.includes('No conservative-management history'));
  assert(!!conservativeFlag, 'Should flag Conservative Management query');
  assert(conservativeFlag?.severity === 'high', 'Conservative Management query must be high severity');

  // Verify Bilateral / Same-Sitting
  const bilateralFlag = tkrReport.anticipatedQueries.find(q => q.reason.includes('Bilateral/simultaneous procedure'));
  assert(!!bilateralFlag, 'Should flag Bilateral / Same-Sitting query');
  assert(bilateralFlag?.severity === 'medium', 'Bilateral query must be medium severity');

  // Verify Cost Implausibility
  const costFlag = tkrReport.anticipatedQueries.find(q => q.reason.includes('Cost breakdown implausible'));
  assert(!!costFlag, 'Should flag Cost Implausibility query');
  assert(costFlag?.severity === 'high', 'Cost Implausibility query must be high severity');

  // Verify PED-Prone Comorbidity
  const pedFlag = tkrReport.anticipatedQueries.find(q => q.reason.includes('Diabetes/hypertension/cardiac/renal present with no past-treatment history'));
  assert(!!pedFlag, 'Should flag PED comorbidity query');
  assert(pedFlag?.severity === 'high', 'PED query must be high severity');

  // Verify Policy Checks are present
  assert(!!tkrReport.policyChecks && tkrReport.policyChecks.length === 4, 'Should contain four manual policy checks');
  assert(tkrReport.policyChecks.some(pc => pc.includes('waiting period')), 'Should contain waiting period check');

  console.log('✅ Test 8 Passed: Deterministic clinical-gap rules and policy checks correctly verified.');

  console.log('\n=== Test 9: Hardcoded ICD-10 Source Scanner ===');
  // Scan TS/TSX source files in restricted directories for hardcoded decimal ICD-10 codes.
  // Allowlisted: icdService.ts (defines validator), icd_costs_database.json (data), icd10Codes.json (data)
  const SCAN_DIRS = ['components', 'engine', 'services', 'utils'];
  const ALLOWLISTED_FILES = [
    'icdService.ts',
    'icdSynonymMap.ts',
    'documentRequirements.ts', // Contains non-code example strings in comments
  ];
  const CODE_LITERAL_REGEX = /['"`]([A-Z]\d{2}\.\d{1,4})['"`]/g;

  const rootDir = path.resolve(__dirname, '..');
  let violations: string[] = [];

  function scanDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        if (ALLOWLISTED_FILES.includes(entry.name)) continue;
        const src = fs.readFileSync(full, 'utf-8');
        let m: RegExpExecArray | null;
        while ((m = CODE_LITERAL_REGEX.exec(src)) !== null) {
          const codeStr = m[1];
          // Only flag if it looks like a real ICD-10 code (single letter + 2 digits + dot + 1-4 chars)
          // and is NOT in the WHO table (i.e. it would be an invalid or CM code)
          // Ignore placeholder strings that are obvious non-codes
          if (!validateCode(codeStr)) {
            const rel = path.relative(rootDir, full);
            violations.push(`${rel}: found non-WHO code literal "${codeStr}"`);
          }
        }
      }
    }
  }

  for (const dir of SCAN_DIRS) {
    scanDir(path.join(rootDir, dir));
  }

  if (violations.length > 0) {
    console.error('❌ Test 9 Failed: Hardcoded non-WHO ICD-10 codes found in source:');
    violations.forEach(v => console.error('  ', v));
    process.exit(1);
  }
  console.log('✅ Test 9 Passed: No hardcoded non-WHO ICD-10 literal codes found in source files.');


  console.log('\n=== Test 10: LLM Direct Code Leak Prevention ===');
  // Simulate a raw LLM JSON response containing a US ICD-10-CM code string.
  // assignICDViaModel must NOT return that CM code. It should either:
  //   (a) Return a valid WHO code derived from the description, or
  //   (b) Return an empty array (no candidates found from description).
  // In no case may 'M17.11' appear in the result.
  const { assignICDViaModel } = await import('../services/icdService');

  // Use the proper mock API so ESM read-only modules are not mutated
  llmClient.setMockQuery(async () =>
    JSON.stringify({
      code: 'M17.11',
      description: 'Bilateral primary osteoarthritis knee',
      diagnosis: 'Osteoarthritis of knee, bilateral'
    })
  );

  const leakCandidates = await assignICDViaModel('Bilateral knee osteoarthritis');
  const leakedCode = leakCandidates.find(c => c.code === 'M17.11');
  assert(!leakedCode, 'Test 10: LLM-suggested CM code M17.11 must NOT appear in candidate output');

  // Restore
  llmClient.setMockQuery(null);

  // Additionally verify the WHO equivalent is present if any candidates returned
  if (leakCandidates.length > 0) {
    const allWho = leakCandidates.every(c => validateCode(c.code));
    assert(allWho, 'Test 10: All returned candidates must be valid WHO ICD-10 codes');
  }

  console.log('✅ Test 10 Passed: LLM CM code bypass is blocked; only WHO-validated codes returned.');

  // =========================================================================
  // TEST case 11: Stay Extension & Enhancement Review Engine Validation
  // =========================================================================
  console.log('\nRunning Test 11: Stay Extension & Enhancement Review Engine...');

  llmClient.setMockQuery(async () =>
    JSON.stringify({
      challengesConsidered: ['why is stay extending?', 'does clinical status justify extension?'],
      anchors: ['Slow clinical recovery'],
      discriminators: [
        {
          challenge: 'why is stay extending?',
          evidence: 'Slow clinical recovery',
          reason: 'To prove stay extension necessity.'
        }
      ]
    })
  );

  const testInput: EnhancementInput = {
    originalApprovalRef: 'APP-54321',
    originalApprovedAmount: 200000,
    amountUtilizedToDate: 150000,
    trigger: 'extended_stay',
    additionalAmountRequested: 60000,
    dischargeDelayReasons: ['Slow clinical recovery / ongoing wound care'],
    originalDischargeDate: '2026-06-30',
    newDischargeDate: '2026-07-04',
    currentSeverityScores: {
      phenoIntensity: 7,
      deteriorationVelocity: 6
    }
  };

  const report = await reviewEnhancement(testInput, 'Sepsis secondary to UTI');
  assert(report.status === 'sufficient', 'Test 11: Valid stay extension request must evaluate to sufficient');
  assert(report.gaps.length === 0, 'Test 11: Sufficient case must contain zero deterministic gaps');

  // Verify Audit Logging
  logEvent('CASE-TEST-11', 'enhancement_reviewed', {
    status: report.status,
    gapCount: report.gaps.length,
    insufficientItems: report.insufficientEvidence,
    originalApprovalRef: testInput.originalApprovalRef,
    additionalAmountRequested: testInput.additionalAmountRequested
  });

  const logs = getAllLogs();
  const matchedLogs = logs.filter(l => l.caseId === 'CASE-TEST-11' && l.eventType === 'enhancement_reviewed');
  assert(matchedLogs.length > 0, 'Test 11: Enhancement review event must be audit logged in localStorage');
  assert((matchedLogs[0].payload as any).status === 'sufficient', 'Test 11: Logged payload property status must match sufficient');

  console.log('✅ Test 11 Passed: Stay extension review and complete audit logging validated successfully.');

  llmClient.setMockQuery(null);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
  
  // Reset getReasoning to original
  llmClient.setMockReasoning(null);
}

runTests().catch(err => {
  console.error('❌ Test run failed with error:', err);
  process.exit(1);
});
