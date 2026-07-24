const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('[Playwright] Starting Real PDF OCR & Rail Verification Test...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
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

    console.log('[Playwright] Clearing localStorage & IndexedDB...');
    await page.evaluate(async () => {
        localStorage.clear();
        try { indexedDB.deleteDatabase('aivana_db'); } catch (e) {}
        try { indexedDB.deleteDatabase('AivanaDB'); } catch (e) {}
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    if (await guestBtn.isVisible()) {
        await guestBtn.click();
        await page.waitForTimeout(1000);
    }

    console.log('[Playwright] Checking PreAuthWizard...');
    await page.waitForSelector('text=New Pre-Authorization', { timeout: 10000 });

    const pdfPath = path.join(__dirname, '..', 'sample_claim.pdf');
    console.log(`[Playwright] Uploading real PDF: "${pdfPath}"...`);

    const artifactDir = 'C:/Users/sanja/.gemini/antigravity/brain/9c6ac357-688b-47dd-bbc8-1ece3f5c9b95';
    fs.mkdirSync(artifactDir, { recursive: true });

    // Directly set input files on unconditionally present file input
    await page.setInputFiles('input[type="file"]', pdfPath);
    await page.waitForTimeout(1200); // 1.2 sec into scanning

    // Screenshot 1: Step 1 DURING active OCR scanning (Item 1 requirement)
    await page.screenshot({ path: path.join(artifactDir, 'evidence_step1_scanning_no_rail.png') });
    console.log('[Playwright] Captured Screenshot 1 (Step 1 during active OCR, rail hidden): evidence_step1_scanning_no_rail.png');

    // Verify rail is NOT visible during scanning
    const railVisibleDuringScan = await page.locator('aside:has-text("Claim Readiness")').isVisible();
    console.log('[Playwright] Claim Readiness Rail visible during scanning:', railVisibleDuringScan ? 'FAIL (Rail is visible)' : 'CONFIRMED HIDDEN');

    console.log('[Playwright] Waiting for OCR extraction completion...');
    await page.waitForTimeout(12000);

    // Screenshot 2: Step 1 after OCR extraction finishes
    await page.screenshot({ path: path.join(artifactDir, 'evidence_real_ocr_step1.png') });
    console.log('[Playwright] Captured Step 1 post-extraction screenshot: evidence_real_ocr_step1.png');

    // Navigate to Step 4
    console.log('[Playwright] Navigating to Step 4...');
    const step4Tab = page.locator('button:has-text("Documents & Generate")');
    if (await step4Tab.isVisible()) {
        await step4Tab.click();
        await page.waitForTimeout(1500);
    }

    // Screenshot 3: Step 4 Review & Generate with persistent rail (Item 2 & Item 3 requirement)
    await page.screenshot({ path: path.join(artifactDir, 'evidence_step4_readiness_breakdown.png') });
    console.log('[Playwright] Captured Screenshot 2 (Step 4 post-fix persistent rail): evidence_step4_readiness_breakdown.png');

    // Extract rail header text
    const railHeaderText = await page.innerText('aside');
    const hasNewHeader = railHeaderText.includes('READINESS BREAKDOWN / REQUIRED GAPS TO RESOLVE');
    console.log('[Playwright] Verified New Rail Header (READINESS BREAKDOWN / REQUIRED GAPS TO RESOLVE):', hasNewHeader ? 'VERIFIED PRESENT' : 'MISSING');

    const railScore = await page.locator('text=/ 100').first().evaluate(el => el.parentElement.textContent);
    console.log('[Playwright] Real OCR Readiness Score:', railScore?.trim());

    await browser.close();
    console.log('[Playwright] Verification complete!');
})();
