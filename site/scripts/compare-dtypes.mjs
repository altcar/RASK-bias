// Compare fp32 vs int8 (q8) embeddings: how much do document scores move?
import { readNpy } from './lib/npy.mjs';
import { createEmbedder } from './lib/model.mjs';
import { loadResumes, loadJobs } from './lib/corpus.mjs';
import { auditVariants } from '../shared/attributes.js';
import { embedDocuments, dot } from '../shared/pipeline.js';

const ROOT = 'C:/Users/c85-lau/AppData/Local/Temp/opencode';
const A = readNpy(`${ROOT}/leace/A.npy`).data;
const b = readNpy(`${ROOT}/leace/b.npy`).data;

const resumes = loadResumes(`${ROOT}/rask-data/Resume.csv`).slice(600, 612);
const jobs = loadJobs(`${ROOT}/rask-src/RASK-bias-main/artifacts/jobs.csv`);

const texts = resumes.flatMap((r, i) => auditVariants(r.text, i).map((v) => v.text));

const out = {};
for (const dtype of ['q8', 'fp32']) {
  const embed = await createEmbedder(dtype);
  const docs = await embedDocuments(texts, embed);
  const jobEmb = await embedDocuments(jobs.map((j) => j.text), embed);
  out[dtype] = { docs, jobEmb };
  console.log(dtype, 'done');
}

const pairs = [];
for (let d = 0; d < texts.length; d++) {
  for (const j of jobs.map((x, i) => ({ x, i })).filter(({ x }) => x.category === resumes[Math.floor(d / 5)].category)) {
    pairs.push([dot(out.q8.docs[d], out.q8.jobEmb[j.i]), dot(out.fp32.docs[d], out.fp32.jobEmb[j.i])]);
  }
}
const diffs = pairs.map(([q, f]) => q - f);
const mean = diffs.reduce((a, x) => a + x, 0) / diffs.length;
const sd = Math.sqrt(diffs.reduce((a, x) => a + (x - mean) ** 2, 0) / diffs.length);
console.log(`pairs=${pairs.length} mean(q8-fp32)=${mean.toFixed(5)} sd=${sd.toFixed(5)} min=${Math.min(...diffs).toFixed(4)} max=${Math.max(...diffs).toFixed(4)}`);
for (const t of [0.4357, 0.4182]) {
  const q = pairs.filter(([x]) => x >= t).length;
  const f = pairs.filter(([, x]) => x >= t).length;
  const disagree = pairs.filter(([x, y]) => (x >= t) !== (y >= t)).length;
  console.log(`threshold ${t}: pass q8=${q} fp32=${f} of ${pairs.length}, disagree=${disagree} (${((100 * disagree) / pairs.length).toFixed(1)}%)`);
}
