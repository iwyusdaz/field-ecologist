#!/usr/bin/env node
/**
 * build-v3-own-assets.mjs — own-work (MIT) v3 assets for Ashcombe Meadow,
 * generated from code so they can be rebuilt and reviewed:
 *
 *   woodland-trees.glb  three generic broadleaf forms (tall tree ~17 m, small
 *                       tree ~10 m, hedge shrub ~2.6 m), each as LOD0
 *                       (<= 8,000 triangles) and LOD1 (<= 150 triangles) with the
 *                       pivot at the trunk base (spikes RESULTS.md "Trees and
 *                       dense vegetation"). Bark: ambientCG Bark012 (CC0). Leaf
 *                       cards: clusters composited from ambientCG LeafSet024 (CC0).
 *                       Not a specific species: generic broadleaf teaching dressing.
 *   survey-stake.glb    numbered survey stake (0.6 m) with flagging tape and a
 *                       blank number plate (UV 0..1) for a run-time digit texture.
 *   cloud-sprites.ktx2  2x2 atlas of soft cloud billboards (ETC1S + alpha).
 *   ashcombe-dawn-33    case LUT: .cube source in assets-src/lut/, PNG strip
 *                       (1089x33 RGB8) in public/assets/v3/lut/.
 *
 * Run scripts/fetch-v3-assets.mjs first (it stages Bark012 and LeafSet024 in
 * data/raw/v3/ambientcg after the licence check). At the end it rewrites the
 * "v3:" rows of ATTRIBUTION.md from the manifest (npm run attribution then
 * regenerates public/attribution.json).
 * Usage: node scripts/build-v3-own-assets.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Document, getBounds } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { OWN_ASSETS } from './v3-assets.config.mjs';
import {
  MANIFEST, OUT, RAW, ROOT, assertLicence, compressGeometry, countTriangles, encodeKtx2, makeIO, readManifest, syncAttributionRows, writeHashed,
} from './lib/v3-asset-lib.mjs';

const LICENCE = 'Own work (MIT)';
const AUTHOR = 'Field Ecologist project (own procedural work)';
const SELF = 'https://github.com/iwyusdaz/field-ecologist/blob/v3/scripts/build-v3-own-assets.mjs';
assertLicence(LICENCE, 'own work');
const cfg = Object.fromEntries(OWN_ASSETS.map((a) => [a.out, a]));
const manifest = readManifest();
manifest.assets ||= {};
const io = await makeIO();
const work = join(tmpdir(), `fe-v3-own-${process.pid}`);
mkdirSync(work, { recursive: true });
const sourceOf = (id) => JSON.parse(readFileSync(join(RAW, 'ambientcg', id, 'source.json'), 'utf8'));
for (const id of ['Bark012', 'LeafSet024']) assertLicence(sourceOf(id).licence, id);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const magick = (...args) => execFileSync('magick', args.flat(), { stdio: ['ignore', 'ignore', 'inherit'] });
function replaceEntry(key, entry) {
  const old = manifest.assets[key];
  const keep = new Set(entry.files.map((f) => f.file));
  for (const f of old?.files || []) if (!keep.has(f.file)) rmSync(join(ROOT, 'public', f.file), { force: true });
  entry.bytes = entry.files.reduce((s, f) => s + f.bytes, 0);
  manifest.assets[key] = entry;
}

// ------------------------------------------------------------------ geometry helpers
class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  get tris() { return this.i.length / 3; }
  vert(p, n, uv) { this.p.push(...p); this.n.push(...n); this.uv.push(...uv); return this.p.length / 3 - 1; }
  quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
}
const add = (a, b) => a.map((v, k) => v + b[k]);
const sub = (a, b) => a.map((v, k) => v - b[k]);
const mul = (a, s) => a.map((v) => v * s);
const len = (a) => Math.hypot(...a);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/** Tapered tube along a quadratic Bezier p0 -> p1 (control) -> p2. Bark UVs repeat every `uvRepeat` metres. */
function tube(mb, p0, p1, p2, r0, r1, radial, rings, uvRepeat = 1.2, capTip = true) {
  const pts = [];
  for (let s = 0; s <= rings; s++) {
    const t = s / rings;
    const a = lerp(p0, p1, t), b = lerp(p1, p2, t);
    pts.push({ c: lerp(a, b, t), tan: norm(sub(b, a)), r: r0 + (r1 - r0) * t });
  }
  let ref = Math.abs(pts[0].tan[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let vAcc = 0;
  const rows = [];
  pts.forEach((pt, s) => {
    if (s > 0) vAcc += len(sub(pt.c, pts[s - 1].c));
    const side = norm(cross(pt.tan, ref)); const up = cross(side, pt.tan); ref = up;
    const row = [];
    for (let k = 0; k <= radial; k++) {
      const ang = (k / radial) * Math.PI * 2;
      const dir = add(mul(side, Math.cos(ang)), mul(up, Math.sin(ang)));
      const circ = 2 * Math.PI * Math.max(pt.r, 0.02);
      row.push(mb.vert(add(pt.c, mul(dir, pt.r)), dir, [(k / radial) * Math.max(1, Math.round(circ / uvRepeat)), vAcc / uvRepeat]));
    }
    rows.push(row);
  });
  for (let s = 0; s < rings; s++) for (let k = 0; k < radial; k++) mb.quad(rows[s][k], rows[s][k + 1], rows[s + 1][k + 1], rows[s + 1][k]);
  if (capTip && r1 > 0.004) {
    const tip = mb.vert(add(pts[rings].c, mul(pts[rings].tan, r1)), pts[rings].tan, [0.5, vAcc / uvRepeat]);
    for (let k = 0; k < radial; k++) mb.i.push(rows[rings][k], rows[rings][k + 1], tip);
  }
  return pts;
}

/** A leaf-cluster card: quad of side `size` centred at c, facing `facing`; normal points away from the crown centre. */
function card(mb, c, facing, size, crownCentre, r) {
  const f = norm(facing);
  const upHint = norm(add([0, 1, 0], mul([r() - 0.5, 0, r() - 0.5], 0.8)));
  let side = cross(upHint, f); if (len(side) < 1e-3) side = [1, 0, 0]; side = norm(side);
  const up = norm(cross(f, side));
  const n = norm(add(norm(sub(c, crownCentre)), mul(f, 0.3)));
  const h = size / 2;
  const v = [[-h, -h, 0, 0], [h, -h, 1, 0], [h, h, 1, 1], [-h, h, 0, 1]].map(([x, y, u, w]) => mb.vert(add(c, add(mul(side, x), mul(up, y))), n, [u, w]));
  mb.quad(v[0], v[1], v[2], v[3]);
}

/** Random point in an ellipsoid shell (radius fraction 0.55..1), axes [rx, ry, rz]. */
function shellPoint(r, centre, axes, inner = 0.55) {
  for (;;) {
    const d = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
    const l = len(d); if (l > 1 || l < 1e-3) continue;
    const k = inner + (1 - inner) * Math.sqrt(r());
    return add(centre, d.map((v, i) => (v / l) * k * axes[i]));
  }
}

/**
 * Generic broadleaf form. Returns { lod0: {wood, leaves}, lod1: {wood, leaves} } MeshBuilders.
 * p: { seed, stems, trunkH, trunkR, crownY, crown:[rx,ry,rz], primaries, secondaries, cards, cardSize, lod1Cards, lod1CardSize, radial }
 */
function broadleaf(p) {
  const r = rng(p.seed);
  const centre = [0, p.crownY, 0];
  const lod0 = { wood: new MeshBuilder(), leaves: new MeshBuilder() };
  const lobeEnds = [];
  for (let s = 0; s < p.stems; s++) {
    const az0 = (s / p.stems) * Math.PI * 2 + r();
    const lean = p.stems > 1 ? 0.35 : 0.04;
    const base = p.stems > 1 ? [Math.cos(az0) * 0.12, 0, Math.sin(az0) * 0.12] : [0, -0.05, 0];
    const top = [Math.cos(az0) * lean * p.trunkH, p.trunkH, Math.sin(az0) * lean * p.trunkH];
    const ctrl = add(lerp(base, top, 0.5), [(r() - 0.5) * 0.1 * p.trunkH, 0, (r() - 0.5) * 0.1 * p.trunkH]);
    tube(lod0.wood, base, ctrl, top, p.trunkR, p.trunkR * 0.6, p.radial, 6, 1.2, false);
    const nPrim = Math.round(p.primaries / p.stems) || 1;
    for (let k = 0; k < nPrim; k++) {
      const az = az0 + (k / nPrim) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const elev = 0.12 + r() * 0.95;
      const dir = [Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)];
      const start = lerp(base, top, 0.75 + r() * 0.25);
      const target = add(centre, dir.map((v, i) => v * p.crown[i] * (0.5 + r() * 0.2)));
      const L = len(sub(target, start));
      const mid = add(lerp(start, target, 0.5), [0, L * 0.08, 0]);
      const pts = tube(lod0.wood, start, mid, target, p.trunkR * 0.45, p.trunkR * 0.12, Math.max(4, p.radial - 2), 4);
      for (let q = 0; q < p.secondaries; q++) {
        const at = pts[1 + Math.floor(r() * (pts.length - 2))];
        const sdir = norm(add(at.tan, [(r() - 0.5) * 1.6, r() * 0.6, (r() - 0.5) * 1.6]));
        const sl = L * (0.3 + r() * 0.25);
        const end = add(at.c, mul(sdir, sl));
        tube(lod0.wood, at.c, add(lerp(at.c, end, 0.5), [0, sl * 0.1, 0]), end, Math.max(at.r * 0.45, 0.012), 0.008, 4, 3);
      }
      lobeEnds.push(target);
    }
  }
  // the crown is a union of lobes around the branch ends (an irregular, cumulus-like
  // broadleaf silhouette instead of one ball); leaf cards sit on the lobe shells
  const lobeR = p.lobe * (p.crown[0] + p.crown[1] + p.crown[2]) / 3;
  const lobes = lobeEnds.map((c) => ({ c, r: lobeR * (0.75 + r() * 0.5) }));
  const pickLobe = (rr) => { const tot = lobes.reduce((a, l) => a + l.r * l.r, 0); let x = rr() * tot; for (const l of lobes) { x -= l.r * l.r; if (x <= 0) return l; } return lobes[lobes.length - 1]; };
  for (let k = 0; k < p.cards; k++) {
    const lb = pickLobe(r);
    const c = shellPoint(r, lb.c, [lb.r, lb.r * 0.8, lb.r], 0.5);
    const out = norm(sub(c, lb.c));
    card(lod0.leaves, c, add(out, [(r() - 0.5) * 1.4, (r() - 0.5) * 1.4, (r() - 0.5) * 1.4]), p.cardSize * (0.8 + r() * 0.4), lb.c, r);
  }
  const lod1 = { wood: new MeshBuilder(), leaves: new MeshBuilder() };
  for (let s = 0; s < p.stems; s++) {
    const az0 = (s / p.stems) * Math.PI * 2;
    const lean = p.stems > 1 ? 0.35 : 0.04;
    const base = p.stems > 1 ? [Math.cos(az0) * 0.12, 0, Math.sin(az0) * 0.12] : [0, -0.05, 0];
    const top = [Math.cos(az0) * lean * p.trunkH, p.trunkH * 1.15, Math.sin(az0) * lean * p.trunkH];
    tube(lod1.wood, base, lerp(base, top, 0.5), top, p.trunkR, p.trunkR * 0.5, p.stems > 1 ? 3 : 5, 1, 1.2, false);
  }
  const r1 = rng(p.seed + 7);
  for (let k = 0; k < p.lod1Cards; k++) {
    const lb = pickLobe(r1);
    const c = shellPoint(r1, lb.c, [lb.r, lb.r * 0.8, lb.r], 0.35);
    card(lod1.leaves, c, add(norm(sub(c, lb.c)), [(r1() - 0.5), (r1() - 0.5), (r1() - 0.5)]), p.lod1CardSize * (0.85 + r1() * 0.3), lb.c, r1);
  }
  return { lod0, lod1 };
}

const FORMS = {
  'tree-tall': { seed: 11, stems: 1, trunkH: 5.5, trunkR: 0.36, crownY: 10.5, crown: [7.0, 5.0, 7.0], lobe: 0.42, primaries: 9, secondaries: 4, cards: 2800, cardSize: 1.5, lod1Cards: 62, lod1CardSize: 4.4, radial: 8, lod0Max: 8000 },
  'tree-small': { seed: 23, stems: 1, trunkH: 3.2, trunkR: 0.2, crownY: 6.4, crown: [4.2, 3.2, 4.2], lobe: 0.45, primaries: 7, secondaries: 3, cards: 2000, cardSize: 1.2, lod1Cards: 62, lod1CardSize: 2.8, radial: 7, lod0Max: 8000 },
  'hedge-shrub': { seed: 37, stems: 5, trunkH: 1.1, trunkR: 0.045, crownY: 1.45, crown: [1.7, 1.1, 1.1], lobe: 0.5, primaries: 10, secondaries: 2, cards: 1500, cardSize: 0.75, lod1Cards: 55, lod1CardSize: 1.25, radial: 5, lod0Max: 8000 },
};

// ------------------------------------------------------------------ textures
function leafClusterTexture() {
  const dir = join(RAW, 'ambientcg', 'LeafSet024');
  const color = join(dir, 'LeafSet024_1K-JPG_Color.jpg');
  const opacity = join(dir, 'LeafSet024_1K-JPG_Opacity.jpg');
  const rgba = join(work, 'leafset-rgba.png');
  magick(color, opacity, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', rgba);
  // the nine leaf cells of the atlas (connected components of the opacity map)
  const cells = [[48, 7, 249, 328], [400, 4, 225, 326], [737, 7, 235, 324], [54, 353, 232, 318], [399, 361, 231, 315], [736, 348, 229, 329], [52, 692, 232, 319], [392, 691, 238, 324], [734, 694, 231, 322]];
  const leaves = cells.map(([x, y, w, h], k) => { const f = join(work, `leaf${k}.png`); magick(rgba, '-crop', `${w}x${h}+${x}+${y}`, '+repage', f); return f; });
  const r = rng(99);
  const S = 512;
  const args = ['-size', `${S}x${S}`, 'xc:none'];
  // twigs
  args.push('-stroke', '#4a3a28', '-strokewidth', '2', '-fill', 'none');
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + r() * 0.5, l = S * (0.2 + r() * 0.14);
    args.push('-draw', `line ${S / 2},${S / 2} ${Math.round(S / 2 + Math.cos(a) * l)},${Math.round(S / 2 + Math.sin(a) * l)}`);
  }
  args.push('-stroke', 'none');
  const N = 320;
  for (let k = 0; k < N; k++) {
    let x, y;
    for (;;) { x = r() * 2 - 1; y = r() * 2 - 1; if (x * x + y * y <= 1) break; }
    const px = S / 2 + x * S * 0.45, py = S / 2 + y * S * 0.45;
    const h = Math.round(30 + r() * 12), w = Math.round(h * 0.72);
    const rot = (Math.atan2(y, x) * 180) / Math.PI + 90 + (r() - 0.5) * 70; // stalk toward the centre
    const bright = Math.round(62 + (k / N) * 38 + r() * 8); // later leaves are on top and lit
    const hue = Math.round(96 + r() * 8);
    args.push('(', leaves[Math.floor(r() * leaves.length)], '-resize', `${w}x${h}!`, '-background', 'none', '-rotate', String(Math.round(rot)), '-modulate', `${bright},${Math.round(95 + r() * 15)},${hue}`, ')',
      '-geometry', `+${Math.round(px - h / 2)}+${Math.round(py - h / 2)}`, '-compose', 'over', '-composite');
  }
  const out = join(work, 'leaf-cluster.png');
  magick(...args, out);
  return out;
}

function woodGrainTexture() {
  const out = join(work, 'stake-wood.png');
  magick('-size', '128x512', '-seed', '5', 'plasma:#c9a172-#8a6540', '-blur', '0x1', '-motion-blur', '0x48+90', '-modulate', '100,80', out);
  return out;
}

// ------------------------------------------------------------------ glTF writing
function buildDoc() {
  const doc = new Document();
  doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  return doc;
}
function primFrom(doc, mb, material) {
  const buffer = doc.getRoot().listBuffers()[0];
  const acc = (arr, type, Ctor) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buffer);
  return doc.createPrimitive()
    .setAttribute('POSITION', acc(mb.p, 'VEC3', Float32Array))
    .setAttribute('NORMAL', acc(mb.n, 'VEC3', Float32Array))
    .setAttribute('TEXCOORD_0', acc(mb.uv, 'VEC2', Float32Array))
    .setIndices(acc(mb.i, 'SCALAR', Uint32Array))
    .setMaterial(material);
}
function ktxTexture(doc, name, file, kind, size) {
  const buf = encodeKtx2(file, kind, size);
  return doc.createTexture(name).setImage(new Uint8Array(buf)).setMimeType('image/ktx2').setURI(`${name}.ktx2`);
}
async function finish(doc, out, extra) {
  const parts = doc.getRoot().getDefaultScene().listChildren().flatMap((g) => (g.listChildren().length ? g.listChildren() : [g])).map((n) => {
    const { min, max } = getBounds(n);
    let tris = 0;
    n.traverse((x) => { for (const pr of x.getMesh()?.listPrimitives() || []) tris += pr.getIndices().getCount() / 3; });
    return { node: n.getName(), triangles: tris, sizeM: max.map((v, i) => +(v - min[i]).toFixed(3)) };
  });
  const { min, max } = getBounds(doc.getRoot().getDefaultScene());
  const boundsM = max.map((v, i) => +(v - min[i]).toFixed(3));
  const triangles = countTriangles(doc);
  await compressGeometry(doc);
  const glb = Buffer.from(await io.writeBinary(doc));
  const w = writeHashed(join(OUT, 'models'), out, 'glb', glb);
  replaceEntry(out, {
    origin: 'own', kind: 'model', author: AUTHOR, source: SELF, licence: LICENCE,
    tier: cfg[out].tier, catalog: cfg[out].catalog, use: cfg[out].use,
    files: [{ file: `assets/v3/models/${w.name}`, bytes: w.bytes, sha256: w.sha256 }],
    triangles, boundsM, parts, ...extra,
  });
  console.log(`own ${out}: ${triangles} tris, ${(w.bytes / 1024).toFixed(0)} KB; ${parts.map((p) => `${p.node} ${p.triangles}`).join(', ')}`);
  return parts;
}

// ------------------------------------------------------------------ woodland-trees.glb
{
  const doc = buildDoc();
  const barkDir = join(RAW, 'ambientcg', 'Bark012');
  const bark = doc.createMaterial('bark').setRoughnessFactor(0.95).setMetallicFactor(0)
    .setBaseColorTexture(ktxTexture(doc, 'bark-color', join(barkDir, 'Bark012_1K-JPG_Color.jpg'), 'color', 512))
    .setNormalTexture(ktxTexture(doc, 'bark-normal', join(barkDir, 'Bark012_1K-JPG_NormalGL.jpg'), 'normal', 256));
  const leaves = doc.createMaterial('leaves').setRoughnessFactor(0.8).setMetallicFactor(0)
    .setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(true)
    .setBaseColorTexture(ktxTexture(doc, 'leaf-cluster', leafClusterTexture(), 'color', 512));
  const scene = doc.createScene('woodland-trees');
  doc.getRoot().setDefaultScene(scene);
  for (const [name, p] of Object.entries(FORMS)) {
    const { lod0, lod1 } = broadleaf(p);
    const t0 = lod0.wood.tris + lod0.leaves.tris, t1 = lod1.wood.tris + lod1.leaves.tris;
    if (t0 > p.lod0Max) throw new Error(`${name} LOD0 has ${t0} triangles (max ${p.lod0Max})`);
    if (t1 > 150) throw new Error(`${name} LOD1 has ${t1} triangles (max 150)`);
    const group = doc.createNode(name);
    for (const [lod, m] of [['LOD0', lod0], ['LOD1', lod1]]) {
      const mesh = doc.createMesh(`${name}-${lod}`).addPrimitive(primFrom(doc, m.wood, bark)).addPrimitive(primFrom(doc, m.leaves, leaves));
      group.addChild(doc.createNode(`${name}-${lod}`).setMesh(mesh));
    }
    scene.addChild(group);
  }
  const b = sourceOf('Bark012'), l = sourceOf('LeafSet024');
  await finish(doc, 'woodland-trees', {
    derivedFrom: [
      { site: 'ambientcg', sourceId: 'Bark012', source: b.source, author: b.author, licence: b.licence, changes: 'Colour 512 px ETC1S + NormalGL 256 px UASTC, embedded as the bark material' },
      { site: 'ambientcg', sourceId: 'LeafSet024', source: l.source, author: l.author, licence: l.licence, changes: 'Leaves cut from the atlas and composited (320 per card, recoloured, with drawn twigs) into a 512 px leaf-cluster card, ETC1S + alpha' },
    ],
    note: 'Generic broadleaf forms, not a specific species. Nodes <form>-LOD0 / <form>-LOD1 share the origin at the trunk base; bake impostors from LOD0 at run time.',
  });
}

// ------------------------------------------------------------------ survey-stake.glb
{
  const doc = buildDoc();
  const wood = doc.createMaterial('stake-wood').setRoughnessFactor(0.85).setMetallicFactor(0)
    .setBaseColorTexture(ktxTexture(doc, 'stake-wood', woodGrainTexture(), 'color', 256));
  const paint = doc.createMaterial('stake-paint').setBaseColorFactor([0.9, 0.32, 0.08, 1]).setRoughnessFactor(0.55).setMetallicFactor(0)
    .setBaseColorTexture(doc.getRoot().listTextures()[0]);
  const tape = doc.createMaterial('flagging-tape').setBaseColorFactor([1.0, 0.22, 0.42, 1]).setRoughnessFactor(0.45).setMetallicFactor(0).setDoubleSided(true);
  const plate = doc.createMaterial('number-plate').setBaseColorFactor([0.95, 0.94, 0.9, 1]).setRoughnessFactor(0.5).setMetallicFactor(0);
  const s = 0.02, top = 0.54, foot = -0.06; // 4 cm square shaft, 6 cm point below ground, 0.54 m above
  const shaft = new MeshBuilder(), band = new MeshBuilder();
  const box = (mb, y0, y1) => {
    const faces = [[[1, 0, 0], [0, 0, 1]], [[0, 0, 1], [-1, 0, 0]], [[-1, 0, 0], [0, 0, -1]], [[0, 0, -1], [1, 0, 0]]];
    faces.forEach(([n, t], f) => {
      const c = mul(n, s);
      const v = [[-1, y0], [1, y0], [1, y1], [-1, y1]].map(([u, y]) => mb.vert(add(add(c, mul(t, u * s)), [0, y, 0]), n, [(u + 1) / 2 * 0.25 + f * 0.25, y * 1.6]));
      mb.quad(v[0], v[1], v[2], v[3]);
    });
  };
  box(shaft, 0, top - 0.07);
  box(band, top - 0.07, top);
  const capV = [[-s, -s], [s, -s], [s, s], [-s, s]].map(([x, z]) => band.vert([x, top, z], [0, 1, 0], [x / s * 0.5 + 0.5, z / s * 0.5 + 0.5]));
  band.quad(capV[3], capV[2], capV[1], capV[0]);
  const tip = shaft.vert([0, foot, 0], [0, -1, 0], [0.5, 0]);
  const ring = [[s, s], [s, -s], [-s, -s], [-s, s]].map(([x, z]) => shaft.vert([x, 0, z], norm([x, -0.5, z]), [x > 0 ? 1 : 0, 0.1]));
  for (let k = 0; k < 4; k++) shaft.i.push(ring[k], ring[(k + 1) % 4], tip);
  // flagging tape: tied under the band, hangs and curls slightly in +x
  const tp = new MeshBuilder();
  const segs = 8, tl = 0.3, tw = 0.025;
  const rows = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const c = [s + 0.004 + Math.sin(t * 1.2) * 0.035, top - 0.08 - t * tl, Math.sin(t * 3) * 0.01];
    rows.push([tp.vert(add(c, [0, 0, -tw / 2]), [1, 0, 0], [0, t]), tp.vert(add(c, [0, 0, tw / 2]), [1, 0, 0], [1, t])]);
  }
  for (let k = 0; k < segs; k++) tp.quad(rows[k][0], rows[k + 1][0], rows[k + 1][1], rows[k][1]);
  // number plate on the +z face below the band (UV 0..1 for the digit texture)
  const pl = new MeshBuilder();
  const pz = s + 0.002, py = top - 0.14;
  const pv = [[-0.035, -0.025, 0, 0], [0.035, -0.025, 1, 0], [0.035, 0.025, 1, 1], [-0.035, 0.025, 0, 1]].map(([x, y, u, v]) => pl.vert([x, py + y, pz], [0, 0, 1], [u, v]));
  pl.quad(pv[0], pv[1], pv[2], pv[3]);
  const mesh = doc.createMesh('survey-stake')
    .addPrimitive(primFrom(doc, shaft, wood)).addPrimitive(primFrom(doc, band, paint))
    .addPrimitive(primFrom(doc, tp, tape)).addPrimitive(primFrom(doc, pl, plate));
  const scene = doc.createScene('survey-stake');
  doc.getRoot().setDefaultScene(scene);
  scene.addChild(doc.createNode('survey-stake').setMesh(mesh));
  await finish(doc, 'survey-stake', { note: 'Origin at ground level; the 6 cm point sits below ground. Material "number-plate" takes a run-time canvas texture with the stake number.' });
}

// ------------------------------------------------------------------ cloud-sprites.ktx2
{
  const tiles = [];
  for (let k = 0; k < 4; k++) {
    const noise = join(work, `cn${k}.png`), mask = join(work, `cm${k}.png`), tile = join(work, `ct${k}.png`);
    magick('-size', '512x512', '-seed', String(31 + k), 'plasma:fractal', '-colorspace', 'gray', '-blur', '0x5', '-auto-level', noise);
    // cumulus-like mask: soft ellipse, flatter at the base
    magick('-size', '512x512', 'xc:black', '-fill', 'white', '-draw', `ellipse 256,${300 - k * 10} ${200 - k * 12},${130 + k * 8} 0,360`, '-fill', 'black', '-draw', `rectangle 0,${370 + k * 6} 512,512`, '-blur', '0x34', mask);
    magick(noise, mask, '-compose', 'multiply', '-composite', '-level', '12%,55%', join(work, `ca${k}.png`));
    // colour: white tops, slightly grey-blue bases (lit from above at dawn)
    magick('-size', '512x512', 'gradient:#fffaf2-#b9c2cc', join(work, `cc${k}.png`));
    magick(join(work, `cc${k}.png`), join(work, `ca${k}.png`), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', tile);
    tiles.push(tile);
  }
  const atlas = join(work, 'cloud-atlas.png');
  magick('(', tiles[0], tiles[1], '+append', ')', '(', tiles[2], tiles[3], '+append', ')', '-append', '+repage', atlas);
  const ktx = encodeKtx2(atlas, 'color', 1024);
  const w = writeHashed(join(OUT, 'sprites'), 'cloud-sprites', 'ktx2', ktx);
  replaceEntry('cloud-sprites', {
    origin: 'own', kind: 'texture', author: AUTHOR, source: SELF, licence: LICENCE,
    tier: cfg['cloud-sprites'].tier, catalog: cfg['cloud-sprites'].catalog, use: cfg['cloud-sprites'].use,
    files: [{ file: `assets/v3/sprites/${w.name}`, bytes: w.bytes, sha256: w.sha256, sizePx: 1024, encoding: 'ETC1S', layout: '2x2 atlas, 512 px tiles' }],
  });
  console.log(`own cloud-sprites: ${(w.bytes / 1024).toFixed(0)} KB`);
}

// ------------------------------------------------------------------ ashcombe-dawn-33 LUT
{
  const N = 33;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  /** Display-space grade after AgX: lifted cool shadows (mist), dawn-gold highlights, soft contrast, -5% saturation. */
  function grade(r, g, b) {
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = 0.95;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    const sh = (1 - l) ** 3, hi = l ** 2;
    r += -0.006 * sh + 0.05 * hi;   // warm highlights toward #F6A65A
    g += 0.010 * sh + 0.022 * hi;
    b += 0.026 * sh - 0.04 * hi;    // cool, misty shadows
    const soft = (x) => x + 0.06 * (x - 0.5) * (1 - Math.abs(2 * x - 1)) * -1; // gentle contrast reduction
    const lift = 0.025;
    return [clamp(lift + soft(r) * (1 - lift)), clamp(lift + soft(g) * (1 - lift)), clamp(lift + soft(b) * (1 - lift))];
  }
  let cube = `TITLE "Ashcombe dawn (field-ecologist v3)"\n# Own work (MIT). Display space, apply after AgX tone mapping.\nLUT_3D_SIZE ${N}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n`;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const [r, g, b] = grade(ri / (N - 1), gi / (N - 1), bi / (N - 1));
    cube += `${r.toFixed(6)} ${g.toFixed(6)} ${b.toFixed(6)}\n`;
  }
  mkdirSync(join(ROOT, 'assets-src', 'lut'), { recursive: true });
  writeFileSync(join(ROOT, 'assets-src', 'lut', 'ashcombe-dawn-33.cube'), cube);
  const w = N * N, h = N;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const c = grade((x % N) / (N - 1), y / (N - 1), Math.floor(x / N) / (N - 1));
      for (let k = 0; k < 3; k++) raw[y * (w * 3 + 1) + 1 + x * 3 + k] = Math.round(c[k] * 255);
    }
  }
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
    return Buffer.concat([l, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  const wr = writeHashed(join(OUT, 'lut'), 'ashcombe-dawn-33', 'png', png);
  replaceEntry('ashcombe-dawn-33', {
    origin: 'own', kind: 'lut', author: AUTHOR, source: SELF, licence: LICENCE,
    tier: cfg['ashcombe-dawn-33'].tier, catalog: cfg['ashcombe-dawn-33'].catalog, use: cfg['ashcombe-dawn-33'].use,
    files: [{ file: `assets/v3/lut/${wr.name}`, bytes: wr.bytes, sha256: wr.sha256, layout: `${w}x${h} RGB8 strip (blue = slice, x within slice = red, y = green)` }],
    sourceFile: 'assets-src/lut/ashcombe-dawn-33.cube',
  });
  console.log(`own ashcombe-dawn-33: png ${wr.bytes} B, cube ${cube.length} B`);
}

if (!process.env.KEEP_WORK) rmSync(work, { recursive: true, force: true });
else console.log(`kept ${work}`);
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${MANIFEST}; ATTRIBUTION.md v3 rows: ${syncAttributionRows(manifest)}`);
