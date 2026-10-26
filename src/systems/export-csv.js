/**
 * CSV export for the learner's data sheet (opens correctly in spreadsheet apps).
 * RFC 4180 quoting, CRLF rows, UTF-8 BOM so Excel detects encoding.
 * @module systems/export-csv
 */
import { COVER_BANDS } from './data-sheet.js';

/** Quote a single CSV field per RFC 4180 (quote iff needed; double inner quotes). */
export function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** @param {Array<Array<string|number>>} rows first row = header */
export function toCSV(rows) {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * Build the data sheet CSV.
 * One row per (quadrat x species counted) plus a cover row for bunchgrass bands,
 * with design + field metadata columns so the file is self-describing.
 * @param {import('./data-sheet.js').DataSheet} sheet
 * @param {Array<{id:string,name:string}>} speciesList from content/species.json
 */
export function dataSheetCSV(sheet, speciesList) {
  const rows = [
    ['quadrat', 'x_m', 'z_m', 'species_id', 'species_name', 'count', 'cover_band', 'cover_label', 'design', 'quadrat_area_m2', 'time_cost'],
  ];
  for (const q of sheet.quadrats) {
    const counted = Object.entries(q.counts).filter(([, n]) => n !== undefined);
    const speciesRows = counted.length ? counted : [['', '']];
    for (const [sp, n] of speciesRows) {
      const meta = speciesList.find((s) => s.id === sp);
      rows.push([
        q.index,
        q.x == null ? '' : q.x.toFixed(2),
        q.z == null ? '' : q.z.toFixed(2),
        sp || '',
        meta ? meta.name : sp || '',
        n === undefined ? '' : n,
        '', '', sheet.design || '', String(4), q.timeCost ? q.timeCost.toFixed(2) : '',
      ]);
    }
    if (q.cover) {
      const band = COVER_BANDS.find((b) => b.id === q.cover);
      rows.push([
        q.index,
        q.x == null ? '' : q.x.toFixed(2),
        q.z == null ? '' : q.z.toFixed(2),
        'bunchgrass', 'Tussock Bunchgrass',
        '', q.cover, band ? band.label : q.cover, sheet.design || '', String(4), q.timeCost ? q.timeCost.toFixed(2) : '',
      ]);
    }
  }
  return toCSV(rows);
}

/** Trigger a browser download of CSV text (no network). */
export function downloadCSV(csvText, filename = 'field-ecologist-data.csv') {
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
