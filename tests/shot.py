#!/usr/bin/env python3
"""빠른 시각 확인용 스크린샷: python3 tests/shot.py out.png [js-to-run-before-shot]"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, Q, HELP
from playwright.sync_api import sync_playwright
out = sys.argv[1]; js = sys.argv[2] if len(sys.argv) > 2 else "()=>{G.choose('archer'); G.startWave(); G.sim(25);}"
srv, url = serve(); errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1440, 'height': 860})
    pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + Q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP)
    r = pg.evaluate(js); pg.evaluate('()=>G.sim(.05)'); pg.wait_for_timeout(700); pg.screenshot(path=out)
    print('result', r, 'errors', errs)
