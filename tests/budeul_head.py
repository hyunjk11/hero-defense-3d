#!/usr/bin/env python3
"""버들 머리 안정성 측정: 게임에서 쓰는 클립(Idle/Run/Drill/Hammer/Hit/Cheer)을 재생하며 Head 뼈의 높이(키 대비)와 앞뒤 숙임(pitch, 서 있을 때 대비)을 샘플링.
python3 tests/budeul_head.py [--json out.json] [--sheet out.png]  → 머리가 반복적으로 크게 숙여지면 FAIL"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
srv, url = serve(); arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
JS = """async (names) => { const { makeHeroModel } = await import('./src/render/characters.js'); const THREE = G.THREE; const out = {};
  const ch = makeHeroModel('mechanic'); const head = ch.root.getObjectByName('Head'), q = new THREE.Quaternion(), v = new THREE.Vector3(), p = new THREE.Vector3();
  const H = 2.8, ref = () => { ch.g.updateMatrixWorld(true); head.getWorldQuaternion(q); v.set(0, 0, 1).applyQuaternion(q); head.getWorldPosition(p); return [Math.asin(-v.y) * 57.3, p.y]; };
  ch.mixer.stopAllAction(); const a0 = ch.mixer.clipAction(ch.acts.Idle.getClip()); a0.play(); ch.mixer.setTime(0); const [p0, y0] = ref();
  for (const n of names) { const A = ch.acts[n]; if (!A) continue; ch.mixer.stopAllAction(); const c = A.getClip(), a = ch.mixer.clipAction(c); a.reset(); a.play(); const P = [], Y = [];
    for (let i = 0; i <= 48; i++) { ch.mixer.setTime(c.duration * i / 48); const [pp, yy] = ref(); P.push(Math.round(pp - p0)); Y.push(+((yy - y0) / H * 100).toFixed(1)); }
    out[n] = { clip: c.name, dur: +c.duration.toFixed(2), pitch: P, dropPct: Y, maxPitch: Math.max(...P.map(Math.abs)), maxDrop: -Math.min(...Y) }; }
  return out; }"""
NAMES = ['Idle', 'Running_A', 'Drill', 'Hammer', 'Hit', 'Cheer']
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(); errs = []; pg.on('pageerror', lambda x: errs.append(str(x)))
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000)
    r = pg.evaluate(JS, NAMES); b.close()
fails = []
for n in NAMES:
    if n not in r: continue
    x = r[n]; print(f"{n:10s} ({x['clip']:>9s} {x['dur']}s)  최대 숙임 {x['maxPitch']:3d}°  머리 높이 최대 하강 {x['maxDrop']:5.1f}%  | pitch " + ' '.join(str(v) for v in x['pitch'][::4]))
    # 일상 동작(대기/달리기)은 15° · 2% 이내, 기본 공격(1초 남짓마다 반복)은 35° · 6% 이내여야 '고개를 자꾸 숙임'이 아님
    lim = (15, 2) if n in ('Idle', 'Running_A') else (35, 6) if n in ('Drill', 'Hammer') else (60, 12)
    if x['maxPitch'] > lim[0] or x['maxDrop'] > lim[1]: fails.append(n)
if arg('--json'): json.dump(r, open(arg('--json'), 'w'), ensure_ascii=False)
print('errors', errs); print('FAIL: ' + ', '.join(fails) if fails else 'HEAD STABLE OK'); sys.exit(1 if fails or errs else 0)
