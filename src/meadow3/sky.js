/**
 * sky.js — the dawn sky over Ashcombe Meadow: a Preetham daylight sky
 * (three/addons Sky, physically based scattering, so the sky reddens and
 * brightens as the Sun climbs), the Sun at its true angular size, the sun
 * light with cascaded shadows (template createSun), image-based light from
 * the Lilienstein early-morning HDRI (Poly Haven, CC0), the dawn haze, and
 * the clouds at real size and height (own-work billboard atlas).
 *
 * Time-lapse (catalog `sun-dawn`): the Sun climbs from 3° toward 21° above the
 * east-north-east horizon, about 1° every 9 s at first, slowing as it goes.
 * Calm mode holds it still while the learner counts.
 * @module meadow3/sky
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createSun } from '../v3/render-chain.js';
import { sunGlowTexture } from './textures.js';

const D2R = Math.PI / 180;
/** Sun azimuth: 70° from +z (north in the scene's map) toward +x (east). */
export const SUN_AZIMUTH_DEG = 70;
export const SUN_START_DEG = 3;
export const SUN_END_DEG = 21;
/** Time-lapse constant (s): elevation = end - (end - start) * exp(-t / TAU). */
export const SUN_TAU = 170;
/** Sun drawn this far from the camera; its disc keeps the true 0.533° across. */
export const SUN_DRAW_DISTANCE = 1800;
export const SUN_ANGULAR_DIAMETER = 2 * Math.atan(1392700000 / 2 / 149597870700);

export function sunDirection(elevDeg, out = new THREE.Vector3()) {
  const el = elevDeg * D2R, az = SUN_AZIMUTH_DEG * D2R;
  return out.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}
export function sunElevationAt(t) { return SUN_END_DEG - (SUN_END_DEG - SUN_START_DEG) * Math.exp(-Math.max(0, t) / SUN_TAU); }

export class DawnSky {
  /**
   * @param {object} app  the v3 app (engine, quality)
   * @param {THREE.Group} parent
   */
  constructor(app, parent) {
    this.app = app;
    const engine = app.engine;
    this.scene = engine.scene;
    this.sky = new Sky();
    this.sky.name = 'dawn-sky';
    this.sky.scale.setScalar(4000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.0045;
    u.mieDirectionalG.value = 0.82;
    if (u.cloudCoverage) u.cloudCoverage.value = 0; // clouds are the real-size billboards below
    if (u.showSunDisc) u.showSunDisc.value = 1;
    this.sky.userData.noOutline = true;
    this.sky.raycast = () => {};
    this.sky.frustumCulled = false;
    parent.add(this.sky);

    // Clickable Sun (catalog sun-dawn): a glow sprite whose bright core is the
    // disc at its true angular size, kept SUN_DRAW_DISTANCE from the camera.
    const mat = new THREE.SpriteMaterial({ map: sunGlowTexture(), color: 0xfff1d6, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sun = new THREE.Sprite(mat);
    this.sun.name = 'sun-disc';
    // The texture core (42% of the radius) is the disc: scale so the core spans 0.533°.
    const disc = 2 * SUN_DRAW_DISTANCE * Math.tan(SUN_ANGULAR_DIAMETER / 2);
    this.sun.scale.setScalar(disc);
    this.sun.renderOrder = -1;
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: mat.map, color: 0xffcf9a, transparent: true, opacity: 0.5, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.sunGlow.raycast = () => {};
    this.sunGlow.userData.noOutline = true;
    this.sun.add(this.sunGlow);
    this.sunGlow.scale.setScalar(9); // relative to the disc
    // Scale check: the Sun is the disc sprite; the child halo is scattered light in the air, not the Sun.
    this.sun.userData.restSize = [disc, disc, 0];
    parent.add(this.sun);

    // Sun light: SunLight cascades on Medium and up (template createSun), none on Low.
    const preset = engine.quality.presetDef;
    this.light = createSun(preset, { large: true, far: 420, intensity: 3.0, color: 0xffd9a8 });
    if (this.light.isSunLight) { this.light.shadow.bias = -0.0003; this.light.shadow.normalBias = 0.04; }
    else { this.light.target.position.set(50, 0, 40); parent.add(this.light.target); }
    parent.add(this.light);
    this.hemi = new THREE.HemisphereLight(0xcfe0f4, 0x5e6b3e, 0.35);
    parent.add(this.hemi);

    this.scene.fog = new THREE.FogExp2(0xe8d6bc, 0.0021);
    this.elevation = SUN_START_DEG;
    this.t = 0;
    this.dir = new THREE.Vector3();
    this.override = null; // a fixed elevation (cinematic, reduced motion)
    this.apply();
  }

  /** IBL from the Lilienstein HDRI (PMREM), dimmed while the Sun is low. */
  setEnvironment(hdr) {
    const pm = new THREE.PMREMGenerator(this.app.engine.renderer);
    this.envMap = pm.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pm.dispose();
    this.scene.environment = this.envMap;
    this.apply();
  }

  /** Advance the time-lapse (motion system 'sun-timelapse'). */
  advance(dt) { this.t += dt; this.elevation = sunElevationAt(this.t); this.apply(); }

  setElevation(deg) { this.override = deg; this.apply(); }
  clearOverride() { this.override = null; this.apply(); }

  apply() {
    const el = this.override ?? this.elevation;
    sunDirection(el, this.dir);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.dir).multiplyScalar(1000);
    const k = THREE.MathUtils.clamp((el - 2) / 20, 0, 1); // 0 at sunrise, 1 by ~22°
    if (this.light.isSunLight) this.light.position.copy(this.dir);
    else this.light.position.copy(this.light.target.position).addScaledVector(this.dir, 150);
    this.light.color.setRGB(1, 0.72 + 0.22 * k, 0.5 + 0.38 * k);
    this.light.intensity = 1.6 + 1.9 * k;
    this.hemi.intensity = 0.3 + 0.25 * k;
    this.scene.environmentIntensity = 0.45 + 0.4 * k;
    this.scene.fog.color.setRGB(0.86 + 0.04 * k, 0.8 + 0.08 * k, 0.7 + 0.16 * k);
    this.sun.material.color.setRGB(1, 0.86 + 0.12 * k, 0.7 + 0.25 * k);
    this.sunGlow.material.opacity = 0.55 - 0.25 * k;
  }

  /** Keep the sky box and the Sun around the camera. */
  follow(camera) {
    this.sky.position.copy(camera.position);
    this.sun.position.copy(camera.position).addScaledVector(this.dir, SUN_DRAW_DISTANCE);
  }
}

/**
 * Clouds at real size: 11 billboards 500-1,400 m across at 1,000-1,700 m,
 * drifting with an illustrative 5.5 m/s wind (the same wind moves the cloud
 * shadows on the ground). The first one is exactly 1,000 m across (catalog
 * `clouds` realSize). Atlas: own-work cloud-sprites (2 x 2).
 */
export class Clouds {
  constructor(parent, wind) {
    this.group = new THREE.Group();
    this.group.name = 'clouds';
    this.wind = wind; // THREE.Vector2 (m/s), shared with the ground shader
    this.sprites = [];
    this.mats = [];
    parent.add(this.group);
  }

  setAtlas(tex) {
    const rnd = (() => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    for (let k = 0; k < 4; k++) {
      const t = tex.clone();
      t.repeat.set(0.5, 0.5);
      t.offset.set((k % 2) * 0.5, Math.floor(k / 2) * 0.5);
      t.needsUpdate = true;
      this.mats.push(new THREE.SpriteMaterial({ map: t, color: 0xfff4ea, transparent: true, opacity: 0.92, depthWrite: false, fog: false }));
    }
    const spots = [[700, -1200, 1000], [-1500, 600, 1250], [2200, 1900, 900], [-600, 2800, 1400], [2600, -300, 1100],
      [-2600, -1700, 800], [400, 2000, 1300], [-1800, 2200, 700], [1500, 3200, 1000], [3000, 1000, 600], [-200, -2600, 900]];
    spots.forEach(([x, z, w], i) => {
      const s = new THREE.Sprite(this.mats[i % 4]);
      const width = i === 0 ? 1000 : w * (0.85 + rnd() * 0.3);
      s.scale.set(width, width * 0.55, 1);
      s.position.set(50 + x, 1000 + rnd() * 700, 50 + z);
      s.name = `cloud-${i}`;
      s.renderOrder = -2;
      this.group.add(s);
      this.sprites.push(s);
    });
  }

  /** Drift with the wind; wrap inside a 7 km square around the meadow. */
  update(dt) {
    for (const s of this.sprites) {
      s.position.x += this.wind.x * dt;
      s.position.z += this.wind.y * dt;
      if (s.position.x > 3600) s.position.x -= 7200;
      if (s.position.z > 3600) s.position.z -= 7200;
    }
  }
}
