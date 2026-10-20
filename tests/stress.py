#!/usr/bin/env python3
"""스트레스 테스트: N마리(기본 100/200/300) 동시 존재 시 로직 스텝 시간, 경로 재계산 시간, 렌더 FPS (headless swiftshader = CPU 렌더링이라 실제 GPU보다 훨씬 느림)
  python3 tests/stress.py [100,200,300] [--gfx perf|high]   (--gfx: 그래픽 품질 강제, 결과는 tests/stress_last.json / stress_last_<gfx>.json)"""
import json, sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import regress
from regress import serve, page, S
GFX = sys.argv[sys.argv.index('--gfx') + 1] if '--gfx' in sys.argv else None
if GFX: regress.Q += '&gfx=' + GFX; sys.argv = [a for a in sys.argv if a not in ('--gfx', GFX)]
from playwright.sync_api import sync_playwright
NS = [int(x) for x in (sys.argv[1] if len(sys.argv) > 1 else '100,200,300').split(',')]
SETUP = r"""(N)=>{ G.hero.g.position.set(-40, 0, -40); G.hero.dead = 1e9; G.coreHp = G.coreMax = 1e9; G.gold = 99999; const used = [];
  for (const [type, i] of [['arrow', 4], ['cannon', 7], ['magic', 10], ['arrow', 13], ['cannon', 16], ['magic', 19]]) { const s = T_.grassNearRoute(i, 2, used); if (!s) continue; used.push(s.join(',')); G.build(s[0], s[1], type); }
  G.phase = 'wave'; G.spawnQ = []; const types = ['grunt', 'imp', 'golem', 'bat', 'digger', 'charger', 'shield', 'bomber', 'siege'];
  for (let i = 0; i < N; i++) { const e = G.spawnEnemy(types[i % types.length], 40); const [x, z] = G.tileXZ(1 + (i % 8), 2 + ((i >> 3) % 12)); const t = G.tileAt(1 + (i % 8), 2 + ((i >> 3) % 12));
    if (t.t === 0 || t.t === 1) { e.g.position.set(x, 0, z); e.tile = [1 + (i % 8), 2 + ((i >> 3) % 12)]; } e.state = 'walk'; }
  return G.enemies.length; }"""
MEASURE = r"""(N)=>{ const ps = G.pathStats, c0 = ps.calls, m0 = ps.ms; ps.max = 0; const steps = []; G.prof = {};
  for (let i = 0; i < 200; i++) { const t0 = performance.now(); G.sim(.05); steps.push(performance.now() - t0); }
  steps.sort((a, b) => a - b); const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
  return { alive_end: G.enemies.filter(e => !e.dead).length, step_ms_avg: +avg.toFixed(2), step_ms_p95: +steps[Math.floor(steps.length * .95)].toFixed(2), step_ms_max: +steps[steps.length - 1].toFixed(2),
    path_calls: ps.calls - c0, path_ms_total: +(ps.ms - m0).toFixed(2), path_ms_per_call: +((ps.ms - m0) / Math.max(1, ps.calls - c0)).toFixed(3), path_ms_max: +ps.max.toFixed(3), path_by_key: { ...ps.byKey }, per_step_ms: Object.fromEntries(Object.entries(G.prof).map(([k, v]) => [k, +(v / 200).toFixed(2)])) }; }"""
FPS = r"""async (sec)=>{ G.manual = false; let n = 0; const t0 = performance.now(); await new Promise(res => { const f = () => { n++; if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  G.manual = true; return +(n / ((performance.now() - t0) / 1000)).toFixed(1); }"""
srv, url = serve(); out, errs = {}, []
with sync_playwright() as pw:
    for N in NS:
        b, pg = page(pw, url, errs, []); S(pg, "()=>G.choose('warrior')"); n = pg.evaluate(SETUP, N); pg.evaluate('()=>G.sim(1)')
        r = pg.evaluate(MEASURE, N); r['spawned'] = n; r['draw_calls'] = pg.evaluate('()=>{ const I = G.renderer.info; I.autoReset = false; return new Promise(res => requestAnimationFrame(() => { I.reset(); requestAnimationFrame(() => { const r = [I.render.calls, I.render.triangles]; I.autoReset = true; res(r); }); })) }'); r['shadow_casters'] = pg.evaluate('()=>{ let n = 0; G.scene.traverse(o => { if (o.isMesh && o.visible && o.castShadow) n++; }); return n; }')
        r['outline_meshes_visible'] = pg.evaluate('()=>{ let n = 0; for (const e of G.enemies) e.g.traverse(o => { if (o.userData.ol && o.visible) n++; }); return n; }')
        r['enemy_materials'] = pg.evaluate('()=>{ const s = new Set(); for (const e of G.enemies) e.g.traverse(o => { if (o.isMesh && !o.userData.ol) s.add(o.material.uuid); }); return s.size; }')
        r['pixel_ratio'] = pg.evaluate('()=>G.renderer.getPixelRatio()'); r['perf_mode'] = pg.evaluate('()=>!!(G.Q && G.Q.perf)')
        r['fps_swiftshader'] = pg.evaluate(FPS, 6); out[N] = r; print(N, json.dumps(r, ensure_ascii=False), flush=True); b.close()
    # 기준: 적 0마리 렌더 FPS
    b, pg = page(pw, url, errs, []); S(pg, "()=>G.choose('warrior')"); out['fps_empty'] = pg.evaluate(FPS, 6); b.close()
print('fps_empty', out['fps_empty'], 'errors', errs[:3]); json.dump(out, open(os.path.join(os.path.dirname(__file__), f'stress_last{"_" + GFX if GFX else ""}.json'), 'w'), indent=1)
