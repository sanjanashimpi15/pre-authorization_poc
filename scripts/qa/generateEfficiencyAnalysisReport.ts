/**
 * generateEfficiencyAnalysisReport.ts
 *
 * Standalone script to generate an Insurance Processing Efficiency Analysis report for any case.
 *
 * Usage:
 *   npx tsx scripts/qa/generateEfficiencyAnalysisReport.ts SYN-2024-10-11-PEDS003
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateEfficiencyAnalysis } from '../../utils/insuranceEfficiencyAnalysis';
import { generateSyntheticCase } from './generateCase';
import { computeReadiness } from '../../utils/readinessScore';
import { classifyCaseComplexity } from '../../utils/complexityClassifier';
import { PreAuthRecord } from '../../components/PreAuthWizard/types';

const REGISTRY_PATH  = path.join(process.cwd(), 'logs', 'qa_registry.json');
const SYNTHETIC_DIR  = path.join(process.cwd(), 'logs', 'synthetic_cases');
const EFFICIENCY_DIR = path.join(process.cwd(), 'logs', 'efficiency_reports');

// Ensure directories exist
if (!fs.existsSync(SYNTHETIC_DIR)) fs.mkdirSync(SYNTHETIC_DIR, { recursive: true });
if (!fs.existsSync(EFFICIENCY_DIR)) fs.mkdirSync(EFFICIENCY_DIR, { recursive: true });

function localMapCaseDataToRecord(caseData: any): Partial<PreAuthRecord> {
  const p = caseData.patient;
  const ins = caseData.insurance;
  const admission = caseData.admission;
  const clinical = caseData.clinical;
  const vitals = clinical?.vitals || {};
  const treatment = caseData.proposedTreatment;
  const est = treatment?.expectedCost || {};
  const pmh = clinical?.pasterMedicalHistory || {};
  
  const [icdCode, icdDesc] = (clinical?.provisionalDiagnosis || '').includes(':') 
    ? clinical.provisionalDiagnosis.split(':') 
    : [clinical?.provisionalDiagnosis || '', clinical?.provisionalDiagnosis || ''];

  return {
    id: caseData.caseId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
    version: 1,
    createdBy: 'Internal QA Agent',
    patient: {
      patientName: p?.name || '',
      age: p?.age || 30,
      gender: p?.gender === 'M' ? 'Male' : p?.gender === 'F' ? 'Female' : 'Other',
      mobileNumber: p?.mobileNumber || '9876543210',
      city: p?.address?.split(',')?.[0]?.trim() || 'Mumbai',
      state: p?.address?.split(',')?.[1]?.trim() || 'Maharashtra',
    },
    insurance: {
      insurerName: ins?.insurer || '',
      tpaName: ins?.tpa || '',
      policyNumber: ins?.policyNumber || '',
      policyType: ins?.policyType || 'Individual',
      sumInsured: ins?.sumInsured || 500000,
    },
    clinical: {
      chiefComplaints: clinical?.chiefComplaint || '',
      durationOfPresentAilment: clinical?.durationOfPresentAilment || '3 days',
      natureOfIllness: 'Acute',
      historyOfPresentIllness: clinical?.hpi || '',
      relevantClinicalFindings: clinical?.physicalExamination || '',
      treatmentTakenSoFar: pmh.medications || '',
      vitals: {
        bp: vitals.bp || '120/80',
        pulse: vitals.hr || '80',
        temp: vitals.temp || '98.6',
        spo2: vitals.spo2 || '98',
        rr: vitals.rr || '16',
      },
      diagnoses: [
        {
          diagnosis: icdDesc,
          icd10Code: icdCode,
          icd10Description: icdDesc,
          probability: 1.0,
          reasoning: '',
          isSelected: true
        }
      ],
      selectedDiagnosisIndex: 0,
      proposedLineOfTreatment: {
        medical: treatment?.treatmentLine === 'medical' || treatment?.treatmentLine === 'both',
        surgical: treatment?.treatmentLine === 'surgical' || treatment?.treatmentLine === 'both',
        intensiveCare: (treatment?.icuDays || 0) > 0,
        investigation: false,
        nonAllopathic: false
      },
      reasonForHospitalisation: treatment?.justification || 'Inpatient monitoring required.'
    },
    admission: {
      dateOfAdmission: admission?.admissionDate || new Date().toISOString().split('T')[0],
      timeOfAdmission: '10:00',
      admissionType: admission?.admissionType === 'planned' ? 'Planned' : 'Emergency',
      roomCategory: (treatment?.icuDays || 0) > 0 ? 'ICU' : 'General Ward',
      expectedLengthOfStay: treatment?.expectedStay || 5,
      expectedDaysInICU: treatment?.icuDays || 0,
      expectedDaysInRoom: (treatment?.expectedStay || 5) - (treatment?.icuDays || 0),
      pastMedicalHistory: {
        diabetes: { present: !!pmh.diabetes },
        hypertension: { present: !!pmh.hypertension },
        heartDisease: { present: !!pmh.heartDisease },
        asthma: { present: !!pmh.asthma },
        epilepsy: { present: !!pmh.epilepsy },
        cancer: { present: !!pmh.cancer },
        kidney: { present: !!pmh.chronicKidneyDisease || !!pmh.kidney },
        liver: { present: !!pmh.liver },
        hiv: { present: !!pmh.hiv },
        alcoholism: { present: !!pmh.alcoholism },
        smoking: { present: !!pmh.smoking },
      },
      previousHospitalization: {
        wasHospitalizedBefore: false
      }
    },
    costEstimate: {
      roomRentPerDay: est.roomRent || 2000,
      expectedRoomDays: (treatment?.expectedStay || 5) - (treatment?.icuDays || 0),
      totalRoomCharges: (est.roomRent || 2000) * ((treatment?.expectedStay || 5) - (treatment?.icuDays || 0)),
      icuChargesPerDay: est.icuCharges || 5000,
      expectedIcuDays: treatment?.icuDays || 0,
      totalIcuCharges: (est.icuCharges || 5000) * (treatment?.icuDays || 0),
      otCharges: est.operationTheaterCost || 0,
      surgeonFee: est.surgeonFees || 0,
      anesthetistFee: est.anesthesiaFees || 0,
      consultantFee: est.surgeonFees ? 5000 : 0,
      investigationsEstimate: est.investigations || 0,
      medicinesEstimate: est.medications || 0,
      consumablesEstimate: est.consumables || 0,
      totalEstimatedCost: est.totalEstimate || 0,
      amountClaimedFromInsurer: est.totalEstimate || 0,
      patientResponsibility: 0,
      exceedsSumInsured: false,
      excessAmount: 0,
      implants: [],
      totalImplantsCost: 0,
      ambulanceCharges: 0,
      miscCharges: 0,
      isPackageRate: false
    },
    uploadedDocuments: (caseData.documentation?.documentsUploaded || []).map((docCat: string, idx: number) => ({
      id: `doc-${idx}`,
      fileName: `${docCat}_uploaded.pdf`,
      fileSizeDisplay: '120 KB',
      fileType: 'pdf',
      mimeType: 'application/pdf',
      uploadedAt: new Date().toISOString(),
      base64Data: '',
      documentCategory: docCat as any,
      autoClassified: true,
      isRequired: true
    })),
    declarations: {
      patient: {
        agreedToTerms: true,
        consentForMedicalDataSharing: true,
        agreesToPayNonPayables: true,
        capturedBy: 'Internal QA Agent'
      },
      doctor: {
        doctorId: 'DOC001',
        doctorName: 'Dr. Test Kumar',
        doctorQualification: 'MD',
        doctorRegistrationNumber: admission?.consultantRegistration || 'REG12345',
        registrationCouncil: 'State Medical Council',
        confirmed: true,
        confirmationMethod: 'in_app'
      },
      hospital: {
        authorizedSignatoryName: 'Hospital Director',
        designation: 'Director',
        hospitalSealApplied: true
      }
    }
  };
}

async function run() {
  const caseId = process.argv[2];
  if (!caseId) {
    console.error('❌ Please specify a case ID. Example:');
    console.error('   npx tsx scripts/qa/generateEfficiencyAnalysisReport.ts SYN-2024-10-11-PEDS003');
    process.exit(1);
  }

  const caseFile = path.join(SYNTHETIC_DIR, `${caseId}.json`);
  let caseData: any = null;

  if (fs.existsSync(caseFile)) {
    console.log(`📖 Loading existing case JSON from → ${caseFile}`);
    try {
      caseData = JSON.parse(fs.readFileSync(caseFile, 'utf-8'));
    } catch (e) {
      console.error(`❌ Failed to parse case file: ${caseFile}`, e);
      process.exit(1);
    }
  } else {
    console.log(`🔍 Case JSON not found locally. Searching registry for metadata...`);
    if (!fs.existsSync(REGISTRY_PATH)) {
      console.error(`❌ Registry file not found. Cannot resolve case metadata without registry or case file.`);
      process.exit(1);
    }

    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    const meta = registry.find((r: any) => r.caseId === caseId);

    if (!meta) {
      console.error(`❌ Case ID "${caseId}" not found in registry. Generating a new case on-demand for this ID...`);
      let specialty = 'cardiology';
      let difficulty: "low" | "medium" | "high" = 'medium';

      const parts = caseId.split('-');
      const specPart = parts[parts.length - 1]?.replace(/[0-9]/g, '')?.toLowerCase();
      if (specPart) specialty = specPart;
      if (caseId.includes('LOW')) difficulty = 'low';
      if (caseId.includes('HIGH')) difficulty = 'high';

      console.log(`🎲 Inferred Specialty: ${specialty}, Complexity: ${difficulty}`);
      console.log(`[QA Engine] Calling Gemini to generate on-demand case details...`);
      try {
        caseData = await generateSyntheticCase([], difficulty, specialty);
        caseData.caseId = caseId; // force match requested ID
        fs.writeFileSync(caseFile, JSON.stringify(caseData, null, 2), 'utf-8');
        console.log(`💾 Saved newly generated case JSON → ${caseFile}`);
      } catch (genError) {
        console.error("❌ On-demand Gemini case generation failed:", genError);
        process.exit(1);
      }
    } else {
      console.log(`✅ Found case metadata in registry: Specialty = ${meta.specialty}, Difficulty = ${meta.difficulty}`);
      console.log(`[QA Engine] Calling Gemini to generate case details conforming to registry...`);
      try {
        caseData = await generateSyntheticCase([], meta.difficulty, meta.specialty);
        caseData.caseId = caseId; // force match requested ID
        fs.writeFileSync(caseFile, JSON.stringify(caseData, null, 2), 'utf-8');
        console.log(`💾 Saved newly generated case JSON → ${caseFile}`);
      } catch (genError) {
        console.error("❌ Registry-matched Gemini case generation failed:", genError);
        process.exit(1);
      }
    }
  }

  console.log(`⚙️ Running clinical engine analysis...`);
  const record = localMapCaseDataToRecord(caseData);
  const readiness = computeReadiness(record as PreAuthRecord, null);
  const comp = classifyCaseComplexity(record as PreAuthRecord);

  console.log(`🧠 Generating complete 9-section Efficiency Analysis Report...`);
  try {
    const analysis = await generateEfficiencyAnalysis(caseData, readiness.score, comp.complexity);
    const reportPath = path.join(EFFICIENCY_DIR, `${caseId}.md`);
    fs.writeFileSync(reportPath, analysis.report, 'utf-8');

    console.log('\n' + '═'.repeat(65));
    console.log(analysis.report);
    console.log('═'.repeat(65));
    console.log(`\n🎉 Efficiency Report saved → ${reportPath}`);
  } catch (err) {
    console.error("❌ Failed to generate report:", err);
    process.exit(1);
  }
}

run();
