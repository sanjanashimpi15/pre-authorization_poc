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

    // If AuthModal is shown, log in or close
    const authInput = await page.$('input[type="email"]');
    if (authInput) {
        console.log('[Playwright] Auth Modal detected, filling guest login...');
        await authInput.fill('guest@aivana.health');
        const passInput = await page.$('input[type="password"]');
        if (passInput) await passInput.fill('guest123');
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) await submitBtn.click();
        await page.waitForTimeout(1500);
    }

    console.log('[Playwright] Checking PreAuthWizard...');
    await page.waitForSelector('text=New Pre-Authorization', { timeout: 10000 });

    // Step 1: Click "Skip Extraction — enter manually instead" or fill fields
    const skipBtn = await page.$('button:has-text("Skip Extraction")');
    if (skipBtn) {
        console.log('[Playwright] Clicking "Skip Extraction — enter manually instead"...');
        await skipBtn.click();
        await page.waitForTimeout(500);
    }

    console.log('[Playwright] Populating Patient & Insurance fields...');
    const nameInput = page.locator('input[placeholder="As on insurance card"]');
    await nameInput.fill('Jane Doe');

    const ageInput = page.locator('input[placeholder="Years"]');
    await ageInput.fill('45');

    const genderSelect = page.locator('select:has-text("Male")');
    await genderSelect.selectOption('Female');

    const phoneInput = page.locator('input[placeholder="+91 XXXXX XXXXX"]');
    await phoneInput.fill('9876543210');

    const cityInput = page.locator('input[class="form-input"]').nth(5);
    if (cityInput) await cityInput.fill('Mumbai');

    const stateSelect = page.locator('select:has-text("Select State")');
    if (stateSelect) await stateSelect.selectOption('Maharashtra');

    const insurerSelect = page.locator('select:has-text("Select Insurance Company")');
    if (insurerSelect) await insurerSelect.selectOption('HealthGuard Insurance');

    const policyInput = page.locator('input[placeholder="POL-XXXXX-XXXX"]');
    if (policyInput) await policyInput.fill('POL-999888');

    const sumInput = page.locator('input[placeholder="500000"]');
    if (sumInput) await sumInput.fill('500000');

    await page.waitForTimeout(500);

    const artifactDir = 'C:/Users/sanja/.gemini/antigravity/brain/9c6ac357-688b-47dd-bbc8-1ece3f5c9b95';
    fs.mkdirSync(artifactDir, { recursive: true });

    // Screenshot 1: Step 1 filled
    await page.screenshot({ path: path.join(artifactDir, 'evidence_step1_filled.png') });
    console.log('[Playwright] Captured Step 1 screenshot: evidence_step1_filled.png');

    // Get score on Step 1 from Rail
    const railScoreStep1 = await page.textContent('.score-circle, div:has-text("/100")');
    console.log('[Playwright] Rail Score on Step 1:', railScoreStep1?.trim());

    // Navigate to Step 2
    console.log('[Playwright] Navigating to Step 2...');
    await page.click('button:has-text("Continue to Clinical Details")');
    await page.waitForTimeout(800);

    // Fill Clinical Details
    const diagnosisInput = page.locator('input[placeholder="e.g. Acute Appendicitis"]');
    if (await diagnosisInput.isVisible()) {
        await diagnosisInput.fill('Acute Appendicitis');
    }
    const complaintsInput = page.locator('textarea[placeholder="Describe chief complaints..."]');
    if (await complaintsInput.isVisible()) {
        await complaintsInput.fill('Severe right lower quadrant abdominal pain for 2 days');
    }

    // Navigate to Step 3
    console.log('[Playwright] Navigating to Step 3...');
    const step2Continue = page.locator('button:has-text("Continue to Admission & Cost")');
    if (await step2Continue.isVisible()) {
        await step2Continue.click();
        await page.waitForTimeout(800);
    }

    // Navigate to Step 4
    console.log('[Playwright] Navigating to Step 4...');
    const step3Continue = page.locator('button:has-text("Continue to Review & Generate")');
    if (await step3Continue.isVisible()) {
        await step3Continue.click();
        await page.waitForTimeout(800);
    }

    // Screenshot 2: Step 4 Review & Generate
    await page.screenshot({ path: path.join(artifactDir, 'evidence_step4_review.png') });
    console.log('[Playwright] Captured Step 4 screenshot: evidence_step4_review.png');

    // Screenshot 3: Right Rail Gaps List
    const railElement = page.locator('.space-y-6').last();
    if (await railElement.isVisible()) {
        await railElement.screenshot({ path: path.join(artifactDir, 'evidence_gap_list.png') });
        console.log('[Playwright] Captured Gap List screenshot: evidence_gap_list.png');
    }

    // Extract rendered values on Step 4 to verify persistence
    const step4PatientName = await page.textContent('text=Jane Doe');
    const step4PolicyNum = await page.textContent('text=POL-999888');
    const step4Insurer = await page.textContent('text=HealthGuard Insurance');
    console.log('[Playwright] Step 4 Verified Patient Name:', step4PatientName ? 'MATCH (Jane Doe)' : 'NOT FOUND');
    console.log('[Playwright] Step 4 Verified Policy Number:', step4PolicyNum ? 'MATCH (POL-999888)' : 'NOT FOUND');
    console.log('[Playwright] Step 4 Verified Insurer Name:', step4Insurer ? 'MATCH (HealthGuard Insurance)' : 'NOT FOUND');

    // Count gap items in rail vs header count
    const gapHeader = await page.textContent('text=/What to Fix/');
    const gapCards = await page.$$('button:has-text("Step")');
    console.log('[Playwright] Gap Header Text:', gapHeader?.trim());
    console.log('[Playwright] Rendered Gap Cards Count:', gapCards.length);

    // Verify Score Consistency
    const railScoreStep4 = await page.locator('text=/100').first().textContent();
    console.log('[Playwright] Score on Step 4:', railScoreStep4?.trim());

    // Test page reload score stability
    console.log('[Playwright] Reloading page to verify score stability across page reloads...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const railScoreAfterReload = await page.locator('text=/100').first().textContent();
    console.log('[Playwright] Score after Page Reload:', railScoreAfterReload?.trim());
    console.log('[Playwright] Score Reload Match:', railScoreStep4?.trim() === railScoreAfterReload?.trim() ? 'CONFIRMED STABLE' : 'MISMATCH');

    await browser.close();
    console.log('[Playwright] Verification complete!');
})();
