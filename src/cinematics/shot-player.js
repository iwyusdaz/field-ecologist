/**
 * Data-driven cinematic shot player (standards section 3.2).
 * Shots come from content/cinematics.json: camera path points, target, duration,
 * easing, captions, purpose tag. Every shot is skippable from the first frame
 * (Skip button + Esc), captioned, with a text description, and has a reduced-motion
 * version (still frames + captions). Cinematics never play during assessment.
 * @module cinematics/shot-player
 */
import { Vector3, CatmullRomCurve3 } from 'three';

export const EASINGS = {
  linear: (t) => t,
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeOut: (t) => 1 - (1 - t) ** 3,
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container   overlay that hosts captions/skip UI
 * @param {import('three').PerspectiveCamera} opts.camera
 * @param {import('../a11y/motion.js').MotionPrefs} opts.motion
 * @param {Function} [opts.onDone]
 * @param {Function} [opts.onSkip]       called when skipped (logged as experienced)
 */
export class ShotPlayer {
  constructor({ container, camera, motion, onDone, onSkip }) {
    this.container = container;
    this.camera = camera;
    this.motion = motion;
    this.onDone = onDone;
    this.onSkip = onSkip;
    this.shots = [];
    this.index = -1;
    this.playing = false;
    this.paused = false;
    this._t = 0;
    this._raf = null;
    this._stillDeadline = null;
    this._stillRemaining = null;
    this._buildUI();
  }

  _buildUI() {
    this.root = document.createElement('div');
    this.root.className = 'cinematic-overlay';
    this.root.setAttribute('role', 'region');
    this.root.setAttribute('aria-label', 'Cinematic');
    this.caption = document.createElement('p');
    this.caption.className = 'cinematic-caption';
    this.caption.setAttribute('aria-live', 'polite');
    this.desc = document.createElement('p');
    this.desc.className = 'cinematic-audio-description visually-hidden';
    this.progress = document.createElement('p');
    this.progress.className = 'cinematic-progress';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'cinematic-skip';
    skip.textContent = 'Skip cinematic (Esc)';
    skip.addEventListener('click', () => this.skip());
    this.root.append(this.progress, this.caption, this.desc, skip);
    this.container.appendChild(this.root);
    this.root.hidden = true;
    this._esc = (e) => { if (e.key === 'Escape' && this.playing && !this.paused) this.skip(); };
    document.addEventListener('keydown', this._esc);
  }

  /** Load a cinematic definition { id, title, shots: [...] } from content JSON. */
  load(def) {
    this.def = def;
    this.shots = def.shots || [];
    this.index = -1;
  }

  play() {
    if (!this.shots.length) { this.onDone?.(); return; }
    this.playing = true;
    this.paused = false;
    this.root.hidden = false;
    this.index = -1;
    this._nextShot();
  }

  _nextShot() {
    this.index++;
    if (this.index >= this.shots.length) return this._finish();
    const shot = this.shots[this.index];
    this.progress.textContent = `Shot ${this.index + 1} of ${this.shots.length} — purpose: ${shot.purpose}`;
    this.caption.textContent = shot.captions?.join(' ') || '';
    this.desc.textContent = shot.description || '';
    this._t = 0;
    if (this.motion.reduced) {
      // Reduced-motion version: still frame at the end of the path + captions.
      this._placeAt(shot, 1);
      const hold = Math.max(2500, (shot.duration || 10) * 700);
      this._stillDeadline = performance.now() + hold;
      this._stillTimer = setTimeout(() => this._nextShot(), hold);
    } else {
      this._start = performance.now();
      this._stillDeadline = null; // not a still shot: pause() must not pick up a stale timer
      cancelAnimationFrame(this._raf);
      const step = () => {
        if (!this.playing) return;
        if (this.paused) { this._raf = requestAnimationFrame(step); return; }
        const elapsed = (performance.now() - this._start) / 1000;
        const dur = shot.duration || 10;
        const t = Math.min(1, elapsed / dur);
        this._placeAt(shot, t);
        if (t >= 1) { this._nextShot(); return; }
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }
  }

  _placeAt(shot, t) {
    const ease = EASINGS[shot.easing] || EASINGS.easeInOut;
    const k = ease(t);
    const pts = (shot.path || []).map(p => new Vector3(...p));
    const target = new Vector3(...(shot.target || [0, 0, 0]));
    let pos;
    if (pts.length === 0) pos = this.camera.position.clone();
    else if (pts.length === 1) pos = pts[0];
    else if (pts.length === 2) pos = pts[0].clone().lerp(pts[1], k);
    else pos = new CatmullRomCurve3(pts).getPoint(k);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
  }

  /** Pause the current shot (camera path or reduced-motion still timer). */
  pause() {
    if (!this.playing || this.paused) return;
    this.paused = true;
    this._pausedAt = performance.now();
    if (this._stillDeadline) {
      clearTimeout(this._stillTimer);
      this._stillRemaining = Math.max(0, this._stillDeadline - this._pausedAt);
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const gap = performance.now() - this._pausedAt;
    if (this._start) this._start += gap;
    if (this.motion.reduced && this._stillRemaining != null) {
      this._stillDeadline = performance.now() + this._stillRemaining;
      this._stillTimer = setTimeout(() => this._nextShot(), this._stillRemaining);
      this._stillRemaining = null;
    }
  }

  skip() {
    if (!this.playing) return;
    this.paused = false;
    clearTimeout(this._stillTimer);
    cancelAnimationFrame(this._raf);
    this.playing = false;
    this.root.hidden = true;
    this.onSkip?.(this.def?.id);
    this.onDone?.();
  }

  _finish() {
    this.playing = false;
    this.paused = false;
    this.root.hidden = true;
    this.onDone?.();
  }

  dispose() {
    document.removeEventListener('keydown', this._esc);
    clearTimeout(this._stillTimer);
    cancelAnimationFrame(this._raf);
    this.root?.remove();
  }
}
