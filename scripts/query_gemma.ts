import { getReasoningFromMedGemma } from '../services/llmClient';

async function run() {
  console.log('--- STARTING GEMMA QUERIES ---');

  // Case A: Diabetes Hero Case
  const caseA = {
    diagnosis: "Type 2 diabetes mellitus with hyperglycemia",
    admissionType: "Emergency",
    narrative: "Patient: Anil Kankriya, 58 year old male. Policy Number: POL-992384, TPA Name: Medi Assist. Date of Admission: 2026-06-30. Room Category: General Ward. Total estimated cost: ₹45,000, amount claimed: ₹40,000. Doctor Name: Dr. Ramesh Kumar, Registration Number: MCI-12345. Clinical findings: Anil Kankriya presented with high blood sugar levels. Vitals: BP 130/85 mmHg, Pulse 76 bpm, Temp 98.6°F, SpO2 98%, RR 18. Patient complains of polyuria and polydipsia. Blood sugar values: fasting blood glucose is 280 mg/dL and post-prandial blood glucose is 380 mg/dL. He has been advised admission for emergency glycemic control and stabilization of blood glucose levels."
  };

  // Case B: Thin Pneumonia Case
  const caseB = {
    diagnosis: "Community-acquired pneumonia",
    admissionType: "Emergency",
    narrative: "Patient has cough and high fever. Cough and high fever noticed recently. Chest crackles present."
  };

  // Case C: Sufficient Appendicitis Case
  const caseC = {
    diagnosis: "Acute appendicitis",
    admissionType: "Planned",
    narrative: "28M, 18h RLQ pain, migratory, fever 38.4, WBC 14.2, USG shows non-compressible appendix 9mm with periappendiceal fluid. Surgeon: laparoscopic appendectomy advised."
  };

  try {
    console.log('Querying Case A (Diabetes)...');
    const resA = await getReasoningFromMedGemma(caseA.diagnosis, caseA.admissionType, caseA.narrative);
    console.log('CASE_A_RESULT:', JSON.stringify(resA));
  } catch (err: any) {
    console.error('Case A failed:', err.message);
  }

  try {
    console.log('Querying Case B (Pneumonia)...');
    const resB = await getReasoningFromMedGemma(caseB.diagnosis, caseB.admissionType, caseB.narrative);
    console.log('CASE_B_RESULT:', JSON.stringify(resB));
  } catch (err: any) {
    console.error('Case B failed:', err.message);
  }

  try {
    console.log('Querying Case C (Appendicitis)...');
    const resC = await getReasoningFromMedGemma(caseC.diagnosis, caseC.admissionType, caseC.narrative);
    console.log('CASE_C_RESULT:', JSON.stringify(resC));
  } catch (err: any) {
    console.error('Case C failed:', err.message);
  }

  console.log('--- GEMMA QUERIES COMPLETED ---');
}

run();
