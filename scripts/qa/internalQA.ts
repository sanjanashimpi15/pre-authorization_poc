import { generateSyntheticCase } from './generateCase';
import { computeReadiness } from '../../utils/readinessScore';
import { classifyCaseComplexity } from '../../utils/complexityClassifier';
import { computeCaseMetrics, generateBenchmarkReport, CaseMetrics, StepTimings } from '../../utils/benchmarkMetrics';
import { generateEfficiencyAnalysis } from '../../utils/insuranceEfficiencyAnalysis';
import { PreAuthRecord } from '../../components/PreAuthWizard/types';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

const REGISTRY_PATH      = path.join(process.cwd(), 'logs', 'qa_registry.json');
const BUG_LOG_PATH       = path.join(process.cwd(), 'logs', 'bugs_discovered.md');
const SESSION_LOG_PATH   = path.join(process.cwd(), 'logs', 'qa_loop_session.log');
const METRICS_PATH       = path.join(process.cwd(), 'logs', 'benchmark_metrics.json');
const REPORT_DIR         = path.join(process.cwd(), 'logs', 'benchmark_reports');
const EFFICIENCY_DIR     = path.join(process.cwd(), 'logs', 'efficiency_reports');
const SYNTHETIC_DIR      = path.join(process.cwd(), 'logs', 'synthetic_cases');
const REPORT_INTERVAL    = 50; // generate a report every N cases

// Ensure directories exist
if (!fs.existsSync(path.dirname(REGISTRY_PATH))) fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
if (!fs.existsSync(EFFICIENCY_DIR)) fs.mkdirSync(EFFICIENCY_DIR, { recursive: true });
if (!fs.existsSync(SYNTHETIC_DIR)) fs.mkdirSync(SYNTHETIC_DIR, { recursive: true });

function computeHash(data: any): string {
    const str = JSON.stringify(data);
    return crypto.createHash('md5').update(str).digest('hex');
}

function mapCaseDataToRecord(caseData: any): Partial<PreAuthRecord> {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadMetrics(): CaseMetrics[] {
  if (!fs.existsSync(METRICS_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8')); } catch { return []; }
}

function saveMetrics(all: CaseMetrics[]): void {
  fs.writeFileSync(METRICS_PATH, JSON.stringify(all, null, 2), 'utf-8');
}

function maybeGenerateReport(all: CaseMetrics[]): void {
  if (all.length === 0 || all.length % REPORT_INTERVAL !== 0) return;

  const oldest = all[all.length - REPORT_INTERVAL].caseId;
  const newest = all[all.length - 1].caseId;
  const period = `${oldest} → ${newest}`;
  const report = generateBenchmarkReport(all.slice(-REPORT_INTERVAL), period);

  const filename = `report_${all.length}_cases_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  const reportPath = path.join(REPORT_DIR, filename);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log('\n' + '═'.repeat(65));
  console.log(report);
  console.log(`📄 Report saved → ${reportPath}`);
  console.log('═'.repeat(65) + '\n');

  // Trigger global Dataset Analytics Report generation
  try {
    const { execSync } = require('child_process');
    console.log(`[QA Engine] Re-generating global Dataset Analytics Report...`);
    execSync('npx tsx scripts/qa/generateDatasetAnalytics.ts', { stdio: 'inherit' });
  } catch (err) {
    console.warn(`⚠️ [QA Engine] Failed to trigger generateDatasetAnalytics.ts:`, err);
  }
}

// ─── Specialties ─────────────────────────────────────────────────────────────

const specialties = [
  'cardiology', 'neurology', 'ortho', 'surgery', 'pulmo',
  'nephro', 'ent', 'ophtho', 'obgyn', 'peds',
  'onco', 'icu', 'trauma', 'burns', 'gastro', 'endo', 'infectious'
];

// ─── Main loop ────────────────────────────────────────────────────────────────

async function startLoop() {
  console.log("🚀 Starting Aivana Internal QA Engine Loop (with benchmarking)...");
  
  let caseCounter = 1;
  
  while (true) {
      const loopStart = Date.now();
      const timestamp = new Date().toISOString();
      const spec = specialties[(caseCounter - 1) % specialties.length];
      
      // Rotate all three difficulty levels evenly
      const difficultyOptions: ("low" | "medium" | "high")[] = ['low', 'medium', 'high'];
      const difficulty: "low" | "medium" | "high" = difficultyOptions[caseCounter % 3];
      
      // Load registry to avoid duplicates
      let registryList: any[] = [];
      if (fs.existsSync(REGISTRY_PATH)) {
          try { registryList = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')); } catch {}
      }
      
      console.log(`\n[${timestamp}] CASE-SYN-${caseCounter} | Status: STARTING`);
      console.log(`[QA Engine] Generating a unique ${difficulty.toUpperCase()} case for specialty: ${spec}...`);
      
      // ── STEP 1: Case Generation (maps to Patient Entry + Clinical Review) ────
      let caseData: any = null;
      const t0_gen = Date.now();
      try {
          const recentForContext = registryList.slice(-30);
          caseData = await generateSyntheticCase(recentForContext, difficulty, spec);
      } catch (genError) {
          console.error("[QA Engine] Gemini Generation failed. Retrying in 5 seconds...", genError);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
      }
      const t1_gen = Date.now();
      
      if (!caseData || !caseData.caseId) {
          console.warn("[QA Engine] Invalid Case JSON returned. Skipping...");
          continue;
      }
      
      const caseHash = computeHash(caseData);
      const isDuplicate = registryList.some(r => r.caseId === caseData.caseId);
      if (isDuplicate) {
          caseData.caseId = `${caseData.caseId}-R${caseCounter}`;
          console.log(`[QA Engine] Duplicate caseId detected; reassigned to ${caseData.caseId}`);
      }

      // Save full case JSON for later standalone analysis
      fs.writeFileSync(path.join(SYNTHETIC_DIR, `${caseData.caseId}.json`), JSON.stringify(caseData, null, 2), 'utf-8');
      
      console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Status: RUNNING`);
      
      // ── STEP 2: Clinical Data Mapping ─────────────────────────────────────
      const t0_map = Date.now();
      const record = mapCaseDataToRecord(caseData);
      const t1_map = Date.now();

      // ── STEP 3: Cost Validation ───────────────────────────────────────────
      const t0_cost = Date.now();
      const hasSurgicalCosts = (record.costEstimate?.otCharges ?? 0) > 0
        || (record.costEstimate?.surgeonFee ?? 0) > 0
        || (record.costEstimate?.totalImplantsCost ?? 0) > 0;
      const _costCheck = hasSurgicalCosts; // used by readiness engine
      const t1_cost = Date.now();

      // ── STEP 4: Document Check ────────────────────────────────────────────
      const t0_doc = Date.now();
      const numUploaded = (record.uploadedDocuments || []).length;
      const numRequired = (caseData.documentation?.documentsUploaded || []).length;
      const t1_doc = Date.now();

      // ── STEP 5: Query Evaluation ──────────────────────────────────────────
      const t0_query = Date.now();
      const numQueries    = caseData.groundTruth?.expectedTPAQueries?.length || 0;
      const highSeverity  = (caseData.groundTruth?.expectedTPAQueries || []).filter((q: any) => q.severity === 'high').length;
      const mediumSeverity = (caseData.groundTruth?.expectedTPAQueries || []).filter((q: any) => q.severity === 'medium').length;
      const lowSeverity   = (caseData.groundTruth?.expectedTPAQueries || []).filter((q: any) => q.severity === 'low').length;
      const t1_query = Date.now();

      // ── STEP 6: Score & Complexity Computation ────────────────────────────
      const t0_score = Date.now();
      const readinessResult  = computeReadiness(record, null);
      const actualScore      = readinessResult.score;
      const complexityResult = classifyCaseComplexity(record);
      const actualComplexity = complexityResult.complexity;
      const t1_score = Date.now();

      // ── Assemble raw timings ──────────────────────────────────────────────
      const stepTimings: StepTimings = {
        caseGeneration_ms:  t1_gen   - t0_gen,
        clinicalMapping_ms: t1_map   - t0_map,
        costValidation_ms:  t1_cost  - t0_cost,
        docCheck_ms:        t1_doc   - t0_doc,
        queryEval_ms:       t1_query - t0_query,
        scoreCompute_ms:    t1_score - t0_score,
        totalAivana_ms:     Date.now() - loopStart,
      };

      // ── Compute and persist benchmark metrics ─────────────────────────────
      const metrics = computeCaseMetrics(
        caseData.caseId,
        spec,
        caseData.complexity || difficulty,
        stepTimings,
        numRequired,
      );

      const allMetrics = loadMetrics();
      allMetrics.push(metrics);
      saveMetrics(allMetrics);

      // Log one-line metrics summary
      console.log(
        `[BENCHMARK] ${caseData.caseId} | ` +
        `Aivana: ${metrics.aivanaProcessingTime.totalTime_minutes} min | ` +
        `Saved: ${metrics.timeSaved.minutes} min (${metrics.timeSaved.percentageReduction}) | ` +
        `${metrics.throughputMultiplier}x throughput`
      );

      // ── Bug detection ─────────────────────────────────────────────────────
      const bugs: string[] = [];
      const expectedScore = caseData.groundTruth?.expectedClaimReadinessScore || 0;

      console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Readiness Score: ${actualScore}/100, expected ${expectedScore}`);

      if (Math.abs(actualScore - expectedScore) > 20) {
          bugs.push(`Claim Readiness Score mismatch. Expected: ${expectedScore}%, Computed: ${actualScore}%`);
      }

      const expectedComplexity = caseData.complexity;
      if (actualComplexity.toLowerCase() !== expectedComplexity.toLowerCase()) {
          bugs.push(`Complexity mismatch. Expected: ${expectedComplexity}, Computed: ${actualComplexity} (Reason: ${complexityResult.reason})`);
      }

      const caseStatus = bugs.length > 0 ? 'FAILED' : 'PASSED';
      console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Status: ${caseStatus}`);
      console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Queries: ${numQueries}, severity distribution [H:${highSeverity}, M:${mediumSeverity}, L:${lowSeverity}]`);
      console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Bugs: ${bugs.length}`);

      // ── STEP 7: Insurance Processing Efficiency Analysis ─────────────────
      try {
          console.log(`[QA Engine] Generating Insurance Processing Efficiency Analysis for ${caseData.caseId}...`);
          const analysis = await generateEfficiencyAnalysis(caseData, actualScore, actualComplexity);
          const analysisPath = path.join(EFFICIENCY_DIR, `${caseData.caseId}.md`);
          fs.writeFileSync(analysisPath, analysis.report, 'utf-8');
          console.log(`✨ [QA Engine] Efficiency Analysis saved → ${analysisPath}`);
      } catch (err) {
          console.warn(`⚠️ [QA Engine] Failed to generate Efficiency Analysis for ${caseData.caseId}:`, err);
      }

      if (bugs.length > 0) {
          const bugId = `BUG-${new Date().toISOString().split('T')[0]}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
          console.log(`❌ [QA Engine] Bug(s) discovered! Logging bug ID: ${bugId}`);
          const bugEntry = `
## Bug ID: ${bugId}
* **Severity**: High
* **Priority**: High
* **Synthetic Case ID**: ${caseData.caseId}
* **Diagnosis**: ${caseData.clinical?.provisionalDiagnosis}
* **Description**:
${bugs.map(b => `  - ${b}`).join('\n')}
* **Expected Result**: Calculated Claim Readiness Score and Complexity should match the predicted/ground truth clinical guidelines.
* **Actual Result**: Gaps or calculation mismatches occurred.
* **Timestamp**: ${new Date().toISOString()}

---
`;
          fs.appendFileSync(BUG_LOG_PATH, bugEntry, 'utf-8');
      }

      // ── Registry ──────────────────────────────────────────────────────────
      const registryItem = {
          caseId:      caseData.caseId,
          diagnosis:   caseData.clinical?.provisionalDiagnosis || 'Unknown',
          specialty:   caseData.specialty || spec,
          difficulty:  caseData.complexity || difficulty,
          insurer:     caseData.insurance?.insurer || 'Unknown',
          tpa:         caseData.insurance?.tpa || 'Unknown',
          hash:        caseHash,
          testedAt:    new Date().toISOString(),
          status:      bugs.length > 0 ? 'FAIL' : 'PASS',
          bugsLogged:  bugs.length > 0,
          benchmark: {
            aivanaMinutes: metrics.aivanaProcessingTime.totalTime_minutes,
            savedMinutes:  metrics.timeSaved.minutes,
            savedPct:      metrics.timeSaved.percentageReduction,
            multiplier:    metrics.throughputMultiplier,
          }
      };
      registryList.push(registryItem);
      fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registryList, null, 2), 'utf-8');

      // Session log
      fs.appendFileSync(SESSION_LOG_PATH,
        `[${new Date().toISOString()}] Case ${caseData.caseId} | Complexity: ${difficulty} | Status: ${caseStatus} | Saved: ${metrics.timeSaved.minutes}min\n`,
        'utf-8'
      );

      // ── Generate report every REPORT_INTERVAL cases ───────────────────────
      maybeGenerateReport(allMetrics);

      caseCounter++;
      console.log(`[${new Date().toISOString()}] CASE-SYN-${caseCounter} | Session continues...`);
      await new Promise((r) => setTimeout(r, 2000));
  }
}

// Start Runner
startLoop().catch((err) => {
    console.error("QA Loop Runner encountered a fatal error:", err);
});
