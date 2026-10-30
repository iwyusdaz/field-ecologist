/**
 * Shared helpers for the v3 asset scripts: licence checks, downloads, KTX2
 * encoding with toktx (KTX-Software 4.4.2) and glTF optimisation with
 * glTF-Transform (meshopt + quantization + KHR_texture_basisu).
 * @module scripts/lib/v3-asset-lib
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { compactPrimitive, listTextureSlots, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { ALLOWED_LICENCES, FORBIDDEN_LICENCE, SOURCE_SITES } from '../v3-assets.config.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW = join(ROOT, 'data', 'raw', 'v3');
export const OUT = join(ROOT, 'public', 'assets', 'v3');
export const MANIFEST = join(OUT, 'manifest.json');
export const TOKTX = process.env.TOKTX || join(homedir(), 'ktx-software', 'bin', 'toktx');
const UA = { 'User-Agent': 'ImmersiveLearningPortfolio/3.0 (field-ecologist asset pipeline)' };

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Throws unless `licence` is on the plan 09 decision 2 list. */
export function assertLicence(licence, what) {
  if (!ALLOWED_LICENCES.includes(licence) || FORBIDDEN_LICENCE.test(licence)) {
    throw new Error(`Licence check failed for ${what}: "${licence}" is not on the allowed list (${ALLOWED_LICENCES.join(', ')})`);
  }
}

/** Throws unless the URL's host belongs to the given source site. */
export function assertHost(url, site) {
  const host = new URL(url).hostname;
  if (!SOURCE_SITES[site].hosts.includes(host)) throw new Error(`Licence check failed: ${url} is not on ${site} (${SOURCE_SITES[site].hosts.join(', ')})`);
}

/**
 * Opens each source site's licence page and checks that it still states CC0.
 * Neither API has a per-asset licence field, so this is the asset-level proof
 * (the same check is recorded in research/sources.md).
 */
export async function checkSiteLicences(sites = Object.keys(SOURCE_SITES)) {
  const out = {};
  for (const site of sites) {
    const s = SOURCE_SITES[site];
    assertLicence(s.licence, site);
    const res = await fetch(s.licencePage, { headers: { ...UA, Accept: 'text/html' } });
    if (!res.ok) throw new Error(`Licence check failed: ${s.licencePage} returned HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes(s.mustContain)) throw new Error(`Licence check failed: ${s.licencePage} no longer contains "${s.mustContain}"`);
    out[site] = { page: s.licencePage, licence: s.licence, checkedAt: new Date().toISOString().slice(0, 10) };
    console.log(`licence ok: ${site} -> ${s.licence} (${s.licencePage})`);
  }
  return out;
}

export async function fetchJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Download to `dest` unless it already exists (raw cache in data/raw/v3, gitignored). */
export async function download(url, dest) {
  if (existsSync(dest)) return readFileSync(dest);
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf;
}

/**
 * Encode one image file to KTX2.
 * kind: 'color' (sRGB ETC1S), 'linear' (ETC1S, RGB kept so three.js reads G/B),
 * 'normal' (UASTC + RDO + Zstd; ETC1S normal mode would need a custom shader).
 */
export function encodeKtx2(input, kind, size) {
  const work = join(tmpdir(), `fe-v3-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(work, { recursive: true });
  try {
    const src = join(work, 'in.png');
    execFileSync('magick', [input, '-resize', `${size}x${size}>`, '-depth', '8', src]);
    const out = join(work, 'out.ktx2');
    const common = ['--t2', '--genmipmap'];
    const args = kind === 'normal'
      ? [...common, '--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '2.0', '--zcmp', '19', '--assign_oetf', 'linear', '--target_type', 'RGB']
      : kind === 'color'
        ? [...common, '--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--assign_oetf', 'srgb']
        : [...common, '--encode', 'etc1s', '--clevel', '4', '--qlevel', '160', '--assign_oetf', 'linear', '--target_type', 'RGB'];
    execFileSync(TOKTX, [...args, out, src], { stdio: ['ignore', 'ignore', 'inherit'] });
    return readFileSync(out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function makeIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
}

/** Triangle count of everything drawn by the default scene (instances counted once per node). */
export function countTriangles(doc) {
  let tris = 0;
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  });
  return Math.round(tris);
}

export function boundsMetres(doc, scene) {
  const s = scene || doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const { min, max } = getBounds(s);
  return max.map((v, i) => +(v - min[i]).toFixed(3));
}

/** Re-encode every texture in a document to KTX2 (KHR_texture_basisu, required). */
export function texturesToKtx2(doc, size) {
  const textures = doc.getRoot().listTextures();
  if (!textures.length) return [];
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const work = join(tmpdir(), `fe-v3-tex-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(work, { recursive: true });
  const report = [];
  try {
    textures.forEach((tex, i) => {
      const slots = listTextureSlots(tex);
      const kind = slots.some((s) => /normal/i.test(s)) ? 'normal'
        : slots.some((s) => /baseColor|emissive|diffuse|specularColor|sheenColor/i.test(s)) ? 'color' : 'linear';
      const ext = tex.getMimeType() === 'image/png' ? 'png' : 'jpg';
      const src = join(work, `t${i}.${ext}`);
      writeFileSync(src, Buffer.from(tex.getImage()));
      const ktx = encodeKtx2(src, kind, kind === 'normal' ? Math.min(size, 512) : size);
      tex.setImage(new Uint8Array(ktx)).setMimeType('image/ktx2');
      if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(png|jpe?g)$/i, '.ktx2'));
      report.push({ slots, kind, bytes: ktx.length });
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return report;
}

/**
 * Fallback for photogrammetry meshes whose UV seams stop the normal simplifier:
 * meshoptimizer's 'Permissive' mode may collapse across attribute seams
 * (small UV stretching on the seams, acceptable for background rocks and logs).
 */
export function simplifyPermissive(doc, ratio, error) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      if (!idx || prim.getMode() !== 4) continue;
      const pos = prim.getAttribute('POSITION').getArray();
      const target = Math.max(3, Math.floor((idx.getCount() * ratio) / 3) * 3);
      const [out] = MeshoptSimplifier.simplify(new Uint32Array(idx.getArray()), new Float32Array(pos), 3, target, error, ['Permissive']);
      idx.setArray(out);
      compactPrimitive(prim);
    }
  }
}

/** meshopt (includes quantization) at the level the S2 spikes recommend. */
export async function compressGeometry(doc) {
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
}

export function readManifest() {
  if (!existsSync(MANIFEST)) return { assets: {} };
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

export function writeHashed(dir, base, ext, buf) {
  mkdirSync(dir, { recursive: true });
  const h = sha256(buf);
  const name = `${base}-${h.slice(0, 8)}.${ext}`;
  writeFileSync(join(dir, name), buf);
  return { name, bytes: buf.length, sha256: h };
}

/**
 * Rewrite the "v3:" rows of ATTRIBUTION.md from the manifest (one row per
 * shipped file group, plus one per CC0 source baked into an own-work file).
 * Rows are inserted after the last non-v3 row; other rows are left alone.
 */
export function syncAttributionRows(manifest) {
  const path = join(ROOT, 'ATTRIBUTION.md');
  const lines = readFileSync(path, 'utf8').split('\n');
  const files = (e) => {
    const f = e.files[0].file;
    if (e.files.length === 1) return `public/${f}`;
    const dir = f.slice(0, f.lastIndexOf('/') + 1);
    return `public/${dir}${e.files.map((x) => x.file.slice(dir.length)).join(', ')}`;
  };
  const rows = [];
  const all = Object.entries(manifest.assets);
  for (const [, e] of all) if (e.origin === 'third-party') rows.push(`| v3: ${e.name} (\`${files(e)}\`) | ${e.author} | ${e.source} | ${e.licence} | ${e.changes}; ${e.use} |`);
  for (const [key, e] of all) {
    if (e.origin !== 'own') continue;
    for (const d of e.derivedFrom || []) rows.push(`| v3: ambientCG ${d.sourceId} (baked into \`${files(e)}\`) | ${d.author} | ${d.source} | ${d.licence} | ${d.changes} |`);
    rows.push(`| v3: ${key} (\`${files(e)}\`${e.sourceFile ? `, source \`${e.sourceFile}\`` : ''}) | ${e.author} | ${e.source} | ${e.licence} | Generated by scripts/build-v3-own-assets.mjs; ${e.use} |`);
  }
  const kept = lines.filter((l) => !l.startsWith('| v3: '));
  let at = -1;
  kept.forEach((l, i) => { if (/^\|/.test(l)) at = i; });
  kept.splice(at + 1, 0, ...rows);
  writeFileSync(path, kept.join('\n'));
  return rows.length;
}
