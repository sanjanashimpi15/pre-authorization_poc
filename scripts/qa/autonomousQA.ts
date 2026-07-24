import { chromium } from 'playwright';
import { generateSyntheticCase } from './generateCase';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';

const REGISTRY_PATH = path.join(process.cwd(), 'logs', 'qa_registry.json');
const BUG_LOG_PATH = path.join(process.cwd(), 'logs', 'bugs_discovered.md');
const SCREENSHOT_DIR = path.join(process.cwd(), 'logs', 'screenshots');
const SESSION_LOG_PATH = path.join(process.cwd(), 'logs', 'qa_loop_session.log');

// Ensure directories exist
if (!fs.existsSync(path.dirname(REGISTRY_PATH))) fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let activePort = 3000;

function checkServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function ensureServerRunning() {
  if (await checkServer(3000)) {
      activePort = 3000;
      console.log("[QA Runner] Vite server is already running on port 3000.");
      return null;
  }
  if (await checkServer(3001)) {
      activePort = 3001;
      console.log("[QA Runner] Vite server is already running on port 3001.");
      return null;
  }

  console.log("[QA Runner] Vite server not running. Starting 'npm run dev'...");
  const devServer = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      detached: false,
      stdio: 'ignore'
  });
  
  // Wait for the server to spin up on port 3000 or 3001
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await checkServer(3000)) {
      activePort = 3000;
      console.log("[QA Runner] Vite server is up and listening on port 3000.");
      return devServer;
    }
    if (await checkServer(3001)) {
      activePort = 3001;
      console.log("[QA Runner] Vite server is up and listening on port 3001.");
      return devServer;
    }
  }
  throw new Error("Timeout waiting for Vite dev server to start.");
}

function computeHash(data: any): string {
    const str = JSON.stringify(data);
    return crypto.createHash('md5').update(str).digest('hex');
}

function createDummyFile(category: string): string {
    const tempDir = path.join(process.cwd(), 'temp_docs');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    const filePath = path.join(tempDir, `${category}_doc.pdf`);
    // Tiny valid mock PDF structure
    fs.writeFileSync(filePath, `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 50 >>\nstream\nBT /F1 24 Tf 100 700 Td (Synthetic Document for ${category}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000201 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n301\n%%EOF`);
    return filePath;
}

async function fillInputUnderLabel(page: any, labelText: string, value: string) {
    try {
        const input = page.locator(`xpath=//label[contains(., "${labelText}")]/following-sibling::input`);
        if (await input.isVisible()) {
            await input.fill(value);
            return;
        }
        const datalistInput = page.locator(`xpath=//label[contains(., "${labelText}")]/following-sibling::input[@list]`);
        if (await datalistInput.isVisible()) {
            await datalistInput.fill(value);
        }
    } catch (e) {
        console.warn(`[QA Helper] Failed to fill input for label "${labelText}":`, e);
    }
}

async function fillTextareaUnderLabel(page: any, labelText: string, value: string) {
    try {
        const textarea = page.locator(`xpath=//label[contains(., "${labelText}")]/following-sibling::textarea`);
        if (await textarea.isVisible()) {
            await textarea.fill(value);
        }
    } catch (e) {
        console.warn(`[QA Helper] Failed to fill textarea for label "${labelText}":`, e);
    }
}

async function selectUnderLabel(page: any, labelText: string, value: string) {
    try {
        const select = page.locator(`xpath=//label[contains(., "${labelText}")]/following-sibling::select`);
        if (await select.isVisible()) {
            try {
                await select.selectOption({ label: value });
            } catch {
                await select.selectOption({ value: value });
            }
        }
    } catch (e) {
        console.warn(`[QA Helper] Failed to select option for label "${labelText}":`, e);
    }
}

async function checkCheckboxByText(page: any, labelText: string) {
    try {
        const checkbox = page.locator(`xpath=//label[contains(., "${labelText}")]//input[@type="checkbox"]`);
        if (await checkbox.isVisible()) {
            await checkbox.check();
        }
    } catch (e) {
        console.warn(`[QA Helper] Failed to check checkbox containing text "${labelText}":`, e);
    }
}

const pmhLabels: Record<string, string> = {
  diabetes: 'Diabetes',
  hypertension: 'Hypertension',
  heartDisease: 'Heart Disease',
  asthma: 'Asthma / COPD',
  epilepsy: 'Epilepsy',
  cancer: 'Cancer',
  chronicKidneyDisease: 'Kidney Disease',
  kidney: 'Kidney Disease',
  liver: 'Liver Disease',
  hiv: 'HIV',
  alcoholism: 'Alcoholism',
  smoking: 'Smoking'
};

async function runCase(page: any, caseData: any): Promise<string[]> {
  const bugs: string[] = [];
  const caseId = caseData.caseId;
  const p = caseData.patient;
  const ins = caseData.insurance;
  const admission = caseData.admission;
  const clinical = caseData.clinical;
  const vitals = clinical.vitals;
  const treatment = caseData.proposedTreatment;
  const est = treatment.expectedCost;
  const pmh = clinical.pasterMedicalHistory;
  
  const [icdCode, icdDesc] = clinical.provisionalDiagnosis.includes(':') 
    ? clinical.provisionalDiagnosis.split(':') 
    : [clinical.provisionalDiagnosis, clinical.provisionalDiagnosis];

  // Step 1: Patient and Policy Details
  console.log(`[Case ${caseId}] Filling Step 1: Patient & Policy Details...`);
  await page.click('button:has-text("New Pre-Authorization"), button:has-text("＋ New Pre-Authorization")');
  await page.click('button:has-text("Enter Manually")');
  
  await fillInputUnderLabel(page, 'Full Name', p.name);
  if (p.dob) await fillInputUnderLabel(page, 'Date of Birth', p.dob);
  await fillInputUnderLabel(page, 'Age', String(p.age));
  await selectUnderLabel(page, 'Gender', p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Other');
  await selectUnderLabel(page, 'Marital Status', 'Single');
  await fillInputUnderLabel(page, 'Mobile Number', p.mobileNumber || '9876543210');
  await fillInputUnderLabel(page, 'City', p.address?.split(',')?.[0]?.trim() || 'Mumbai');
  await selectUnderLabel(page, 'State', p.address?.split(',')?.[1]?.trim() || 'Maharashtra');
  
  await fillInputUnderLabel(page, 'Insurance Company', ins.insurer);
  await selectUnderLabel(page, 'TPA Name', ins.tpa);
  await fillInputUnderLabel(page, 'Policy Number', ins.policyNumber);
  await selectUnderLabel(page, 'Policy Type', ins.policyType || 'Individual');
  await fillInputUnderLabel(page, 'Sum Insured', String(ins.sumInsured));
  await selectUnderLabel(page, 'Relationship', 'Self');
  
  await page.click('button:has-text("Continue to Clinical Details")');
  await page.waitForTimeout(500);
  
  // Step 2: Clinical Details
  console.log(`[Case ${caseId}] Filling Step 2: Clinical Details...`);
  await page.click('button:has-text("Enter Manually")');
  
  await fillTextareaUnderLabel(page, 'Chief Complaints', clinical.chiefComplaint);
  await fillInputUnderLabel(page, 'Duration of Present Ailment', clinical.durationOfPresentAilment || '3 days');
  await selectUnderLabel(page, 'Nature of Illness', 'Acute');
  await fillTextareaUnderLabel(page, 'History of Present Illness', clinical.hpi);
  await fillTextareaUnderLabel(page, 'Relevant Clinical Findings', clinical.physicalExamination || '');
  await fillTextareaUnderLabel(page, 'Treatment Taken So Far', pmh.medications || '');
  
  // Vitals
  await fillInputUnderLabel(page, 'B.P. (mmHg)', vitals.bp || '120/80');
  await fillInputUnderLabel(page, 'Pulse (/min)', vitals.hr || '80');
  
  // Convert Temp if in C
  const tempVal = parseFloat(vitals.temp);
  const tempStr = tempVal < 45 ? String((tempVal * 9/5 + 32).toFixed(1)) : vitals.temp;
  await fillInputUnderLabel(page, 'Temp (°F)', tempStr || '98.6');
  await fillInputUnderLabel(page, 'SpO2 (%)', vitals.spo2 || '98');
  await fillInputUnderLabel(page, 'RR (/min)', vitals.rr || '16');
  
  // ICD Search
  console.log(`[Case ${caseId}] Searching for diagnosis: ${icdDesc}`);
  await page.fill('input[placeholder*="Search diagnosis by name or ICD-10 code"]', icdDesc);
  await page.waitForTimeout(1000);
  
  // Click first candidate if any
  const candidate = page.locator('button:has(.bg-blue-500\\/10)').first();
  if (await candidate.isVisible()) {
    await candidate.click();
    await page.waitForTimeout(500);
    
    // Pick the code in the confirmation section if required
    const confirmSectionBtn = page.locator('button:has-text("Confirm Selection")');
    if (await confirmSectionBtn.isVisible()) {
      await confirmSectionBtn.click();
    }
  } else {
    // Try fallback
    const fallbackBtn = page.locator('button:has-text("Ask MedGemma Fallback")');
    if (await fallbackBtn.isVisible()) {
      await fallbackBtn.click();
      await page.waitForTimeout(2000);
      const firstCandidate = page.locator('button:has(.bg-blue-500\\/10)').first();
      if (await firstCandidate.isVisible()) {
        await firstCandidate.click();
      }
    }
  }

  // Confirm selection in the main picker if it is still visible
  const pickerConfirmBtn = page.locator('button:has-text("Confirm Selection")');
  if (await pickerConfirmBtn.isVisible()) {
    await pickerConfirmBtn.click();
  }
  
  // Line of Treatment
  if (treatment.treatmentLine === 'medical' || treatment.treatmentLine === 'both') {
    await page.click('text="Medical Management"');
  }
  if (treatment.treatmentLine === 'surgical' || treatment.treatmentLine === 'both') {
    await page.click('text="Surgical Management"');
  }
  if (treatment.icuDays > 0) {
    await page.click('text="Intensive Care"');
  }
  
  await fillTextareaUnderLabel(page, 'OPD management NOT appropriate', treatment.justification || 'Inpatient monitoring required.');
  
  await page.click('button:has-text("Continue to Admission & Cost")');
  await page.waitForTimeout(500);
  
  // Step 3: Admission & Cost
  console.log(`[Case ${caseId}] Filling Step 3: Admission & Cost...`);
  await selectUnderLabel(page, 'Room Category', 'General Ward');
  await fillInputUnderLabel(page, 'Expected Stay (Days)', String(treatment.expectedStay || 5));
  
  // Past Medical History checks
  if (pmh) {
      for (const [key, value] of Object.entries(pmh)) {
          if (value === true || (value && (value as any).present)) {
              const labelText = pmhLabels[key] || key;
              const checkbox = page.locator(`xpath=//span[contains(text(), "${labelText}")]/preceding-sibling::input`);
              if (await checkbox.isVisible()) {
                  await checkbox.check();
              }
          }
      }
  }
  
  // Cost breakdown estimates
  await fillInputUnderLabel(page, 'Room Rent per Day', String(est.roomRent || 2000));
  await fillInputUnderLabel(page, 'OT Charges', String(est.operationTheaterCost || 0));
  await fillInputUnderLabel(page, 'Surgeon / Professional Fees', String(est.surgeonFees || 0));
  await fillInputUnderLabel(page, 'Anesthetist Fees', String(est.anesthesiaFees || 0));
  await fillInputUnderLabel(page, 'Consultant Fees', String(est.surgeonFees ? 5000 : 0));
  await fillInputUnderLabel(page, 'Investigations', String(est.investigations || 0));
  await fillInputUnderLabel(page, 'Medicines', String(est.medications || 0));
  await fillInputUnderLabel(page, 'Consumables', String(est.consumables || 0));
  await fillInputUnderLabel(page, 'Amount Claimed from Insurer', String(est.totalEstimate || est.totalEstimate));
  
  await page.click('button:has-text("Continue to Upload & Verify")');
  await page.waitForTimeout(1000);
  
  // Step 4: Documents and Preview
  console.log(`[Case ${caseId}] Filling Step 4: Upload & Verify...`);
  
  // Upload documents from expected list
  if (caseData.documentation?.documentsUploaded) {
      for (const docCat of caseData.documentation.documentsUploaded) {
          const docPath = createDummyFile(docCat);
          await page.locator('input[type="file"]').first().setInputFiles(docPath);
          await page.waitForTimeout(3000); // Wait for extraction/categorization to trigger
      }
  }
  
  // Accept AI suggestions
  const acceptAllBtn = page.locator('button:has-text("Accept All")');
  if (await acceptAllBtn.isVisible()) {
      await acceptAllBtn.click();
  }
  
  // Go to declarations tab and complete it
  await page.click('button:has-text("Declarations")');
  await page.waitForTimeout(500);
  
  await checkCheckboxByText(page, 'Patient/attendant has been informed');
  await checkCheckboxByText(page, 'Patient consents to sharing');
  await checkCheckboxByText(page, 'Patient agrees to pay');
  await fillInputUnderLabel(page, 'Captured by', 'Autonomous QA Agent');
  
  await selectUnderLabel(page, 'Select Treating Doctor', 'DOC001');
  await checkCheckboxByText(page, 'Doctor confirms the above');
  await fillInputUnderLabel(page, 'Authorized Signatory', 'QA Supervisor');
  await fillInputUnderLabel(page, 'Designation', 'Lead Auditor');
  await checkCheckboxByText(page, 'Hospital seal will be applied');
  
  // Go to Evidence Review tab and capture readiness score
  await page.click('button:has-text("Evidence Review")');
  await page.waitForTimeout(1000);
  
  // Read readiness score text from persistent rail
  const railScoreText = await page.locator('.tabular-nums').first().innerText();
  const actualScore = parseInt(railScoreText.trim());
  console.log(`[Case ${caseId}] Actual Claims Readiness Score: ${actualScore}% (Expected: ${caseData.groundTruth?.expectedClaimReadinessScore}%)`);
  
  if (Math.abs(actualScore - caseData.groundTruth?.expectedClaimReadinessScore) > 20) {
      bugs.push(`Claim Readiness Score Mismatch. Expected: ${caseData.groundTruth?.expectedClaimReadinessScore}%, Actual: ${actualScore}%`);
  }
  
  // Go to Part C Preview Tab
  await page.click('button:has-text("Part C Preview")');
  await page.waitForTimeout(1000);
  
  // Verify completion status banner
  const submittabilityLabel = await page.locator('text="READY FOR SUBMISSION"').isVisible();
  const expectedComplete = caseData.groundTruth?.expectedValidationErrors?.length === 0;
  if (expectedComplete && !submittabilityLabel) {
      bugs.push(`Form submittability mismatch. Expected READY FOR SUBMISSION, but form is pending/incomplete.`);
  }

  // Go to Step 5: Final Submission Form
  await page.click('button:has-text("Generate Pre-Auth Form")');
  await page.waitForTimeout(1000);
  
  // Confirm submission is possible or check layout
  const previewDocCard = page.locator('text="IRDAI CASHLESS PRE-AUTHORIZATION"');
  if (!(await previewDocCard.isVisible())) {
      bugs.push(`Part C Generation Failure: IRDAI Pre-Auth Form Document preview is not visible on Step 5.`);
  }
  
  // Close the case wizard to return to the dashboard
  await page.click('button:has-text("Save Draft & Exit"), button:has-text("Close")');
  await page.waitForTimeout(500);

  return bugs;
}

const specialties = [
  'cardiology', 'neurology', 'ortho', 'surgery', 'pulmo',
  'nephro', 'ent', 'ophtho', 'obgyn', 'peds',
  'onco', 'icu', 'trauma', 'burns', 'gastro', 'endo', 'infectious'
];

async function startLoop() {
  console.log("🚀 Starting Aivana Autonomous QA System Loop...");
  const devServer = await ensureServerRunning();
  
  // Start Browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture logs/errors
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`Page Uncaught Exception: ${err.message}`);
  });

  let caseCounter = 1;
  
  try {
      while (true) {
          const timestamp = new Date().toISOString();
          const spec = specialties[(caseCounter - 1) % specialties.length];
          
          let difficulty: "low" | "medium" | "high" = "medium";
          if (caseCounter < 5) {
              difficulty = "low";
          } else if (caseCounter < 15) {
              difficulty = "medium";
          } else {
              difficulty = "high";
          }
          
          // Load registry to avoid duplicates
          let registryList: any[] = [];
          if (fs.existsSync(REGISTRY_PATH)) {
              try {
                  registryList = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
              } catch {}
          }
          
          console.log(`\n[${timestamp}] CASE-SYN-${caseCounter} | Status: STARTING`);
          console.log(`[QA Engine] Requesting a unique ${difficulty.toUpperCase()} case for specialty: ${spec}...`);
          
          let caseData: any = null;
          try {
              caseData = await generateSyntheticCase(registryList.slice(-10), difficulty, spec);
          } catch (genError) {
              console.error("[QA Engine] Gemini Generation failed. Retrying in 5 seconds...", genError);
              await new Promise((r) => setTimeout(r, 5000));
              continue;
          }
          
          if (!caseData || !caseData.caseId) {
              console.warn("[QA Engine] Invalid Case JSON returned. Skipping...");
              continue;
          }
          
          const caseHash = computeHash(caseData);
          const isDuplicate = registryList.some(r => r.hash === caseHash || r.caseId === caseData.caseId);
          if (isDuplicate) {
              console.log(`[QA Engine] Duplicate case hash detected for ${caseData.caseId}. Re-generating...`);
              continue;
          }
          
          console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Status: RUNNING`);
          console.log(`[QA Engine] Testing Case ${caseData.caseId} (${caseData.clinical?.provisionalDiagnosis || 'Unknown Diagnosis'})`);
          
          // Perform UI actions
          await page.goto(`http://localhost:${activePort}`);
          await page.waitForLoadState('networkidle');
          
          consoleErrors.length = 0; // Reset errors list
          
          let caseBugs: string[] = [];
          try {
              caseBugs = await runCase(page, caseData);
          } catch (uiError: any) {
              console.error(`[QA Engine] UI flow crashed during execution for Case ${caseData.caseId}:`, uiError.message);
              caseBugs.push(`UI Flow Crash: ${uiError.message}`);
          }
          
          if (consoleErrors.length > 0) {
              caseBugs.push(...consoleErrors.map(err => `Console Error: ${err}`));
          }
          
          const caseStatus = caseBugs.length > 0 ? 'FAILED' : 'PASSED';
          console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Status: ${caseStatus}`);
          console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Readiness Score: ${caseData.groundTruth?.expectedClaimReadinessScore || 0}/100`);
          console.log(`[${new Date().toISOString()}] ${caseData.caseId} | Bugs: ${caseBugs.length}`);
          
          // Handle Bug Discovery
          if (caseBugs.length > 0) {
              const bugId = `BUG-${new Date().toISOString().split('T')[0]}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
              console.log(`❌ [QA Engine] Bug(s) discovered! Logging bug ID: ${bugId}`);
              
              const screenshotPath = path.join(SCREENSHOT_DIR, `${bugId}.png`);
              try {
                  await page.screenshot({ path: screenshotPath });
              } catch (ssError) {
                  console.error("[QA Engine] Could not capture screenshot:", ssError);
              }
              
              const bugEntry = `
## Bug ID: ${bugId}
* **Severity**: High
* **Priority**: High
* **Synthetic Case ID**: ${caseData.caseId}
* **Diagnosis**: ${caseData.clinical?.provisionalDiagnosis}
* **Description**:
${caseBugs.map(b => `  - ${b}`).join('\n')}
* **Reproduction Details**:
  1. Open Aivana pre-authorization wizard.
  2. Input case ${caseData.caseId} details manual path.
  3. Validate expected outputs on Step 4 and Step 5.
* **Expected Result**: Clean compliance scoring, matched document extraction, and zero exceptions.
* **Actual Result**: Gaps or console errors triggered.
* **Screenshot**: ![Screenshot](./screenshots/${bugId}.png)
* **Timestamp**: ${new Date().toISOString()}

---
`;
              fs.appendFileSync(BUG_LOG_PATH, bugEntry, 'utf-8');
          }
          
          // Append to registry
          const registryItem = {
              caseId: caseData.caseId,
              diagnosis: caseData.clinical?.provisionalDiagnosis || 'Unknown',
              specialty: caseData.specialty || spec,
              difficulty: caseData.complexity || difficulty,
              insurer: caseData.insurance?.insurer || 'Unknown',
              tpa: caseData.insurance?.tpa || 'Unknown',
              hash: caseHash,
              testedAt: new Date().toISOString(),
              status: caseBugs.length > 0 ? 'FAIL' : 'PASS',
              bugsLogged: caseBugs.length > 0
          };
          
          registryList.push(registryItem);
          fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registryList, null, 2), 'utf-8');
          
          // Log to session file
          const sessionEntry = `[${new Date().toISOString()}] Case ${caseData.caseId} | Complexity: ${difficulty} | Status: ${caseStatus}\n`;
          fs.appendFileSync(SESSION_LOG_PATH, sessionEntry, 'utf-8');
          
          caseCounter++;
          
          console.log(`[${new Date().toISOString()}] CASE-SYN-${caseCounter} | Session continues...`);
          await new Promise((r) => setTimeout(r, 2000));
      }
  } finally {
      await browser.close();
      if (devServer) {
          console.log("[QA Runner] Shutting down Vite dev server...");
          devServer.kill();
      }
  }
}

// Start Runner
startLoop().catch((err) => {
    console.error("QA Loop Runner encountered a fatal error:", err);
});
