import { env, pipeline } from '@huggingface/transformers';

env.cacheDir = './.cache';

console.log('transformers version ok');

for (const dtype of ['q8', 'fp32']) {
  const t0 = Date.now();
  const extract = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype });
  console.log(dtype, 'loaded in', Date.now() - t0, 'ms');
  const out = await extract(['The quick brown fox jumps over the lazy dog.', 'A fast auburn fox leaps above a sleepy canine.'], {
    pooling: 'none',
  });
  console.log(dtype, 'dims', out.dims, 'sample', Array.from(out.data.slice(0, 4)));
}
