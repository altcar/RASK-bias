import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('public/shared', { recursive: true });
cpSync('shared', 'public/shared', { recursive: true });

const result = await build({
  entryPoints: ['client/lab.js'],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  platform: 'browser',
  outfile: 'public/assets/lab.js',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  metafile: true,
  logLevel: 'info',
});

const bytes = Object.values(result.metafile.outputs).reduce((a, o) => a + o.bytes, 0);
console.log(`lab bundle: ${(bytes / 1e6).toFixed(2)} MB`);
