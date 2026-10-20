#!/usr/bin/env python3
"""×2 배속 / 일시정지(5) 테스트.  python3 tests/speed.py
 - 배속: 같은 실제 시간에 G.t 가 약 2배 · 일시정지: G.t 정지, 키보드(Q 스킬)·화면 클릭 차단, 계속하기/P 키 해제, 판 밖에서는 해제 · 터치 대상 44px
 스크린샷 shots/improve/p5_pause.png, p5_speed.png, p5_pause_1024x600.png, p5_speed_1024x600.png"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
def page(pw, q, vp, touch=False, dpr=1):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=dpr, has_touch=touch, is_mobile=touch); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1' + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP); return b, pg
with sync_playwright() as pw:
    # 터치 크기 (태블릿 가로 1024x600)
    b, pg = page(pw, '&stage=1-2', (1024, 600), True, 2); J(pg, "()=>G.choose('mage')"); J(pg, '()=>G.sim(.3)')
    sz = J(pg, "()=>['pauseBtn','speedBtn'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })")
    ok('speed_pause_touch_44', all(w >= 44 and h >= 44 for w, h in sz), sz)
    pg.tap('#pauseBtn'); pg.wait_for_timeout(200); ok('tap_pause', J(pg, '()=>G.paused')); pg.screenshot(path=f'{OUT}/p5_pause_1024x600.png')
    pg.tap('#pauseGo'); pg.wait_for_timeout(200); ok('tap_resume', not J(pg, '()=>G.paused')); pg.tap('#speedBtn'); pg.wait_for_timeout(200); ok('tap_speed', J(pg, '()=>G.speed') == 2)
    pg.screenshot(path=f'{OUT}/p5_speed_1024x600.png'); b.close()
    # 배속 = 같은 길이(≤0.05초) 스텝을 G.speed 번 (더 큰 dt 아님) — main.js loop 소스 확인
    src = open('src/main.js', encoding='utf-8').read()
    ok('speed_is_substeps', 'const dt = Math.min(raw, .05); for (let i = 0; i < (G.speed || 1); i++) step(dt);' in src and 'if (!G.manual && !G.paused)' in src)
    # ---- 배속 / 일시정지 (실시간 루프) ----
    b, pg = page(pw, '', (1280, 760)); J(pg, "()=>G.choose('warrior')"); J(pg, "()=>{ G.startWave(); }")
    # 프레임당 진행 시간 (swiftshader 는 CPU 한계라 실제 시간 기준 비율은 의미 없음 → 프레임당 G.t 증가량 비교)
    RT = "(ms)=>new Promise(r => { let f = 0; const tick = () => { f++; if (!done) requestAnimationFrame(tick); }; let done = false; requestAnimationFrame(tick); const t0 = G.t; G.manual = false; setTimeout(() => { G.manual = true; done = true; r((G.t - t0) / Math.max(1, f)); }, ms); })"
    t1 = J(pg, RT, 2500); pg.click('#speedBtn'); t2 = J(pg, RT, 2500)
    ok('speed_x2', J(pg, '()=>G.speed') == 2 and pg.inner_text('#speedBtn') == '×2' and t2 > t1 * 1.7, (round(t1, 4), round(t2, 4)))
    pg.screenshot(path=f'{OUT}/p5_speed.png')
    J(pg, "()=>{ G.manual = false; }"); pg.click('#pauseBtn'); pg.wait_for_timeout(200)
    st = J(pg, "()=>[G.paused, !document.getElementById('pauseOv').classList.contains('hidden'), G.t]"); pg.wait_for_timeout(1200); t3 = J(pg, '()=>G.t')
    cd0 = J(pg, '()=>G.hero.skillCd'); pg.keyboard.press('q'); pg.wait_for_timeout(200); cd1 = J(pg, '()=>G.hero.skillCd')
    top = J(pg, "()=>{ const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2 + 120); return e && !!e.closest('#pauseOv'); }")
    ok('pause_freezes', st[0] and st[1] and abs(t3 - st[2]) < 1e-9, (st, t3)); ok('pause_blocks_keys', cd0 == cd1 == 0, (cd0, cd1)); ok('pause_blocks_clicks', top)
    pg.screenshot(path=f'{OUT}/p5_pause.png')
    pg.click('#pauseGo'); pg.wait_for_timeout(600); ok('resume', not J(pg, '()=>G.paused') and J(pg, '()=>G.t') > t3)
    pg.keyboard.press('p'); ok('p_key_pause', J(pg, '()=>G.paused')); pg.keyboard.press('p'); ok('p_key_resume', not J(pg, '()=>G.paused'))
    pg.keyboard.press('f'); ok('f_key_speed', J(pg, '()=>G.speed') == 1)
    J(pg, "()=>{ G.manual = false; Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; }")
    ok('auto_pause_when_hidden', J(pg, '()=>G.paused')); J(pg, "()=>G.setPaused(false)")
    J(pg, "()=>{ G.setSpeed(2); G.setPaused(true); G.phase = 'over'; }"); pg.wait_for_timeout(700); ok('speed_reset_after_run', J(pg, '()=>G.speed') == 1 and pg.inner_text('#speedBtn') == '×1'); ok('unpause_when_over', not J(pg, '()=>G.paused') and J(pg, "()=>document.getElementById('pauseOv').classList.contains('hidden')"))
    J(pg, '()=>{ G.manual = true; }'); b.close()
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
