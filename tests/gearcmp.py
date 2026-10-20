#!/usr/bin/env python3
"""버들 장비 모델(budeul_gear.glb) 압축 전/후 화면 비교.  python3 tests/gearcmp.py 원본.glb 새.glb
같은 시드·수동 시계로 버들을 대기/공격/달리기 자세 × 두 각도로 렌더 → 픽셀 차이. 결과 shots/improve/p3_gear_{orig,new,diff}_<자세>.png + p3_gear_cmp.json"""
import sys, os, io, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat
A, B = sys.argv[1], sys.argv[2]; OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs = []
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
CAM = "([r,th])=>import('./src/render/scene.js').then(({cam,updateCam})=>{ const p=G.hero.g.position; cam.target.set(p.x,1.6,p.z); cam.r=r; cam.phi=1.1; cam.theta=th; updateCam(); })"
POSES = [('idle', 'Idle', 7, .5), ('idle_back', 'Idle', 7, 3.6), ('attack', 'Drill', 7, .9), ('run', 'Run', 7, -.6)]
def shots(path):
    out = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 900, 'height': 700})
        pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
        data = open(path, 'rb').read(); pg.route('**/models/budeul_gear.glb', lambda r: r.fulfill(status=200, body=data, headers={'content-type': 'model/gltf-binary'}))
        pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP)
        pg.evaluate("()=>{ G.choose('mechanic'); document.getElementById('hud').classList.add('hidden'); }")
        for name, clip, r, th in POSES:
            pg.evaluate(f"()=>{{ const h = G.hero; h.g.position.set(0, 0, 4); h.g.rotation.y = 0; G.play(h.ch, '{clip}', {{ fade: 0 }}); h.ch.mixer.setTime(0); h.ch.mixer.update(.37); }}")
            pg.evaluate(CAM, [r, th]); pg.evaluate(RAF); out[name] = Image.open(io.BytesIO(pg.screenshot())).convert('RGB')
        b.close()
    return out
o, n = shots(A), shots(B); R = {}
for k in o:
    d = ImageChops.difference(o[k], n[k]); g = d.convert('L'); px = sum(1 for v in g.getdata() if v > 24); tot = g.size[0] * g.size[1]
    R[k] = {'mean_abs_diff': round(sum(ImageStat.Stat(d).mean) / 3, 3), 'pixels_gt24_pct': round(100 * px / tot, 3), 'max': max(g.getextrema())}
    o[k].save(f'{OUT}/p3_gear_orig_{k}.png'); n[k].save(f'{OUT}/p3_gear_new_{k}.png'); Image.eval(g, lambda v: min(255, v * 8)).save(f'{OUT}/p3_gear_diff_{k}.png')
    print(k, R[k], flush=True)
json.dump({'orig': A, 'new': B, 'sizes': [os.path.getsize(A), os.path.getsize(B)], 'poses': R, 'errors': errs[:5]}, open(f'{OUT}/p3_gear_cmp.json', 'w'), indent=1)
print('errors', errs[:5])
