const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('[Playwright] Starting diagnostic run...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await context.newPage();

    const artifactDir = 'C:/Users/sanja/.gemini/antigravity/brain/9c6ac357-688b-47dd-bbc8-1ece3f5c9b95';
    fs.mkdirSync(artifactDir, { recursive: true });

    console.log('[Playwright] Navigating...');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(artifactDir, 'diag1_initial.png') });

    const guestBtn = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn.isVisible()) {
        console.log('[Playwright] Clicking Continue as Guest...');
        await guestBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(artifactDir, 'diag2_after_guest.png') });
    }

    console.log('[Playwright] Clearing localStorage and reloading...');
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(artifactDir, 'diag3_after_reload.png') });

    const guestBtn2 = page.locator('button:has-text("Continue as Guest")');
    if (await guestBtn2.isVisible()) {
        console.log('[Playwright] Clicking Continue as Guest after reload...');
        await guestBtn2.click();
        await page.waitForTimeout(4000);
        await page.screenshot({ path: path.join(artifactDir, 'diag4_after_guest2.png') });
    }

    // Dump all visible text
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('[Playwright] Page body text (first 800 chars):\n', bodyText.slice(0, 800));

    // Check if any modal or spinner is blocking
    const spinnerVisible = await page.locator('.animate-spin').isVisible();
    console.log('[Playwright] Spinner visible:', spinnerVisible);

    await browser.close();
    console.log('[Playwright] Diagnostic complete.');
})();
