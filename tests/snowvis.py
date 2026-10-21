#!/usr/bin/env python3
"""설원(2장) 가독성 + 배너 넘침 회귀 검사.  python3 tests/snowvis.py [--shots] [--root DIR --tag before --nocheck]
1) 2-1..2-4 를 1024x633 건설 단계(로즈)로 찍어 판 영역 밝기/대비 측정: 평균 < 205, 표준편차 > 45, 하얗게 날아간(>=245) 픽셀 < 12%
   (기준: 숲 1-1). 스크린샷 shots/snow/<stage>.png (--shots)
2) 긴 배너(장비 보너스 등)가 1024x600 · 1024x768 · 768x1024 · 1440x860 에서 화면 밖으로 넘치지 않음 (폭 ≤ 72vw, 가로 화면에선 좌우 패널과 겹치지 않음)"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import regress
from regress import ARGS, Q
from playwright.sync_api import sync_playwright
from PIL import Image; import numpy as np
A = sys.argv; arg = lambda k, d=None: A[A.index(k) + 1] if k in A else d
if '--root' in A: regress.ROOT = os.path.abspath(arg('--root'))
SHOTS = '--shots' in A or '--root' in A; TAG = arg('--tag', ''); CHECK = '--nocheck' not in A
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'snow'); os.makedirs(OUT, exist_ok=True)
srv, url = regress.serve(); errs, res, metrics = [], {}, {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
def board(path):  # 좌우 패널·상단 HUD·하단 버튼 제외한 판 영역
    a = np.asarray(Image.open(path).convert('L'), dtype=float); h, w = a.shape; b = a[int(h * .24):int(h * .88), int(w * .19):int(w * .8)]
    gy, gx = np.abs(np.diff(b, axis=0)).mean(), np.abs(np.diff(b, axis=1)).mean()
    return {'mean': round(b.mean(), 1), 'std': round(b.std(), 1), 'clip': round(float((b >= 245).mean()) * 100, 1), 'edge': round((gx + gy) / 2, 2)}
LONG = '⚔ 장비 보너스: 피해 +18% · 스킬 위력 +12% · 최대 체력 +8% · 치명타 확률 +8% · 공격 속도 +9% · 사거리 +13% · 치명타 피해 +28%'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1024, 'height': 633})
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    for st in ['1-1', '2-1', '2-2', '2-3', '2-5', '2-6', '2-4']:  # 2-5·2-6 = 2026-10-21 새 스테이지
        pg.goto(url + Q + '&stage=' + st); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate("()=>G.choose('gunner')")
        pg.evaluate("()=>{ G.manual=true; G.sim(.5); }"); pg.wait_for_timeout(3200)  # 출전 배너가 사라진 뒤
        p = os.path.join(OUT, f'{TAG + "_" if TAG else ""}{st}.png'); pg.screenshot(path=p); m = metrics[st] = board(p)
        if not SHOTS: os.remove(p)
        if CHECK and st != '1-1': ok(f'{st}_readable', m['mean'] < 205 and m['std'] > 45 and m['clip'] < 12, m)
        else: print('    ', st, m, flush=True)
    if CHECK:
        for vw, vh in [(1024, 600), (1024, 768), (768, 1024), (1440, 860)]:
            pg.set_viewport_size({'width': vw, 'height': vh}); pg.wait_for_timeout(300)
            for txt in [LONG, 'EQ']:
                r = pg.evaluate("""async (t)=>{ const H=await import('./src/ui/hud.js'), F=await import('./src/ui/flow.js');
                  if (t==='EQ') t=F.equipLine({atk:18,skill:12,hp:8,crit:8,spd:9,rng:13,critD:28});
                  H.banner(t,'#ffe08a',5000); await new Promise(r=>setTimeout(r,450)); const e=document.getElementById('banner'), b=e.getBoundingClientRect();
                  const hit=['build','ups'].map(id=>document.getElementById(id)).filter(p=>p&&p.offsetParent).some(p=>{ const q=p.getBoundingClientRect(); return b.left<q.right&&b.right>q.left&&b.top<q.bottom&&b.bottom>q.top; });
                  return {l:b.left,r:b.right,t:b.top,b:b.bottom,w:b.width,fs:parseFloat(getComputedStyle(e).fontSize),panel:hit,txt:e.textContent}; }""", txt)
                ok(f'banner_fits_{vw}x{vh}_{"long" if txt == LONG else "equip"}', r['l'] >= 0 and r['r'] <= vw and r['t'] >= 0 and r['b'] <= vh * .5 and r['w'] <= vw * .72 and (vw < 900 or not r['panel']), {k: round(v) if isinstance(v, float) else v for k, v in r.items()})
            if (vw, vh) == (1024, 600) and SHOTS: pg.screenshot(path=os.path.join(OUT, 'banner_1024x600.png'))
        print('console errors:', errs); ok('no_console_errors', not errs)
    json.dump(metrics, open(os.path.join(OUT, f'metrics{"_" + TAG if TAG else ""}.json'), 'w'), indent=1)
    n = sum(res.values()); print(f'{n}/{len(res)} ok', 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
