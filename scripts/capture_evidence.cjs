const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('[Playwright] Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();

    console.log('[Playwright] Navigating to http://localhost:3000/ ...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Click "Continue as Guest" if present
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
        console.log('[Playwright] Auth Modal detected, clicking "Continue as Guest"...');
        await guestBtn.click();
        await page.waitForTimeout(1500);
    }

    console.log('[Playwright] Checking PreAuthWizard...');
    await page.waitForSelector('text=New Pre-Authorization', { timeout: 10000 });

    // Seed canonical valid record into localStorage & state
    console.log('[Playwright] Seeding pre-auth draft into localStorage...');
    await page.evaluate(() => {
        const validDraft = {
            id: 'PA-AIVANA-TEST-001',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'draft',
            complexity: 'Low',
            complexityReason: 'Standard medical hospitalization case',
            patient: {
                patientName: 'Jane Doe',
                age: 45,
                gender: 'Female',
                mobileNumber: '9876543210',
                city: 'Mumbai',
                state: 'Maharashtra',
                uhid: 'UHID-998877'
            },
            insurance: {
                dataSource: 'manual',
                insurerName: 'Star Health Insurance',
                tpaName: 'Medi Assist TPA',
                policyNumber: 'POL-999888',
                tpaIdCardNumber: 'CARD-112233',
                sumInsured: 500000,
                policyType: 'Individual',
                policyStartDate: '2025-01-01',
                policyEndDate: '2026-12-31'
            },
            clinical: {
                dataSource: 'manual_entry',
                chiefComplaints: 'Severe right lower quadrant abdominal pain for 2 days',
                durationOfPresentAilment: '2 days',
                natureOfIllness: 'Acute',
                historyOfPresentIllness: 'Pain started 48 hrs ago, localized to RIF',
                relevantClinicalFindings: 'Tenderness at McBurney point, fever 101F',
                reasonForHospitalisation: 'Requires emergency appendectomy under general anesthesia.',
                diagnoses: [
                    {
                        diagnosis: 'Acute Appendicitis',
                        icd10Code: 'K35.80',
                        icd10Description: 'Unspecified acute appendicitis',
                        isSelected: true
                    }
                ],
                selectedDiagnosisIndex: 0,
                proposedLineOfTreatment: {
                    medical: false,
                    surgical: true,
                    intensiveCare: false,
                    investigation: false,
                    nonAllopathic: false
                },
                vitals: { bp: '120/80', pulse: '88', temp: '101', spo2: '98', rr: '18' }
            },
            admission: {
                admissionType: 'Emergency',
                dateOfAdmission: '2026-07-20',
                timeOfAdmission: '10:00',
                roomCategory: 'Single Private Room',
                expectedDaysInRoom: 3,
                expectedDaysInICU: 0,
                expectedLengthOfStay: 3,
                pastMedicalHistory: { diabetes: { present: false }, hypertension: { present: false } },
                previousHospitalization: { wasHospitalizedBefore: false }
            },
            costEstimate: {
                roomRentPerDay: 5000,
                expectedRoomDays: 3,
                nursingChargesPerDay: 1000,
                icuChargesPerDay: 0,
                expectedIcuDays: 0,
                otCharges: 25000,
                surgeonFee: 35000,
                anesthetistFee: 10000,
                consultantFee: 5000,
                investigationsEstimate: 12000,
                medicinesEstimate: 15000,
                consumablesEstimate: 8000,
                ambulanceCharges: 2000,
                miscCharges: 2000,
                totalEstimatedCost: 134000,
                isPackageRate: false
            },
            declarations: {
                patient: { signaturePresent: true },
                doctor: { doctorName: 'Dr. A. Sharma', doctorQualification: 'MS General Surgery', doctorRegistrationNumber: 'MCI-554433' },
                hospital: { hospitalSealApplied: true, sealPresent: true }
            },
            uploadedDocuments: []
        };
        localStorage.setItem('aivana_active_preauth_draft', JSON.stringify(validDraft));
        localStorage.setItem('aivana_active_step', '1');
    });

    console.log('[Playwright] Reloading page to hydrate wizard with seeded draft...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const artifactDir = 'C:/Users/sanja/.gemini/antigravity/brain/9c6ac357-688b-47dd-bbc8-1ece3f5c9b95';
    fs.mkdirSync(artifactDir, { recursive: true });

    // Screenshot 1: Step 1 filled with seeded data
    await page.screenshot({ path: path.join(artifactDir, 'evidence_step1_filled.png') });
    console.log('[Playwright] Captured Step 1 screenshot: evidence_step1_filled.png');

    // Get score on Step 1 from Rail
    const railScoreStep1 = await page.locator('text=/ 100').first().evaluate(el => el.parentElement.textContent);
    console.log('[Playwright] Rail Score on Step 1:', railScoreStep1?.trim());

    // Click Step 4 tab directly in header
    console.log('[Playwright] Navigating directly to Step 4 via header tab...');
    const step4Tab = page.locator('button:has-text("Documents & Generate")');
    await step4Tab.click();
    await page.waitForTimeout(1000);

    // Screenshot 2: Step 4 Review & Generate
    await page.screenshot({ path: path.join(artifactDir, 'evidence_step4_review.png') });
    console.log('[Playwright] Captured Step 4 screenshot: evidence_step4_review.png');

    // Screenshot 3: Right Rail Gaps List
    const railElement = page.locator('.space-y-6').last();
    if (await railElement.isVisible()) {
        await railElement.screenshot({ path: path.join(artifactDir, 'evidence_gap_list.png') });
        console.log('[Playwright] Captured Gap List screenshot: evidence_gap_list.png');
    }

    // Extract rendered values on Step 4
    const pageText = await page.innerText('body');
    console.log('[Playwright] Step 4 Full Text Excerpt:', pageText.replace(/\s+/g, ' ').substring(0, 800));

    const hasName = pageText.toLowerCase().includes('jane doe');
    const hasPolicy = pageText.toLowerCase().includes('pol-999888');
    const hasInsurer = pageText.toLowerCase().includes('star health insurance');

    console.log('[Playwright] Step 4 Verified Patient Name (Jane Doe):', hasName ? 'VERIFIED PERSISTED' : 'MISSING');
    console.log('[Playwright] Step 4 Verified Policy Number (POL-999888):', hasPolicy ? 'VERIFIED PERSISTED' : 'MISSING');
    console.log('[Playwright] Step 4 Verified Insurer Name (Star Health Insurance):', hasInsurer ? 'VERIFIED PERSISTED' : 'MISSING');

    // Count gap items in rail vs header count
    const gapHeader = await page.locator('text=What to Fix').first().textContent();
    const gapCards = await page.$$('button:has-text("Step")');
    console.log('[Playwright] Gap Header Text:', gapHeader?.trim());
    console.log('[Playwright] Rendered Gap Cards Count:', gapCards.length);

    // Verify Score Consistency
    const railScoreStep4 = await page.locator('text=/ 100').first().evaluate(el => el.parentElement.textContent);
    console.log('[Playwright] Score on Step 4:', railScoreStep4?.trim());

    // Test page reload score stability
    console.log('[Playwright] Reloading page to verify score stability across page reloads...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const railScoreAfterReload = await page.locator('text=/ 100').first().evaluate(el => el.parentElement.textContent);
    console.log('[Playwright] Score after Page Reload:', railScoreAfterReload?.trim());
    console.log('[Playwright] Score Reload Match:', railScoreStep4?.trim() === railScoreAfterReload?.trim() ? 'CONFIRMED STABLE' : 'MISMATCH');

    await browser.close();
    console.log('[Playwright] Verification complete!');
})();
