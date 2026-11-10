import { pipeline } from '@huggingface/transformers';

export async function createEmbedder(dtype = 'q8', { progress } = {}) {
  const extract = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype,
    progress_callback: progress,
  });

  return async function embedChunks(chunks, batchSize = 32) {
    const out = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const res = await extract(batch, { pooling: 'mean', normalize: true });
      const dim = res.dims[1];
      for (let b = 0; b < batch.length; b++) {
        out.push(new Float32Array(res.data.buffer, res.data.byteOffset + b * dim * 4, dim).slice());
      }
    }
    return out;
  };
}
