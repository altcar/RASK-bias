// Reproduce part of the dataset-wide audit in JavaScript to validate the port:
//   node scripts/experiment.mjs --dtype q8 --sample 40
import { readNpy } from './lib/npy.mjs';
import { createEmbedder } from './lib/model.mjs';
import { loadResumes, loadJobs, rng } from './lib/corpus.mjs';
import { REGIONS, auditVariants, GENDERS } from '../shared/attributes.js';
import { embedDocuments, normalize, dot } from '../shared/pipeline.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const dtype = args.dtype ?? 'q8';
const sampleN = Number(args.sample ?? 40);

const ROOT = 'C:/Users/c85-lau/AppData/Local/Temp/opencode';
const A = readNpy(`${ROOT}/leace/A.npy`).data;
const b = readNpy(`${ROOT}/leace/b.npy`).data;

const resumes = loadResumes(`${ROOT}/rask-data/Resume.csv`);
const jobs = loadJobs(`${ROOT}/rask-src/RASK-bias-main/artifacts/jobs.csv`);
console.log(`resumes=${resumes.length} jobs=${jobs.length} dtype=${dtype}`);

const rand = rng(7);
const pick = [...resumes].sort(() => rand() - 0.5).slice(0, sampleN);

const embedChunks = await createEmbedder(dtype);
const jobEmb = await embedDocuments(jobs.map((j) => j.text), embedChunks);
const jobEmbFair = await embedDocuments(jobs.map((j) => j.text), embedChunks, { A, b });

const THRESHOLDS = { biased: 0.4357304275035858, leace: 0.41819849610328674 };

const results = [];
for (const [i, r] of pick.entries()) {
  const variants = auditVariants(r.text, i);
  const texts = variants.map((v) => v.text);
  const before = await embedDocuments(texts, embedChunks);
  const after = await embedDocuments(texts, embedChunks, { A, b });

  const catJobs = jobs.map((j, idx) => ({ j, idx })).filter(({ j }) => j.category === r.category);
  for (const [vi, v] of variants.entries()) {
    const scoresB = catJobs.map(({ idx }) => dot(before[vi], jobEmb[idx]));
    const scoresF = catJobs.map(({ idx }) => dot(after[vi], jobEmbFair[idx]));
    results.push({ resume: i, attr: v.attr, group: v.group, scoresB, scoresF });
  }
  if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${pick.length}\n`);
}

function metrics(mode, threshold, attr) {
  const rows = results.filter((r) => r.attr === attr);
  const passes = rows.map((r) => (mode === 'biased' ? r.scoresB : r.scoresF).map((s) => s >= threshold));
  const byGroup = {};
  rows.forEach((r, i) => {
    const m = mode === 'biased' ? r.scoresB : r.scoresF;
    byGroup[r.group] ??= { pass: 0, n: 0, scores: [] };
    byGroup[r.group].pass += passes[i].filter(Boolean).length;
    byGroup[r.group].n += passes[i].length;
    byGroup[r.group].scores.push(...m);
  });
  const rates = Object.fromEntries(Object.entries(byGroup).map(([g, v]) => [g, v.pass / v.n]));
  // flip rate: per (resume, job index) does the decision change across variants of this attr
  const flips = new Map();
  rows.forEach((r, i) => {
    const m = mode === 'biased' ? r.scoresB : r.scoresF;
    m.forEach((s, j) => {
      const key = `${r.resume}:${j}`;
      const val = s >= threshold;
      flips.set(key, flips.has(key) ? (flips.get(key) === val ? val : 'mixed') : val);
    });
  });
  const flipRate = [...flips.values()].filter((v) => v === 'mixed').length / flips.size;
  const gap = {};
  if (attr === 'location') {
    const per = {};
    rows.forEach((r, i) => {
      per[r.resume] ??= {};
      const m = mode === 'biased' ? r.scoresB : r.scoresF;
      per[r.resume][r.group] = m.reduce((a, x) => a + x, 0) / m.length;
    });
    for (const g of REGIONS.slice(1)) {
      const d = pick.map((_, k) => per[k]?.[g] - per[k]?.US).filter((x) => Number.isFinite(x));
      gap[g] = d.reduce((a, x) => a + x, 0) / d.length;
    }
  }
  const min = Math.min(...Object.values(rates));
  const max = Math.max(...Object.values(rates));
  return { rates, flipRate, impact: min / max, gap };
}

for (const mode of ['biased', 'leace']) {
  for (const attr of ['gender', 'location']) {
    const m = metrics(mode, THRESHOLDS[mode], attr);
    const rates = Object.entries(m.rates).map(([g, v]) => `${g} ${(100 * v).toFixed(1)}%`).join(' · ');
    console.log(
      `${mode.padEnd(7)} ${attr.padEnd(9)} pass ${rates} | impact ${m.impact.toFixed(3)} | flips ${(100 * m.flipRate).toFixed(1)}%` +
        (attr === 'location' ? ` | gap ${Object.entries(m.gap).map(([g, v]) => `${g} ${v.toFixed(4)}`).join(', ')}` : ''),
    );
  }
}
