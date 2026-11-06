/**
 * textures.js — small canvas textures drawn at run time (own work, no
 * download): wood grain for the gate, the quadrat frame's tape markings,
 * insect wings, feathers, cloth weave, the survey stakes' number plates, the
 * sun's glow and the clipboard data sheet. Each one is real surface detail on
 * a modelled object (plan 10 §4.3: no bare primitives).
 * @module meadow3/textures
 */
import * as THREE from 'three';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function tex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Weathered timber: grain lines and knots, greyed oak. */
export function woodTexture(seed = 7) {
  const [c, g] = canvas(256, 64);
  const r = seeded(seed);
  g.fillStyle = '#7a6448';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 90; i++) {
    const y = r() * 64, a = 0.08 + r() * 0.18;
    g.strokeStyle = r() > 0.5 ? `rgba(40,30,20,${a})` : `rgba(200,185,160,${a * 0.7})`;
    g.lineWidth = 0.5 + r() * 1.4;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * (1 + r() * 2));
    g.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = 30 + r() * 200, y = 10 + r() * 44;
    g.fillStyle = 'rgba(50,35,22,0.55)';
    g.beginPath(); g.ellipse(x, y, 4 + r() * 3, 2 + r() * 2, 0, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { repeat: true });
}

/**
 * Quadrat frame: white aluminium tube with red tape every 50 cm (field
 * quadrats are often marked so the counter can see the halves and quarters).
 * u runs along a bar (0..1 = 2 m).
 */
export function quadratTexture() {
  const [c, g] = canvas(256, 16);
  g.fillStyle = '#e9e7df';
  g.fillRect(0, 0, 256, 16);
  const grad = g.createLinearGradient(0, 0, 0, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 16);
  g.fillStyle = '#c8322b';
  for (const u of [0.25, 0.5, 0.75]) g.fillRect(u * 256 - 4, 0, 8, 16);
  g.fillStyle = 'rgba(60,60,60,0.25)';
  for (let x = 0; x < 256; x += 3) g.fillRect(x, 7 + Math.sin(x) * 0.5, 1, 1);
  return tex(c);
}

/** Butterfly wing: base colour, dark veins, a margin band and two spots. */
export function wingTexture(base = '#f2c230', seed = 3) {
  const [c, g] = canvas(64);
  const r = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(30,20,10,0.75)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    g.beginPath(); g.moveTo(0, 32); g.quadraticCurveTo(24, 10 + i * 9, 64, 4 + i * 11); g.stroke();
  }
  g.fillStyle = 'rgba(25,18,10,0.85)';
  g.fillRect(52, 0, 12, 64);
  g.fillStyle = '#fff6dc';
  for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(57, 8 + k * 16 + r() * 4, 2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(20,15,10,0.8)';
  g.beginPath(); g.arc(30, 24, 4, 0, Math.PI * 2); g.fill();
  return tex(c);
}

/** Bee body: amber and black bands with fine hair speckle. */
export function beeTexture() {
  const [c, g] = canvas(64, 16);
  for (let x = 0; x < 64; x += 8) { g.fillStyle = (x / 8) % 2 ? '#1c140c' : '#d39a2a'; g.fillRect(x, 0, 8, 16); }
  const r = seeded(11);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,230,170,${r() * 0.25})`; g.fillRect(r() * 64, r() * 16, 1, 1); }
  return tex(c);
}

/** Small-bird plumage: brown back with darker feather edges. */
export function featherTexture() {
  const [c, g] = canvas(64);
  g.fillStyle = '#6b5440';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(35,25,18,0.7)';
  for (let y = 4; y < 64; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < 64; x += 7) {
    g.beginPath(); g.arc(x, y, 3.5, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
  }
  g.fillStyle = 'rgba(230,215,190,0.5)';
  g.fillRect(0, 44, 64, 20);
  return tex(c, { repeat: true });
}

/** Cloth weave (a light multiplier: the material colour stays the cloth colour). */
export function clothTexture(seed = 5) {
  const [c, g] = canvas(64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  const r = seeded(seed);
  for (let y = 0; y < 64; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; g.fillRect(0, y, 64, 1); }
  for (let x = 0; x < 64; x += 2) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`; g.fillRect(x, 0, 1, 64); }
  return tex(c, { repeat: true });
}

/** Skin: very soft mottling (multiplier). */
export function skinTexture() {
  const [c, g] = canvas(64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  const r = seeded(9);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,60,50,${r() * 0.05})`; g.beginPath(); g.arc(r() * 64, r() * 64, 1 + r() * 2, 0, Math.PI * 2); g.fill(); }
  return tex(c, { repeat: true });
}

/** A survey stake's number plate. */
export function numberPlateTexture(n) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f4f1e6';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 76px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  return tex(c);
}

/** Soft sun glow with a bright core (the sun disc itself is the core). */
export function sunGlowTexture() {
  const [c, g] = canvas(128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,250,1)');
  grad.addColorStop(0.42, 'rgba(255,246,225,1)');
  grad.addColorStop(0.5, 'rgba(255,214,150,0.55)');
  grad.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

/** A soft, wispy sheet for the mist banks. */
export function mistTexture(seed = 21) {
  const [c, g] = canvas(256);
  const r = seeded(seed);
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const x = 40 + r() * 176, y = 40 + r() * 176, rad = 30 + r() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.12})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  return tex(c);
}

/** Tiny soft dot for pollen and dust motes. */
export function moteTexture() {
  const [c, g] = canvas(32);
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return tex(c);
}

/**
 * The clipboard data sheet, drawn from the learner's DataSheet: a header, one
 * line per quadrat with its counts in pencil-grey handwriting style (Caveat
 * when loaded, else a fallback face). Returns { texture, draw(sheet, species) }.
 */
export function clipboardSheet() {
  const [c, g] = canvas(256, 360);
  const t = tex(c);
  const short = { butterweed: 'Bw', daisyleaf: 'Dl', 'blue-sedge': 'Sg', bunchgrass: 'Bg', 'fen-orchid': 'Or' };
  const draw = (sheet = null) => {
    g.fillStyle = '#f7f3e8';
    g.fillRect(0, 0, 256, 360);
    g.strokeStyle = 'rgba(70,110,170,0.35)';
    g.lineWidth = 1;
    for (let y = 56; y < 360; y += 28) { g.beginPath(); g.moveTo(10, y); g.lineTo(246, y); g.stroke(); }
    g.strokeStyle = 'rgba(200,60,60,0.45)';
    g.beginPath(); g.moveTo(40, 0); g.lineTo(40, 360); g.stroke();
    g.fillStyle = '#26313a';
    g.font = '600 20px "Caveat", "Comic Sans MS", cursive';
    g.fillText('Ashcombe Meadow · quadrats', 46, 40);
    g.font = '600 18px "Caveat", "Comic Sans MS", cursive';
    const rows = sheet?.quadrats || [];
    rows.slice(0, 11).forEach((q, i) => {
      const y = 76 + i * 28;
      g.fillStyle = '#26313a';
      g.fillText(String(q.index), 16, y);
      if (!q.visited) return;
      const parts = Object.entries(q.counts || {}).map(([sp, n]) => `${short[sp] || sp} ${n}`);
      if (q.cover) parts.push(`Bg cover ${q.cover}%`);
      g.fillStyle = '#3a4650';
      g.fillText(parts.join('  ') || '…', 48, y);
    });
    t.needsUpdate = true;
  };
  draw();
  return { texture: t, draw };
}
