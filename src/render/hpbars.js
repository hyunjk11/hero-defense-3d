import * as THREE from 'three';
import { G } from '../core/state.js';
import { camera, scene } from './scene.js';

// HP 바: 카메라를 향하는 하나의 그룹 안에 프레임/배경/잔상/체력이 모두 같은 왼쪽 기준점에서 늘어남
const barGeo = new THREE.PlaneGeometry(1, 1).translate(.5, 0, 0), BARS = [], barV = new THREE.Vector3(), barLow = new THREE.Color(0xff4a3a), barMid = new THREE.Color(0xffd23a);
function hpBar(parent, y, w = 1.4, color = 0x55ff77, opt = {}) {
  const g = new THREE.Group(); scene.add(g); const h = opt.h || .16, pad = .045;
  const part = (c, op, ww, hh, x, ro) => { const m = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthTest: false, depthWrite: false, toneMapped: false }));
    m.scale.set(ww, hh, 1); m.position.set(x, 0, 0); m.renderOrder = ro; m.frustumCulled = false; g.add(m); return m; };
  const frame = part(0x0b0816, .85, w + pad * 2, h + pad * 2, -w / 2 - pad, 20), back = part(0x3a1420, .95, w, h, -w / 2, 21),
    trail = part(0xfff0b0, 1, w, h, -w / 2, 22), fg = part(color, 1, w, h, -w / 2, 23);
  const base = new THREE.Color(color), b = { g, parent, y, w, r: 1, tr: 1, hold: 0, vis: true, auto: !!opt.auto, grade: opt.grade !== false && color === 0x55ff77, fg, trail, frame,
    set(r) { r = Math.max(0, Math.min(1, r)); if (r < this.r - 1e-4) this.hold = .35; if (r > this.tr) this.tr = r; this.r = r; },
    show(v) { this.vis = v; }, dispose() { scene.remove(g); g.children.forEach(m => m.material.dispose()); const i = BARS.indexOf(this); if (i >= 0) BARS.splice(i, 1); } , base };
  BARS.push(b); return b;
}
function updBars(dt) {
  for (const b of BARS) {
    const alive = b.vis && b.parent.parent && b.parent.visible !== false && !(b.auto && b.r >= .999 && b.tr >= .999);
    b.g.visible = alive && !G.heroShot; if (!b.g.visible) continue;
    if (b.hold > 0) b.hold -= dt; else b.tr = Math.max(b.r, b.tr - dt * (.25 + (b.tr - b.r) * 2.2));
    b.parent.getWorldPosition(barV); b.g.position.set(barV.x, barV.y + b.y, barV.z); b.g.quaternion.copy(camera.quaternion);
    b.fg.scale.x = Math.max(1e-4, b.w * b.r); b.trail.scale.x = Math.max(1e-4, b.w * b.tr); b.trail.visible = b.tr > b.r + 1e-3;
    if (b.grade) b.fg.material.color.copy(b.r > .5 ? b.base : b.r > .25 ? barMid : barLow);
  }
}

export { BARS, hpBar, updBars };
