/**
 * Copies three.js decoder files from node_modules into public/decoders/ so every
 * decoder is self-hosted in the build (build contract 08 5.1 — no CDN loads).
 * Run once at install time: node scripts/setup-decoders.mjs
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public', 'decoders');

for (const d of ['draco', 'basis']) mkdirSync(join(pub, d), { recursive: true });

// three@0.186 does not export './package.json', so resolve the build entry and
// walk up to the package dir; fall back to a direct node_modules path.
function threeDir() {
  try {
    const entry = require.resolve('three'); // e.g. .../three/build/three.module.js
    return join(dirname(entry), '..');
  } catch {
    return join(root, 'node_modules', 'three');
  }
}
const dir = threeDir();

for (const f of ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']) {
  const src = join(dir, 'examples', 'jsm', 'libs', 'draco', f);
  if (existsSync(src)) copyFileSync(src, join(pub, 'draco', f));
  else console.warn(`missing decoder file: ${f}`);
}

for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  const src = join(dir, 'examples', 'jsm', 'libs', 'basis', f);
  if (existsSync(src)) copyFileSync(src, join(pub, 'basis', f));
  else console.warn(`missing decoder file: ${f}`);
}

console.log('decoders copied to public/decoders/');
