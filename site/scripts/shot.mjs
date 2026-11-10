import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:8899/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);

const title = await page.title();
const bars = await page.locator('#hero-chart .hero-row').count();
const cells = await page.locator('#pass-chart .chart-cell svg rect').count();
const flips = await page.locator('#flip-chart svg rect').count();
const cats = await page.locator('#category-chart .cat-row').count();
console.log(JSON.stringify({ title, bars, passBars: cells, flipBars: flips, cats }, null, 2));

await page.screenshot({ path: 'shots/hero.png', clip: { x: 0, y: 0, width: 1440, height: 900 } });

await page.locator('#lab').scrollIntoViewIfNeeded();
await page.waitForSelector('.model-card', { timeout: 30000 });
await page.waitForTimeout(600);

const readLab = async () =>
  (await page.locator('.model-card').first().innerText()).split('\n').slice(0, 6).join(' | ');
console.log('default:', await readLab());
console.log('verdict:', await page.locator('.verdict h3').innerText());
console.log('explain:', (await page.locator('.lab-explain p').first().innerText()).slice(0, 220));

// second example, default job
await page.locator('#cv-select').selectOption({ index: 1 });
await page.waitForTimeout(500);
console.log('cv2:', await readLab(), '|', await page.locator('.verdict h3').innerText());

// a different job for cv2
await page.locator('#job-select').selectOption({ index: 6 });
await page.waitForTimeout(500);
console.log('cv2 other job:', await readLab(), '|', await page.locator('.verdict h3').innerText());

await page.locator('#cv-select').selectOption({ index: 0 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/lab.png' });

for (const [name, sel] of [
  ['audit', '#audit'],
  ['pipeline', '#pipeline'],
  ['leace', '#leace'],
  ['data', '#data'],
  ['limits', '#limits'],
]) {
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `shots/${name}.png` });
}

console.log('--- console ---');
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
