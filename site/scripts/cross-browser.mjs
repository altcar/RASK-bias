// Cross-browser smoke test: sample lab + live in-browser model.
import { webkit, firefox } from 'playwright';

const url = process.env.URL ?? 'https://rask-bias.hheylau.workers.dev/';

for (const [name, type] of [['webkit', webkit], ['firefox', firefox]]) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  const iso = await page.evaluate(() => crossOriginIsolated);
  await page.locator('#lab').scrollIntoViewIfNeeded();
  await page.waitForSelector('.model-card', { timeout: 60000 });
  const verdict = await page.locator('.verdict h3').innerText();

  // live model
  await page.locator('.lab-tab[data-source="custom"]').click();
  await page.locator('#load-sample-text').click();
  await page.locator('#run-btn').click();
  let live = 'timeout';
  try {
    await page.waitForFunction(
      () => !document.querySelector('#run-btn').disabled && document.querySelectorAll('.model-card').length > 0,
      null,
      { timeout: 240000 },
    );
    live = (await page.locator('.model-card').first().innerText()).split('\n')[3];
  } catch {}

  console.log(JSON.stringify({ browser: name, crossOriginIsolated: iso, verdict: verdict.slice(0, 40), live, seconds: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 4) }));
  await browser.close();
}
