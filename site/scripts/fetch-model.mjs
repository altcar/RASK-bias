// Download the int8 MiniLM used by the browser demo, so a clean CI checkout can build.
// Writes into .cache/Xenova/all-MiniLM-L6-v2/ where scripts/setup-assets.mjs expects it.
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = 'Xenova/all-MiniLM-L6-v2';
const BASE = `https://huggingface.co/${REPO}/resolve/main`;
const DIR = join('.cache', 'Xenova', 'all-MiniLM-L6-v2');

const FILES = [
  ['config.json', 'config.json'],
  ['tokenizer.json', 'tokenizer.json'],
  ['tokenizer_config.json', 'tokenizer_config.json'],
  ['onnx/model_quantized.onnx', 'onnx/model_quantized.onnx'],
];

mkdirSync(join(DIR, 'onnx'), { recursive: true });

for (const [remote, local] of FILES) {
  const dest = join(DIR, local);
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`cached  ${local} (${(statSync(dest).size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  const res = await fetch(`${BASE}/${remote}`);
  if (!res.ok) throw new Error(`${remote}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`fetched ${local} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
