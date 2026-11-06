/**
 * lod.js — instanced level-of-detail sets for the own-work trees and hedge
 * shrubs (S2 spike "impostor forest": LOD0 under 60 m, LOD1 to the preset's
 * impostorFar, a baked billboard impostor beyond it). One InstancedMesh per
 * (level, glTF primitive) plus one impostor mesh, so a whole woodland costs a
 * handful of draw calls. Buckets are rebuilt when the camera moves 3 m or
 * every 0.4 s.
 * @module meadow3/lod
 */
import * as THREE from 'three';

/**
 * Meshes (geometry + material + matrix) under a glTF LOD node, relative to the
 * node's parent (the tree's pivot at the trunk base), so the node's own offset
 * is kept.
 */
export function meshParts(node) {
  const ref = node.parent || node;
  ref.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(ref.matrixWorld).invert();
  const parts = [];
  node.traverse((o) => {
    if (!o.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    parts.push({ geometry: o.geometry, material: o.material, local });
  });
  return parts;
}

/**
 * Render a node into a square RGBA texture from the side (an impostor).
 * @returns {{ texture: THREE.Texture, width: number, height: number, baseY: number }}
 */
export function bakeImpostor(renderer, node, { size = 256, light = 2.4 } = {}) {
  const box = new THREE.Box3().setFromObject(node);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const w = Math.max(s.x, s.z) * 1.04, h = s.y * 1.04; // node pivot at its base (y = 0)
  const side = Math.max(w, h);
  const cam = new THREE.OrthographicCamera(-side / 2, side / 2, side / 2, -side / 2, 0.01, side * 6);
  cam.position.set(c.x, c.y, c.z + side * 2);
  cam.lookAt(c);
  const scn = new THREE.Scene();
  const clone = node.clone();
  scn.add(clone);
  scn.add(new THREE.HemisphereLight(0xfff3df, 0x4a5a32, light));
  const dl = new THREE.DirectionalLight(0xfff0d8, 1.6);
  dl.position.set(0.6, 1, 0.8);
  scn.add(dl);
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const prevRT = renderer.getRenderTarget();
  const prevClear = new THREE.Color(); renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevTM = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scn, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTM;
  return { texture: rt.texture, width: side, height: side, baseY: c.y - side / 2 };
}

export class LodSet {
  /**
   * @param {THREE.Object3D} parent
   * @param {object} o
   * @param {string} o.name
   * @param {THREE.Object3D[]} o.levels   glTF nodes, LOD0 first
   * @param {number[]} o.near             max distance per level (the last level runs to `far`)
   * @param {number} o.far                impostor beyond this (Infinity = no impostor)
   * @param {{ texture: THREE.Texture, width: number, height: number }|null} o.impostor
   * @param {{ x: number, y: number, z: number, rot: number, scale: number }[]} o.placements
   * @param {boolean} [o.castShadow]
   */
  constructor(parent, o) {
    this.group = new THREE.Group();
    this.group.name = o.name;
    parent.add(this.group);
    this.near = o.near;
    this.far = o.far;
    this.placements = o.placements;
    const n = o.placements.length;
    this.levels = o.levels.map((node, li) => meshParts(node).map((p) => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, n);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = Boolean(o.castShadow) && li === 0;
      m.receiveShadow = true;
      m.userData.local = p.local;
      m.name = `${o.name}-lod${li}`;
      this.group.add(m);
      return m;
    }));
    this.matrices = o.placements.map((p) => new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(p.scale, p.scale, p.scale),
    ));
    if (o.impostor) {
      const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ map: o.impostor.texture, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 });
      this.imp = new THREE.InstancedMesh(geo, mat, n);
      this.imp.count = 0;
      this.imp.frustumCulled = false;
      this.imp.name = `${o.name}-impostor`;
      this.imp.userData.impostor = o.impostor;
      this.group.add(this.imp);
    }
    this._last = new THREE.Vector3(1e9, 0, 0);
    this._t = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  setFar(far) { this.far = far; this._last.set(1e9, 0, 0); }

  update(camera, dt) {
    this._t += dt;
    const p = camera.position;
    if (p.distanceToSquared(this._last) < 9 && this._t < 0.4) return;
    this._t = 0;
    this._last.copy(p);
    const counts = this.levels.map(() => 0);
    let ic = 0;
    for (let i = 0; i < this.placements.length; i++) {
      const pl = this.placements[i];
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      let li = this.near.findIndex((r) => d < r);
      if (li < 0) li = d < this.far || !this.imp ? this.levels.length - 1 : -1;
      if (li >= 0) {
        for (const mesh of this.levels[li]) { this._m.multiplyMatrices(this.matrices[i], mesh.userData.local); mesh.setMatrixAt(counts[li], this._m); }
        counts[li]++;
      } else {
        const imp = this.imp.userData.impostor;
        this._q.setFromAxisAngle(this._v.set(0, 1, 0), Math.atan2(p.x - pl.x, p.z - pl.z));
        this._m.compose(this._v.set(pl.x, pl.y + imp.baseY * pl.scale, pl.z), this._q, this._s.set(imp.width * pl.scale, imp.height * pl.scale, 1));
        this.imp.setMatrixAt(ic++, this._m);
      }
    }
    this.levels.forEach((meshes, li) => { for (const m of meshes) { m.count = counts[li]; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } });
    if (this.imp) { this.imp.count = ic; this.imp.instanceMatrix.needsUpdate = true; this.imp.computeBoundingSphere(); }
  }
}
