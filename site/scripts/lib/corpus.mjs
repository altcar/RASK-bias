import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';

export function loadResumes(path) {
  const raw = readFileSync(path, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  return rows
    .map((r) => ({
      id: Number(r.ID),
      category: r.Category,
      text: String(r.Resume_str ?? r.Resume ?? r.text ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((r) => r.text.length > 200);
}

export function loadJobs(path) {
  const raw = readFileSync(path, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true }).map((r) => ({
    category: r.Category,
    jobId: r.job_id,
    title: r.title,
    location: r.location,
    experience: r.experience_level,
    requiredEdu: Number(r.required_edu),
    text: String(r.text).replace(/\s+/g, ' ').trim(),
  }));
}

/** Deterministic RNG (mulberry32) so samples are reproducible across runs. */
export function rng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
