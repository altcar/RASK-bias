import { chromium } from 'playwright';

const url = process.env.URL ?? 'https://rask-bias.hheylau.workers.dev/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const failed = [];
const errors = [];
const sizes = new Map();
page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', async (res) => {
  const len = Number(res.headers()['content-length'] ?? 0);
  if (len) sizes.set(new URL(res.url()).pathname, len);
});

await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = Math.max(window.__perf.lcp, e.startTime); })
    .observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true });
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1000);

const checks = {
  sections: await page.locator('main > section').count(),
  heroBars: await page.locator('#hero-chart .hero-row').count(),
  passCells: await page.locator('#pass-chart .chart-cell').count(),
  passBars: await page.locator('#pass-chart svg rect').count(),
  flipBars: await page.locator('#flip-chart svg rect').count(),
  cats: await page.locator('#category-chart .cat-row').count(),
  cues: await page.locator('#cue-list li').count(),
  eduRows: await page.locator('#edu-chart .stat-row').count(),
  countryRows: await page.locator('#country-chart .stat-row').count(),
};

await page.locator('#lab').scrollIntoViewIfNeeded();
await page.waitForSelector('.model-card', { timeout: 30000 });
await page.waitForTimeout(500);

const lab = {
  cvOptions: await page.locator('#cv-select option').count(),
  jobOptions: await page.locator('#job-select option').count(),
  verdict: await page.locator('.verdict h3').innerText(),
  before: (await page.locator('.model-card').first().innerText()).split('\n').slice(3, 5).join(' '),
};

// walk every sample CV + default job and check it produces a result
const verdicts = [];
for (let i = 0; i < lab.cvOptions; i++) {
  await page.locator('#cv-select').selectOption({ index: i });
  await page.waitForTimeout(180);
  verdicts.push(`${i + 1}: ${(await page.locator('.verdict h3').innerText()).slice(0, 46)}`);
}

// live model, twice (second run should hit the cache)
await page.locator('.lab-tab[data-source="custom"]').click();
await page.locator('#load-sample-text').click();
const t1 = Date.now();
await page.locator('#run-btn').click();
await page.waitForFunction(() => document.querySelectorAll('.model-card').length > 0 && !document.querySelector('#run-btn').disabled, null, { timeout: 180000 });
const first = ((Date.now() - t1) / 1000).toFixed(1);
const liveScore = (await page.locator('.model-card').first().innerText()).split('\n')[3];
const r1 = await page.locator('#run-btn').click().catch(() => {});
const t2 = Date.now();
await page.waitForFunction(() => !document.querySelector('#run-btn').disabled, null, { timeout: 180000 });
const second = ((Date.now() - t2) / 1000).toFixed(1);

const perf = await page.evaluate(() => window.__perf);
const totalMb = [...sizes.values()].reduce((a, b) => a + b, 0) / 1e6;

console.log(JSON.stringify({ checks, lab, verdicts, live: { firstRunSeconds: first, secondRunSeconds: second, liveScore }, perf: { lcp: Math.round(perf.lcp), cls: +perf.cls.toFixed(4) }, initialTransferMb: +totalMb.toFixed(1), failed, errors }, null, 2));
await browser.close();
