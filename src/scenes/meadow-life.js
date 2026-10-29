/**
 * v2.0.0 ambient life for Ashcombe Meadow: wind gust waves, butterflies on
 * looping margin splines, drifting pollen, morning mist that thins over the
 * session, cloud shadows, the flowing stream, and the field-ecologist character.
 *
 * Learning-cue policy (design/art-bible.md §6): life runs everywhere outside the
 * counting view; inside it the AmbientLifeManager is in calm mode (~30 %), and
 * the elements that would sit between the orthographic camera and the quadrat
 * (mist sheets, pollen, butterflies, rings) are hidden and cloud shadows fade
 * out, so the counted plants stay the clearest thing on screen. Reduced motion
 * freezes everything.
 * @module scenes/meadow-life
 */
import * as THREE from 'three';
import { AmbientLifeManager } from '../v2/ambient-life.js';
import { createAnimatedCharacter } from '../v2/stylized-character.js';
import { terrainHeight, streamX, FIELD_SIZE } from '../systems/moisture-field.js';

/** Butterfly loops — all over the margins / boundary strips, never over the field interior. */
export const BUTTERFLY_PATHS = [
  [[-6, 1.4, 20], [-3, 2.0, 32], [-7, 1.6, 44], [-9, 2.2, 30]],
  [[20, 1.5, 104], [32, 2.1, 106], [44, 1.6, 103], [30, 1.9, 101.5]],
  [[60, 1.6, 104], [72, 2.2, 106], [84, 1.5, 103], [70, 1.8, 101.5]],
  [[104, 1.4, 14], [107, 2.0, 26], [103, 1.6, 34], [101.5, 1.9, 22]],
  [[22, 1.3, -6], [34, 1.9, -8], [40, 1.5, -5], [30, 1.7, -4]],
];

function makeButterfly(color) {
  const g = new THREE.Group();
  const wingGeo = new THREE.CircleGeometry(0.06, 7, 0, Math.PI);
  wingGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.15 });
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(wingGeo, mat);
    w.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    pivot.add(w);
    pivot.userData.side = side;
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  return g;
}

/**
 * @param {import('./meadow.js').MeadowScene} meadow
 * @returns {{ life: AmbientLifeManager, character: object, setCounting(on:boolean):void, update(dt:number, camera:THREE.Camera):void }}
 */
export function buildMeadowLife(meadow) {
  const scene = meadow.scene;
  const life = new AmbientLifeManager(scene, { reducedMotion: meadow.reducedMotion, seed: 2026 });
  const hideInCounting = [];
  let counting = false;

  // 1. Wind gusts: rolling waves modulate the existing wind shader (uGust).
  const windU = meadow.vegetation.windUniforms;
  windU.uGust = windU.uGust || { value: 1 };
  // No gusts inside the counting view (counting legibility); otherwise they follow
  // the calm factor, so reduced motion (calm 0) stops them too.
  life.addUpdater((dt, elapsed, calm) => { windU.uGust.value = counting ? 0 : calm; });

  // 2. Butterflies on margin loops (wing-flap meshes).
  const colors = [0xf2c230, 0xf6a65a, 0xffffff, 0xf2c230, 0xb8ccd6];
  const flies = [];
  BUTTERFLY_PATHS.forEach((path, i) => {
    const b = makeButterfly(colors[i % colors.length]);
    b.name = `butterfly-${i}`;
    scene.add(b);
    const wp = path.map(([x, y, z]) => [x, terrainHeight(x, z) + y, z]);
    life.addSplineMover(b, wp, { speed: 0.9 + i * 0.12, stopRadius: 0, closed: true });
    flies.push(b);
    hideInCounting.push(b);
  });
  life.addUpdater((dt, elapsed) => {
    flies.forEach((b, i) => {
      const a = 0.25 + 0.95 * (0.5 + 0.5 * Math.sin(elapsed * 17 + i * 1.3));
      for (const w of b.userData.wings) w.rotation.z = w.userData.side * a;
      b.position.y += Math.sin(elapsed * 3 + i) * 0.002;
    });
  });

  // 3. Drifting pollen in the low sun (around the station and the south half).
  const pollen = life.addParticleVolume({
    name: 'meadow-pollen', center: [50, 1.6, 22], extents: [70, 2.6, 40], count: 260,
    color: 0xffe3a0, size: 0.06, opacity: 0.55, drift: [0.12, 0.04, 0.08],
  });
  hideInCounting.push(pollen);

  // 4. Morning mist: low translucent sheets along the stream, thinning over ~4 min.
  const mistMat = new THREE.MeshBasicMaterial({ color: 0xdfe7ea, transparent: true, opacity: 0.32, depthWrite: false, fog: false });
  const mistTex = makeMistTexture();
  if (mistTex) mistMat.map = mistTex;
  const mist = new THREE.Group();
  mist.name = 'morning-mist';
  for (let k = 0; k < 6; k++) {
    const z = -10 + k * 22;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), mistMat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(streamX(z) + 3, terrainHeight(streamX(z), z) + 0.55 + (k % 2) * 0.25, z);
    sheet.renderOrder = 3;
    mist.add(sheet);
  }
  scene.add(mist);
  hideInCounting.push(mist);
  const fog = meadow.v2Fog;
  life.addUpdater((dt, elapsed, calm) => {
    const morning = Math.max(0, 1 - elapsed / 240); // thins over ~4 minutes of life time
    mistMat.opacity = 0.08 + 0.26 * morning;
    for (const [i, s] of mist.children.entries()) s.position.x += Math.sin(elapsed * 0.05 + i) * 0.004;
    if (fog && scene.fog === fog) fog.density = meadow.v2FogBase + 0.004 * morning;
  });

  // 5. Cloud shadows drifting over the field and apron.
  const cu = meadow.cloudUniforms;
  life.addUpdater((dt) => { cu.uCloudT.value += dt; });

  // 6. Flowing stream (scrolling normals).
  const water = meadow.env?.water;
  if (water) {
    const nm = water.userData.normalMap;
    // v2 revision M1: frozen in counting (and hidden, below); reduced motion
    // already skips custom updaters.
    life.addUpdater((dt) => {
      if (counting) return;
      nm.offset.y -= dt * 0.18; nm.offset.x += dt * 0.012;
    });
    hideInCounting.push(water);
  }

  // 7. The field ecologist beside the quadrat stack at the field station.
  const character = createAnimatedCharacter({
    id: 'ecologist', name: 'Field ecologist', height: 1.68, hairStyle: 'cap', prop: 'clipboard',
    outfit: 'jacket', topColor: 0x6e9b4e, accentColor: 0xf2c230, bottomColor: 0x4a3628,
    hairColor: 0x5a3b26, skinColor: 0xc98f6b,
  });
  const cx = 51.6, cz = 3.4;
  character.root.position.set(cx, terrainHeight(cx, cz), cz);
  character.root.rotation.y = 0.35;
  scene.add(character.root);
  life.addCharacter(character);
  let poseT = 0;
  life.addUpdater((dt) => {
    poseT += dt;
    character.setAction(Math.floor(poseT / 6) % 2 === 0 ? 'idle' : 'write');
  });

  let cloudK = 0.22;
  return {
    life,
    character,
    hideInCounting,
    setCounting(on) {
      counting = on;
      life.setCalmMode(on);
      for (const o of hideInCounting) o.visible = !on;
      // v2 revision M3: no cloud-shadow blob may slide across the quadrat while
      // it fades, so the shadow snaps off the moment counting starts.
      if (on) { cloudK = 0; cu.uCloudK.value = 0; }
    },
    update(dt, camera) {
      life.update(dt, camera);
      const target = counting || life.reducedMotion ? 0 : 0.22;
      cloudK += (target - cloudK) * Math.min(1, dt * 2);
      cu.uCloudK.value = cloudK;
    },
  };
}

function makeMistTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export { FIELD_SIZE };
