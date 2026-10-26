#!/usr/bin/env node
/**
 * Generate public/attribution.json from ATTRIBUTION.md (single source of truth).
 * The markdown table's asset / author / source / license / changes columns map
 * 1:1 to the build-contract fields (08-vercel-deployment.md section 5.4).
 * Usage: node scripts/gen-attribution.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(root, 'ATTRIBUTION.md'), 'utf8');

const rows = [];
for (const line of md.split('\n')) {
  if (!/^\|/.test(line)) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  if (cells.length < 5) continue;
  if (/^[-\s:]+$/.test(cells[0])) continue; // separator row
  if (/^asset$/i.test(cells[0])) continue;  // header row
  rows.push({
    asset: cells[0],
    author: cells[1],
    source: cells[2],
    license: cells[3],
    changes: cells[4],
  });
}

if (!rows.length) {
  console.error('gen-attribution: no rows parsed from ATTRIBUTION.md');
  process.exit(1);
}

const out = join(root, 'public', 'attribution.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
console.log(`attribution.json: wrote ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`);
