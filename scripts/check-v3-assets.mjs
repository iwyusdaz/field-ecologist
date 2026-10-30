#!/usr/bin/env node
/**
 * check-v3-assets.mjs — verifies the staged v3 assets and the object catalog
 * (plan 10 §4.1, §7 Download gate, plan 09 decision 2 licences):
 *   1. every manifest entry (and every source baked into an own-work file) has
 *      an allowed licence and an ATTRIBUTION.md row with its source URL and
 *      licence; public/attribution.json matches ATTRIBUTION.md;
 *   2. every listed file exists with the recorded size and sha256, is <= 20 MB,
 *      and no unlisted file sits in public/assets/v3/;
 *   3. tier totals (first load vs streamed after the first click);
 *   4. content/objects.json: the §4.1 fields only, word limits, honesty and role
 *      values, realSize present, sources listed in research/sources.md (or a
 *      repo file that exists), >= 20 objects, and every catalog id mapped to an
 *      asset or to code (scripts/v3-assets.config.mjs CODE_ONLY).
 * Exit 1 on any failure.
 * Usage: node scripts/check-v3-assets.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ALLOWED_LICENCES, CODE_ONLY, FORBIDDEN_LICENCE, MOTION } from './v3-assets.config.mjs';
import { MANIFEST, OUT, ROOT } from './lib/v3-asset-lib.mjs';

const MAX_FILE = 20 * 1024 * 1024;
const FIRST_LOAD_ASSET_CEILING = 8 * 1024 * 1024; // mobile first-load budget; the whole page is measured by ui-audit
const FIELDS = ['id', 'name', 'short', 'more', 'whyItMatters', 'realSize', 'honesty', 'source', 'role'];
const HONESTY = ['real', 'reconstructed', 'fictional', 'illustrative', 'time-lapse'];
const fails = [];
const fail = (m) => fails.push(m);
const words = (s) => (String(s).trim().match(/\S+/g) || []).length;

// ---------------------------------------------------------------- 1. licences + attribution
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const attrMd = readFileSync(join(ROOT, 'ATTRIBUTION.md'), 'utf8');
const mdRows = attrMd.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-/.test(l) && !/^\|\s*Asset\s*\|/i.test(l));
const attrJson = JSON.parse(readFileSync(join(ROOT, 'public', 'attribution.json'), 'utf8'));
if (attrJson.length !== mdRows.length) fail(`attribution.json has ${attrJson.length} rows, ATTRIBUTION.md has ${mdRows.length} (run npm run attribution)`);
const okLicence = (l) => ALLOWED_LICENCES.includes(l) && !FORBIDDEN_LICENCE.test(l);
const rowFor = (needle, source, licence) => mdRows.find((r) => r.includes(needle) && r.includes(source) && r.includes(`| ${licence} |`));
const entries = Object.entries(manifest.assets || {});
for (const [key, e] of entries) {
  if (!okLicence(e.licence)) fail(`${key}: licence "${e.licence}" not allowed`);
  for (const f of e.files) {
    const base = f.file.split('/').pop();
    if (!rowFor(base, e.source, e.licence)) fail(`${key}: no ATTRIBUTION.md row with ${base}, ${e.source} and ${e.licence}`);
  }
  for (const d of e.derivedFrom || []) {
    if (!okLicence(d.licence)) fail(`${key} <- ${d.sourceId}: licence "${d.licence}" not allowed`);
    if (!rowFor(e.files[0].file.split('/').pop(), d.source, d.licence)) fail(`${key} <- ${d.sourceId}: no ATTRIBUTION.md row`);
  }
}
for (const [site, c] of Object.entries(manifest.licenceCheck || {})) if (!okLicence(c.licence)) fail(`site ${site}: licence ${c.licence}`);
if (!manifest.licenceCheck?.polyhaven || !manifest.licenceCheck?.ambientcg) fail('manifest has no site licence check record (run scripts/fetch-v3-assets.mjs)');

// ---------------------------------------------------------------- 2. files
const listed = new Set();
const tiers = { first: 0, stream: 0 };
let largest = { file: '', bytes: 0 };
for (const [key, e] of entries) {
  for (const f of e.files) {
    const p = join(ROOT, 'public', f.file);
    listed.add(p);
    if (!existsSync(p)) { fail(`${key}: missing ${f.file}`); continue; }
    const buf = readFileSync(p);
    if (buf.length !== f.bytes) fail(`${key}: ${f.file} is ${buf.length} B, manifest says ${f.bytes}`);
    if (createHash('sha256').update(buf).digest('hex') !== f.sha256) fail(`${key}: ${f.file} sha256 mismatch`);
    if (buf.length > MAX_FILE) fail(`${key}: ${f.file} is over 20 MB`);
    if (buf.length > largest.bytes) largest = { file: f.file, bytes: buf.length };
    if (!(e.tier in tiers)) fail(`${key}: unknown tier ${e.tier}`);
    else tiers[e.tier] += buf.length;
  }
}
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const p of walk(OUT)) if (p !== MANIFEST && !listed.has(p)) fail(`unlisted file ${relative(ROOT, p)}`);
if (tiers.first > FIRST_LOAD_ASSET_CEILING) fail(`first-load v3 assets ${tiers.first} B exceed ${FIRST_LOAD_ASSET_CEILING} B`);

// ---------------------------------------------------------------- 4. catalog
const cat = JSON.parse(readFileSync(join(ROOT, 'content', 'objects.json'), 'utf8'));
const objects = cat.objects || [];
const sourcesMd = readFileSync(join(ROOT, 'research', 'sources.md'), 'utf8');
const ids = new Set();
let maxGrade = 0;
const syll = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g) || []).length);
const grade = (t) => { const s = Math.max(1, (t.match(/[.!?]+/g) || []).length); const w = t.match(/[A-Za-z]+/g) || []; return 0.39 * (w.length / s) + 11.8 * (w.reduce((a, x) => a + syll(x), 0) / w.length) - 15.59; };
for (const o of objects) {
  const where = `objects.json ${o.id || '(no id)'}`;
  const keys = Object.keys(o);
  for (const k of FIELDS) if (!(k in o)) fail(`${where}: missing ${k}`);
  for (const k of keys) if (!FIELDS.includes(k)) fail(`${where}: extra field ${k}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.id || '')) fail(`${where}: id not kebab-case`);
  if (ids.has(o.id)) fail(`${where}: duplicate id`);
  ids.add(o.id);
  if (!String(o.name || '').trim()) fail(`${where}: empty name`);
  if (words(o.short) < 1 || words(o.short) > 25) fail(`${where}: short has ${words(o.short)} words (1-25)`);
  if (words(o.more) < 1 || words(o.more) > 120) fail(`${where}: more has ${words(o.more)} words (1-120)`);
  if (typeof o.whyItMatters !== 'string') fail(`${where}: whyItMatters must be a string`);
  if (o.role === 'task' && !o.whyItMatters.trim()) fail(`${where}: task object without whyItMatters`);
  const rs = o.realSize;
  const okSize = (typeof rs === 'number' && rs > 0) || (Array.isArray(rs) && rs.length === 3 && rs.every((v) => typeof v === 'number' && v > 0));
  if (!okSize) fail(`${where}: realSize must be a positive number or [x, y, z] in metres`);
  if (!cat.realSizeBasis?.[o.id]) fail(`${where}: no realSizeBasis note`);
  if (!HONESTY.includes(o.honesty)) fail(`${where}: honesty "${o.honesty}"`);
  if (!['task', 'explore'].includes(o.role)) fail(`${where}: role "${o.role}"`);
  if (typeof o.source !== 'string' || !o.source) fail(`${where}: empty source`);
  else if (o.source.startsWith('repo:')) { if (!existsSync(join(ROOT, o.source.slice(5)))) fail(`${where}: ${o.source} does not exist`); }
  else if (!/^https:\/\//.test(o.source) || !sourcesMd.includes(o.source)) fail(`${where}: source ${o.source} is not listed in research/sources.md`);
  if (o.honesty === 'fictional' && ['butterweed', 'daisyleaf', 'blue-sedge', 'bunchgrass', 'fen-orchid'].includes(o.id) && !/fictional teaching species/i.test(o.more)) fail(`${where}: species card must say it is a fictional teaching species`);
  if (MOTION[o.id] && !new RegExp(MOTION[o.id], 'i').test(`${o.short} ${o.more}`)) fail(`${where}: moving object must say "${MOTION[o.id]}" in its card`);
  if (o.honesty === 'time-lapse' && MOTION[o.id] !== 'time-lapse') fail(`${where}: time-lapse honesty without a MOTION entry`);
  maxGrade = Math.max(maxGrade, grade(o.short), grade(o.more));
}
if (objects.length < 20) fail(`catalog has ${objects.length} objects (min 20)`);
const mapped = new Set([...entries.flatMap(([, e]) => e.catalog || []), ...Object.keys(CODE_ONLY)]);
for (const id of ids) if (!mapped.has(id)) fail(`catalog ${id} has no asset or code mapping`);
for (const [key, e] of entries) for (const id of e.catalog || []) if (!ids.has(id)) fail(`${key}: catalog id ${id} not in objects.json`);
for (const id of [...Object.keys(CODE_ONLY), ...Object.keys(MOTION)]) if (!ids.has(id)) fail(`config id ${id} not in objects.json`);

// ---------------------------------------------------------------- report
const mb = (b) => (b / 1048576).toFixed(2);
console.log(JSON.stringify({
  manifestEntries: entries.length,
  files: listed.size,
  firstLoadMB: +mb(tiers.first),
  streamMB: +mb(tiers.stream),
  largestFile: `${largest.file} (${mb(largest.bytes)} MB)`,
  attributionRows: mdRows.length,
  catalogObjects: objects.length,
  task: objects.filter((o) => o.role === 'task').length,
  explore: objects.filter((o) => o.role === 'explore').length,
  honesty: Object.fromEntries(HONESTY.map((h) => [h, objects.filter((o) => o.honesty === h).length])),
  maxCardFleschKincaid: +maxGrade.toFixed(1),
}, null, 2));
if (fails.length) {
  console.error(`\n${fails.length} problem(s):\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log('check-v3-assets: all checks passed');
