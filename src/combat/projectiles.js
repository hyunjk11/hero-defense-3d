import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { rand } from '../core/util.js';
import { G, later } from '../core/state.js';
import { scene } from '../render/scene.js';
import { glow } from '../render/toon.js';
import { P, PB, debris, emit, ringFx } from '../render/vfx.js';
import { enemyAim } from '../world/towers.js';
import { hurt, armorOf } from '../monsters/enemy.js';
import { AWK, poolHits, pierceDmg } from '../data/growth.js';
import { Q } from '../render/quality.js';

// ================= 투사체 =================
const arrowGeo = new THREE.CylinderGeometry(.035, .035, 1, 5).rotateX(Math.PI / 2), arrowHead = new THREE.ConeGeometry(.08, .22, 6).rotateX(Math.PI / 2);
function makeArrow(color) { const m = new THREE.Mesh(arrowGeo, glow(color, 1.4)); const h = new THREE.Mesh(arrowHead, glow(color, 2.2)); h.position.z = .55; m.add(h); return m; }
const orbGeo = new THREE.IcosahedronGeometry(.3, 2), orbMat = glow(0xc07aff, 4);
const bulletGeo = new THREE.CylinderGeometry(.045, .045, .9, 6).rotateX(Math.PI / 2), bulletMat = glow(0xffe0b0, 3.2);
const cmats = {}, cmat = (c, i) => cmats[c + ':' + i] || (cmats[c + ':' + i] = glow(c, i)); // 전직 투사체 색 (opts.col 있을 때만)
function shoot(kind, from, target, dmg, opts = {}) {
  const m = kind === 'arrow' ? makeArrow(opts.color || 0xd0ffd0) : kind === 'bullet' ? new THREE.Mesh(bulletGeo, opts.col ? cmat(opts.col, 3.2) : bulletMat) : new THREE.Mesh(orbGeo, opts.col ? cmat(opts.col, 4) : orbMat); m.position.copy(from); scene.add(m);
  G.projs.push({ kind, m, target, dmg, spd: kind === 'arrow' ? 32 : kind === 'bullet' ? 62 : 16, h: G.curHero, mk: G.mK | 0, ...opts }); // h: 쏜 영웅 (onHit 을 그 영웅 문맥으로)
}
function aoe(pos, r, dmg, color, opts = {}) {
  for (const e of [...G.enemies]) { if (e.dead) continue; const dx = e.g.position.x - pos.x, dz = e.g.position.z - pos.z; if (dx * dx + dz * dz <= r * r && (!opts.groundOnly || !e.E.fly)) { if (opts.slowT) { e.slowT = Math.max(e.slowT, opts.slowT); e.slowAmt = Math.max(e.slowAmt || 0, opts.slowAmt); } else if (opts.slow) { e.slowT = 1.5; e.slowAmt = .45; } hurt(e, dmg, color, opts.big); } }
}
// 광역 폭발 분기: 착탄 후 집속탄 (고정 각도, 게임 난수 미사용)
function clusterBombs(p) { const B = p.cluster, tw = p.tw, d = p.dest.clone();
  for (let k = 0; k < B.cluster; k++) later(.16 + k * .09, () => { const a = k * Math.PI * 2 / B.cluster + .5, q = new THREE.Vector3(d.x + Math.cos(a) * 1.9, d.y, d.z + Math.sin(a) * 1.9);
    G.xpSrc = G.grow && tw && !tw.dead ? tw : null; const w0 = G.mWho; G.mWho = tw ? null : (p.h || undefined); G.mTw = tw || null; aoe(q, B.clusterR, p.dmg * B.clusterK, '#ffd07a', { groundOnly: true }); G.mWho = w0; G.mTw = null; G.xpSrc = null;
    ringFx(q, B.clusterR, 0xffb03a, .3); emit(P, q.x, .4, q.z, 22, 0xffc04a, 5, .5, -6, 1); emit(PB, q.x, .6, q.z, 3, 0xff7a2a, 2, .4, 0, .6); Snd.play('boom', { pos: q, vol: .35, rate: 1.3 }); }); }
// 명중 콜백(전직 화상·빙결·도탄 등)을 쏜 영웅 문맥으로 (파티). 단일 영웅이면 그대로 호출
function hitCb(p, ...a) { if (p.h && p.h !== G.curHero && G.withHero) G.withHero(p.h, () => p.onHit(...a)); else p.onHit(...a); }
function killProj(i) { const p = G.projs[i]; scene.remove(p.m); G.projs.splice(i, 1); }
// 피해 미터: 투사체마다 주인(쏜 영웅 / 타워 = null)·종류(스킬)를 정해 hurt() 가 집계
function updProjs(dt) { const w0 = G.mWho, k0 = G.mK; try { updProjs0(dt); } finally { G.mWho = w0; G.mK = k0; G.mTw = null; } }
function updProjs0(dt) {
  if (pools.length) updPools(dt);
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i], m = p.m; G.mWho = p.tw ? null : (p.h || undefined); G.mK = p.mk | 0; G.mTw = p.tw || null;
    if (p.kind === 'ball') { p.t += dt; const k = Math.min(1, p.t / p.dur); m.position.lerpVectors(p.from, p.dest, k); m.position.y = p.from.y + (p.dest.y + .3 - p.from.y) * k + Math.sin(k * Math.PI) * 3.2;
      if (rand() < .5) emit(P, m.position.x, m.position.y, m.position.z, 1, 0x9a9a9a, .5, .5, 1, 0);
      if (k >= 1) { killProj(i); G.xpSrc = p.tw && G.grow ? p.tw : null; aoe(p.dest, p.r, p.dmg, '#ffc07a', { groundOnly: true }); G.xpSrc = null; if (p.cluster && p.cluster.cluster) clusterBombs(p); if (p.awk && p.tw) { const A = AWK.cannon; firePool({ x: p.dest.x, z: p.dest.z, r: A.poolR, dmg: p.dmg * A.poolK, left: A.poolT, tw: p.tw }); } ringFx(p.dest, p.r, 0xff8a2a, .35); emit(P, p.dest.x, .4, p.dest.z, 40, 0xffa04a, 7, .6, -8, 1.5); emit(PB, p.dest.x, .6, p.dest.z, 6, 0xff7a2a, 3, .5, 0, 1); debris(p.dest.x, .3, p.dest.z, 4, [0x8a6a4a, 0x5a5a5a], 4); G.shake = Math.max(G.shake, .08); Snd.play('boom', { pos: p.dest, vol: .6 }); }
      continue; }
    if (p.kind === 'rain' || p.kind === 'meteor') {
      const d = p.dest.clone().sub(m.position), len = d.length(), mv = p.spd * dt;
      if (p.kind === 'meteor') { emit(P, m.position.x, m.position.y, m.position.z, 8, 0xff8a2a, 2, .5, 2, 2); m.rotation.x += dt * 5; }
      if (len <= mv) { killProj(i);
        if (p.kind === 'rain') { aoe(p.dest, 1.3, p.dmg, '#9affb0', p.slowT ? { slowT: p.slowT, slowAmt: p.slowAmt } : {}); emit(P, p.dest.x, .3, p.dest.z, 5, 0x9affb0, 3, .35); }
        else { aoe(p.dest, p.r || 4.8, p.dmg, '#ffb05a', { big: true, slow: true }); G.shake = .9; ringFx(p.dest, (p.r || 4.8) * 1.25, 0xff8a2a, .6); emit(PB, p.dest.x, .5, p.dest.z, 50, 0xff7a2a, 10, 1, -4, 3); emit(P, p.dest.x, .5, p.dest.z, 160, 0xffcc5a, 14, 1.1, -14, 3); debris(p.dest.x, .5, p.dest.z, 30, [0x3a2a2a, 0xff6a2a, 0x6a4a3a], 10); Snd.play('meteor', { pos: p.dest, force: true }); Snd.play('boom', { pos: p.dest }); }
        continue; }
      m.position.addScaledVector(d.normalize(), mv); continue;
    }
    if (p.kind === 'pierce') { const mv = Math.min(p.left, p.spd * dt); p.left -= mv; m.position.addScaledVector(p.dir, mv); m.position.y += (1.1 - m.position.y) * Math.min(1, dt * 8);
      emit(P, m.position.x, m.position.y, m.position.z, 3, p.col || 0x9ad8ff, .6, .35, 0, .2); G.xpSrc = G.grow && p.tw ? p.tw : null;
      for (const e of [...G.enemies]) { if (e.dead || (e.E.fly && !p.air) || p.hit.has(e)) continue; const dx = e.g.position.x - m.position.x, dz = e.g.position.z - m.position.z; if (dx * dx + dz * dz > 1.1 * 1.1) continue;
        p.hit.add(e); hurt(e, p.dmg / Math.max(.05, 1 - armorOf(e)), p.txt || '#bfe8ff', true); if (p.onHit) hitCb(p, e); const q = enemyAim(e); emit(P, q.x, q.y, q.z, 14, 0x9ad8ff, 5, .4, -3, .6); debris(q.x, q.y, q.z, 2, [0xf0ead8], 3); }
      G.xpSrc = null; if (p.left <= 0) { killProj(i); ringFx(m.position, 1.4, 0x9ad8ff, .3); emit(P, m.position.x, m.position.y, m.position.z, 18, 0xbfe8ff, 4, .4, -2, .6); if (p.awkLine && p.tw) { const A = AWK.cannon; firePool({ x: p.awkLine.x, z: p.awkLine.z, x2: m.position.x, z2: m.position.z, w: A.lineW, dmg: p.dmg * A.poolK, left: A.lineT, tw: p.tw }); } } continue; }
    if (p.target.dead) { killProj(i); continue; }
    const tp = enemyAim(p.target), d = tp.clone().sub(m.position), len = d.length(), mv = p.spd * dt;
    if (len <= mv) { killProj(i);
      if (p.kind === 'bullet') { hurt(p.target, p.dmg, '#ffd0e4', false, { x: m.position.x, z: m.position.z, kind: 'ranged' }); emit(P, tp.x, tp.y, tp.z, 4, 0xffe0a0, 3.5, .2); if (p.onHit) hitCb(p, tp, p.target); }
      else if (p.kind === 'arrow') { G.xpSrc = p.tw && G.grow ? p.tw : null; hurt(p.target, p.ap ? p.dmg / Math.max(.05, 1 - armorOf(p.target)) : p.dmg, p.ap ? '#ff9ab0' : '#ffffff', !!p.big, { x: m.position.x, z: m.position.z, kind: 'ranged' }); G.xpSrc = null; if (p.big) { ringFx(tp, 1.2, 0xff7a9a, .25); emit(P, tp.x, tp.y, tp.z, 12, 0xff9ab0, 4, .35); } emit(P, tp.x, tp.y, tp.z, 5, p.color || 0xd0ffd0, 3, .3); if (p.onHit) hitCb(p, tp, p.target);  if (p.awk && p.tw) awkPierce(p, tp); }
      else { aoe(tp, p.aoe, p.dmg, '#d0a0ff', { slow: true }); emit(P, tp.x, tp.y, tp.z, 18, p.col || 0xb07aff, 5, .5, -4, 1.5); ringFx(tp, p.aoe, p.col || 0xb07aff, .3); if (p.onHit) hitCb(p, tp, p.target); }
      continue; }
    m.position.addScaledVector(d.normalize(), mv); m.lookAt(tp);
    if (p.kind !== 'bullet') emit(P, m.position.x, m.position.y, m.position.z, 1, p.kind === 'arrow' ? (p.color || 0x9affb0) : (p.col || 0xb07aff), .3, .25, 0, 0);
  }
}

// ================= ✨ 초월 효과: 천궁 꿰뚫기 · 화염 포루 불바다 (docs/TOWER_AWAKEN_2026-10-24.md) =================
const awkN = k => { const N = (G.awkN ||= {}); N[k] = (N[k] || 0) + 1; };
// 꿰뚫기: 명중 후 3.5 안의 아직 안 맞은 가장 가까운 적에게 다음 화살 (80% → 65%). opts.awk 는 여러 화살이 같이 쓰므로 고치지 않고 새로 만듦
function awkPierce(p, tp) { const A = AWK.arrow, k = p.awk.pl | 0; if (k >= A.pierce || p.tw.dead) return; const hit = p.awkHit || new Set([p.target]), from = p.target.g.position;
  let nb = null, nd = A.pierceR * A.pierceR; for (const e of G.enemies) { if (e.dead || hit.has(e) || e.immT > G.t) continue; const d = e.g.position.distanceToSquared(from); if (d < nd) { nd = d; nb = e; } } if (!nb) return;
  hit.add(nb); const base = p.awkBase || p.dmg; shoot('arrow', tp.clone(), nb, pierceDmg(base, k + 1), { spd: 40, color: 0xfff6a0, tw: p.tw, ap: p.ap, big: false, awk: { pl: k + 1 }, awkHit: hit, awkBase: base }); awkN('pierce'); }
// 불바다: 바닥 가산 데칼(원/직선) · 활성 상한 8 (오래된 것 재사용) · 0.5초 틱마다 적마다 덮는 것 중 가장 센 1개만 (지상)
const pools = [], poolMeshes = [], circGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2), lineGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); let poolT = 0;
G.awkPools = pools;
function poolMesh() { let m = poolMeshes.find(x => !x.userData.on); if (!m) { m = new THREE.Mesh(circGeo, new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.renderOrder = 2; poolMeshes.push(m); scene.add(m); } m.userData.on = true; m.visible = true; return m; }
function firePool(o) { const A = AWK.cannon; if (pools.length >= A.poolMax) { const old = pools.shift(); old.m.userData.on = false; old.m.visible = false; }
  const m = poolMesh(); o.t0 = o.left; if (o.x2 === undefined) { m.geometry = circGeo; m.position.set(o.x, .12, o.z); m.scale.set(o.r, 1, o.r); m.rotation.set(0, 0, 0); }
  else { const dx = o.x2 - o.x, dz = o.z2 - o.z, L = Math.hypot(dx, dz) || .01; m.geometry = lineGeo; m.position.set((o.x + o.x2) / 2, .12, (o.z + o.z2) / 2); m.scale.set(o.w * 2, 1, L); m.rotation.set(0, Math.atan2(dx, dz), 0); }
  o.m = m; pools.push(o); awkN(o.x2 === undefined ? 'pool' : 'line'); if (!Q.perf) emit(PB, o.x, .5, o.z, 6, 0xff7a2a, 3, .6, 0, 1); }
function updPools(dt) { const A = AWK.cannon;
  for (let i = pools.length - 1; i >= 0; i--) { const o = pools[i]; o.left -= dt; const k = Math.max(0, o.left / o.t0); o.m.material.opacity = .18 + .32 * Math.min(1, k * 1.5) + Math.sin(G.t * 9 + i) * .05;
    if (o.left <= 0) { o.m.userData.on = false; o.m.visible = false; pools.splice(i, 1); } }
  poolT += dt; if (poolT < A.tick) return; poolT -= A.tick; if (!pools.length) return;
  const L = G.enemies.filter(e => !e.dead), H = poolHits(pools, L.map(e => ({ x: e.g.position.x, z: e.g.position.z, fly: !!e.E.fly })));
  for (const [i, best] of H) { const e = L[i]; if (e.dead) continue;
    const tw = best.tw && !best.tw.dead ? best.tw : null; G.mWho = null; G.mTw = tw; G.xpSrc = G.grow ? tw : null; hurt(e, best.dmg, '#ff9a5a'); G.xpSrc = null; awkN('poolHit');
    if (!Q.perf) emit(P, e.g.position.x, .4, e.g.position.z, 3, 0xff8a3a, 2.5, .4, 2, .4); }
  G.mTw = null; }

export { makeArrow, shoot, aoe, updProjs };
