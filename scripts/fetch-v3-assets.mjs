#!/usr/bin/env node
/**
 * fetch-v3-assets.mjs — downloads and processes the third-party v3 assets
 * listed in scripts/v3-assets.config.mjs (plan 10 §6.3, formats from
 * _templates/spikes/RESULTS.md "Asset formats S4 should use"):
 *   - Poly Haven models -> GLB, EXT_meshopt_compression + KHR_mesh_quantization,
 *     textures KHR_texture_basisu (KTX2: ETC1S colour/linear, UASTC normals);
 *   - Poly Haven HDRI   -> .hdr, unmodified;
 *   - ambientCG PBR     -> standalone .ktx2 maps (or staged in data/raw for the
 *     own-work builder when `embed: true`).
 *
 * Licence check: before any download it opens each site's licence page and
 * aborts unless the CC0 statement is there, checks every licence string
 * against plan 09 decision 2, and refuses any download URL outside the
 * site's hosts. Raw downloads are cached in data/raw/v3/ (gitignored).
 *
 * Output: public/assets/v3/** (content-hashed names) and the third-party
 * entries of public/assets/v3/manifest.json.
 *
 * Usage: node scripts/fetch-v3-assets.mjs [--only id1,id2]
 * Needs: magick (ImageMagick), toktx 4.4.2 (TOKTX env or ~/ktx-software/bin/toktx).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { getBounds } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import { AMBIENTCG_MATERIALS, POLYHAVEN_HDRIS, POLYHAVEN_MODELS, SOURCE_SITES } from './v3-assets.config.mjs';
import {
  OUT, RAW, MANIFEST, assertHost, assertLicence, boundsMetres, checkSiteLicences, compressGeometry,
  countTriangles, download, encodeKtx2, fetchJson, makeIO, readManifest, simplifyPermissive, texturesToKtx2, writeHashed,
} from './lib/v3-asset-lib.mjs';

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? new Set(process.argv[onlyIdx + 1].split(',')) : null;
const want = (x) => !only || only.has(x.id) || only.has(x.out);

const siteLicences = await checkSiteLicences();
const manifest = readManifest();
manifest.assets ||= {};
const io = await makeIO();

function replaceEntry(key, entry) {
  const old = manifest.assets[key];
  const keep = new Set(entry.files.map((f) => f.file));
  for (const f of old?.files || []) {
    if (!keep.has(f.file) && existsSync(join(OUT, '..', '..', f.file))) rmSync(join(OUT, '..', '..', f.file));
  }
  entry.bytes = entry.files.reduce((s, f) => s + f.bytes, 0);
  manifest.assets[key] = entry;
}
const rel = (sub, name) => `assets/v3/${sub}/${name}`;

// ---------------------------------------------------------------- Poly Haven models
for (const m of POLYHAVEN_MODELS.filter(want)) {
  const info = await fetchJson(`https://api.polyhaven.com/info/${m.id}`);
  if (info.type !== 2) throw new Error(`${m.id} is not a Poly Haven model`);
  const authors = Object.keys(info.authors || {});
  if (!authors.length) throw new Error(`${m.id}: no author on api.polyhaven.com/info`);
  const licence = SOURCE_SITES.polyhaven.licence;
  assertLicence(licence, m.id);
  const files = await fetchJson(`https://api.polyhaven.com/files/${m.id}`);
  const g = files?.gltf?.['1k']?.gltf || files?.gltf?.['2k']?.gltf;
  if (!g?.url) throw new Error(`${m.id}: no 1k/2k glTF`);
  assertHost(g.url, 'polyhaven');
  const rawDir = join(RAW, 'polyhaven', `${m.id}-${info.files_hash.slice(0, 8)}`);
  await download(g.url, join(rawDir, basename(new URL(g.url).pathname)));
  for (const [relPath, meta] of Object.entries(g.include || {})) {
    assertHost(meta.url, 'polyhaven');
    await download(meta.url, join(rawDir, relPath));
  }
  const doc = await io.read(join(rawDir, basename(new URL(g.url).pathname)));
  const trisSource = countTriangles(doc);
  await doc.transform(dedup(), prune(), weld());
  let tris = countTriangles(doc);
  for (const error of [0.001, 0.003, 0.01, 0.03, 0.08, 0.15, 0.3]) {
    if (tris <= m.maxTris) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.01, m.maxTris / tris), error }));
    tris = countTriangles(doc);
  }
  for (const error of [0.01, 0.03, 0.08]) {
    if (tris <= m.maxTris) break;
    simplifyPermissive(doc, m.maxTris / tris, error);
    tris = countTriangles(doc);
  }
  if (tris > m.maxTris * 1.1) throw new Error(`${m.id}: ${tris} triangles after simplify (target ${m.maxTris})`);
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const boundsM = boundsMetres(doc, scene);
  const parts = scene.listChildren().map((n) => {
    const { min, max } = getBounds(n);
    return { node: n.getName(), sizeM: max.map((v, i) => +(v - min[i]).toFixed(3)) };
  });
  const textures = texturesToKtx2(doc, m.tex);
  await doc.transform(prune());
  await compressGeometry(doc);
  const glb = Buffer.from(await io.writeBinary(doc));
  const w = writeHashed(join(OUT, 'models'), m.out, 'glb', glb);
  replaceEntry(m.out, {
    origin: 'third-party', kind: 'model', site: 'polyhaven', sourceId: m.id, name: info.name,
    author: authors.join(', '), source: `https://polyhaven.com/a/${m.id}`, licence,
    tier: m.tier, catalog: m.catalog, use: m.use,
    files: [{ file: rel('models', w.name), bytes: w.bytes, sha256: w.sha256 }],
    triangles: tris, trianglesSource: trisSource, boundsM, parts,
    textures: textures.map((t) => ({ slots: t.slots, encoding: t.kind === 'normal' ? 'UASTC' : 'ETC1S', bytes: t.bytes })),
    changes: `1k glTF -> GLB; ${tris < trisSource ? `simplified ${trisSource} -> ${tris} triangles (meshoptimizer); ` : ''}textures resized to ${m.tex} px and KTX2-encoded; meshopt + quantization`,
  });
  console.log(`model ${m.out}: ${tris} tris (source ${trisSource}), ${(w.bytes / 1024).toFixed(0)} KB, ${boundsM.join(' x ')} m`);
}

// ---------------------------------------------------------------- Poly Haven HDRIs
for (const h of POLYHAVEN_HDRIS.filter(want)) {
  const info = await fetchJson(`https://api.polyhaven.com/info/${h.id}`);
  if (info.type !== 0) throw new Error(`${h.id} is not a Poly Haven HDRI`);
  const authors = Object.keys(info.authors || {});
  const licence = SOURCE_SITES.polyhaven.licence;
  assertLicence(licence, h.id);
  const files = await fetchJson(`https://api.polyhaven.com/files/${h.id}`);
  const f = files?.hdri?.[h.res]?.hdr;
  if (!f?.url) throw new Error(`${h.id}: no ${h.res} hdr`);
  assertHost(f.url, 'polyhaven');
  const buf = await download(f.url, join(RAW, 'polyhaven', `${h.id}-${info.files_hash.slice(0, 8)}`, basename(new URL(f.url).pathname)));
  if (f.md5) {
    const md5 = createHash('md5').update(buf).digest('hex');
    if (md5 !== f.md5) throw new Error(`${h.id}: md5 mismatch`);
  }
  const w = writeHashed(join(OUT, 'hdri'), h.out, 'hdr', buf);
  replaceEntry(h.out, {
    origin: 'third-party', kind: 'hdri', site: 'polyhaven', sourceId: h.id, name: info.name,
    author: authors.join(', '), source: `https://polyhaven.com/a/${h.id}`, licence,
    tier: h.tier, catalog: h.catalog, use: h.use,
    takenAt: info.date_taken ? new Date(info.date_taken * 1000).toISOString() : null,
    files: [{ file: rel('hdri', w.name), bytes: w.bytes, sha256: w.sha256 }],
    changes: `Unmodified ${h.res} HDR (renamed copy)`,
  });
  console.log(`hdri ${h.out}: ${(w.bytes / 1024).toFixed(0)} KB`);
}

// ---------------------------------------------------------------- ambientCG materials
for (const a of AMBIENTCG_MATERIALS.filter(want)) {
  const res = await fetchJson(`https://ambientcg.com/api/v2/full_json?id=${a.id}&include=downloadData`);
  const asset = res.foundAssets?.find((x) => x.assetId === a.id);
  if (!asset) throw new Error(`${a.id} not found on ambientCG`);
  const licence = SOURCE_SITES.ambientcg.licence;
  assertLicence(licence, a.id);
  const dl = (asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads || []).find((d) => d.attribute === '1K-JPG');
  if (!dl) throw new Error(`${a.id}: no 1K-JPG download`);
  assertHost(dl.fullDownloadPath, 'ambientcg');
  const dir = join(RAW, 'ambientcg', a.id);
  const zip = join(RAW, 'ambientcg', `${a.id}_1K-JPG.zip`);
  await download(dl.fullDownloadPath, zip);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  }
  writeFileSync(join(dir, 'source.json'), JSON.stringify({
    id: a.id, name: asset.displayName, source: `https://ambientcg.com/a/${a.id}`, author: 'ambientCG', licence,
  }, null, 2));
  if (a.embed) { console.log(`ambientCG ${a.id}: staged in data/raw for the own-work builder`); continue; }
  const map = (suffix) => readdirSync(dir).find((f) => f.endsWith(`_${suffix}.jpg`));
  const files = [];
  for (const [key, size] of Object.entries(a.size)) {
    let input = join(dir, map({ color: 'Color', normal: 'NormalGL', rough: 'Roughness' }[key]));
    let tmp = null;
    if (key === 'color' && a.alpha) {
      tmp = join(tmpdir(), `fe-v3-${a.id}-rgba.png`);
      execFileSync('magick', [input, join(dir, map('Opacity')), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', tmp]);
      input = tmp;
    }
    const ktx = encodeKtx2(input, key === 'color' ? 'color' : key === 'normal' ? 'normal' : 'linear', size);
    if (tmp) rmSync(tmp, { force: true });
    const w = writeHashed(join(OUT, 'textures'), `${a.out}-${key}`, 'ktx2', ktx);
    files.push({ file: rel('textures', w.name), bytes: w.bytes, sha256: w.sha256, map: key, sizePx: size, encoding: key === 'normal' ? 'UASTC' : 'ETC1S' });
  }
  const tile = asset.dimensionX ? +(asset.dimensionX / 100).toFixed(2) : null;
  replaceEntry(a.out, {
    origin: 'third-party', kind: 'material', site: 'ambientcg', sourceId: a.id, name: asset.displayName,
    author: 'ambientCG', source: `https://ambientcg.com/a/${a.id}`, licence,
    tier: a.tier, catalog: a.catalog, use: a.use, tileSizeM: tile,
    files,
    changes: `1K JPG maps -> KTX2 (${files.map((f) => `${f.map} ${f.sizePx} px ${f.encoding}`).join(', ')})${a.alpha ? '; opacity merged into the colour alpha' : ''}`,
  });
  console.log(`material ${a.out}: ${files.map((f) => `${f.map} ${(f.bytes / 1024).toFixed(0)} KB`).join(', ')}`);
}

manifest.licenceCheck = siteLicences;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${MANIFEST}`);
