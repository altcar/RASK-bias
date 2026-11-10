// RASK-bias — page logic: charts, reveal, and the bias lab.
import { normalize, applyLeace, dot } from '/shared/pipeline.js';
import { twinSpecs, educationLevel, countriesMentioned, EDU_LEVELS } from '/shared/attributes.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nf = (x, d = 3) => Number(x).toFixed(d);
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const PALETTE = { bias: '#c2452a', fair: '#0e6b58', ink: '#15160f', muted: '#62635a', faint: '#8f8d81', line: '#ded7c6' };

document.documentElement.classList.add('js');

// ------------------------------------------------------------------ nav + reveal
const nav = $('#nav');
const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
onScroll();
addEventListener('scroll', onScroll, { passive: true });

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
);
$$('.reveal').forEach((el) => io.observe(el));
// Safety net: never leave content hidden if observation misbehaves.
setTimeout(() => $$('.reveal:not(.is-in)').forEach((el) => el.classList.add('is-in')), 4000);

// ------------------------------------------------------------------------ svg helpers
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}
function svgRoot(container, w, h) {
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', role: 'img', style: `height:auto` });
  container.appendChild(root);
  return root;
}
function text(parent, x, y, str, cls, anchor = 'start') {
  const t = svg('text', { x, y, class: cls, 'text-anchor': anchor }, parent);
  t.textContent = str;
  return t;
}

/**
 * Horizontal bar chart: rows are labels, each row can carry 1..n series bars.
 */
function barChart(container, { rows, max, series, width = 420, valueFormat = (v) => nf(v, 1), axisFormat, ticks = 4, title, labelMode = 'bar' }) {
  const labelW = 96;
  const valueW = 52;
  const rowH = series.length > 1 ? 40 : 30;
  const barH = series.length > 1 ? 13 : 16;
  const gap = series.length > 1 ? 4 : 0;
  const top = 6;
  const axisH = 20;
  const plotW = width - labelW - valueW;
  const height = top + rows.length * rowH + axisH;
  const root = svgRoot(container, width, height);
  if (title) root.setAttribute('aria-label', title);
  const zeroY = (r) => top + r * rowH;
  const fmtAxis = axisFormat ?? valueFormat;

  // grid + axis
  for (let t = 0; t <= ticks; t++) {
    const v = (max * t) / ticks;
    const x = labelW + (plotW * t) / ticks;
    svg('line', { x1: x, x2: x, y1: top, y2: height - axisH, class: t === 0 ? 'axis-line' : 'grid-line' }, root);
    text(root, x, height - 6, fmtAxis(v), 'axis-label', t === 0 ? 'start' : 'middle');
  }

  rows.forEach((row, r) => {
    const y0 = zeroY(r);
    const label = svg('text', { x: 0, y: y0 + rowH / 2 + (series.length > 1 ? -6 : 4), class: 'value-label' }, root);
    label.textContent = row.label;
    if (row.sub) {
      const s = svg('text', { x: 0, y: y0 + rowH / 2 + (series.length > 1 ? 8 : 16), class: 'axis-label' }, root);
      s.textContent = row.sub;
    }
    series.forEach((s, si) => {
      const v = row.values[si];
      const w = Math.max(0, (plotW * v) / max);
      const y = y0 + (rowH - series.length * barH - (series.length - 1) * gap) / 2 + si * (barH + gap);
      const bar = svg('rect', { x: labelW, y, width: 0, height: barH, rx: 2, class: s.className ?? 'bar-bias', 'data-series': si }, root);
      const t = svg('title', {}, bar);
      t.textContent = `${row.label} · ${s.name}: ${valueFormat(v)}`;
      requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('width', w)));
      const labelX = labelMode === 'fixed' ? labelW + plotW + 6 : labelW + w + 6;
      const val = text(root, labelX, y + barH - 2.5, valueFormat(v), 'value-label');
      val.setAttribute('data-series', si);
    });
  });
  return root;
}

// ------------------------------------------------------------------ chart: hero
function renderHero(hero, jobs) {
  const el = $('#hero-chart');
  if (!el) return;
  el.innerHTML = '';
  const job = jobs?.find((j) => j.i === hero.job);
  const regions = ['US', 'UK/Europe', 'Asia'];
  const twinIdx = { US: [1, 2], 'UK/Europe': [3, 4], Asia: [5, 6] };
  const mean = (arr, ids) => ids.reduce((a, i) => a + arr[i], 0) / ids.length;
  const lo = 0.38;
  const hi = 0.52;
  const scale = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;

  const head = document.createElement('div');
  head.className = 'hero-chart-head';
  head.innerHTML = `<span>CV as written <b>${esc(hero.category.replace(/-/g, ' ').toLowerCase())}</b></span><span>${esc(job ? job.title : 'own-category job')}</span>`;
  el.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'hero-rows';
  grid.innerHTML = `<div class="hero-col-head"></div>
    <div class="hero-col-head">Original</div>
    <div class="hero-col-head">After LEACE</div>`;
  for (const region of regions) {
    const b = mean(hero.before, twinIdx[region]);
    const a = mean(hero.after, twinIdx[region]);
    const row = document.createElement('div');
    row.className = 'hero-row';
    row.innerHTML = `
      <div class="hero-region">${region === 'UK/Europe' ? 'UK / EU' : region}<span>address</span></div>
      <div class="hero-cell">
        <div class="hero-track" aria-hidden="true">
          <i class="hero-bar bar-b" style="width:${scale(b)}"></i>
          <u class="hero-thr" style="left:${scale(0.4357)}"></u>
        </div>
        <div class="hero-val ${b >= 0.4357 ? 'v-pass' : 'v-fail'}"><span>${nf(b, 3)}</span><em>${b >= 0.4357 ? 'PASS' : 'FAIL'}</em></div>
      </div>
      <div class="hero-cell">
        <div class="hero-track" aria-hidden="true">
          <i class="hero-bar bar-f" style="width:${scale(a)}"></i>
          <u class="hero-thr" style="left:${scale(0.4182)}"></u>
        </div>
        <div class="hero-val ${a >= 0.4182 ? 'v-pass' : 'v-fail'}"><span>${nf(a, 3)}</span><em>${a >= 0.4182 ? 'PASS' : 'FAIL'}</em></div>
      </div>`;
    grid.appendChild(row);
  }
  el.appendChild(grid);
  const gapB = mean(hero.before, twinIdx.US) - mean(hero.before, twinIdx.Asia);
  const gapA = mean(hero.after, twinIdx.US) - mean(hero.after, twinIdx.Asia);
  const foot = document.createElement('p');
  foot.className = 'hero-gap';
  foot.innerHTML = `US − Asia gap <b>${nf(gapB, 3)}</b> → <b>${nf(gapA, 3)}</b><span>dashed tick = that model's pass mark</span>`;
  el.appendChild(foot);
}

// ------------------------------------------------------------- chart: pass rates
function renderPassRates(audit) {
  const container = $('#pass-chart');
  if (!container) return;
  const attrs = [
    { key: 'gender', title: 'Gender', order: ['Female', 'Male'], ref: 'Male', sub: 'name + pronoun' },
    { key: 'location', title: 'Location', order: ['US', 'UK/Europe', 'Asia'], ref: 'US', sub: 'address' },
    { key: 'education', title: 'Education', order: ['Associate', 'Bachelor', 'Master'], ref: 'Master', sub: 'degree level' },
  ];
  container.innerHTML = '';
  attrs.forEach((attr) => {
    const cell = document.createElement('div');
    cell.className = 'chart-cell';
    cell.innerHTML = `<h4>${attr.title}<span>${attr.sub}</span></h4>`;
    container.appendChild(cell);
    const rows = attr.order.map((g) => ({
      label: g === 'UK/Europe' ? 'UK/EU' : g,
      sub: g === attr.ref ? 'reference' : undefined,
      values: [100 * audit.biased[attr.key].pass_rate[g], 100 * audit.leace[attr.key].pass_rate[g]],
    }));
    barChart(cell, {
      rows,
      max: 70,
      width: 340,
      ticks: 2,
      valueFormat: (v) => `${v.toFixed(1)}%`,
      axisFormat: (v) => `${v.toFixed(0)}%`,
      series: [
        { name: 'Original', className: 'bar-bias' },
        { name: 'After LEACE', className: 'bar-fair' },
      ],
      title: `Pass rate by ${attr.title}`,
    });
  });
}

// Focus the comparison on one model without hiding the other: the unused series fades.
function bindMethodToggle() {
  const chart = $('#pass-chart');
  if (!chart) return;
  $$('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.toggle-btn').forEach((b) => {
        b.classList.toggle('is-on', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      chart.dataset.method = btn.dataset.method;
    });
  });
}

// ------------------------------------------------------------------- chart: flips
function renderFlips(audit) {
  const container = $('#flip-chart');
  if (!container) return;
  const attrs = [
    ['gender', 'Gender'],
    ['location', 'Location'],
    ['education', 'Education'],
  ];
  container.innerHTML = '';
  const width = 460;
  const root = barChart(container, {
    width,
    max: 16,
    ticks: 4,
    valueFormat: (v) => `${v.toFixed(1)}%`,
    axisFormat: (v) => `${v.toFixed(0)}%`,
    labelMode: 'fixed',
    rows: attrs.map(([k, label]) => ({
      label,
      values: [100 * audit.biased[k].flip_rate, 100 * audit.leace[k].flip_rate],
    })),
    series: [
      { name: 'Original', className: 'bar-bias' },
      { name: 'After LEACE', className: 'bar-fair' },
    ],
    title: 'Decision flip rate by attribute',
  });
  // 1% tolerance line (the foot text explains it; no inline label to avoid crowding)
  const labelW = 96;
  const valueW = 52;
  const plotW = width - labelW - valueW;
  const x = labelW + (plotW * 1) / 16;
  svg('line', { x1: x, x2: x, y1: 2, y2: 3 * 40 + 6, stroke: PALETTE.ink, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.65 }, root);
}

// ------------------------------------------------------------------- chart: gaps
function renderGaps(audit) {
  const container = $('#gap-chart');
  if (!container) return;
  container.innerHTML = '';
  const width = 460;
  const labelW = 112;
  const valueW = 46;
  const plotW = width - labelW - valueW;
  const rows = [];
  for (const g of ['Asia', 'UK/Europe']) {
    for (const [method, name] of [['biased', 'Original'], ['leace', 'LEACE']]) {
      const d = audit[method].location['score_gap_vs_US'][g];
      rows.push({ g: g === 'UK/Europe' ? 'UK/EU' : g, name, method, ...d });
    }
  }
  const lo = -0.04;
  const hi = 0.004;
  const x = (v) => labelW + ((v - lo) / (hi - lo)) * plotW;
  const rowH = 44;
  const height = rows.length * rowH + 26;
  const root = svgRoot(container, width, height);
  root.setAttribute('aria-label', 'Location score gap versus US');

  for (const t of [-0.04, -0.03, -0.02, -0.01, 0]) {
    svg('line', { x1: x(t), x2: x(t), y1: 4, y2: height - 22, class: t === 0 ? 'axis-line' : 'grid-line' }, root);
    text(root, x(t), height - 6, t.toFixed(2), 'axis-label', t === 0 ? 'end' : 'middle');
  }

  rows.forEach((r, i) => {
    const y = 12 + i * rowH;
    const color = r.method === 'biased' ? PALETTE.bias : PALETTE.fair;
    const label = svg('text', { x: 0, y: y + 9, class: 'value-label' }, root);
    label.textContent = `${r.g} vs US`;
    const sub = svg('text', { x: 0, y: y + 22, class: 'axis-label' }, root);
    sub.textContent = r.name;
    svg('line', { x1: x(r.ci95[0]), x2: x(r.ci95[1]), y1: y + 12, y2: y + 12, stroke: color, 'stroke-width': 1.4, opacity: 0.5 }, root);
    for (const end of [r.ci95[0], r.ci95[1]]) svg('line', { x1: x(end), x2: x(end), y1: y + 7, y2: y + 17, stroke: color, 'stroke-width': 1.4, opacity: 0.5 }, root);
    svg('circle', { cx: x(r.mean), cy: y + 12, r: 4, fill: color }, root);
    text(root, x(r.mean) - 8, y + 16, nf(r.mean, 3), 'value-label', 'end');
  });
  text(root, x(0) - 6, 10, 'no gap', 'axis-label', 'end');
}

// --------------------------------------------------------------- stat list (HTML)
function statList(container, items, { max, format = (v) => String(v), note } = {}) {
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'stat-list';
  list.innerHTML = items
    .map(
      (it) => `<div class="stat-row">
        <span class="stat-name">${esc(it.label)}</span>
        <span class="stat-bar"><i style="width:${Math.max(1.5, (100 * it.value) / max)}%"></i></span>
        <span class="stat-val mono">${format(it.value)}</span>
      </div>`,
    )
    .join('');
  container.appendChild(list);
  if (note) {
    const p = document.createElement('p');
    p.className = 'chart-foot';
    p.style.marginTop = '4px';
    p.innerHTML = note;
    container.appendChild(p);
  }
}

// --------------------------------------------------------------- chart: education
function renderEducation(scan) {
  const container = $('#edu-chart');
  if (!container) return;
  const { educationLevels, totals } = scan;
  const total = totals.resumes;
  const shares = educationLevels.map((lvl) => (100 * totals.edu[lvl]) / total);
  statList(
    container,
    educationLevels.map((lvl, i) => ({ label: lvl, value: shares[i] })),
    {
      max: 45,
      format: (v) => `${v.toFixed(0)}%`,
      note: `University degrees dominate: <strong>66.3%</strong> hold a Bachelor's or a Master's, and <strong>10.3%</strong> state no degree at all.`,
    },
  );
}

// --------------------------------------------------------------- chart: countries
function renderCountries(scan) {
  const container = $('#country-chart');
  if (!container) return;
  const top = scan.countries.slice(0, 9);
  statList(
    container,
    top.map(([name, count]) => ({ label: name, value: count })),
    {
      max: top[0][1],
      format: (v) => String(v),
      note: `Counted with a country regex over all 2,484 CVs — <strong>33%</strong> mention a country, 25.5% the US. <strong>95.1%</strong> have their city masked as “City, State”.`,
    },
  );
}

// --------------------------------------------------------------- chart: categories
function renderCategories(scan) {
  const container = $('#category-chart');
  if (!container) return;
  container.innerHTML = '';
  const max = Math.max(...scan.categories.map((c) => c.resumes));
  const list = document.createElement('div');
  list.className = 'cat-grid';
  for (const c of scan.categories) {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-name">${esc(c.name.replace(/-/g, ' ').toLowerCase())}</span>
      <span class="cat-bar"><i style="width:${(100 * c.resumes) / max}%"></i></span>
      <span class="cat-n mono">${c.resumes}</span>`;
    list.appendChild(row);
  }
  container.appendChild(list);
}

function renderCues(scan) {
  const list = $('#cue-list');
  if (!list) return;
  const labels = {
    marital_family: 'Marital / family status',
    disability_veteran: 'Disability / veteran',
    religion: 'Religion',
    race_ethnicity: 'Race / ethnicity',
    age: 'Age / date of birth',
    nationality: 'Nationality / visa',
  };
  const total = scan.totals.resumes;
  const entries = Object.entries(scan.totals.cues).sort((a, b) => b[1] - a[1]);
  list.innerHTML = entries
    .map(([k, v]) => {
      const p = (100 * v) / total;
      return `<li><span>${labels[k] ?? k}</span><span class="mono">${p.toFixed(1)}%</span>
        <span class="bar-wrap"><i style="width:${Math.min(100, p * 3.5)}%"></i></span></li>`;
    })
    .join('');
}

// ============================================================== data bootstrap
const BASE = '/data/';
let DATA = null;

async function loadJSON(name) {
  const res = await fetch(`${BASE}${name}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

async function boot() {
  try {
    const [audit, scan, jobs, hero] = await Promise.all([
      loadJSON('audit.json'),
      loadJSON('scan.json'),
      loadJSON('jobs.json'),
      loadJSON('hero.json'),
    ]);
    DATA = { audit, scan, jobs, hero };
    renderHero(hero, jobs);
    renderPassRates(audit);
    renderFlips(audit);
    renderGaps(audit);
    renderEducation(scan);
    renderCountries(scan);
    renderCategories(scan);
    renderCues(scan);
    bindMethodToggle();

    // The lab pulls ~1 MB of embeddings; only start when the section is near the viewport.
    const labSection = $('#lab');
    if (labSection) {
      const labIO = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            labIO.disconnect();
            initLab();
          }
        },
        { rootMargin: '700px 0px' },
      );
      labIO.observe(labSection);
    }
  } catch (err) {
    console.error(err);
    const el = $('#pass-chart');
    if (el) el.innerHTML = `<p class="muted">Could not load the audit artefacts (${esc(err.message)}).</p>`;
  }
}

// ==================================================================== bias lab
const lab = {
  ready: false,
  examples: null,
  exampleVectors: new Map(),
  jobs: null,
  jobVectors: null,
  leace: null,
  example: null,
  jobId: null,
  mode: 'sample',
  customText: '',
  customVectors: null,
  model: null,
  loading: false,
};

async function loadBinary(name) {
  const res = await fetch(`${BASE}${name}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Float32Array(buf);
}

function leaceOpts() {
  return { A: lab.leace.A, b: lab.leace.b };
}

function vectorsFromRaw(raw) {
  const { A, b } = leaceOpts();
  return { before: normalize(raw), after: normalize(applyLeace(raw, A, b)) };
}

async function initLab() {
  const cvSelect = $('#cv-select');
  if (!cvSelect) return;
  cvSelect.innerHTML = '<option>Loading sample CVs…</option>';
  $('#job-select').innerHTML = '<option>Loading jobs…</option>';
  $('#run-btn').disabled = true;
  try {
    const [examples, jobs, jobEmbRaw, A, b] = await Promise.all([
      loadJSON('examples.json'),
      loadJSON('jobs.json'),
      loadBinary('job-emb.bin'),
      loadBinary('leace_a.bin'),
      loadBinary('leace_b.bin'),
    ]);
    lab.examples = examples;
    lab.jobs = jobs;
    lab.leace = { A, b };
    lab.jobVectors = jobs.map((_, i) =>
      vectorsFromRaw(jobEmbRaw.subarray(i * 384, (i + 1) * 384)),
    );

    // decode example twin embeddings
    const buf = await loadBinary('examples.bin');
    examples.forEach((ex, e) => {
      const twins = [];
      for (let t = 0; t < 7; t++) {
        const raw = buf.subarray((e * 7 + t) * 384, (e * 7 + t + 1) * 384);
        twins.push(vectorsFromRaw(raw));
      }
      lab.exampleVectors.set(ex.id, twins);
    });

    renderCvOptions();
    bindLabControls();
    lab.ready = true;
    $('#run-btn').disabled = false;
    selectExample(examples[0].id, { silent: true });
    runScreen();
  } catch (err) {
    console.error(err);
    $('#lab-results').innerHTML = `<div class="result-empty"><p class="mono-label">Unavailable</p><p>The lab data could not be loaded (${esc(err.message)}). The audit above is unaffected.</p></div>`;
  }
}

function renderCvOptions() {
  const select = $('#cv-select');
  select.innerHTML = lab.examples
    .map(
      (ex) =>
        `<option value="${ex.id}">${esc(ex.category.replace(/-/g, ' '))} — flips in ${ex.flipsBefore}/5 jobs</option>`,
    )
    .join('');
}

function renderJobOptions(category, preferred) {
  const select = $('#job-select');
  const groups = new Map();
  lab.jobs.forEach((j) => {
    if (!groups.has(j.category)) groups.set(j.category, []);
    groups.get(j.category).push(j);
  });
  // current category first
  const order = [...groups.keys()].sort((a, b) => (a === category ? -1 : b === category ? 1 : a.localeCompare(b)));
  select.innerHTML = order
    .map(
      (cat) =>
        `<optgroup label="${esc(cat.replace(/-/g, ' '))}">` +
        groups
          .get(cat)
          .map((j) => `<option value="${j.i}">${esc(j.title)} — ${esc(j.location)}</option>`)
          .join('') +
        `</optgroup>`,
    )
    .join('');
  const fallback = groups.get(category)?.[0];
  const chosen = preferred != null && lab.jobs.some((j) => j.i === preferred) ? preferred : fallback?.i;
  if (chosen != null) select.value = String(chosen);
  lab.jobId = Number(select.value);
}

function bindLabControls() {
  $$('.lab-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.lab-tab').forEach((t) => {
        t.classList.toggle('is-on', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      lab.mode = tab.dataset.source;
      $$('.lab-pane').forEach((p) => p.classList.toggle('is-hidden', p.dataset.pane !== lab.mode));
      $('#run-hint').textContent =
        lab.mode === 'sample'
          ? 'Sample CVs are instant. Your own text downloads the 23 MB int8 model once.'
          : 'Your text is embedded in this tab. The 23 MB model is cached after the first run.';
      if (lab.mode === 'custom') updateCustomMeta();
    });
  });

  $('#cv-select').addEventListener('change', (e) => {
    selectExample(e.target.value);
    runScreen();
  });
  $('#job-select').addEventListener('change', (e) => {
    lab.jobId = Number(e.target.value);
    runScreen();
  });

  const ta = $('#cv-text');
  ta.addEventListener('input', () => {
    lab.customText = ta.value;
    lab.customVectors = null;
    updateCustomMeta();
  });

  $('#load-sample-text').addEventListener('click', () => {
    const ex = lab.examples.find((x) => x.id === $('#cv-select').value) ?? lab.examples[0];
    ta.value = ex.text;
    lab.customText = ex.text;
    lab.customVectors = null;
    updateCustomMeta();
  });

  $('#run-btn').addEventListener('click', () => runScreen());
}

function updateCustomMeta() {
  const words = (lab.customText.match(/\S+/g) ?? []).length;
  $('#cv-words').textContent = `${words} words`;
  const box = $('#cv-detect');
  if (lab.mode !== 'custom') return;
  if (words < 20) {
    box.innerHTML = '';
    return;
  }
  const edu = educationLevel(lab.customText);
  const countries = countriesMentioned(lab.customText);
  box.innerHTML =
    `<span>education: ${esc(EDU_LEVELS[edu])}</span>` +
    (countries.length ? countries.map((c) => `<span>mentions ${esc(c)}</span>`).join('') : `<span>no country named</span>`);
}

function selectExample(id, { silent = false } = {}) {
  const ex = lab.examples.find((x) => x.id === id);
  if (!ex) return;
  lab.example = ex;
  lab.twinMeta = twinSpecs(ex.text);
  $('#cv-select').value = id;
  renderJobOptions(ex.category, ex.defaultJob);
  const edu = educationLevel(ex.text);
  $('#cv-detect').innerHTML =
    `<span>${esc(ex.category.replace(/-/g, ' '))}</span><span>${ex.words} words</span>` +
    `<span>education: ${esc(ex.education)}</span>` +
    (ex.countries.length ? ex.countries.map((c) => `<span>mentions ${esc(c)}</span>`).join('') : `<span>no country named</span>`);
  if (!silent) $('#run-hint').textContent = 'Scores computed from the offline embeddings — instant.';
}

function currentVectors() {
  if (lab.mode === 'sample') {
    const twins = lab.exampleVectors.get(lab.example.id);
    return { twins, computed: false };
  }
  return { twins: lab.customVectors, computed: true };
}

async function runScreen() {
  const out = $('#lab-results');
  if (!lab.ready) return;
  if (lab.mode === 'custom' && !lab.customText.trim()) {
    out.innerHTML = `<div class="result-empty"><p class="mono-label">No text</p><p>Paste a CV (or load an example) first.</p></div>`;
    return;
  }
  if (lab.mode === 'custom' && !lab.customVectors) {
    await runModel();
    if (!lab.customVectors) return;
  }
  if (!lab.jobId && lab.jobId !== 0) return;
  const job = lab.jobs.find((j) => j.i === lab.jobId);
  if (!job) return;

  const { twins } = currentVectors();
  if (!twins) return;

  const scores = twins.map((t) => ({
    before: dot(t.before, lab.jobVectors[lab.jobId].before),
    after: dot(t.after, lab.jobVectors[lab.jobId].after),
  }));
  renderResult(lab.twinMeta, scores, job, fieldStats(twins, job.category));
}

/** How the same CV fares across every job in the field, before and after erasure. */
function fieldStats(vectors, category) {
  const thrB = DATA.audit.biased.calibration.threshold;
  const thrF = DATA.audit.leace.calibration.threshold;
  return lab.jobs
    .filter((j) => j.category === category)
    .map((j) => {
      const b = vectors.slice(1).map((v) => dot(v.before, lab.jobVectors[j.i].before));
      const a = vectors.slice(1).map((v) => dot(v.after, lab.jobVectors[j.i].after));
      return {
        i: j.i,
        title: j.title,
        location: j.location,
        mixedB: new Set(b.map((s) => s >= thrB)).size > 1,
        mixedA: new Set(a.map((s) => s >= thrF)).size > 1,
      };
    });
}

async function runModel() {
  if (lab.loading) return;
  lab.loading = true;
  const status = $('#model-status');
  const bar = $('#model-bar');
  const label = $('#model-text');
  const btn = $('#run-btn');
  status.classList.remove('is-hidden');
  bar.style.width = '2%';
  label.textContent = lab.model ? 'Embedding the CV and its six twins…' : 'Loading the model (23 MB, cached after this)…';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Embedding…';
  try {
    if (!lab.model) {
      const mod = await import('/assets/lab.js');
      lab.model = await mod.createEmbedder({
        onProgress: ({ loaded, total, stage }) => {
          if (total) {
            const p = Math.min(96, Math.round((100 * loaded) / total));
            bar.style.width = `${p}%`;
            label.textContent = `Downloading ${stage ?? 'model'} — ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
          }
        },
      });
      bar.style.width = '96%';
      label.textContent = 'Model ready. Embedding the CV and its six twins…';
    }
    const texts = [lab.customText, ...twinSpecs(lab.customText).slice(1).map((t) => t.text)];
    lab.twinMeta = twinSpecs(lab.customText);
    const raws = await lab.model.embedRaw(texts, ({ done, total }) => {
      bar.style.width = `${96 + Math.round((4 * done) / Math.max(total, 1))}%`;
      label.textContent = `Embedding chunk ${Math.min(done, total)} of ${total}…`;
    });
    lab.customVectors = raws.map((r) => vectorsFromRaw(r));
    bar.style.width = '100%';
    label.textContent = `Done — ${raws.length} document vectors from ${raws.length ? 'this CV and its twins' : ''}.`;
    setTimeout(() => status.classList.add('is-hidden'), 1200);
  } catch (err) {
    console.error(err);
    label.textContent = `Could not run the in-browser model: ${err.message}`;
    bar.style.width = '0%';
    $('#lab-results').innerHTML = `<div class="result-empty"><p class="mono-label">Model error</p>
      <p>The browser model failed to load (${esc(err.message)}). The sample CVs still work — they use precomputed embeddings from the same pipeline.</p></div>`;
  } finally {
    lab.loading = false;
    btn.disabled = false;
    btn.innerHTML = 'Screen the CV <span aria-hidden="true">→</span>';
  }
}

function twinCell(twin, value, threshold) {
  const pass = value >= threshold;
  const w = Math.max(2, Math.min(100, ((value - 0.30) / 0.24) * 100));
  return `<td class="${pass ? 'pass' : 'fail'}" title="${twin.location} / ${twin.gender}: ${nf(value, 4)}">
    <span class="fill" style="width:${w}%"></span><span class="v">${nf(value, 3)}<i class="d"></i></span></td>`;
}

function modelCard({ title, tag, threshold, scores, twins, mode }) {
  const asWritten = scores[0];
  const cf = scores.slice(1);
  const pass = asWritten[mode] >= threshold;
  const decisions = cf.map((s) => s[mode] >= threshold);
  const consistent = new Set(decisions).size === 1;
  const differFromWritten = cf.filter((s) => (s[mode] >= threshold) !== pass).length;
  const swing = Math.max(...cf.map((s) => s[mode])) - Math.min(...cf.map((s) => s[mode]));
  const rows = [
    ['US', [1, 2]],
    ['UK/EU', [3, 4]],
    ['Asia', [5, 6]],
  ];
  return `
  <article class="model-card">
    <header><h4>${title}</h4><span class="tag">${tag}</span></header>
    <div class="big">
      <div class="score-val"><small>CV as written</small>${nf(asWritten[mode], 3)}</div>
      <div style="text-align:right">
        <span class="decision ${pass ? 'pass' : 'fail'}">${pass ? 'PASS' : 'FAIL'}</span>
        <div class="hint" style="margin-top:5px">threshold ${nf(threshold, 4)}</div>
      </div>
    </div>
    <table class="twin-table">
      <thead><tr><th scope="col">Address</th><th scope="col">Female</th><th scope="col">Male</th></tr></thead>
      <tbody>
        ${rows
          .map(
            ([label, idx]) =>
              `<tr><th scope="row">${label}</th>${idx.map((i) => twinCell(twins[i], scores[i][mode], threshold)).join('')}</tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <footer>
      <span>swing ${nf(swing, 3)}</span>
      <span class="${consistent ? 'ok' : 'flip'}">${consistent ? 'twins agree' : `${differFromWritten}/6 twins flip`}</span>
    </footer>
  </article>`;
}

function renderResult(twins, scores, job, field = []) {
  const thrB = DATA.audit.biased.calibration.threshold;
  const thrF = DATA.audit.leace.calibration.threshold;
  const before = scores.slice(1).map((s) => s.before);
  const after = scores.slice(1).map((s) => s.after);
  const passB = before.map((s) => s >= thrB);
  const passA = after.map((s) => s >= thrF);
  const nB = passB.filter(Boolean).length;
  const nA = passA.filter(Boolean).length;
  const mixedB = nB > 0 && nB < 6;
  const mixedA = nA > 0 && nA < 6;
  const gapB = Math.max(...before) - Math.min(...before);
  const gapA = Math.max(...after) - Math.min(...after);
  const edu = educationLevel(twins[0].text);
  const req = job.requiredEdu ?? 0;
  const legit = req > edu && edu < req;

  const regionMean = (xs, idx) => idx.reduce((a, i) => a + xs[i - 1], 0) / idx.length;
  const rB = { US: regionMean(before, [1, 2]), UK: regionMean(before, [3, 4]), Asia: regionMean(before, [5, 6]) };
  const rA = { US: regionMean(after, [1, 2]), UK: regionMean(after, [3, 4]), Asia: regionMean(after, [5, 6]) };
  const genderGap = [0, 2, 4].reduce((a, i) => a + Math.abs(before[i] - before[i + 1]), 0) / 3;

  const title = mixedB
    ? 'The decision changes when only the address changes'
    : nB === 6
      ? 'All six twins pass — location does not change the decision'
      : 'All six twins fail — location does not change the decision';
  const desc = mixedB
    ? `Original model: ${nB} of 6 twins pass, and the scores span ${nf(gapB, 3)} — the address alone moves the decision across the ${nf(thrB, 4)} pass mark.`
    : `Original model: the six twins span ${nf(gapB, 3)} and all share the same decision, so this CV–job pair does not discriminate.`;
  const afterDesc = mixedA
    ? ` After LEACE, ${nA} of 6 pass and the span falls to ${nf(gapA, 3)} — narrowed, but the flip survives.`
    : ` After LEACE the span is ${nf(gapA, 3)} and the twins still agree.`;
  const asWrittenPass = scores[0].before >= thrB;

  $('#lab-results').innerHTML = `
    <div class="verdict ${mixedB ? 'verdict-bad' : 'verdict-ok'}">
      <span class="badge">${mixedB ? 'Biased' : 'Stable'}</span>
      <div>
        <h3>${title}</h3>
        <p>${desc}${afterDesc}</p>
      </div>
    </div>
    <div class="compare">
      ${modelCard({ title: 'Original MiniLM', tag: 'before', threshold: thrB, scores, twins, mode: 'before' })}
      ${modelCard({ title: 'After LEACE', tag: 'after', threshold: thrF, scores, twins, mode: 'after' })}
    </div>
    ${
      field.length
        ? `<div class="lab-field">
      <div class="lab-field-head">
        <h4>Every job in this field</h4>
        <p>${field.filter((f) => f.mixedB).length} of ${field.length} jobs flip on the original model ·
          <strong>${field.filter((f) => f.mixedA).length}</strong> after LEACE</p>
      </div>
      <div class="field-grid">
        ${field
          .map(
            (f) => `<div class="field-cell${f.i === job.i ? ' is-current' : ''}">
              <span class="field-title">${esc(f.title)}</span>
              <span class="field-loc">${esc(f.location)}</span>
              <span class="field-tags">
                <i class="ft ${f.mixedB ? 'ft-flip' : 'ft-ok'}">${f.mixedB ? 'flips' : 'stable'}</i>
                <i class="ft ${f.mixedA ? 'ft-flip' : 'ft-ok'}">${f.mixedA ? 'flips' : 'stable'}</i>
              </span>
            </div>`,
          )
          .join('')}
      </div>
      <p class="field-legend"><span>left = original</span><span>right = after LEACE</span></p>
    </div>`
        : ''
    }
    <div class="lab-explain">
      <h4>What just happened</h4>
      <p>
        Same CV, same job: <strong>${esc(job.title)}</strong> (${esc(job.location)}).
        As written it scores <span class="mono">${nf(scores[0].before, 3)}</span>
        (${asWrittenPass ? 'PASS' : 'FAIL'} at <span class="mono">${nf(thrB, 4)}</span>).
        With a <strong>US</strong> address the twins average <span class="mono">${nf(rB.US, 3)}</span>;
        with an <strong>Asian</strong> address, <span class="mono">${nf(rB.Asia, 3)}</span> —
        a gap of <strong>${nf(rB.US - rB.Asia, 3)}</strong> from an address line.
        After the eraser: <span class="mono">${nf(rA.US, 3)}</span> vs
        <span class="mono">${nf(rA.Asia, 3)}</span>, gap <strong>${nf(rA.US - rA.Asia, 3)}</strong>.
      </p>
      <p>
        Region means — before: US ${nf(rB.US, 3)} · UK ${nf(rB.UK, 3)} · Asia ${nf(rB.Asia, 3)}
        &nbsp;|&nbsp; after: US ${nf(rA.US, 3)} · UK ${nf(rA.UK, 3)} · Asia ${nf(rA.Asia, 3)}.
        The female/male twins differ by ${nf(genderGap, 4)} on average.
        ${legit ? `<br /><strong>Requirement note:</strong> this job states a ${esc(EDU_LEVELS[req])} degree and the CV shows ${esc(EDU_LEVELS[edu])} — a FAIL for that reason would be legitimate, not bias.` : ''}
      </p>
    </div>`;
}

// ------------------------------------------------------------------------ go
boot();
