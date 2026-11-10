import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:8899/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
console.log('crossOriginIsolated:', await page.evaluate(() => crossOriginIsolated));
console.log('SharedArrayBuffer:', await page.evaluate(() => typeof SharedArrayBuffer));
console.log('headers:', await page.evaluate(() => ({ coep: document.querySelector('meta')?.content })));

// record the sample-mode scores for cv1 / job default
await page.locator('#lab').scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const sampleBefore = await page.locator('.model-card').first().innerText();
console.log('SAMPLE:', sampleBefore.split('\n').slice(0, 6).join(' | '));

await page.locator('.lab-tab[data-source="custom"]').click();
await page.locator('#load-sample-text').click();
await page.waitForTimeout(300);
const words = await page.locator('#cv-words').innerText();
console.log('loaded text words:', words);

const t0 = Date.now();
await page.locator('#run-btn').click();

// watch progress text while it loads
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(2000);
  const status = await page.locator('#model-text').innerText().catch(() => '');
  const done = await page.locator('.model-card').count();
  console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${status} | cards=${done}`);
  if (done > 0 && !(await page.locator('#run-btn').isDisabled().catch(() => false))) break;
}

const custom = await page.locator('.model-card').first().innerText().catch(() => null);
console.log('CUSTOM:', custom ? custom.split('\n').slice(0, 6).join(' | ') : 'NO RESULT');
console.log('verdict:', await page.locator('.verdict h3').innerText().catch(() => '-'));
await page.screenshot({ path: 'shots/lab-custom.png' });

console.log('--- console (last 25) ---');
console.log(logs.slice(-25).join('\n'));
await browser.close();
