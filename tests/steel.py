#!/usr/bin/env python3
"""강철 사용처 (2026-10-24) 브라우저 테스트: 대장간 ⚖ 교환 · 🎲 옵션 재설정 · 연구소 🧱 바리케이드 보강 → 판 안 바리케이드 체력.
python3 tests/steel.py [--shots]  (--shots: /workspace/report_shots/steel_*.png)"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = '/workspace/report_shots'; srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
L = lambda pg: J(pg, "()=>G.gear.Acc.load()")
def shot(pg, name):
    if not SHOTS: return
    os.makedirs(OUT, exist_ok=True); pg.mouse.move(5, 5); J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{name}.png')
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=7; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.hero='mage'; d.souls=100; d.mat={steel:1000,crystal:5}; d.stats={runs:1,kills:1,waves:1,souls:1}; delete d.xch; delete d.barLv;
        d.inv=[{...E.makeItem('armor','mage',4,r,2), id:'rr1'}, {...E.makeItem('acc','mage',0,r), id:'cm1'}, {...E.makeItem('weapon','mage',2,r), id:'rr2'}]; return d; }); }""")
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=20000); pg.wait_for_timeout(1200)
    # ---- ⚖ 교환 ----
    J(pg, "()=>G.gear.openSmith()"); pg.wait_for_timeout(300); pg.click('#smTabs .ftab[data-t="xch"]'); pg.wait_for_timeout(200)
    ok('xch_tab', pg.locator('#smBody .xchBox').count() == 1 and pg.inner_text('#xchLeftN') == '15' and '한국 시간 0시' in pg.inner_text('#smBody'))
    pg.click('#smBody .xchGo[data-n="1"]'); pg.wait_for_timeout(200); s = L(pg)
    ok('xch_one', s['souls'] == 130 and s['mat']['steel'] == 990 and s['xch']['n'] == 1 and pg.inner_text('#xchLeftN') == '14' and '영혼석 +30' in pg.inner_text('#xchMsg'), (s['souls'], s['mat']['steel'], s.get('xch')))
    ok('xch_smmats_updated', '990' in pg.inner_text('#smMats') and '130' in pg.inner_text('#smMats'))
    pg.click('#smBody .xchGo[data-n="5"]'); pg.wait_for_timeout(200); shot(pg, 'steel_exchange')
    mx = pg.locator('#smBody .xchGo').nth(2); ok('xch_max_label', '최대 9회' in mx.inner_text(), mx.inner_text())
    mx.click(); pg.wait_for_timeout(200); s = L(pg)
    ok('xch_cap_reached', s['souls'] == 100 + 15 * 30 and s['mat']['steel'] == 1000 - 150 and pg.inner_text('#xchLeftN') == '0' and pg.locator('#smBody .xchGo:not([disabled])').count() == 0, (s['souls'], s['mat']['steel']))
    J(pg, "()=>{ document.querySelector('#smBody .xchGo').disabled=false; document.querySelector('#smBody .xchGo').click(); }"); pg.wait_for_timeout(200)
    ok('xch_cap_enforced_logic', L(pg)['souls'] == 550)
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.xch={d:'2026-01-01', n:15}; return d; }); G.gear.closeSmith(true); G.gear.openSmith(); }"); pg.wait_for_timeout(200)
    ok('xch_new_day_resets', pg.inner_text('#xchLeftN') == '15')
    # ---- 🎲 옵션 재설정 ----
    pg.click('#smTabs .ftab[data-t="rr"]'); pg.wait_for_timeout(200)
    ids = J(pg, "()=>[...document.querySelectorAll('#smBody .smList .itile')].map(b=>b.dataset.id)")
    ok('rr_list_excludes_common', 'rr1' in ids and 'rr2' in ids and 'cm1' not in ids, ids)
    pg.click('#smBody .smList .itile[data-id="rr1"]'); pg.wait_for_timeout(150); s0 = L(pg); sub0 = [x for x in s0['inv'] if x['id'] == 'rr1'][0]['sub']
    ok('rr_cost_shown', '강철 90' in pg.inner_text('#smBody .smMain'))
    pg.click('#rrGo'); pg.wait_for_timeout(250); s1 = L(pg); cand = J(pg, "()=>[...document.querySelectorAll('.rrCol.new .rrLine')].length")
    ok('rr_paid_not_applied', s1['mat']['steel'] == s0['mat']['steel'] - 90 and s1['souls'] == s0['souls'] and [x for x in s1['inv'] if x['id'] == 'rr1'][0]['sub'] == sub0 and cand == 2, (s1['mat']['steel'], cand))
    shot(pg, 'steel_reroll')
    pg.click('#rrApply'); pg.wait_for_timeout(200); s2 = L(pg); sub2 = [x for x in s2['inv'] if x['id'] == 'rr1'][0]['sub']
    ok('rr_applied', len(sub2) == 2 and J(pg, f"()=>G.gear.E.validSubs(G.gear.Acc.load().inv.find(x=>x.id==='rr1'), {sub2})") and pg.locator('#rrGo').count() == 1, sub2)
    pg.click('#rrGo'); pg.wait_for_timeout(200); pg.click('#rrKeep'); pg.wait_for_timeout(200); s3 = L(pg)
    ok('rr_keep', [x for x in s3['inv'] if x['id'] == 'rr1'][0]['sub'] == sub2 and s3['mat']['steel'] == s2['mat']['steel'] - 90)
    J(pg, "()=>G.gear.closeSmith(true)")
    # ---- 🧱 바리케이드 보강 ----
    J(pg, "()=>G.openLab()"); pg.wait_for_timeout(300); st0 = L(pg)['mat']['steel']
    ok('bar_row', not hidden(pg, 'labPanel') and '바리케이드 보강' in pg.inner_text('#labBar') and 'Lv.0/10' in pg.inner_text('#labBar') and '강철 40' in pg.inner_text('#labBarBtn'))
    pg.click('#labBarBtn'); pg.wait_for_timeout(150); pg.click('#labBarBtn'); pg.wait_for_timeout(250); s = L(pg)
    ok('bar_bought', s.get('barLv') == 2 and s['mat']['steel'] == st0 - 100 and 'Lv.2/10' in pg.inner_text('#labBar') and '+10%' in pg.inner_text('#labBar'), (s.get('barLv'), s['mat']['steel']))
    shot(pg, 'steel_barricade_lab')
    J(pg, "()=>document.getElementById('labClose').click()"); pg.wait_for_timeout(200)
    # ---- 판 안: 바리케이드 체력 ×1.1 ----
    pg.click('#twGo'); pg.click('.chtab[data-c="0"]'); pg.click('#stChalGo'); pg.wait_for_function("()=>G.phase==='build'", timeout=20000)
    r = J(pg, "()=>{ G.gold=9999; const [bc, br]=G.route[3]; const okB=G.build(bc, br, 'barricade'); const t=G.tileAt(bc, br); return [G.barRes, okB, t.bar ? t.bar.max : 0, G.advBar||1, G.ups.bar] }")
    ok('bar_hp_in_run', abs(r[0] - 1.1) < 1e-9 and r[2] and abs(r[2] - 320 * 1.1 * r[3] * (1 + .25 * r[4])) < 1e-6, r)
    J(pg, "()=>{ G.phase='build'; document.getElementById('retreat').click(); document.getElementById('gcOk').click(); }"); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=60000)
    before = J(pg, "()=>JSON.stringify(G.gear.P.clean(G.gear.Acc.load()))"); pg.reload(); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=60000)
    ok('save_roundtrip', J(pg, "()=>JSON.stringify(G.gear.P.clean(G.gear.Acc.load()))") == before and J(pg, "()=>G.gear.Acc.load().barLv") == 2)
    print('errors', errs); ok('no_console_errors', not errs)
    print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
