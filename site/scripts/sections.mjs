import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://127.0.0.1:8899/';
const width = Number(process.env.W ?? 1440);
const tag = process.env.TAG ?? 'desk';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(500);

// reveal everything
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(1200);

for (const [name, sel] of [
  ['hero', '#top'],
  ['audit', '#audit'],
  ['pipeline', '#pipeline'],
  ['leace', '#leace'],
  ['lab', '#lab'],
  ['data', '#data'],
  ['limits', '#limits'],
  ['footer', 'footer.footer'],
]) {
  const el = page.locator(sel);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await el.screenshot({ path: `shots/${tag}-${name}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
