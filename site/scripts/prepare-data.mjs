// Build the data the site needs from the RASK-bias artefacts in data/source/.
//   npm run data
import { parse } from 'csv-parse/sync';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNpy } from './lib/npy.mjs';
import { createEmbedder } from './lib/model.mjs';
import { loadJobs } from './lib/corpus.mjs';
import { embedRawDocuments } from '../shared/pipeline.js';

const SRC = process.env.RASK_SRC ?? fileURLToPath(new URL('../data/source/', import.meta.url));
const OUT = new URL('../public/data/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const read = (p) => readFileSync(p, 'utf8');
const json = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data));

// ---------------------------------------------------------------- audit metrics (published)
const audit = {
  biased: JSON.parse(read(join(SRC, 'audit_biased_metrics.json'))),
  leace: JSON.parse(read(join(SRC, 'audit_leace_metrics.json'))),
  calibration: JSON.parse(read(join(SRC, 'calibration.json'))),
};
json('audit.json', audit);

// ------------------------------------------------------------------------ LEACE eraser (A,b)
const A = readNpy(join(SRC, 'leace_A.npy'));
const b = readNpy(join(SRC, 'leace_B.npy'));
writeFileSync(new URL('leace_a.bin', OUT), Buffer.from(A.data.buffer, A.data.byteOffset, A.data.byteLength));
writeFileSync(new URL('leace_b.bin', OUT), Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength));

// ---------------------------------------------------------------------------------- scan
const scan = parse(read(join(SRC, 'scan_resumes.csv')), { columns: true, skip_empty_lines: true });
const EDU = ['None', 'High school', 'Associate', 'Bachelor', 'Master', 'PhD'];
const CUES = ['race_ethnicity', 'age', 'marital_family', 'religion', 'nationality', 'disability_veteran'];
const countries = {};

const categories = {};
for (const row of scan) {
  const cat = (categories[row.Category] ??= {
    name: row.Category,
    resumes: 0,
    edu: Object.fromEntries(EDU.map((e) => [e, 0])),
    countries: {},
    cues: 0,
    locationMasked: 0,
    gender: { Female: 0, Male: 0, None: 0 },
  });
  cat.resumes += 1;
  cat.edu[EDU[Number(row.edu_level)] ?? 'None'] += 1;
  cat.locationMasked += row.location_masked === 'True' ? 1 : 0;
  cat.gender[row.gender_signal] = (cat.gender[row.gender_signal] ?? 0) + 1;
  if (CUES.some((c) => Number(row[c]) > 0)) cat.cues += 1;
  for (const c of String(row.countries ?? '').split(/[;|,]/).map((s) => s.trim()).filter(Boolean)) {
    countries[c] = (countries[c] ?? 0) + 1;
    cat.countries[c] = (cat.countries[c] ?? 0) + 1;
  }
}

const totals = scan.reduce(
  (acc, row) => {
    acc.resumes += 1;
    acc.edu[EDU[Number(row.edu_level)]] += 1;
    acc.locationMasked += row.location_masked === 'True' ? 1 : 0;
    acc.gender[row.gender_signal] += 1;
    for (const c of CUES) acc.cues[c] += Number(row[c]) > 0 ? 1 : 0;
    return acc;
  },
  {
    resumes: 0,
    edu: Object.fromEntries(EDU.map((e) => [e, 0])),
    locationMasked: 0,
    gender: { Female: 0, Male: 0, None: 0 },
    cues: Object.fromEntries(CUES.map((c) => [c, 0])),
  },
);

json('scan.json', {
  totals,
  countries: Object.entries(countries).sort((a, b) => b[1] - a[1]),
  categories: Object.values(categories).sort((a, b) => b.resumes - a.resumes),
  educationLevels: EDU,
});

// ----------------------------------------------------------------------------------- jobs
const jobs = loadJobs(join(SRC, 'jobs.csv'));
json('jobs.json', jobs.map((j, i) => ({ i, ...j })));

// Job embeddings: raw mean of unit-norm 180-word chunks (before normalisation), so the
// browser can derive both the biased and the LEACE-debiased document vectors.
const embedChunks = await createEmbedder('q8');
const jobRaw = await embedRawDocuments(jobs.map((j) => j.text), embedChunks);
const flat = new Float32Array(jobRaw.length * 384);
jobRaw.forEach((v, i) => flat.set(v, i * 384));
writeFileSync(new URL('job-emb.bin', OUT), Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));

json('meta.json', {
  built: new Date().toISOString(),
  model: 'sentence-transformers/all-MiniLM-L6-v2',
  runner: 'Xenova/all-MiniLM-L6-v2 · int8 (q8) · onnxruntime-web',
  dim: 384,
  jobs: jobs.length,
  resumes: scan.length,
  chunkWords: 180,
  maxTokens: 256,
});
console.log(`wrote audit, scan (${scan.length}), ${jobs.length} jobs + embeddings`);
