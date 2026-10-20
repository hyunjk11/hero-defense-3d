#!/usr/bin/env python3
"""그래픽 품질 모드(자동/고품질/성능) 테스트 + 비교 스크린샷 shots/improve/p1_*.png.  python3 tests/gfx.py
 - ?gfx=high / ?gfx=perf 강제: 외곽선·그림자·픽셀 비율·그림자 맵 크기
 - 종류별 공유 몸 머티리얼 + 피격 플래시(맞은 개체만 하얗게, 같은 종류 다른 개체는 그대로), 제거 시 공유 머티리얼 dispose 안 함
 - 설정 토글(localStorage hd3d_gfx) 즉시 반영 · 터치 기기 자동=성능 · FPS 자동 전환(?gfxauto)"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
SCENE = r"""()=>{ G.hero.g.position.set(2, 0, 8); G.gold = 9999; const used = [];
  for (const [type, i] of [['arrow', 4], ['cannon', 8], ['magic', 12]]) { const s = T_.grassNearRoute(i, 2, used); if (!s) continue; used.push(s.join(',')); G.build(s[0], s[1], type); }
  G.phase = 'wave'; G.spawnQ = []; const types = ['grunt', 'imp', 'golem', 'shield', 'charger', 'bomber', 'siege', 'digger', 'boss'];
  const R = G.route; for (let i = 0; i < 18; i++) { const [c, r] = R[Math.min(R.length - 2, 2 + i * 2)], [x, z] = G.tileXZ(c, r); const e = T_.enemyAt(types[i % types.length], x, z); e.state = 'walk'; e.hp = e.max = 1e9; }
  G.sim(.6); return G.enemies.length; }"""
INFO = r"""()=>{ let cs = 0, ol = 0, olAll = 0; G.scene.traverse(o => { if (o.isMesh && o.visible && o.castShadow) cs++; });
  for (const e of G.enemies) e.g.traverse(o => { if (o.userData.ol) { olAll++; if (o.visible) ol++; } });
  return { perf: G.Q.perf, mode: G.Q.mode, why: G.Q.why, pr: G.renderer.getPixelRatio(), shadow: G.scene.children.filter(o => o.isDirectionalLight && o.castShadow).map(l => l.shadow.mapSize.x)[0], casters: cs, ol, olAll }; }"""
CALLS = '()=>{ const I = G.renderer.info; I.autoReset = false; return new Promise(res => requestAnimationFrame(() => { I.reset(); requestAnimationFrame(() => { const r = [I.render.calls, I.render.triangles]; I.autoReset = true; res(r); }); })) }'
def page(pw, q, vp=(1280, 760), touch=False, dpr=1):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=dpr, has_touch=touch, is_mobile=touch); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1' + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); return b, pg
M = {}
with sync_playwright() as pw:
    for mode in ['high', 'perf']:
        b, pg = page(pw, '&gfx=' + mode, dpr=2); pg.evaluate("()=>G.choose('mage')"); pg.evaluate(SCENE)
        info = pg.evaluate(INFO); info['calls_tris'] = pg.evaluate(CALLS); M[mode] = info; print(mode, json.dumps(info), flush=True)
        pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/p1_{mode}.png')
        pg.evaluate("()=>{ const e = G.enemies[4]; G.cam.target.set(e.g.position.x, 0, e.g.position.z); G.cam.r = 26; G.sim(.05); }"); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/p1_{mode}_close.png')
        if mode == 'high':
            ok('high_full_outlines_shadows', not info['perf'] and info['ol'] == info['olAll'] and info['pr'] == 1.75 and info['shadow'] == 2048, info)
            r = pg.evaluate("""()=>{ const g = G.enemies.filter(e => e.type === 'grunt'); const a = g[0], b = g[1]; const bm = m => m.m.shMeshes.map(x => x.material.uuid).join();
              const shared = bm(a) === bm(b); G.hurt(a, 1, '#fff', false); G.sim(.05); const fa = a.m.shMeshes.every(x => x.material.emissive.getHex() === 0xffffff), fb = b.m.shMeshes.some(x => x.material.emissive.getHex() === 0xffffff);
              G.sim(.6); const back = bm(a) === bm(b); return { shared, fa, fb, back, n: g.length }; }""")
            ok('shared_body_materials', r['shared'] and r['n'] >= 2, r); ok('hit_flash_only_hit_enemy', r['fa'] and not r['fb'] and r['back'], r)
            r = pg.evaluate("""()=>{ const g = G.enemies.filter(e => e.type === 'grunt'), m = g[1].m.shBase[0]; g[0].hp = 1; G.hurt(g[0], 1e12, '#fff', false); G.sim(4); const e2 = G.spawnEnemy('grunt', 1); G.sim(.05);
              return { same: e2.m.shBase[0] === m, alive: !g[1].dead, mats: e2.m.mats.length }; }""")
            ok('shared_survives_removal', r['same'] and r['alive'], r)
            pg.evaluate("()=>{ document.getElementById('sndPanel').classList.remove('hidden'); }"); pg.click('#sndPanel .gfxSeg button[data-gfx="perf"]'); pg.wait_for_timeout(200)
            t = pg.evaluate("()=>[G.Q.mode, G.Q.perf, localStorage.getItem('hd3d_gfx'), document.querySelector('#sndPanel .gfxSeg .on').dataset.gfx, document.querySelector('#sndPanel .gfxNow').textContent]")
            ok('toggle_saved', t[0] == 'perf' and t[2] == 'perf' and t[3] == 'perf', t)  # URL ?gfx 강제가 우선이라 perf 플래그 자체는 URL 이 정함
            pg.evaluate("()=>localStorage.removeItem('hd3d_gfx')"); b.close()
        else:
            ok('perf_limits', info['perf'] and info['ol'] < info['olAll'] and info['pr'] == 1.25 and info['shadow'] == 1024 and info['casters'] < M['high']['casters'], info)
            ok('perf_fewer_calls', info['calls_tris'][0] < M['high']['calls_tris'][0], (M['high']['calls_tris'], info['calls_tris']))
            ok('boss_keeps_outline', pg.evaluate("()=>G.enemies.filter(e => e.E.boss).every(e => { let v = true; e.g.traverse(o => { if (o.userData.ol && !o.visible) v = false; }); return v; })"))
            b.close()
    b, pg = page(pw, ''); pg.evaluate("()=>G.choose('mage')"); pg.evaluate(SCENE)
    a0 = pg.evaluate(INFO); pg.evaluate("()=>document.getElementById('sndPanel').classList.remove('hidden')"); pg.click('#sndPanel .gfxSeg button[data-gfx="perf"]'); pg.wait_for_timeout(300); a1 = pg.evaluate(INFO)
    ok('toggle_to_perf_live', not a0['perf'] and a1['perf'] and a1['ol'] < a1['olAll'] and a1['shadow'] == 1024, (a0, a1))
    pg.reload(); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); ok('setting_persists', pg.evaluate("()=>G.Q.mode==='perf' && G.Q.perf"))
    pg.evaluate("()=>G.Q.set('high')"); ok('toggle_to_high', pg.evaluate("()=>!G.Q.perf && localStorage.getItem('hd3d_gfx')==='high'")); pg.evaluate("()=>G.Q.set('auto')"); b.close()
    b, pg = page(pw, '&gfxauto=1'); r = pg.evaluate("()=>{ const Q = G.Q, s0 = Q.perf; for (let i = 0; i < 400; i++) Q.tick(1 / 20, true); return [s0, Q.perf, Q.why, localStorage.getItem('hd3d_gfx_auto'), Math.round(Q.fps)]; }")
    ok('auto_fps_switch', r[0] is False and r[1] is True and r[2] == 'fps' and r[3] == 'perf', r)
    pg.evaluate("()=>{ localStorage.removeItem('hd3d_gfx_auto'); localStorage.removeItem('hd3d_gfx'); }"); b.close()
    b, pg = page(pw, '&gfxauto=1'); r = pg.evaluate("()=>{ const Q = G.Q; for (let i = 0; i < 400; i++) Q.tick(1 / 50, true); for (let i = 0; i < 100; i++) Q.tick(1 / 5, false); return [Q.perf, Math.round(Q.fps)]; }")
    ok('auto_fps_stays_high', r[0] is False, r); b.close()
    b, pg = page(pw, '', vp=(1024, 600), touch=True, dpr=2); pg.evaluate("()=>G.choose('mage')"); pg.evaluate(SCENE)
    info = pg.evaluate(INFO); ok('tablet_auto_perf', info['perf'] and info['why'] == 'touch' and info['pr'] == 1.25, info); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/p1_tablet_auto.png'); b.close()
json.dump(M, open(f'{OUT}/p1_metrics.json', 'w'), indent=1)
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
