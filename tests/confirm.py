#!/usr/bin/env python3
"""Q-1 공용 확인창 · Q-2 Esc 층 스택 브라우저 테스트 (2026-10-23, docs/IMPROVE_2026-10-23.md).  python3 tests/confirm.py   (단독 실행)
 - 네이티브 confirm() 창이 한 번도 뜨지 않음 (dialog 이벤트 0)
 - 새로 시작(#mnNew): #gConfirm(위험=빨강) · Esc = 취소(저장 그대로) · 확인 → 초기화 후 마을
 - 마을: 가방 위에 확인창 → Esc 는 확인창만, 다음 Esc 가 가방 닫기 (맨 위 하나만)
 - 전투 귀환(#retreat): 📊 오버레이 위 확인창 → Esc 는 확인창만 (오버레이·건설 단계 유지) → 다음 Esc 로 오버레이 닫힘 → 확인 → 마을
 - 던전 원정 포기(#dgGiveUp): 취소 → 원정 계속 · 확인 → 마을 (분해 = equip.py q1_* · 던전 구매 = dungeon.py q1_dgshop_*)
 - 태블릿 1024×600 터치: 확인/취소 버튼 ≥ 48px, 상자가 화면 안
 스크린샷 shots/improve/confirm_{new,retreat,giveup,tablet}.png"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res, dialogs = [], {}, []
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:300], flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !e || e.classList.contains('hidden'); }}")
conf = lambda pg: not hidden(pg, 'gConfirm')
def shot(pg, name): J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{name}.png'); J(pg, "()=>G.pauseRender=false")
def boot(b, vw, vh, touch=False, q=''):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=touch); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: (dialogs.append(d.message[:80]), d.accept())); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1' + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_function("()=>G.screen==='menu'", timeout=30000); pg.wait_for_timeout(300)
    J(pg, "()=>G.gear.Acc.update(d=>({...d, souls: 777, stats:{runs:1,kills:1,waves:1,souls:1}}))")
    return c, pg

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 데스크톱 1280×800 =====
    c, pg = boot(b, 1280, 800, q='&dgtest=1')
    pg.click('#mnNew'); pg.wait_for_timeout(300)
    ok('new_confirm_shown', conf(pg) and '새로 시작' in pg.inner_text('#gConfirm') and J(pg, "()=>document.getElementById('gConfirm').classList.contains('danger')"), pg.inner_text('#gConfirm') if conf(pg) else '')
    ok('new_focus_ok', J(pg, "()=>document.activeElement && document.activeElement.id")=='gcOk')
    shot(pg, 'confirm_new')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('new_esc_cancels', not conf(pg) and J(pg, "()=>G.screen")=='menu' and J(pg, "()=>G.gear.Acc.load().souls")==777)
    pg.click('#mnNew'); pg.wait_for_timeout(300); pg.click('#gcNo'); pg.wait_for_timeout(200)
    ok('new_no_cancels', not conf(pg) and J(pg, "()=>G.screen")=='menu' and J(pg, "()=>G.gear.Acc.load().souls")==777)
    pg.click('#mnNew'); pg.wait_for_timeout(300); pg.click('#gcOk'); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(800)
    ok('new_ok_resets', not conf(pg) and J(pg, "()=>G.gear.Acc.load().souls")==0)
    # 마을: 가방 + 확인창 → Esc 한 번에 하나
    pg.click('#twBag'); pg.wait_for_timeout(300)
    J(pg, "()=>import('./src/ui/confirm.js').then(m=>{ window._cr='pend'; m.askConfirm({title:'층 테스트', body:'x'}).then(v=>window._cr=v); })"); pg.wait_for_timeout(300)
    L = J(pg, "()=>import('./src/ui/keys.js').then(m=>m.openLayers())")
    ok('layers_order', L[:2] == ['confirm', 'inv'], L)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    ok('esc1_confirm_only', not conf(pg) and not hidden(pg, 'invPanel') and J(pg, "()=>window._cr") is False)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
    ok('esc2_closes_inv', hidden(pg, 'invPanel'))
    # 전투 귀환 (1-1 출정)
    pg.goto(url + '?seed=12345&flow=1&stage=1-1&run=1'); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=240000); pg.wait_for_timeout(500)
    J(pg, "()=>{ G.manual=true; }"); pg.keyboard.press('c'); pg.wait_for_timeout(400); ok('statov_open', J(pg, "()=>G.statsUI.isOpen()"))
    pg.click('#retreat'); pg.wait_for_timeout(400)
    ok('retreat_confirm_shown', conf(pg) and '귀환' in pg.inner_text('#gConfirm') and not J(pg, "()=>document.getElementById('gConfirm').classList.contains('danger')"))
    shot(pg, 'confirm_retreat')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('retreat_esc_confirm_only', not conf(pg) and J(pg, "()=>G.statsUI.isOpen() && G.phase==='build' && G.screen!=='town'"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300); ok('esc_then_statov', not J(pg, "()=>G.statsUI.isOpen()"))
    pg.click('#retreat'); pg.wait_for_timeout(300); pg.click('#gcOk'); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=240000); pg.wait_for_timeout(500)
    ok('retreat_ok_town', J(pg, "()=>G.screen")=='town')
    # 던전 원정 포기 (게스트 = 연습 원정)
    pg.goto(url + '?seed=12345&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000); pg.wait_for_timeout(300)
    if J(pg, "()=>G.screen") != 'town':
        pg.mouse.click(640, 400); pg.wait_for_timeout(300)
        if J(pg, "()=>G.screen") == 'login': pg.click('#lgGuest'); pg.wait_for_timeout(300)
        J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(600)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden') && document.getElementById('dgStart')", timeout=30000); pg.wait_for_timeout(1500)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300); J(pg, "()=>{ G.manual=true; }")
    pg.click('#dgGiveUp'); pg.wait_for_timeout(300)
    ok('giveup_confirm_shown', conf(pg) and '원정 포기' in pg.inner_text('#gConfirm') and J(pg, "()=>document.getElementById('gcOk').classList.contains('danger')"))
    shot(pg, 'confirm_giveup')
    pg.click('#gcNo'); pg.wait_for_timeout(400); ok('giveup_no_continues', not conf(pg) and J(pg, "()=>!!G.dungeon && G.screen!=='town'"))
    pg.click('#dgGiveUp'); pg.wait_for_timeout(300); pg.click('#gcOk'); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=240000)
    ok('giveup_ok_town', J(pg, "()=>G.screen")=='town')
    c.close()
    # ===== 태블릿 1024×600 터치 =====
    c, pg = boot(b, 1024, 600, touch=True)
    pg.tap('#mnNew'); pg.wait_for_timeout(400)
    R = J(pg, "()=>{ const r=e=>{ const b=document.getElementById(e).getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }; const x=document.querySelector('#gConfirm .acBox').getBoundingClientRect(); return { ok:r('gcOk'), no:r('gcNo'), inside: x.left>=0 && x.top>=0 && x.right<=innerWidth && x.bottom<=innerHeight }; }")
    ok('tablet_btn_48', conf(pg) and min(R['ok'] + R['no']) >= 48 and R['inside'], R)
    shot(pg, 'confirm_tablet')
    pg.tap('#gcNo'); pg.wait_for_timeout(300); ok('tablet_tap_cancel', not conf(pg) and J(pg, "()=>G.screen")=='menu')
    c.close(); b.close()
ok('no_native_dialogs', not dialogs, dialogs)
print('console errors:', errs); ok('no_console_errors', not errs, errs)
srv.shutdown(); bad = [k for k, v in res.items() if not v]; print('FAILED:', bad if bad else 'none'); sys.exit(1 if bad else 0)
