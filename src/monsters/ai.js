import { Snd } from '../audio/audio.js';
import { CORE, T, inGrid, isBlock, tileX, tileZ, toTile } from '../core/grid.js';
import { BLK } from '../data/terrain.js';
import { G } from '../core/state.js';
import { P, debris, emit } from '../render/vfx.js';
import { flashMats, play } from '../render/characters.js';
import { core, damageTile, tileAt } from '../world/terrain.js';
import { enterCost, nextStep } from '../world/pathfinding.js';
import { reachCore, removeEnemy } from './enemy.js';
import { hero, heroDamage } from '../heroes/hero.js';

function groundY(x, z) { const [c, r] = toTile(x, z); return inGrid(c, r) && tileAt(c, r).t === T.CARVED ? -.46 : 0; }
function enemyWalk(x, z) { const [c, r] = toTile(x, z); if (!inGrid(c, r)) return false; const t = tileAt(c, r); return !isBlock(t.t) && t.t !== T.BEDROCK && !t.tower && !t.bar; }
function separate(dt) {
  const L = G.enemies.filter(e => !e.dead && !e.E.fly && e.state !== 'spawn');
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i].g.position, b = L[j].g.position, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, m = (L[i].E.h + L[j].E.h) * .2;
    if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), k = Math.min(.5, (m - d) * .5) * Math.min(1, dt * 8), ux = dx / d * k, uz = dz / d * k;
      if (enemyWalk(a.x - ux, a.z - uz)) { a.x -= ux; a.z -= uz; } if (enemyWalk(b.x + ux, b.z + uz)) { b.x += ux; b.z += uz; } } }
}
function faceTo(g, x, z, dt, k = 10) { let d = Math.atan2(x - g.position.x, z - g.position.z) - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rotation.y += d * Math.min(1, dt * k); }
function updEnemies(dt) {
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i], E = e.E, g = e.g; if (e.m.mixer) e.m.mixer.update(dt);
    if (e.dying !== undefined) { e.dying -= dt; if (E.fly) { e.m.inner.position.y = Math.max(.3, e.m.inner.position.y - dt * 7); e.m.inner.rotation.z += dt * 8; } else if (e.dying < .5) g.position.y -= dt * 2.5; if (e.dying <= 0) removeEnemy(e); continue; }
    if (e.flash > 0) { e.flash -= dt; flashMats(e.m.mats, true); } else if (e.slowT > 0) flashMats(e.m.mats, true, 0x2a3aaa); else flashMats(e.m.mats, false);
    e.hb.set(Math.max(0, e.hp / e.max)); if (e.state === 'spawn') { e.spawnT -= dt; if (e.spawnT <= 0) e.state = 'walk'; continue; }
    const slowK = e.slowT > 0 ? 1 - (e.slowAmt || .45) : 1, spd = E.spd * slowK; e.slowT -= dt;
    if (E.fly) {
      const tx = core.position.x, tz = core.position.z, dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < 1) { reachCore(e); continue; } g.position.x += dx / d * spd * dt; g.position.z += dz / d * spd * dt; faceTo(g, tx, tz, dt);
      e.bob += dt; const f = Math.sin(G.t * 16 + e.bob); e.m.wings[0].rotation.y = f * .8; e.m.wings[1].rotation.y = -f * .8; e.m.inner.position.y = 3 + Math.sin(G.t * 3 + e.bob) * .35; e.m.inner.rotation.x = .15;
      const [tc, tr] = toTile(g.position.x, g.position.z); if (inGrid(tc, tr)) e.tile = [tc, tr]; continue;
    }
    // 영웅과 근접 전투
    const hd = hero && hero.dead <= 0 ? Math.hypot(hero.g.position.x - g.position.x, hero.g.position.z - g.position.z) : 99;
    if (hd < 1.25 + E.h * .2) { faceTo(g, hero.g.position.x, hero.g.position.z, dt, 14); play(e.m, E.dig, { speed: 1.2 }); e.atkCd -= dt; if (e.atkCd <= 0) { e.atkCd = .85; heroDamage(E.dps * .85); } continue; }
    if (e.next && enterCost(tileAt(e.next[0], e.next[1])) === Infinity) e.next = null;
    if (!e.next) e.next = nextStep(e.tile[0], e.tile[1]);
    if (!e.next) { reachCore(e); continue; }
    const nt = tileAt(e.next[0], e.next[1]), cx = tileX(e.tile[0]), cz = tileZ(e.tile[1]);
    if (isBlock(nt.t) || nt.bar) { // 지형/바리케이드 부수기
      const dx = e.next[0] - e.tile[0], dz = e.next[1] - e.tile[1], sx = -dz, sz = dx;
      const tx = cx + dx * .55 + sx * e.off[0] * 1.2, tz = cz + dz * .55 + sz * e.off[0] * 1.2;
      const ddx = tx - g.position.x, ddz = tz - g.position.z, d = Math.hypot(ddx, ddz);
      if (d > .75) { const mv = Math.min(d, spd * dt); g.position.x += ddx / d * mv; g.position.z += ddz / d * mv; faceTo(g, tx, tz, dt); play(e.m, E.walk, { speed: spd * E.ws }); }
      else { if (d > .05) { const mv = Math.min(d, spd * dt * .5); g.position.x += ddx / d * mv; g.position.z += ddz / d * mv; } faceTo(g, tileX(nt.c), tileZ(nt.r), dt, 12); play(e.m, E.dig, { speed: 1.15 * slowK + .1 }); e.digging = true;
        damageTile(nt, E.dps * dt); e.hitT -= dt;
        if (e.hitT <= 0) { e.hitT = .55; const hx = (g.position.x + tileX(nt.c)) / 2, hz = (g.position.z + tileZ(nt.r)) / 2;
          if (nt.bar || isBlock(nt.t)) { const cols = nt.bar ? [0xa8703a, 0x6a4422] : BLK[nt.t].deb; debris(hx, .9, hz, E.boss ? 5 : 2, cols, 4); emit(P, hx, .9, hz, 6, nt.t === T.ROCK ? 0xffffff : 0xc8a070, 3, .4, -6, .6); Snd.play(nt.bar || nt.t === T.FOREST ? 'digWood' : nt.t === T.ROCK ? 'dig' : 'digSoft', { pos: g.position, rate: E.boss ? .7 : 1 }); }
          if (E.boss) G.shake = Math.max(G.shake, .15); } }
    } else {
      e.digging = false;
      const tx = tileX(e.next[0]) + e.off[0], tz = tileZ(e.next[1]) + e.off[1], dx = tx - g.position.x, dz = tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < spd * dt + .03) { g.position.x = tx; g.position.z = tz; e.tile = e.next; e.next = null; if (e.tile[0] === CORE[0] && e.tile[1] === CORE[1]) { reachCore(e); continue; } }
      else { g.position.x += dx / d * spd * dt; g.position.z += dz / d * spd * dt; faceTo(g, tx, tz, dt); }
      play(e.m, E.walk, { speed: spd * E.ws });
      if (E.boss && Math.sin(G.t * 4.5) * Math.sin((G.t - dt) * 4.5) < 0) { G.shake = Math.max(G.shake, .16); Snd.play('stomp', { pos: g.position, rate: .55, force: true }); emit(P, g.position.x, .2, g.position.z, 6, 0x8a7a6a, 3, .4); }
    }
    g.position.y += (groundY(g.position.x, g.position.z) - g.position.y) * Math.min(1, dt * 8);
  }
}

export { groundY, separate, updEnemies };
