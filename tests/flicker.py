#!/usr/bin/env python3
"""바닥 깜빡임(z-fighting/그림자 출렁임) 검사: 영웅이 걷는 동안 카메라를 아주 조금씩 옮긴 연속 프레임에서
   돌길/지면 픽셀이 '튀는' 비율을 측정. MSAA 끔(msaa=0) 대비 켬(msaa=1, 실제 GPU 기본값)에서 크게 줄어야 함.  python3 tests/flicker.py [--save dir]"""
import sys, os, pathlib, io
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, Q
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SAVE = sys.argv[sys.argv.index('--save') + 1] if '--save' in sys.argv else None
srv, url = serve(); errs = []
def grab(pg, js, crop):
    pg.evaluate(js); pg.wait_for_timeout(120); return Image.open(io.BytesIO(pg.screenshot(clip=crop))).convert('L')
def flick(frames):
    # 인접 프레임 사이 밝기가 크게(>40) 바뀐 픽셀 비율 (부드러운 카메라 이동에서는 거의 0이어야 함)
    out = []
    for a, b in zip(frames, frames[1:]):
        d = ImageChops.difference(a, b); h = d.histogram(); out.append(sum(h[40:]) / (a.width * a.height))
    return max(out)
def run(pg, name, cam, crop):
    fr = []
    for i in range(8):
        e = i * 0.004  # 아주 작은 카메라 이동(약 1/10 픽셀)
        fr.append(grab(pg, "()=>{ const c=%s; G.cam.target.set(c[0]+%f,c[1],c[2]+%f); G.cam.r=c[3]; G.cam.phi=c[4]; G.cam.theta=c[5]; G.sim(.001,.001); }" % (cam, e, e * .7), crop))
        if SAVE: fr[-1].save(f'{SAVE}/{name}_{i}.png')
    v = flick(fr); print(f'{name} flicker={v:.5f}', flush=True); return v
def town(pw, q):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 960, 'height': 560}); c.add_init_script(MOCK); pg = c.new_page(); pg.set_default_timeout(120000)
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1' + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); pg.wait_for_timeout(800)
    pg.mouse.click(500, 300); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(1500)
    pg.evaluate("()=>{ G.townTeleport(3, 3); G.manual=true; }")
    v = run(pg, 'town' + q[-1], '[1,1,-151,34,.78,0]', {'x': 230, 'y': 140, 'width': 500, 'height': 300}); b.close(); return v
def defense(pw, q):
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 960, 'height': 560}); pg.set_default_timeout(120000)
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + Q + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate("()=>{ G.choose('mage'); }"); pg.wait_for_timeout(1500); pg.evaluate("()=>{ G.manual=true; }")
    v = run(pg, 'defense' + q[-1], '[0,0,0,40,.9,0]', {'x': 180, 'y': 120, 'width': 600, 'height': 320}); b.close(); return v
with sync_playwright() as pw:
    t0, t1, d0, d1 = town(pw, '&msaa=0'), town(pw, '&msaa=1'), defense(pw, '&msaa=0'), defense(pw, '&msaa=1')
    print('errors', errs); print('town', t0, '->', t1, 'defense', d0, '->', d1); ok = t1 < t0 * .6 and d1 <= d0 * 1.05 and t1 < .003 and not errs; print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
