#!/usr/bin/env python3
"""U-9a/Q-15 마을 시설 바로가기 레일 + Q-4a 가방 배지 + U-5 .ui-x + U-7a 키 배지 (2026-10-23).
  python3 tests/rail.py [--shots]   (1024x600 터치 · 1440x860 마우스, --shots: shots/improve/u9_rail_*.png)"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; srv, url = serve(); errs, res = [], {}
OUT = pathlib.Path(__file__).resolve().parent.parent / 'shots' / 'improve'
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
vis = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none' }}")
PANELS = {'smith': 'smithPanel', 'lab': 'labPanel', 'shop': 'shopPanel', 'dungeon': 'dgPanel', 'bless': 'twBless'}
BIG = ['smithPanel', 'labPanel', 'shopPanel', 'dgPanel', 'twBless', 'invPanel', 'statPanel', 'stagePanel', 'mailPanel']
def town(b, vw, vh, touch):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=touch); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(1500)
    return c, pg
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for vw, vh, touch in ((1024, 600, True), (1440, 860, False)):
        tag = f'{vw}x{vh}'; c, pg = town(b, vw, vh, touch)
        ok(f'{tag} rail_visible', vis(pg, 'twRail') and pg.locator('#twRail .railBtn:not(.hidden)').count() == 5)
        r = J(pg, """()=>{ const R=e=>e.getBoundingClientRect(), rail=R(document.getElementById('twRail')), hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
          const others=['.twTop','.twBottom','.twLeft'].map(s=>document.querySelector(s)).filter(Boolean).map(R);
          return { inView: rail.top>=0&&rail.bottom<=innerHeight&&rail.right<=innerWidth, overlaps: others.filter(o=>hit(rail,o)).length,
                   sizes: [...document.querySelectorAll('#twRail .railBtn')].map(e=>[e.offsetWidth,e.offsetHeight]) } }""")
        ok(f'{tag} rail_in_view_no_overlap', r['inView'] and r['overlaps'] == 0, r)
        if touch: ok(f'{tag} rail_touch48', all(w >= 47.5 and h >= 47.5 for w, h in r['sizes']), r['sizes'])
        if SHOTS and touch: OUT.mkdir(parents=True, exist_ok=True); J(pg, "()=>G.pauseRender=true"); pg.screenshot(path=str(OUT / f'u9_rail_{tag}.png')); J(pg, "()=>G.pauseRender=false")
        for k, pid in PANELS.items():
            pg.click(f'#twRail .railBtn[data-go="{k}"]'); pg.wait_for_timeout(500)
            others = [p for p in BIG if p != pid and vis(pg, p)]
            ok(f'{tag} rail_{k}_opens', vis(pg, pid) and not others, others)
        # 열린 패널의 .ui-x 닫기 버튼 = 오른쪽 위 · 터치 48 (panelIn 애니메이션 뒤 측정)
        pg.click('#twRail .railBtn[data-go="smith"]'); pg.wait_for_timeout(700)
        x = J(pg, "()=>{ const e=document.querySelector('#smithPanel .ui-x'), p=document.getElementById('smithPanel').getBoundingClientRect(), r=e.getBoundingClientRect(); return [e.offsetWidth, e.offsetHeight, Math.round(p.right-r.right), Math.round(r.top-p.top)] }")
        ok(f'{tag} ui_x_corner', x[0] >= (47.5 if touch else 43.5) and x[1] >= (47.5 if touch else 43.5) and 0 <= x[2] <= 16 and 0 <= x[3] <= 16, x)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300); ok(f'{tag} esc_closes_rail_panel', not vis(pg, 'smithPanel'))
        if tag == '1024x600':
            # Q-4a: 🎒 가방 배지 = codexClaimable(현재 저장) 과 같음
            q = J(pg, "async ()=>{ const m=await import('./src/ui/gear.js'); return [m.codexClaimable(G.gear.Acc.load()), document.getElementById('twBag').classList.contains('hasNew')] }")
            ok(f'{tag} q4_bag_badge_matches_codex', q[0] == q[1], q)
        c.close()
    # U-7a 전투 HUD 키 배지 C·P·F
    c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345'); pg.wait_for_function("()=>window.G&&G.ready", timeout=120000)
    k = J(pg, "()=>['statBtn','pauseBtn','speedBtn'].map(id=>getComputedStyle(document.getElementById(id),'::after').content)")
    ok('u7_key_badges', k == ['"C"', '"P"', '"F"'], k)
    c.close(); b.close()
ok('no_page_errors', not [e for e in errs if e.startswith('PE')], errs[:3])
print('FAILED:', [k for k, v in res.items() if not v] or 'none'); sys.exit(0 if all(res.values()) else 1)
