/**
 * Core renderer + loop for all immersive learning projects.
 * Every repo copies this template into src/core/ (a copy, not a package dependency).
 * Conventions: 1 unit = 1 meter. sRGB output, ACES Filmic tone mapping by default.
 * @module core/engine
 */
import * as THREE from 'three';
import { QualityManager } from './quality.js';

/**
 * Detect a software WebGL implementation (SwiftShader, llvmpipe, ...). Headless
 * test browsers always use one, and on a 2-vCPU CI runner a back-to-back render
 * loop starves the main thread so badly that overlay clicks time out.
 * @returns {string|null} the renderer string when it is a software renderer
 */
function detectSoftwareGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) ? name : null;
  } catch {
    return null;
  }
}

export class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {import('./quality.js').PresetName} [opts.preset] forced preset (else auto)
   * @param {number} [opts.maxFrameMs] frame budget used by dynamic resolution
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    // Software WebGL: cap at ~5 fps so the main thread stays free for input.
    this.softwareGL = detectSoftwareGL();
    this.minFrameMs = this.softwareGL ? 200 : 0;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // AA handled by SMAA pass on Medium+, or MSAA on Low via renderer (WebGL2 multisampled RT)
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.baseFov = this.camera.fov;

    this.quality = new QualityManager(this.renderer, opts.preset);
    this.clock = new THREE.Clock();
    this._updateFns = [];
    this._running = false;
    this._paused = false;
    this._visible = true;
    this.frames = 0;
    this.fps = 0;
    this._fpsT = 0;
    this._fpsFrames = 0;
    this._benchT = 0;
    this._benchFrames = 0;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', () => {
      this._visible = !document.hidden;
    });
    this.resize();

    // Optional post pipeline (set by the scene via setComposer) and an alternate
    // render camera (the orthographic quadrat view bypasses the composer).
    this.composer = null;
    this.renderCamera = null;

    // Respect prefers-reduced-motion at startup; the settings toggle overrides it.
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Provide an EffectComposer; when set, rendering goes through it. */
  setComposer(composer) {
    this.composer = composer;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const scale = this.quality.resolutionScale;
    this.renderer.setPixelRatio(window.devicePixelRatio * scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  /** Register a per-frame update fn(dt seconds, elapsed seconds). */
  onUpdate(fn) { this._updateFns.push(fn); return fn; }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    // Keep rendering at or below ~50% of the main thread so the overlay stays
    // responsive when a single frame is expensive (software WebGL on CI).
    const schedule = (delayMs) => {
      if (delayMs > 4) setTimeout(() => requestAnimationFrame(tick), delayMs);
      else requestAnimationFrame(tick);
    };
    const tick = () => {
      if (!this._running) return;
      if (this._paused || !this._visible) { schedule(100); return; }
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const t = this.clock.elapsedTime;
      const t0 = performance.now();
      for (const fn of this._updateFns) fn(dt, t);
      this.renderer.info.reset();
      const cam = this.renderCamera || this.camera;
      if (this.composer && !this.renderCamera) this.composer.render(dt);
      else this.renderer.render(this.scene, cam);
      const cost = performance.now() - t0;
      schedule(Math.max(cost > 20 ? cost : 0, this.minFrameMs - cost));
      // Dynamic resolution: sample a 2 s window during the first 20 s after load.
      this.frames++; this._fpsFrames++;
      this._fpsT += dt;
      if (this._fpsT >= 1) { this.fps = this._fpsFrames / this._fpsT; this._fpsT = 0; this._fpsFrames = 0; }
      if (t < 20 && this.quality.auto) {
        this._benchFrames++; this._benchT += dt;
        if (this._benchT >= 2) {
          this.quality.autoSelect(this._benchFrames / this._benchT);
          this._benchFrames = 0; this._benchT = 0;
          this.resize();
        }
      } else if (this.quality.dynamic && t >= 20) {
        if (this.fps > 0 && this.fps < 48 && this.quality.resolutionScale > 0.6) {
          this.quality.resolutionScale = Math.max(0.6, this.quality.resolutionScale - 0.05);
          this.resize();
        } else if (this.fps > 58 && this.quality.resolutionScale < this.quality.presetDef.resolutionScale) {
          this.quality.resolutionScale = Math.min(this.quality.presetDef.resolutionScale, this.quality.resolutionScale + 0.05);
          this.resize();
        }
      }
    };
    requestAnimationFrame(tick);
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this.clock.getDelta(); }

  dispose() {
    this._running = false;
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
