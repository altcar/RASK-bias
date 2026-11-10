// Port of src/screener.py + the LEACE affine layer from src/debias.py.
// MiniLM reads 256 tokens, so long CVs are split into 180-word chunks; the document
// embedding is the mean of the (unit-norm) chunk embeddings. LEACE is affine, so applying
// it to the mean is identical to applying it to each chunk and then averaging — that is why
// one 384x384 matrix reproduces the whole debiased screener.

export const CHUNK_WORDS = 180;
export const MAX_TOKENS = 256;
export const DIM = 384;

export function chunkText(text, size = CHUNK_WORDS) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const chunks = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(' '));
  return chunks;
}

export function normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.max(Math.sqrt(sum), 1e-12);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** x @ A + b, with A stored row-major, exactly as in artifacts/leace.npz. */
export function applyLeace(vec, A, b) {
  const d = vec.length;
  const out = new Float32Array(d);
  for (let i = 0; i < d; i++) {
    const x = vec[i];
    if (x === 0) continue;
    const row = i * d;
    for (let j = 0; j < d; j++) out[j] += x * A[row + j];
  }
  if (b) for (let j = 0; j < d; j++) out[j] += b[j];
  return out;
}

/**
 * Raw document vectors: the *unnormalised* mean of the unit-norm chunk embeddings.
 * LEACE was fitted on these (normalize_mean=False in the Python pipeline), so keeping the
 * raw mean lets us derive both screeners from one embedding.
 * @param {string[]} texts
 * @param {(chunks: string[]) => Promise<Float32Array[]>} embedChunks
 */
export async function embedRawDocuments(texts, embedChunks) {
  const chunked = texts.map((t) => chunkText(t));
  const vecs = await embedChunks(chunked.flat());
  const docs = [];
  let cursor = 0;
  for (const chunks of chunked) {
    const mean = new Float32Array(DIM);
    for (let c = 0; c < chunks.length; c++) {
      const v = vecs[cursor + c];
      const w = 1 / chunks.length;
      for (let i = 0; i < DIM; i++) mean[i] += v[i] * w;
    }
    cursor += chunks.length;
    docs.push(mean);
  }
  return docs;
}

/** Turn a raw document vector into a screener vector: erase (optional) then L2-normalise. */
export function finalize(vec, { A, b } = {}) {
  return normalize(A ? applyLeace(vec, A, b) : vec);
}

export async function embedDocuments(texts, embedChunks, opts = {}) {
  const raw = await embedRawDocuments(texts, embedChunks);
  return raw.map((v) => finalize(v, opts));
}

export const cosine = dot;
