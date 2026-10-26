/**
 * Content integrity: items, species and designs cross-references must hold so
 * the alignment matrix (design/alignment-matrix.md) is grounded in real content.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const species = read('content/species.json');
const items = read('content/items.json');
const designs = read('content/designs.json');
const cinematics = read('content/cinematics.json');
const modules = read('content/modules.json');

const speciesIds = species.species.map((s) => s.id);

describe('species content', () => {
  it('has exactly five species with unique ids', () => {
    expect(speciesIds).toHaveLength(5);
    expect(new Set(speciesIds).size).toBe(5);
  });

  it('covers all four distribution patterns the plan requires', () => {
    const types = species.species.map((s) => s.modelParams.type);
    expect(types).toContain('thomas'); // clumped (butterweed + orchid)
    expect(types).toContain('poisson'); // random
    expect(types).toContain('gradient'); // moisture gradient
    expect(speciesIds).toContain('fen-orchid'); // rare
  });

  it('every field mark states shape and size, not colour alone (a11y rule)', () => {
    for (const s of species.species) {
      expect(s.fieldMarks.length).toBeGreaterThanOrEqual(3);
      expect(s.fieldMarks[0]).toMatch(/^shape:/);
      expect(s.fieldMarks[1]).toMatch(/^size:/);
      expect(s.fieldMarks[s.fieldMarks.length - 1]).toMatch(/^colour:/);
      const shapeSize = s.fieldMarks.slice(0, -1).join(' ');
      expect(shapeSize.length).toBeGreaterThan(40); // substantive, not a colour
    }
  });

  it('every species has a look-alike warning and a count method', () => {
    for (const s of species.species) {
      expect(s.lookAlikeWarning.length).toBeGreaterThan(10);
      expect(s.countMethod.length).toBeGreaterThan(5);
      expect(s.heightCm).toMatch(/\d+–\d+/);
    }
  });

  it('states honestly that the flora is fictional', () => {
    expect(species.meta.statement).toMatch(/constructed for teaching purposes/i);
  });
});

describe('assessment items', () => {
  const groups = ['precheck', 'idQuiz', 'chartItems', 'transfer'];
  const all = groups.flatMap((g) => items[g]);

  it('have unique ids across all groups', () => {
    const ids = all.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every MC item has >= 2 options and the correct option exists', () => {
    for (const item of all) {
      if (item.kind === 'species' && !item.options) continue; // rendered-ID item
      expect(item.options?.length, item.id).toBeGreaterThanOrEqual(2);
      expect(item.options.some((o) => o.id === item.correct), item.id).toBe(true);
    }
  });

  it('every item teaches (has a why)', () => {
    for (const item of all) expect(item.why?.length, item.id).toBeGreaterThan(20);
  });

  it('counts: 5 pre-check, 8 ID quiz, 3 chart, 4 transfer (per plan §5.2/5.4)', () => {
    expect(items.precheck).toHaveLength(5);
    expect(items.idQuiz).toHaveLength(8);
    expect(items.chartItems).toHaveLength(3);
    expect(items.transfer).toHaveLength(4);
  });

  it('species-referencing items point at real species', () => {
    for (const item of items.idQuiz) {
      if (item.speciesRef) expect(speciesIds, item.id).toContain(item.speciesRef);
    }
  });

  it('rubric has the four criteria from plan §5.4', () => {
    expect(items.reportRubric.map((c) => c.id)).toEqual(['justification', 'accuracy', 'uncertainty', 'limitations']);
    for (const c of items.reportRubric) expect(c.levels).toHaveLength(3);
  });
});

describe('designs + cinematics + modules', () => {
  it('has the four designs including the biased one', () => {
    expect(designs.designs.map((d) => d.id)).toEqual(['random', 'systematic', 'stratified', 'convenience']);
    expect(designs.designs.find((d) => d.id === 'convenience').kind).toBe('nonprobability');
  });

  it('cinematic budget: total <= 55 s, each shot <= 25 s, every shot captioned + described + purpose-tagged', () => {
    let total = 0;
    for (const c of cinematics.cinematics) {
      for (const s of c.shots) {
        total += s.duration;
        expect(s.duration, s.id).toBeLessThanOrEqual(25);
        expect(s.purpose, s.id).toMatch(/orient|motivate|reveal|consequence/);
        expect(s.captions.length, s.id).toBeGreaterThan(0);
        expect(s.description.length, s.id).toBeGreaterThan(20);
      }
    }
    expect(total).toBeLessThanOrEqual(55);
  });

  it('modules reference the five modules and the reveal names four error sources', () => {
    expect(Object.keys(modules.modules).sort()).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(modules.revealErrorSources.map((e) => e.id)).toEqual(['bias', 'variance', 'rarity', 'misid']);
    expect(modules.report.sections.map((s) => s.id)).toEqual(['design', 'results', 'uncertainty', 'limitations']);
  });
});
