#!/usr/bin/env python3
"""Q-13 다음 웨이브 자동 시작 (설정, 기본 off).  python3 tests/autowave.py
 - 기본 off: 웨이브가 끝나도 건설 단계 그대로 · 설정 칸 2개(#stAutoWave 메뉴 ↔ #sndAutoWave 전투) 같은 값 · localStorage hd3d_autoWave
 - 켜면: 건설 15초(G.t) 뒤 자동 시작 · #startWave 에 남은 초(data-auto) · 첫 웨이브는 자동 아님 · 콘솔 오류 0"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
CLEAR = "()=>{ G.spawnQ.length=0; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9); G.sim(4); return [G.phase, G.wave]; }"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': 1280, 'height': 760}).new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP)
    J(pg, "()=>G.choose('warrior')"); J(pg, "()=>G.sim(.3)")
    st = J(pg, "()=>['stAutoWave','sndAutoWave'].map(id=>{ const e=document.getElementById(id); return e ? e.checked : null; })")
    ok('settings_rows_default_off', st == [False, False], st)
    J(pg, "()=>G.sim(20)"); ok('first_wave_not_auto', J(pg, "()=>[G.phase, G.wave]") == ['build', 0])
    J(pg, "()=>G.startWave()"); r = J(pg, CLEAR); ok('wave1_cleared', r == ['build', 1], r)
    J(pg, "()=>G.sim(20)"); ok('off_stays_build', J(pg, "()=>[G.phase, G.wave, document.getElementById('startWave').dataset.auto||'']") == ['build', 1, ''])
    J(pg, "()=>{ const e=document.getElementById('sndAutoWave'); e.checked=true; e.dispatchEvent(new Event('change')); }")
    ok('toggle_synced_saved', J(pg, "()=>[document.getElementById('stAutoWave').checked, localStorage.getItem('hd3d_autoWave')]") == [True, '1'])
    J(pg, "()=>G.sim(1)"); a = J(pg, "()=>[G.phase, +(document.getElementById('startWave').dataset.auto||0), getComputedStyle(document.getElementById('startWave'),'::after').content]")
    ok('countdown_shown', a[0] == 'build' and 13 <= a[1] <= 15 and '초' in a[2], a)
    J(pg, "()=>G.sim(13)"); ok('not_yet', J(pg, "()=>G.phase") == 'build')
    J(pg, "()=>G.sim(2)"); r = J(pg, "()=>[G.phase, G.wave, document.getElementById('startWave').dataset.auto||'']"); ok('auto_started', r == ['wave', 2, ''], r)
    r = J(pg, CLEAR); J(pg, "()=>{ const e=document.getElementById('stAutoWave'); e.checked=false; e.dispatchEvent(new Event('change')); }"); J(pg, "()=>G.sim(20)")
    ok('off_again', J(pg, "()=>[G.phase, G.wave, localStorage.getItem('hd3d_autoWave'), document.getElementById('sndAutoWave').checked]") == ['build', 2, '0', False])
    b.close()
ok('no_console_errors', not errs, errs[:3])
print('ALL OK' if all(res.values()) else 'FAILED', len(res)); sys.exit(0 if all(res.values()) else 1)
