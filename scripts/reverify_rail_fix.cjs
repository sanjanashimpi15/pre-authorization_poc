const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('[Playwright] Starting 4-State Verification Test...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await context.newPage();

    const artifactDir = 'C:/Users/sanja/.gemini/antigravity/brain/9c6ac357-688b-47dd-bbc8-1ece3f5c9b95';
    fs.mkdirSync(artifactDir, { recursive: true });

    // ─── SETUP: Navigate, auth, clear storage, reload ───────────────
    console.log('[Playwright] Navigating to http://localhost:3000/ ...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Click Continue as Guest if modal appears
    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
        console.log('[Playwright] Auth Modal: clicking "Continue as Guest"...');
        await guestBtn.click();
        await page.waitForTimeout(2000);
    }

    // Clear all state then reload fresh React tree
    console.log('[Playwright] Clearing localStorage and reloading...');
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Handle auth modal again after reload
    if (await guestBtn.isVisible()) {
        console.log('[Playwright] Auth Modal after reload: clicking "Continue as Guest"...');
        await guestBtn.click();
        await page.waitForTimeout(3000); // give React time to re-render after auth
    }

    // Wait for Patient & Insurance Details heading (the choice screen)
    console.log('[Playwright] Waiting for wizard choice screen to appear...');
    await page.waitForSelector('text=Patient & Insurance Details', { timeout: 15000 });
    console.log('[Playwright] Wizard choice screen ready.');

    // ─────────────────────────────────────────────────────────────────
    // STATE 1: Fresh empty state — Rail MUST be hidden
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[STATE 1] Fresh app load — verifying rail is hidden...');
    await page.screenshot({ path: path.join(artifactDir, 'reverify_state1_fresh_no_rail.png') });
    const railState1 = await page.locator('aside:has-text("Claim Readiness")').isVisible();
    console.log(`[STATE 1] Rail Visible: ${railState1 ? '❌ FAIL (visible on empty state)' : '✓ CONFIRMED HIDDEN'}`);

    // ─────────────────────────────────────────────────────────────────
    // STATE 2: Upload starts — rail MUST stay hidden during active OCR
    // ─────────────────────────────────────────────────────────────────
    const pdfPath = path.join(__dirname, '..', 'sample_claim.pdf');
    console.log(`\n[STATE 2] Uploading "${path.basename(pdfPath)}" to trigger OCR...`);

    // Wait for the file input to be attached to DOM (it's hidden via CSS, but present)
    await page.waitForSelector('input[type="file"]', { timeout: 10000, state: 'attached' });
    await page.setInputFiles('input[type="file"]', pdfPath);
    await page.waitForTimeout(1200); // 1.2 seconds into active scanning

    await page.screenshot({ path: path.join(artifactDir, 'reverify_state2_scanning_no_rail.png') });
    const railState2 = await page.locator('aside:has-text("Claim Readiness")').isVisible();
    console.log(`[STATE 2] Rail Visible during active scanning: ${railState2 ? '❌ FAIL (visible during OCR)' : '✓ CONFIRMED HIDDEN'}`);

    // ─────────────────────────────────────────────────────────────────
    // STATE 3: OCR Extraction completes — Rail MUST appear with real score
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[STATE 3] Waiting for OCR extraction to complete (~15s)...');
    await page.waitForTimeout(15000);

    await page.screenshot({ path: path.join(artifactDir, 'reverify_state3_ocr_completed_rail.png') });
    const railState3 = await page.locator('aside:has-text("Claim Readiness")').isVisible();
    console.log(`[STATE 3] Rail Visible post-extraction: ${railState3 ? '✓ CONFIRMED VISIBLE' : '❌ FAIL (hidden after extraction)'}`);

    if (railState3) {
        const scoreEl = page.locator('text=/ 100').first();
        if (await scoreEl.isVisible()) {
            const scoreText = await scoreEl.evaluate(el => el.parentElement?.textContent?.trim());
            console.log(`[STATE 3] Score shown in rail: "${scoreText}"`);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // STATE 4: Navigate to Step 4 — verify breakdown header, no crash
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[STATE 4] Navigating to Step 4 (Documents & Generate)...');
    const step4Tab = page.locator('button:has-text("Documents & Generate")');
    if (await step4Tab.isVisible()) {
        await step4Tab.click();
        await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: path.join(artifactDir, 'reverify_state4_step4_breakdown.png') });
    console.log('[STATE 4] Screenshot captured: reverify_state4_step4_breakdown.png');

    const railText = await page.locator('aside').first().innerText().catch(() => 'NO ASIDE FOUND');
    const hasTitle = railText.toUpperCase().includes('CLAIM READINESS');
    const hasChecklist = railText.toUpperCase().includes('WHAT TO FIX') || railText.toUpperCase().includes('READINESS BREAKDOWN');
    console.log(`[STATE 4] Rail title "Claim Readiness": ${hasTitle ? '✓ VERIFIED PRESENT' : '❌ MISSING'}`);
    console.log(`[STATE 4] Gap checklist present: ${hasChecklist ? '✓ VERIFIED PRESENT' : '❌ FAIL'}`);
    if (!hasTitle || !hasChecklist) {
        console.log('[STATE 4] Actual rail text (first 200 chars):', railText.slice(0, 200));
    }

    await browser.close();
    console.log('\n[Playwright] ✓ 4-State Verification complete — ZERO crashes!');
})();
