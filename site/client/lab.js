// Browser-side MiniLM inference, bundled to /assets/lab.js and loaded on demand.
// Weights, tokenizer and the onnxruntime WASM binary are all served from this origin.
import { env, pipeline } from '@huggingface/transformers';
import { embedRawDocuments } from '../shared/pipeline.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/model/';
env.useBrowserCache = true;
// onnxruntime-web 1.31's default browser bundle wants the 25.6 MiB "asyncify" build, which
// exceeds the 25 MiB per-asset limit on Cloudflare Workers. The plain threaded build is the
// same runtime, 12 MiB smaller, and we point both the loader and the binary at it.
env.backends.onnx.wasm.wasmPaths = {
  mjs: '/ort/ort-wasm-simd-threaded.mjs',
  wasm: '/ort/ort-wasm-simd-threaded.wasm',
};

const threads =
  typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 2))
    : 1;
env.backends.onnx.wasm.numThreads = threads;

let pipelinePromise = null;

function stageOf(file = '') {
  if (file.includes('model')) return 'model weights';
  if (file.includes('tokenizer')) return 'tokenizer';
  return 'runtime';
}

async function build(onProgress) {
  let extract;
  try {
    extract = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'q8',
      progress_callback: (e) => {
        if (!onProgress) return;
        if (e.status === 'progress') {
          onProgress({ loaded: e.loaded ?? 0, total: e.total ?? 0, stage: stageOf(e.file) });
        } else if (e.status === 'ready') {
          onProgress({ loaded: 1, total: 1, stage: 'ready' });
        }
      },
    });
  } catch (err) {
    // Threads need cross-origin isolation; fall back rather than fail the demo.
    console.warn('[rask] threaded WASM failed, retrying single-threaded', err);
    env.backends.onnx.wasm.numThreads = 1;
    extract = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  }

  const embedChunks = async (chunks, onChunk) => {
    const BATCH = 8;
    const out = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const res = await extract(batch, { pooling: 'mean', normalize: true });
      const dim = res.dims[1];
      for (let b = 0; b < batch.length; b++) {
        out.push(new Float32Array(res.data.buffer.slice(res.data.byteOffset + b * dim * 4, res.data.byteOffset + (b + 1) * dim * 4)));
      }
      onChunk?.({ done: Math.min(i + BATCH, chunks.length), total: chunks.length });
    }
    return out;
  };

  return {
    threads,
    /** @returns {Promise<Float32Array[]>} raw (un-normalised) document vectors */
    embedRaw: (texts, onChunk) => embedRawDocuments(texts, (chunks) => embedChunks(chunks, onChunk)),
  };
}

export async function createEmbedder({ onProgress } = {}) {
  if (!pipelinePromise) pipelinePromise = build(onProgress);
  return pipelinePromise;
}
