// Minimal reader for NumPy .npy files (float32, C order) as used by artifacts/leace.npz
import { readFileSync } from 'node:fs';

export function readNpy(path) {
  const buf = readFileSync(path);
  if (buf.readUInt8(0) !== 0x93) throw new Error('not a npy file');
  const major = buf.readUInt8(6);
  let offset = 8;
  let headerLen;
  if (major === 1) {
    headerLen = buf.readUInt16LE(offset);
    offset += 2;
  } else {
    headerLen = buf.readUInt32LE(offset);
    offset += 4;
  }
  const header = buf.toString('latin1', offset, offset + headerLen);
  offset += headerLen;
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const shape = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const fortran = /'fortran_order':\s*(True|False)/.exec(header)?.[1] === 'True';
  if (descr !== '<f4') throw new Error(`unsupported dtype ${descr}`);

  const count = shape.reduce((a, b) => a * b, 1);
  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) data[i] = buf.readFloatLE(offset + i * 4);
  return { shape, data, fortran };
}
