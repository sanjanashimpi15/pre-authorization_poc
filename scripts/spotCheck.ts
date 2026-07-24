import { reviewEvidence, checkClinicalPresence } from '../engine/evidenceReview';

// Test Case 1: CKD Dialysis — should NOT fire OPD necessity rule (it's excluded now)
const dialysisCase: any = {
  clinical: {
    diagnoses: [{ diagnosis: 'Chronic Kidney Disease - Maintenance Hemodialysis', icd10Code: 'N18.5' }],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'Scheduled dialysis session',
    historyOfPresentIllness: 'Known CKD stage 5 on twice weekly maintenance hemodialysis.',
    relevantClinicalFindings: 'Patient stable, AV fistula intact.',
    vitals: { bp: '120/80', pulse: '80', temp: '98.6', spo2: '98', rr: '16' },
    reasonForHospitalisation: 'scheduled dialysis'
  },
  admission: { admissionType: 'Planned' }
};

// Test Case 2: Acute Gastroenteritis — SHOULD fire OPD necessity rule
const ageCase: any = {
  clinical: {
    diagnoses: [{ diagnosis: 'Acute Gastroenteritis', icd10Code: 'A09' }],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'Loose stools and vomiting x 2 days',
    historyOfPresentIllness: 'Multiple episodes of watery diarrhea.',
    relevantClinicalFindings: 'Mild dehydration. Vitals stable.',
    vitals: { bp: '110/70', pulse: '88', temp: '98.6', spo2: '99', rr: '16' },
    reasonForHospitalisation: 'Patient wants IV fluids'
  },
  admission: { admissionType: 'Planned' }
};

// Test Case 3: Dengue with Thrombocytopenia — should NOT fire OPD rule (severity markers present)
const dengueCase: any = {
  clinical: {
    diagnoses: [{ diagnosis: 'Dengue Fever', icd10Code: 'A97.0' }],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'High grade fever, body ache for 4 days',
    historyOfPresentIllness: 'Dengue confirmed by NS1 antigen test.',
    relevantClinicalFindings: 'Platelets 52,000. Thrombocytopenia documented. LFTs elevated.',
    vitals: { bp: '100/70', pulse: '98', temp: '101', spo2: '97', rr: '18' },
    reasonForHospitalisation: 'monitoring'
  },
  admission: { admissionType: 'Emergency' }
};

// Test Case 4: Leukocytosis matching
const leukocytosisCase: any = {
  clinical: {
    diagnoses: [{ diagnosis: 'Acute Appendicitis', icd10Code: 'K35.8' }],
    selectedDiagnosisIndex: 0,
    chiefComplaints: 'Severe RIF pain',
    historyOfPresentIllness: 'Acute onset abdominal pain.',
    relevantClinicalFindings: 'Leukocytosis noted. Rebound tenderness at McBurney point.',
    vitals: { bp: '120/80', pulse: '100', temp: '100.4', spo2: '98', rr: '20' }
  },
  admission: { admissionType: 'Emergency' }
};

async function runSpot() {
  console.log('\n===== SPOT CHECK: Bug Fix Verification =====\n');

  const r1 = await reviewEvidence(dialysisCase);
  const hasOPDQueryDialysis = r1.anticipatedQueries.some(q => q.relatedChallenge.includes('OPD'));
  console.log(`✅ CKD Dialysis OPD rule suppressed: ${!hasOPDQueryDialysis ? 'PASS ✅' : 'FAIL ❌'}`);
  
  const r2 = await reviewEvidence(ageCase);
  const hasOPDQueryAGE = r2.anticipatedQueries.some(q => q.relatedChallenge.includes('OPD') && q.severity === 'high');
  console.log(`✅ AGE OPD necessity rule fires: ${hasOPDQueryAGE ? 'PASS ✅' : 'FAIL ❌'}`);

  const r3 = await reviewEvidence(dengueCase);
  const hasOPDQueryDengue = r3.anticipatedQueries.some(q => q.relatedChallenge.includes('OPD') && q.reason.includes('stable'));
  console.log(`✅ Dengue with thrombocytopenia OPD rule suppressed: ${!hasOPDQueryDengue ? 'PASS ✅' : 'FAIL ❌'}`);

  // Test Case 4 (direct unit test): Leukocytosis matching
  // When MedGemma returns "elevated WBC count" as an anchor,
  // checkClinicalPresence must find "Leukocytosis" in narrative as a match.
  const leukocytosisRecord: any = {
    clinical: {
      chiefComplaints: 'Severe RIF pain',
      historyOfPresentIllness: 'Acute onset abdominal pain.',
      relevantClinicalFindings: 'Leukocytosis noted. Rebound tenderness at McBurney point.',
    }
  };
  const leukocytosisPresent = checkClinicalPresence('elevated WBC count', leukocytosisRecord);
  console.log(`✅ Leukocytosis recognized as WBC elevated: ${leukocytosisPresent ? 'PASS ✅' : 'FAIL ❌'}`);

  // Additional unit tests for other synonym fixes
  const menorrhagiaRecord: any = {
    clinical: { chiefComplaints: 'Menorrhagia', historyOfPresentIllness: 'Heavy menstrual bleeding for 6 months.', relevantClinicalFindings: '' }
  };
  const menorrhagiaPresent = checkClinicalPresence('evidence of menorrhagia', menorrhagiaRecord);
  console.log(`✅ Menorrhagia recognized from chief complaint: ${menorrhagiaPresent ? 'PASS ✅' : 'FAIL ❌'}`);

  const tenderRecord: any = {
    clinical: { chiefComplaints: '', historyOfPresentIllness: '', relevantClinicalFindings: 'Abdomen soft but tender.' }
  };
  const tenderPresent = checkClinicalPresence('abdominal examination findings', tenderRecord);
  console.log(`✅ "Abdomen tender" recognized as abdominal exam finding: ${tenderPresent ? 'PASS ✅' : 'FAIL ❌'}`);

  const plateletRecord: any = {
    clinical: { chiefComplaints: '', historyOfPresentIllness: '', relevantClinicalFindings: 'Platelets 52,000. LFTs mildly elevated.' }
  };
  const plateletPresent = checkClinicalPresence('platelet count', plateletRecord);
  console.log(`✅ Numeric platelet count recognized: ${plateletPresent ? 'PASS ✅' : 'FAIL ❌'}`);

  console.log('\n===== AGE Case OPD Query =====');
  r2.anticipatedQueries.filter(q => q.relatedChallenge.includes('OPD')).forEach(q => {
    console.log(`  [${q.severity.toUpperCase()}] ${q.query}`);
  });
}

runSpot().catch(console.error);
