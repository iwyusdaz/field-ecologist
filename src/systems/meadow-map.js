/**
 * Plan-view SVG map of Ashcombe Meadow (100 m x 100 m). Shared by the design
 * picker, the fieldwork HUD and the reveal. Pure DOM — also usable in text mode
 * where a visual is secondary, though text mode's primary overview is the
 * 20 x 20 grid table (design/text-mode-design.md).
 *
 * Coordinates: x 0..100 west→east (stream/wet at low x), z 0..100. The map is
 * drawn with west on the LEFT and z increasing DOWNWARD, matching the 3D
 * top-down view (north = -z up).
 * @module systems/meadow-map
 */
import { FIELD_SIZE, streamX, strata, zoneOf } from './moisture-field.js';

const W = 300; // px
const H = 300;

export const ZONE_FILL = { wet: '#3f6f8f', mid: '#6f8f5a', dry: '#b09b62' };

/**
 * @param {object} opts
 * @param {boolean} [opts.showZones] draw the moisture strata (shown before design choice)
 * @param {boolean} [opts.interactive] accept clicks for convenience placement
 * @param {(x:number,z:number)=>void} [opts.onPick] world-metre callback for clicks
 */
export class MeadowMap {
  constructor(opts = {}) {
    this.onPick = opts.onPick;
    this.showZones = opts.showZones !== false;
    this.el = document.createElement('figure');
    this.el.className = 'meadow-map';
    const zones = strata();
    const zoneRects = zones.map((b) =>
      `<rect x="${(b.xMin / FIELD_SIZE) * W}" y="0" width="${((b.xMax - b.xMin) / FIELD_SIZE) * W}" height="${H}"
        fill="${ZONE_FILL[b.id]}" opacity="0.35"/>`).join('');
    const stream = [];
    for (let z = 0; z <= FIELD_SIZE; z += 2) {
      const x = streamX(z);
      stream.push(`${(x / FIELD_SIZE) * W},${(z / FIELD_SIZE) * H}`);
    }
    this.svgNS = 'http://www.w3.org/2000/svg';
    const svg = this._el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    svg.setAttribute('aria-label', 'Map of Ashcombe Meadow: stream and wet ground on the west side, dry rise on the east');
    svg.innerHTML = `
      <rect x="0" y="0" width="${W}" height="${H}" fill="#8fae6b"/>
      ${this.showZones ? zoneRects : ''}
      <polyline points="${stream.join(' ')}" fill="none" stroke="#51707d" stroke-width="5" stroke-linejoin="round" opacity="0.9"/>
      <g data-layer="ghosts"></g>
      <g data-layer="quadrats"></g>
      <g data-layer="active"></g>
      <g data-layer="labels">
        <text x="${(3 / FIELD_SIZE) * W}" y="16" font-size="11" fill="#eef4f8">stream (wet)</text>
        <text x="${(72 / FIELD_SIZE) * W}" y="${H - 10}" font-size="11" fill="#4a3f24">dry rise</text>
        <text x="${(50 / FIELD_SIZE) * W}" y="${(6 / FIELD_SIZE) * H}" font-size="10" fill="#2d2a20" text-anchor="middle">gate</text>
      </g>
      <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#2d2a20" stroke-width="1"/>`;
    this.svg = svg;
    this.layers = {
      ghosts: svg.querySelector('[data-layer="ghosts"]'),
      quadrats: svg.querySelector('[data-layer="quadrats"]'),
      active: svg.querySelector('[data-layer="active"]'),
    };
    this.el.appendChild(svg);
    const cap = document.createElement('figcaption');
    cap.className = 'meadow-map-caption';
    cap.textContent = 'Plan view, 100 m × 100 m. West (stream, wet) on the left; the gate is at the top.';
    this.el.appendChild(cap);

    if (opts.interactive && this.onPick) {
      svg.style.cursor = 'crosshair';
      svg.addEventListener('pointerdown', (e) => {
        const r = svg.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * FIELD_SIZE;
        const pz = (e.clientY - r.top) / r.height * FIELD_SIZE;
        if (px >= 0 && px <= FIELD_SIZE && pz >= 0 && pz <= FIELD_SIZE) this.onPick(px, pz);
      });
    }
  }

  _el(tag, attrs = {}) {
    const e = document.createElementNS(this.svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  _pt(x, z) {
    return { px: (x / FIELD_SIZE) * W, pz: (z / FIELD_SIZE) * H };
  }

  /** Draw the placed quadrats (2 m squares). */
  setQuadrats(points) {
    const g = this.layers.quadrats;
    g.innerHTML = '';
    const half = (2 / FIELD_SIZE) * W / 2;
    points.forEach((p, i) => {
      const { px, pz } = this._pt(p.x, p.z);
      const rect = this._el('rect', {
        x: px - half, y: pz - half, width: half * 2, height: half * 2,
        fill: 'none', stroke: '#ffffff', 'stroke-width': 1.4,
      });
      rect.setAttribute('data-quadrat', String(i + 1));
      const label = this._el('text', { x: px, y: pz - half - 2, 'font-size': 8, fill: '#ffffff', 'text-anchor': 'middle' });
      label.textContent = String(i + 1);
      g.append(rect, label);
    });
  }

  /** Mark visited quadrats and highlight the active one. */
  setStates(visitedFlags, activeIndex) {
    const rects = this.layers.quadrats.querySelectorAll('rect[data-quadrat]');
    rects.forEach((r) => {
      const i = Number(r.getAttribute('data-quadrat')) - 1;
      r.setAttribute('stroke', i === activeIndex ? '#ffd166' : visitedFlags[i] ? '#cfe8cf' : '#ffffff');
      r.setAttribute('stroke-width', i === activeIndex ? 2.2 : 1.4);
    });
    const a = this.layers.active;
    a.innerHTML = '';
    // active marker is conveyed by stroke colour above; keep layer for future use
  }

  /** Transient ghost quadrats (S3 rain / preview). */
  setGhosts(points) {
    const g = this.layers.ghosts;
    g.innerHTML = '';
    const half = (2 / FIELD_SIZE) * W / 2;
    for (const p of points.slice(0, 400)) {
      const { px, pz } = this._pt(p.x, p.z);
      g.appendChild(this._el('rect', {
        x: px - half, y: pz - half, width: half * 2, height: half * 2,
        fill: 'rgba(158,203,255,0.35)', stroke: 'none',
      }));
    }
  }

  /** Zone label for a point (used in lists). */
  static zoneOf(x) { return zoneOf(x); }
}
