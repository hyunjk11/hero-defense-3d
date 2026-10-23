import { barHpAt } from '../data/towers.js';
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { T, inGrid, tileX, tileZ } from '../core/grid.js';
import { G } from '../core/state.js';
import { scene } from '../render/scene.js';
import { mk, toon } from '../render/toon.js';
import { P, debris, emit } from '../render/vfx.js';
import { hpBar } from '../render/hpbars.js';
import { refreshTile, tileAt } from './terrain.js';
import { computeDist, enterCost } from './pathfinding.js';
import { banner } from '../ui/hud.js';
import { select } from '../ui/input.js';

// ================= 바리케이드 =================
const barMaxHp = () => barHpAt(G.ups.bar, G.advBar || 1); // 전직 성기사: 바리케이드 체력 +15%
const woodM = toon(0xa8703a), woodD = toon(0x6a4422), ropeM = toon(0xe0c890);
function addBarricade(t) {
  const g = new THREE.Group(), x = tileX(t.c), z = tileZ(t.r); g.position.set(x, t.t === T.CARVED ? -.46 : 0, z); scene.add(g);
  const wl = (c, r) => inGrid(c, r) && enterCost(tileAt(c, r)) < 3; const horiz = wl(t.c - 1, t.r) || wl(t.c + 1, t.r);
  const inner = new THREE.Group(); inner.rotation.y = horiz ? Math.PI / 2 : 0; g.add(inner);
  for (const y of [.45, 1]) { const l = mk(new THREE.CylinderGeometry(.13, .13, 1.9, 8), woodD, 0, y, -.1, inner); l.rotation.z = Math.PI / 2; }
  for (let i = -2; i <= 2; i++) { const s = mk(new THREE.CylinderGeometry(.1, .12, 1.3, 7), woodM, i * .4, .75, 0, inner); s.rotation.x = (i % 2 ? .3 : -.2); mk(new THREE.ConeGeometry(.1, .35, 7), toon(0xe8c890), 0, .82, 0, s, .02); }
  for (const sx of [-1, 1]) { const x2 = mk(new THREE.CylinderGeometry(.09, .09, 1.6, 7), woodD, sx * .55, .8, .22, inner); x2.rotation.z = sx * .7; }
  mk(new THREE.TorusGeometry(.15, .04, 6, 12), ropeM, -.4, 1, -.1, inner, 0);
  const hb = hpBar(g, 2, 1.6, 0xffb03a, { auto: true }); const b = { t, g, hp: barMaxHp(), max: barMaxHp(), hb, kind: 'bar' }; t.bar = b; refreshTile(t); return b;
}
function removeBarricade(t, broken) {
  const b = t.bar; if (!b) return; scene.remove(b.g); b.hb.dispose(); t.bar = null; if (G.sel === b) select(null);
  if (broken) { debris(b.g.position.x, 1, b.g.position.z, 18, [0xa8703a, 0x6a4422, 0xe0c890], 7); emit(P, b.g.position.x, 1, b.g.position.z, 30, 0xc08a4a, 6, .8, -12, 3); banner('바리케이드 파괴!', '#ffb03a', 900); Snd.play('breakWood', { pos: b.g.position }); }
  computeDist();
}

export { barMaxHp, woodM, woodD, addBarricade, removeBarricade };
