/**
 * Data sheet + CSV export tests (plan §14: "CSV export opens correctly in
 * spreadsheet apps" — RFC 4180 quoting, BOM, header row, one row per record).
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { DataSheet, COVER_BANDS } from '../../src/systems/data-sheet.js';
import { csvField, toCSV, dataSheetCSV } from '../../src/systems/export-csv.js';
import { generateQuadrats } from '../../src/systems/designs.js';

const BUDGET = { quadrats: 10, timeUnits: 100, walkCostPerM: 0.12, baseCostPerQuadrat: 1.5 };
const SPECIES = [
  { id: 'butterweed', name: 'Meadow Butterweed' },
  { id: 'daisyleaf', name: 'Common Daisy-leaf' },
];

function sheetWith(seed = 5) {
  const sheet = new DataSheet({ budget: BUDGET });
  const pts = generateQuadrats('random', 10, seed);
  sheet.start('random', pts);
  pts.forEach((p, i) => sheet.chargeVisit(i + 1, i === 0 ? { x: 50, z: 0 } : pts[i - 1]));
  sheet.setCount(1, 'butterweed', 3);
  sheet.setCount(1, 'daisyleaf', 5);
  sheet.setCount(2, 'butterweed', 0);
  sheet.setCover(2, '5-25');
  return sheet;
}

describe('data sheet', () => {
  it('tracks visits, counts and time', () => {
    const sheet = sheetWith();
    expect(sheet.visitedCount()).toBe(10);
    expect(sheet.totalObserved('butterweed')).toBe(3);
    expect(sheet.timeUsed).toBeGreaterThan(0);
    expect(sheet.remainingTime()).toBeCloseTo(100 - sheet.timeUsed, 8);
  });

  it('estimates density = total count / (completed quadrats * 4 m2)', () => {
    const sheet = sheetWith();
    const est = sheet.estimates();
    // completed records: q1 (counts) + q2 (cover only) -> 8 m2 sampled
    expect(est.butterweed).toBeCloseTo(3 / 8, 10);
    expect(est.daisyleaf).toBeCloseTo(5 / 8, 10);
    expect(est.__quadrats).toBe(2);
    expect(est.__area).toBe(8);
  });

  it('cover estimate uses band midpoints', () => {
    const sheet = sheetWith();
    expect(sheet.coverEstimate()).toBe(15); // single '5-25' band, midpoint 15
    expect(COVER_BANDS.map((b) => b.midpoint)).toEqual([2.5, 15, 37.5, 75]);
  });

  it('clamps counts into 0..999 and rejects unknown cover bands', () => {
    const sheet = sheetWith();
    sheet.setCount(3, 'butterweed', 5000);
    expect(sheet.quadrats[2].counts.butterweed).toBe(999);
    sheet.setCount(3, 'butterweed', -4);
    expect(sheet.quadrats[2].counts.butterweed).toBe(0);
    sheet.setCover(3, 'not-a-band');
    expect(sheet.quadrats[2].cover).toBeNull();
  });
});

describe('CSV export', () => {
  it('quotes fields containing commas, quotes and newlines (RFC 4180)', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField(null)).toBe('');
  });

  it('emits CRLF rows and a trailing CRLF', () => {
    const csv = toCSV([['a', 'b'], ['1', '2']]);
    expect(csv).toBe('a,b\r\n1,2\r\n');
  });

  it('data sheet CSV has a header, one row per quadrat-species and cover rows', () => {
    const sheet = sheetWith();
    const csv = dataSheetCSV(sheet, SPECIES);
    const lines = csv.split('\r\n').filter((l) => l.length);
    expect(lines[0]).toBe('quadrat,x_m,z_m,species_id,species_name,count,cover_band,cover_label,design,quadrat_area_m2,time_cost');
    // 10 quadrats: 9 with empty counts -> one empty-species row each; q1 has 2 species rows; q2 adds a cover row
    expect(lines.length).toBe(1 + 9 + 2 + 1);
    expect(csv).toContain('butterweed,Meadow Butterweed,3');
    expect(csv).toContain('5-25,5–25%');
    expect(csv).toContain(',random,4,');
  });

  it('a quotes-in-name species is escaped and round-trips', () => {
    const sheet = sheetWith();
    sheet.setCount(4, 'weird', 2);
    const csv = dataSheetCSV(sheet, [{ id: 'weird', name: 'Rough "speaker", prickly' }]);
    expect(csv).toContain('"Rough ""speaker"", prickly"');
    const row = csv.split('\r\n').find((l) => l.includes('weird'));
    expect(row).toBeTruthy();
  });
});
