#!/usr/bin/env python3
"""Q-6 결과 화면 버튼 (2026-10-23): 클리어 [재도전][다음][마을] · 패배 [재도전] — 실제 클릭으로 다음/같은 스테이지가 열리는지.
  python3 tests/q6.py [--shots]   (--shots: shots/improve/q6_*.png, 1024x600 터치)"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; srv, url = serve(); errs, res = [], {}
OUT = pathlib.Path(__file__).resolve().parent.parent / 'shots' / 'improve'
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
LOADED = "()=>window.G&&G.ready&&G.stage&&G.phase==='build'"
def clear(pg):
    J(pg, "()=>{ G.manual=true; G.wave=G.stage.waves-1; G.startWave(); G.spawnQ=[]; }")
    for _ in range(40):
        if J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9, '#fff', false); G.sim(1); return G.phase; }") != 'wave': break
    pg.wait_for_timeout(1200)
def box48(pg, sel): r = J(pg, f"()=>{{ const e=document.querySelector('{sel}'); return e ? [e.offsetWidth, e.offsetHeight] : null }}"); return r and r[0] >= 47.5 and r[1] >= 47.5, r
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True, is_mobile=False); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(500, 300); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000)
    pg.goto(url + '?seed=12345&flow=1&stage=1-1&run=1'); pg.wait_for_function(LOADED, timeout=120000); pg.wait_for_timeout(500)
    clear(pg)
    ok('clear_shown', not hidden(pg, 'stageClear'))
    ok('clear_buttons', all(pg.locator(s).count() == 1 for s in ('#scRetry', '#scNext', '#scTown')), pg.inner_text('.scBtns') if pg.locator('.scBtns').count() else '')
    ok('next_title_1_2', '1-2' in (pg.get_attribute('#scNext', 'title') or ''), pg.get_attribute('#scNext', 'title'))
    for s in ('#scRetry', '#scNext', '#scTown'): ok(f'touch48 {s}', *box48(pg, s))
    ok('clear_buttons_in_view', J(pg, "()=>[...document.querySelectorAll('.scBtns button')].every(e=>{ const r=e.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth })"))
    if SHOTS: OUT.mkdir(parents=True, exist_ok=True); J(pg, "()=>G.pauseRender=true"); pg.screenshot(path=str(OUT / 'q6_clear_1024x600.png')); J(pg, "()=>G.pauseRender=false")
    pg.click('#scNext'); pg.wait_for_url('**stage=1-2**', timeout=30000); pg.wait_for_function(LOADED, timeout=120000)
    ok('next_goes_1_2', J(pg, "()=>G.stage.id") == '1-2' and 'run=1' in pg.url, pg.url)
    # 패배 → 재도전 = 같은 스테이지
    J(pg, "async ()=>{ const m=await import('./src/core/waves.js'); m.gameOver(); }"); pg.wait_for_function("()=>!document.getElementById('over').classList.contains('hidden')", timeout=30000); pg.wait_for_timeout(800)
    ok('over_retry_label', '재도전' in pg.inner_text('#overRetry'), pg.inner_text('#overRetry'))
    ok('touch48 #overRetry', *box48(pg, '#overRetry'))
    if SHOTS: J(pg, "()=>G.pauseRender=true"); pg.screenshot(path=str(OUT / 'q6_over_1024x600.png')); J(pg, "()=>G.pauseRender=false")
    pg.evaluate("()=>{ window.__mark = 1 }"); pg.click('#overRetry'); pg.wait_for_function("()=>!window.__mark", timeout=30000); pg.wait_for_function(LOADED, timeout=120000)
    ok('over_retry_same_stage', J(pg, "()=>G.stage.id") == '1-2', pg.url)
    # 클리어 → 재도전 = 같은 스테이지, 마지막 해금 칸이면 다음 버튼 없음
    clear(pg); ok('next_after_1_2', pg.locator('#scNext').count() == 1 and '1-3' in (pg.get_attribute('#scNext', 'title') or ''))
    J(pg, "()=>{ window.__mark = 1 }"); pg.click('#scRetry'); pg.wait_for_function("()=>!window.__mark", timeout=30000); pg.wait_for_function(LOADED, timeout=120000)
    ok('clear_retry_same_stage', J(pg, "()=>G.stage.id") == '1-2', pg.url)
    s = J(pg, "()=>G.gear.Acc.load()"); ok('saved_before_nav', (s['st'] or {}).get('1-1', 0) > 0 and (s['st'] or {}).get('1-2', 0) > 0, s.get('st'))
    print('errors', errs); ok('no_console_errors', not errs)
    b.close()
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
