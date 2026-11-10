import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:8899/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const bytes = new Map();
page.on('response', async (res) => {
  const h = res.headers();
  const len = Number(h['content-length'] ?? 0);
  if (len) bytes.set(new URL(res.url()).pathname, len);
});

await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, longTasks: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.lcp = Math.max(window.__perf.lcp, e.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    window.__perf.longTasks += l.getEntries().length;
  }).observe({ type: 'longtask', buffered: true });
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);

// interaction: toggle
await page.locator('#audit').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.locator('.toggle-btn[data-method="leace"]').click();
await page.waitForTimeout(500);
const dim = await page.evaluate(() => getComputedStyle(document.querySelector('#pass-chart [data-series="0"]')).opacity);
await page.screenshot({ path: 'shots/toggle.png', clip: await page.locator('#pass-chart').boundingBox() });

const perf = await page.evaluate(() => window.__perf);
const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0);
const totalKb = [...bytes.values()].reduce((a, b) => a + b, 0) / 1024;
console.log(JSON.stringify({ fcp: Math.round(fcp), lcp: Math.round(perf.lcp), cls: +perf.cls.toFixed(4), longTasks: perf.longTasks, totalKb: Math.round(totalKb), dimmedOpacity: dim }, null, 2));
console.log('top payloads:', [...bytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${(v / 1024).toFixed(0)} KB ${k}`));

await browser.close();
