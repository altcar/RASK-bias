// Pick illustrative CVs and precompute their counterfactual embeddings, so the demo can
// render instantly without downloading the model. Live inference uses the same pipeline.
//
// Selection aims for examples that stay stable under the small (≈0.005) differences between
// the Node int8 reference and onnxruntime-web's int8 kernels: we require comfortable margins
// on both sides of each threshold, so a demo does not hinge on a rounding error.
import { readFileSync, writeFileSync } from 'node:fs';
import { readNpy } from './lib/npy.mjs';
import { createEmbedder } from './lib/model.mjs';
import { loadResumes } from './lib/corpus.mjs';
import { twinSpecs, educationLevel, countriesMentioned, EDU_LEVELS } from '../shared/attributes.js';
import { embedRawDocuments, finalize, dot } from '../shared/pipeline.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.env.RASK_SRC ?? fileURLToPath(new URL('../data/source/', import.meta.url));
const RESUME_CSV = process.env.RASK_RESUME_CSV ?? fileURLToPath(new URL('../data/Resume.csv', import.meta.url));
const OUT = new URL('../public/data/', import.meta.url);
const A = readNpy(join(SRC, 'leace_A.npy')).data;
const b = readNpy(join(SRC, 'leace_B.npy')).data;
const THR = { before: 0.4357304275035858, after: 0.41819849610328674 };

const jobs = JSON.parse(readFileSync(new URL('jobs.json', OUT)));
const jobEmbRaw = new Float32Array(readFileSync(new URL('job-emb.bin', OUT)).buffer.slice(0));
const jobRaw = jobs.map((_, i) => jobEmbRaw.subarray(i * 384, (i + 1) * 384));
const jobVec = jobRaw.map((raw) => ({ before: finalize(raw), after: finalize(raw, { A, b }) }));

const resumes = loadResumes(RESUME_CSV);
const byCat = {};
for (const r of resumes) (byCat[r.category] ??= []).push(r);

function pickCandidates(list, n, seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return [...list].map((r) => ({ r, k: rand() })).sort((x, y) => x.k - y.k).slice(0, n).map((x) => x.r);
}

const candidates = [];
Object.entries(byCat).forEach(([cat, list], i) => {
  for (const r of pickCandidates(list, 5, 1000 + i)) candidates.push(r);
});
console.log(`candidates: ${candidates.length}`);

const embedChunks = await createEmbedder('q8');
const scored = [];

for (const [ci, r] of candidates.entries()) {
  const catJobs = jobs.map((j, i) => ({ j, i })).filter(({ j }) => j.category === r.category);
  const twins = twinSpecs(r.text);
  const raw = await embedRawDocuments(twins.map((t) => t.text), embedChunks);
  const before = raw.map((v) => finalize(v));
  const after = raw.map((v) => finalize(v, { A, b }));

  const perJob = catJobs.map(({ i }) => {
    const sB = before.map((cv) => dot(cv, jobVec[i].before));
    const sA = after.map((cv) => dot(cv, jobVec[i].after));
    const tB = sB.slice(1);
    const tA = sA.slice(1);
    const mixedB = new Set(tB.map((s) => s >= THR.before)).size > 1;
    const mixedA = new Set(tA.map((s) => s >= THR.after)).size > 1;
    const marginB = Math.min(...tB.map((s) => Math.abs(s - THR.before)));
    const marginA = Math.min(...tA.map((s) => Math.abs(s - THR.after)));
    const marginWritten = Math.min(Math.abs(sB[0] - THR.before), Math.abs(sA[0] - THR.after));
    return { i, scoresB: sB, scoresA: sA, mixedB, mixedA, marginB, marginA, marginWritten };
  });

  const qualify = (minB, minA) =>
    perJob
      .filter((x) => x.mixedB && !x.mixedA && x.marginB >= minB && x.marginA >= minA && x.marginWritten >= 0.006)
      .sort((x, y) => y.marginA + y.marginB - (x.marginA + x.marginB));

  const strict = qualify(0.008, 0.012);
  const loose = qualify(0.004, 0.006);

  scored.push({
    r,
    raw,
    perJob,
    strict,
    loose,
    flipsBefore: perJob.filter((x) => x.mixedB).length,
    flipsAfter: perJob.filter((x) => x.mixedA).length,
    usPassAsiaFail: perJob.filter((x) => x.scoresB[1] >= THR.before && x.scoresB[5] < THR.before).length,
    usGap: perJob.reduce((acc, x) => acc + (x.scoresB[1] - x.scoresB[5]), 0) / perJob.length,
  });
  if ((ci + 1) % 20 === 0) process.stdout.write(`  ${ci + 1}/${candidates.length}\n`);
}

// one example per category, strict first
const chosen = [];
const usedCats = new Set();
for (const pass of ['strict', 'loose']) {
  for (const s of scored.sort((x, y) => (y.usGap || 0) - (x.usGap || 0))) {
    if (usedCats.has(s.r.category) || !s[pass].length) continue;
    s.job = s[pass][0];
    s.grade = pass;
    chosen.push(s);
    usedCats.add(s.r.category);
    if (chosen.length >= 8) break;
  }
  if (chosen.length >= 8) break;
}
// dedupe preserving order
const unique = [...new Set(chosen)];

// one honest "bias survives" example
const stubborn = scored
  .filter((s) => s.flipsAfter >= 2 && s.flipsBefore >= 2 && !unique.includes(s))
  .sort((a, b2) => b2.usGap - a.usGap)[0];
if (stubborn) {
  stubborn.grade = 'persistent';
  stubborn.job = stubborn.perJob.filter((x) => x.mixedB).sort((x, y) => y.marginB - x.marginB)[0];
  unique.push(stubborn);
}

const examples = unique.map((s, idx) => ({
  id: `cv${idx + 1}`,
  category: s.r.category,
  defaultJob: s.job.i,
  jobs: s.perJob.map((x) => x.i),
  education: EDU_LEVELS[educationLevel(s.r.text)],
  countries: countriesMentioned(s.r.text),
  words: s.r.text.split(/\s+/).length,
  text: s.r.text,
  flipsBefore: s.flipsBefore,
  flipsAfter: s.flipsAfter,
  grade: s.grade ?? 'loose',
}));

const flat = new Float32Array(examples.length * 7 * 384);
unique.forEach((s, e) => s.raw.forEach((v, t) => flat.set(v, (e * 7 + t) * 384)));
writeFileSync(new URL('examples.bin', OUT), Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));

for (const [i, ex] of examples.entries()) {
  const s = unique[i];
  const m = s.job ? `marginB ${s.job.marginB.toFixed(3)} marginA ${s.job.marginA.toFixed(3)}` : 'no job';
  console.log(`${ex.id} ${ex.category.padEnd(22)} ${s.grade.padEnd(10)} flips ${ex.flipsBefore}->${ex.flipsAfter} ${m} words ${ex.words}`);
}
writeFileSync(new URL('examples.json', OUT), JSON.stringify(examples));

const heroSrc = unique.find((s) => s.grade === 'strict') ?? unique[0];
const hero = {
  id: examples[unique.indexOf(heroSrc)].id,
  category: heroSrc.r.category,
  job: heroSrc.job.i,
  before: heroSrc.job.scoresB,
  after: heroSrc.job.scoresA,
};
writeFileSync(new URL('hero.json', OUT), JSON.stringify(hero));
console.log('hero', JSON.stringify({ ...hero, before: hero.before.map((x) => +x.toFixed(3)), after: hero.after.map((x) => +x.toFixed(3)) }));
