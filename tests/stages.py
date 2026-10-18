#!/usr/bin/env python3
"""챕터/스테이지 브라우저 테스트 (+ 스크린샷).  python3 tests/stages.py [--shots]"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP, Q
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
# 빙판: 같은 인공 지형(전부 파인 길 vs 전부 풀밭)에서 2초 이동 거리 비교
ICE = r"""(kind)=>{ G.hero.g.position.set(-40,0,-40); G.hero.dead=1e9; for (const t of G.towers) t.cd=1e9;
 for (let c=0;c<G.GW;c++) for (let r=0;r<G.GH;r++){ const t=G.tileAt(c,r); if (t.t>=0&&t.t<=5&&!t.tower){ t.t= kind==='ice'?1:0; t.hp=t.max=0; G.refreshTile(t);} }
 G.computeDist(); const e=G.spawnEnemy('grunt',1); let k=0; while(k<60 && e.state==='spawn'){ G.sim(.05,.05); k++; } const x0=e.g.position.x, z0=e.g.position.z; G.sim(2,.05); const d=Math.hypot(e.g.position.x-x0,e.g.position.z-z0); G.hurt(e,1e9,'#fff',false); G.sim(2); return d; }"""
def ice_ratio(pg, st):
    pg.goto(url + Q + '&stage=' + st); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); J(pg, "()=>G.choose('warrior')"); pg.wait_for_timeout(300)
    return pg.evaluate(ICE, 'ice') / pg.evaluate(ICE, 'grass')
def ingame_shot(pg, path):
    J(pg, "()=>{ G.startWave(); G.manual=true; G.sim(14); G.manual=false; G.cam.r=50; }"); pg.wait_for_timeout(600)
    J(pg, "()=>G.pauseRender=false"); pg.wait_for_timeout(1500); pg.screenshot(path=path)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=20000); pg.wait_for_timeout(800)
    # 출정의 문으로 걸어가면 원정 지도
    J(pg, "()=>{ G.townTeleport(0, -12); G.townGoal(0, -16.2); }"); pg.wait_for_function("()=>!document.getElementById('stagePanel').classList.contains('hidden')", timeout=15000); ok('portal_opens_stage_map', True)
    ok('nodes_locked_state', pg.locator('.snode').count() == 6 and pg.locator('.snode.locked').count() == 5 and pg.locator('.snode.cur').count() == 1)
    pg.click('.chtab[data-c="2"]'); ok('ch2_locked', pg.locator('.lockVeil').count() == 1); pg.click('.chtab[data-c="3"]'); ok('ch3_soon', '준비 중' in pg.inner_text('#stMap'))
    pg.click('.chtab[data-c="1"]')
    if SHOTS:
        J(pg, "()=>{ const {Acc}=G.gear; Acc.update(d=>{ d.st={'1-1':3,'1-2':2,'1-3':1}; return d; }); G.stageSel.openStageSel(); }"); pg.click('.snode[data-id="1-4"]'); J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(1200); pg.screenshot(path='stage_select.png'); J(pg, "()=>{ G.pauseRender=false; G.gear.Acc.update(d=>{ d.st={}; return d; }); G.stageSel.openStageSel(); }")
    pg.click('.snode[data-id="1-1"]'); pg.click('#stGo')
    pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=90000); pg.wait_for_timeout(500)
    ok('stage_loaded', J(pg, "()=>[G.stage.id, G.CORE.join(','), G.SPAWN.join(',')]") == ['1-1', '22,7', '0,8'])
    ok('soft_dirt', J(pg, "()=>G.BLK[2].hp") == 105)
    # 마지막 웨이브까지 빠르게: 웨이브 9로 설정 후 10웨이브 시작, 적 모두 처치
    J(pg, "()=>{ G.manual=true; G.wave=9; G.startWave(); G.spawnQ=[]; }")
    for _ in range(40):
        done = J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9, '#fff', false); G.sim(1); return G.phase; }")
        if done != 'wave': break
    ok('stage_clear_overlay', not hidden(pg, 'stageClear') and '스테이지 클리어' in pg.inner_text('#stageClear'), done)
    s = J(pg, "()=>G.gear.Acc.load()"); ok('stars_saved', s['st'].get('1-1') == 3 and any(x.get('c') == 1 for x in s['inv']) and s['bestWave'] == 0, (s['st'], s['bestWave']))
    pg.click('#scTown'); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=90000)
    ok('url_clean', 'stage=' not in pg.url)
    for _ in range(8):
        pg.wait_for_timeout(1500)
        if hidden(pg, 'chestOv'): break
        pg.click('.cvStage', force=True)
    pg.wait_for_function("()=>!document.getElementById('townPop').classList.contains('hidden')", timeout=15000)
    ok('clear_popup', '클리어' in pg.inner_text('#townPop')); pg.click('#popOk')
    pg.click('#twGo'); pg.wait_for_timeout(300); ok('next_unlocked', pg.locator('.snode.locked').count() == 4 and pg.locator('.snode.cur[data-id="1-2"]').count() == 1)
    # 2스테이지: 포털 2개 (1-3), 설원(2-1) 스크린샷
    if SHOTS:
        J(pg, "()=>G.gear.Acc.update(d=>{ for (const id of ['1-1','1-2','1-3','1-4','1-5','1-6']) d.st[id]=3; return d; })")
        pg.goto(url + '?seed=12345&flow=1&stage=1-4&run=1'); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=90000); ok('two_portals', J(pg, "()=>G.SPAWNS.length") == 2)
        ingame_shot(pg, 'chapter1.png')
        pg.goto(url + '?seed=12345&flow=1&stage=2-2&run=1'); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=90000)
        ingame_shot(pg, 'chapter2.png')
    r2, r1 = ice_ratio(pg, '2-1'), ice_ratio(pg, '1-1'); ok('ice_faster_ch2', r2 > 1.12 and abs(r1 - 1) < .05, (round(r2, 3), round(r1, 3)))
    print('errors', errs); ok('no_console_errors', not errs)
    print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
