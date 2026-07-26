const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('[Playwright] Starting Diagnosis Resolution Verification Test...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await context.newPage();

    const artifactDir = 'C:/Users/sanja/.gemini/antigravity/brain/9c6ac357-688b-47dd-bbc8-1ece3f5c9b95';
    fs.mkdirSync(artifactDir, { recursive: true });

    // ─── SETUP ───
    console.log('[Playwright] Navigating to http://localhost:3000/ ...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
        console.log('[Playwright] Auth Modal: clicking "Continue as Guest"...');
        await guestBtn.click();
        await page.waitForTimeout(2000);
    }

    console.log('[Playwright] Exposing helper window test function...');
    // We wait until the React app is fully active
    await page.waitForSelector('text=Patient & Insurance Details', { timeout: 15000 });

    const testDiagnoses = [
        "Dengue with Pyrexia",
        "Acute Viral Fever with Dengue",
        "CKD with Anaemia",
        "Type II DM with HTN",
        "Pneumonia" // previously-working simple case
    ];

    console.log('\n[TEST 1] Testing Diagnoses and Layered ICD-10 Resolution...');

    const results = [];
    for (const diagnosis of testDiagnoses) {
        console.log(`\n--------------------------------------------`);
        console.log(`Resolving: "${diagnosis}"`);
        const startTime = Date.now();
        
        // Execute inside the browser context
        const candidates = await page.evaluate(async (dx) => {
            return await window.resolveDiagnosisToIcd(dx, "Clinical context: patient presented with complaints.");
        }, diagnosis);

        const duration1 = Date.now() - startTime;
        console.log(`Resolved in ${duration1}ms`);
        console.log(`Candidates found: ${candidates.length}`);
        candidates.slice(0, 3).forEach((c, idx) => {
            console.log(`  ${idx + 1}. Code: ${c.code} | Desc: ${c.description} | Score: ${Math.round(c.confidenceScore * 100)}% | Method: ${c.matchMethod}`);
        });

        // Test caching: Run the exact same call again
        const cacheStartTime = Date.now();
        const cachedCandidates = await page.evaluate(async (dx) => {
            return await window.resolveDiagnosisToIcd(dx, "Clinical context: patient presented with complaints.");
        }, diagnosis);
        const duration2 = Date.now() - cacheStartTime;
        console.log(`Cached lookup took: ${duration2}ms (Cache HIT: ${duration2 < 15 ? '✓ YES' : '❌ NO'})`);

        const normDetails = await page.evaluate((dx) => {
            return window.getCachedNormalization(dx);
        }, diagnosis);

        console.log(`Normalized primary: "${normDetails?.primary}"`);
        console.log(`Associated terms: [${(normDetails?.associated || []).join(', ')}]`);

        results.push({
            diagnosis,
            candidates,
            duration1,
            duration2,
            cacheHit: duration2 < 20, // Cache hits are usually < 1ms
            primary: normDetails?.primary,
            associated: normDetails?.associated
        });
    }

    console.log('\n============================================');
    console.log('SUMMARY RESULTS:');
    let allPassed = true;
    results.forEach(r => {
        const top = r.candidates[0];
        const topCode = top ? top.code : 'Pending';
        const topScore = top ? Math.round(top.confidenceScore * 100) : 0;
        const pass = r.candidates.length > 0 && r.cacheHit;
        if (!pass) allPassed = false;
        console.log(`${r.diagnosis} => Top Code: ${topCode} (${topScore}%) | Cache HIT: ${r.cacheHit ? '✓ PASS' : '❌ FAIL'}`);
    });

    console.log(`\nOverall Test Status: ${allPassed ? '✓ ALL PASSED' : '❌ SOME FAILED'}`);

    await browser.close();
    process.exit(allPassed ? 0 : 1);
})();
