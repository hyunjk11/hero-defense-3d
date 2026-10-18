#!/usr/bin/env python3
"""강화 버튼 '한 번 클릭 = 정확히 1레벨' 검사 (HUD 영웅 강화 + 여신의 축복).
   마우스를 누른 채 HUD/마을 UI가 다시 그려져도 클릭이 씹히지 않아야 함.  python3 tests/clicks.py"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, Q, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
def slow_click(pg, sel, between):
    # 버튼 안쪽 글자(span) 위를 누르고, 누른 동안 UI 갱신을 일으킨 뒤 뗌
    bb = pg.locator(sel + ' .row span').first.bounding_box(); x, y = bb['x'] + 6, bb['y'] + bb['height'] / 2
    # Firefox/Safari는 누른 요소가 DOM에서 교체되면 click을 버림 → 누른 동안 포인터 아래 요소가 그대로 붙어 있는지도 검사
    pg.mouse.move(x, y); pg.evaluate(f"()=>{{ window.__pt = document.elementFromPoint({x},{y}); }}"); pg.mouse.down(); between()
    same = pg.evaluate(f"()=>window.__pt.isConnected && document.elementFromPoint({x},{y}) === window.__pt"); pg.mouse.up(); return same
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1280, 'height': 760})
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + Q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); pg.evaluate("()=>G.choose('mage')"); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ G.gold = 99999; }"); pg.wait_for_timeout(400)
    for k in ['atk', 'spd', 'rng']:
        lv0 = pg.evaluate(f"()=>G.ups.{k}"); same = slow_click(pg, f'.up[data-up="{k}"]', lambda: (pg.evaluate('()=>G.sim(.5)'), pg.wait_for_timeout(200))); pg.wait_for_timeout(300)
        ok(f'hud_up_{k}_one_click', same and pg.evaluate(f"()=>G.ups.{k}") == lv0 + 1, (same,) + (lv0, pg.evaluate(f"()=>G.ups.{k}")))
    b.close()
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 760}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); pg.wait_for_timeout(500)
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
    pg.evaluate("()=>{ G.gear.Acc.update(d=>({ ...d, souls: 5000 })); G.openBlessing(); }"); pg.wait_for_timeout(300)
    lv = lambda: pg.evaluate("()=>{ const s=G.gear.Acc.load(); return s.heroLv[s.hero]; }")
    for k in ['hp', 'atk', 'hp']:
        l0 = lv()[k]; same = slow_click(pg, f'#twPerm .perm[data-k="{k}"]', lambda: (pg.evaluate("()=>{ for (let i=0;i<3;i++) G.gear.Acc.update(d=>d); }"), pg.wait_for_timeout(250))); pg.wait_for_timeout(300)
        ok(f'bless_{k}_one_click', same and lv()[k] == l0 + 1, (same, l0, lv()[k]))
    print('errors', errs); ok('no_console_errors', not errs)
    print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
