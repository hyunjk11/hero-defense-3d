#!/usr/bin/env python3
"""Q-14 도구 우클릭 취소 · 연속 건설 (이미 있던 동작 확인).  python3 tests/q14.py
 - 건설 도구 고른 상태에서 캔버스 우클릭(제자리) → 이동 도구 · 우클릭 드래그(회전, 6px 이상)는 도구 유지
 - 건설 후에도 도구 유지 (Shift 없이 연속 건설) — G.build 테스트 훅은 끝나면 move 로 돌려놓으므로 input.js build() 로 직접 확인"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': 1280, 'height': 760}).new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP)
    J(pg, "()=>G.choose('warrior')"); J(pg, "()=>G.sim(.3)")
    J(pg, "()=>G.setTool('arrow')"); ok('tool_set', J(pg, "()=>G.tool") == 'arrow')
    pg.mouse.move(640, 300); pg.mouse.down(button='right'); pg.mouse.move(700, 310, steps=4); pg.mouse.up(button='right'); pg.wait_for_timeout(100)
    ok('right_drag_keeps_tool', J(pg, "()=>G.tool") == 'arrow')
    pg.mouse.move(640, 300); pg.mouse.down(button='right'); pg.mouse.up(button='right'); pg.wait_for_timeout(100)
    ok('right_click_cancels', J(pg, "()=>G.tool") == 'move')
    r = J(pg, """async()=>{ const m=await import('./src/ui/input.js'); G.gold=9999; m.setTool('arrow'); let n=0; for (let c=0;c<40&&n<2;c++) for (let r=0;r<30&&n<2;r++) { if (!G.buildReason(c, r, 'arrow') && m.build(c, r)) n++; } return [n, G.tool]; }""")
    ok('tool_kept_after_build', r == [2, 'arrow'], r)
    b.close()
ok('no_console_errors', not errs, errs[:3])
print('ALL OK' if all(res.values()) else 'FAILED', len(res)); sys.exit(0 if all(res.values()) else 1)
