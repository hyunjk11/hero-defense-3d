#!/usr/bin/env python3
"""마을/호수광장/여신의 축복/인트로 스크린샷 + 콘솔 오류 확인.  python3 tests/townshot.py [outdir]"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
out = sys.argv[1] if len(sys.argv) > 1 else '.'; srv, url = serve(); errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/intro.png')
    pg.evaluate("()=>{ const s=JSON.parse(localStorage.getItem('hd3d_save')||'{}'); localStorage.setItem('hd3d_save', JSON.stringify({...s, souls: 260, stats:{runs:3,kills:120,waves:9,souls:260}})); }")
    pg.mouse.click(700, 400); pg.wait_for_timeout(400); pg.click('#lgGuest'); pg.wait_for_timeout(300)
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=20000); pg.wait_for_timeout(2500)
    pg.evaluate("()=>{ G.cam.target.set(4,1,-152); G.cam.r=46; G.cam.phi=.85; G.cam.theta=.12; G.manual=false; }"); pg.wait_for_timeout(200)
    pg.evaluate("()=>{ window.__k=setInterval(()=>{G.cam.target.set(5,1,-151); G.cam.r=48; G.cam.phi=.86; G.cam.theta=.1;},16); }"); pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{out}/town.png'); pg.evaluate("()=>clearInterval(window.__k)")
    pg.evaluate("()=>{ const [x,z]=G.townTower(); G.townTeleport(x-9.5, z+1); window.__k=setInterval(()=>{G.cam.target.set(x,6,-150+z); G.cam.r=36; G.cam.phi=1.12; G.cam.theta=-.3;},16); }"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/lake.png')
    pg.evaluate("()=>{ const [x,z]=G.townTower(); G.townTeleport(x-7.8, z); G.townGoal(x-2.45, z); }"); pg.wait_for_function("()=>!document.getElementById('twBless').classList.contains('hidden')", timeout=10000); pg.wait_for_timeout(900)
    pg.evaluate("()=>{ const [x,z]=G.townTower(); clearInterval(window.__k); window.__k=setInterval(()=>{G.cam.target.set(x-2,3,-150+z); G.cam.r=22; G.cam.phi=1.05; G.cam.theta=-.6;},16); }"); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{out}/goddess.png')
    print('errors', errs)
