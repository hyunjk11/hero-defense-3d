#!/usr/bin/env python3
"""워프(T) / 영웅 끼임 탈출 / 적 끼임 보정 테스트.  python3 tests/warp.py"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, page, S
from playwright.sync_api import sync_playwright
PRE = r"""()=>{ window.W_ = {
  pos() { const p = G.hero.g.position; return [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100]; },
  tile() { return G.toTile(G.hero.g.position.x, G.hero.g.position.z); },
  coreFront() { return G.tileXZ(G.CORE[0] - 1, G.CORE[1]); },
  far() { return G.tileXZ(G.SPAWN[0] + 1, G.SPAWN[1]); },
  blockNextToGrass() { for (let c = 3; c < 20; c++) for (let r = 2; r < 14; r++) { const t = G.tileAt(c, r); if (t.t < 2 || t.t > 4) continue; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const n = G.tileAt(c + dc, r + dr); if (n && n.t === 0 && !n.tower) return [c, r, c + dc, r + dr]; } } },
}; return 1; }"""
TESTS = {
 'warp': r"""()=>{ const h = G.hero, [fx, fz] = W_.far(); h.g.position.set(fx, 0, fz); h.path = []; G.sim(.2);
   const d0 = Math.hypot(h.g.position.x - W_.coreFront()[0], h.g.position.z - W_.coreFront()[1]); const ok1 = G.startWarp(); G.sim(.5); const mid = W_.pos(); G.sim(.7);
   const [cx, cz] = W_.coreFront(), d1 = Math.hypot(h.g.position.x - cx, h.g.position.z - cz); const again = G.startWarp();
   return { started: ok1, far_before: +d0.toFixed(1), still_mid_channel: Math.hypot(mid[0] - fx, mid[1] - fz) < .01, dist_core_front_after: +d1.toFixed(2), warpN: G.warpN, cd: +h.warpCd.toFixed(1), blocked_on_cd: again === false,
     ok: ok1 && d0 > 20 && d1 < 2.5 && G.warpN === 1 && h.warpCd > 9 && again === false }; }""",
 'warp_cancel': r"""()=>{ const h = G.hero, [fx, fz] = W_.far(); h.g.position.set(fx, 0, fz); G.sim(.2); G.startWarp(); G.sim(.4); G.heroGoTo(fx + 2, fz); G.sim(1.2);
   return { warpN: G.warpN || 0, warpT: h.warpT, cd: h.warpCd, moved_away_from_core: Math.hypot(h.g.position.x - W_.coreFront()[0], h.g.position.z - W_.coreFront()[1]) > 20, ok: !G.warpN && h.warpT === 0 && h.warpCd === 0 }; }""",
 'warp_cd_expires': r"""()=>{ const h = G.hero; G.startWarp(); G.sim(1.2); const a = G.startWarp(); G.sim(10); const b = G.startWarp(); return { cd_left: h.warpCd, phase: G.phase, second_blocked: a === false, after_10s: b, ok: a === false && b === true }; }""",
 'hero_overlap_escape': r"""()=>{ const h = G.hero, [bc, br, gc, gr] = W_.blockNextToGrass(), [bx, bz] = G.tileXZ(bc, br), [gx, gz] = G.tileXZ(gc, gr);
   h.g.position.set(gx + (bx - gx) * .35, 0, gz + (bz - gz) * .35); const [tx, tz] = [gx - (bx - gx) * 1.5, gz - (bz - gz) * 1.5]; G.heroGoTo(tx, tz); const t0 = W_.pos(); const tr = []; for (let i = 0; i < 10; i++) { G.sim(.25); tr.push(W_.pos()); }
   const p = W_.pos(); return { start: t0, end: p, moved: +Math.hypot(p[0] - t0[0], p[1] - t0[1]).toFixed(2), trace: tr.slice(0, 4), unstuck: h.unstuckN, ok: h.unstuckN === 0 && Math.hypot(p[0] - t0[0], p[1] - t0[1]) > 1 }; }""",
 'hero_inside_block_unstuck': r"""()=>{ const h = G.hero, [bc, br] = W_.blockNextToGrass(), [bx, bz] = G.tileXZ(bc, br); h.g.position.set(bx, 0, bz); G.heroGoTo(...W_.coreFront()); G.sim(3);
   const [c, r] = W_.tile(), t = G.tileAt(c, r); return { unstuck: h.unstuckN, tile_type: t.t, ok: h.unstuckN >= 1 && (t.t === 0 || t.t === 1 || t.t === 6 || t.t === 7) }; }""",
 'build_preview_reasons': r"""()=>{ const [bc, br, gc, gr] = W_.blockNextToGrass(); G.gold = 500; const r = {};
   r.grass_ok = G.buildReason(gc, gr, 'arrow'); r.block_tower = G.buildReason(bc, br, 'arrow'); r.block_clear = G.buildReason(bc, br, 'clear'); r.grass_clear = G.buildReason(gc, gr, 'clear');
   G.gold = 5; r.poor = G.buildReason(gc, gr, 'arrow'); G.gold = 500; r.core_tile = G.buildReason(G.CORE[0], G.CORE[1], 'arrow');
   G.setTool('cannon'); G.sim(.1); const h = G.hoverTile(gc, gr); r.tip = h[2]; r.mode = document.getElementById('modeInd').innerText; r.mode_visible = !document.getElementById('modeInd').classList.contains('hidden');
   G.setTool('move'); r.mode_hidden_after = document.getElementById('modeInd').classList.contains('hidden');
   r.ok = r.grass_ok === null && /개간/.test(r.block_tower) && r.block_clear === null && !!r.grass_clear && /골드 부족/.test(r.poor) && !!r.core_tile && /90G/.test(r.tip) && r.mode_visible && r.mode_hidden_after; return r; }""",
 'enemy_nudge': r"""()=>{ G.hero.g.position.set(-40, 0, -40); G.hero.dead = 1e9; const [bc, br, gc, gr] = W_.blockNextToGrass(), [bx, bz] = G.tileXZ(bc, br), [gx, gz] = G.tileXZ(gc, gr);
   const e = T_.enemyAt('grunt', gx, gz); G.phase = 'wave'; e.g.position.set(bx, 0, bz); e.E = Object.assign({}, e.E, { dps: 0, digDps: 0 }); e.tile = [gc, gr]; e.next = [gc, gr];
   for (let i = 0; i < 50; i++) { G.sim(.05); if (!G.nudgeN) e.g.position.set(bx, 0, bz); } const [c, r] = G.toTile(e.g.position.x, e.g.position.z); return { nudges: G.nudgeN || 0, free: G.tileAt(c, r).t < 2, ok: (G.nudgeN || 0) >= 1 }; }""",
}
srv, url = serve(); errs, out, fail = [], {}, False
with sync_playwright() as pw:
    for name, js in TESTS.items():
        b, pg = page(pw, url, errs, []); S(pg, "()=>G.choose('warrior')"); S(pg, PRE); r = S(pg, js); b.close(); out[name] = r; print('==', name, json.dumps(r, ensure_ascii=False), flush=True); fail |= not r.get('ok')
print('errors', errs[:3]); print('FAIL' if fail or errs else 'ALL OK'); sys.exit(1 if fail or errs else 0)
