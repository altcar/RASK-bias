// Copy static runtime assets: the int8 MiniLM model, onnxruntime-web WASM, and fonts.
// Everything is served from our own origin, so the demo has no third-party dependency.
import { cpSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';

const nm = 'node_modules';
const modelSrc = '.cache/Xenova/all-MiniLM-L6-v2';
const modelDst = 'public/model/Xenova/all-MiniLM-L6-v2';

mkdirSync(`${modelDst}/onnx`, { recursive: true });
for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json']) {
  copyFileSync(`${modelSrc}/${f}`, `${modelDst}/${f}`);
}
copyFileSync(`${modelSrc}/onnx/model_quantized.onnx`, `${modelDst}/onnx/model_quantized.onnx`);

mkdirSync('public/ort', { recursive: true });
// onnxruntime-web 1.31 loads a WASM/ESM pair at runtime; ship the plain threaded build
// (13.6 MB). The default "asyncify" build is 25.6 MB and exceeds the 25 MiB asset cap.
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(`${nm}/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}

mkdirSync('public/fonts', { recursive: true });
const fonts = [
  [`${nm}/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2`, 'instrument-sans-var.woff2'],
  [`${nm}/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-italic.woff2`, 'instrument-sans-var-italic.woff2'],
  [`${nm}/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2`, 'instrument-serif.woff2'],
  [`${nm}/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2`, 'instrument-serif-italic.woff2'],
  [`${nm}/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2`, 'jetbrains-mono-var.woff2'],
];
for (const [src, dst] of fonts) {
  if (!existsSync(src)) throw new Error(`missing font ${src}`);
  copyFileSync(src, `public/fonts/${dst}`);
}

const size = (p) => (statSync(p).size / 1e6).toFixed(1);
console.log('assets ready:', {
  model: `${size(`${modelDst}/onnx/model_quantized.onnx`)} MB`,
  wasm: `${size('public/ort/ort-wasm-simd-threaded.wasm')} MB`,
  fonts: 'ok',
});
