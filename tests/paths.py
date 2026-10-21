#!/usr/bin/env python3
"""입구(포털)가 여러 개인 스테이지에서 모든 입구의 경로 표시(리본·점선·화살표) 검사.  python3 tests/paths.py [--shots]
경로 재계산(지형 변경) 시 갱신, 반복 재계산에도 메시/지오메트리 누수 없음, 콘솔 오류 없음. 스크린샷 shots/paths/two_entrances.png"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP, Q
from playwright.sync_api import sync_playwright
SHOTS = '--shots' in sys.argv; OUT = 'shots/paths'; srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a)
# 각 경로: 입구에서 시작, 코어(1번) 또는 앞 경로와의 합류 칸에서 끝, 리본·점선·화살표가 실제로 그려짐
CHECK = r"""()=>{ const v=G.routeVis(), core=G.CORE.join(','), sp=G.SPAWNS.map(s=>s.join(',')), prev=new Set();
  return v.map((R,i)=>{ const end=R.end?R.end.join(','):'', o={i, tiles:R.tiles, ribbon:R.ribbon>0, dashes:R.dashes, chevs:R.chevs,
    start:R.start&&R.start.join(',')===sp[i], end: i===0 ? end===core : (end===core||prev.has(end)) }; G.routes[i].forEach(t=>prev.add(t.join(','))); return o; }); }"""
STAGES = ['1-3', '1-4', '1-5', '1-6', '2-2', '2-3', '2-4', '2-5', '2-6', '3-5', '3-6', '4-5', '4-6']  # 2026-10-21 새 스테이지 포함
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1280, 'height': 760})
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    for st in STAGES:
        pg.goto(url + Q + '&stage=' + st); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); J(pg, "()=>G.choose('warrior')"); pg.wait_for_timeout(200)
        J(pg, "()=>{ G.manual=true; G.sim(.2); }"); v = J(pg, CHECK); n = J(pg, "()=>G.SPAWNS.length")
        ok(f'{st}_all_entrances_drawn', n >= 2 and len(v) == n and all(r['tiles'] >= 2 and r['ribbon'] and r['dashes'] > 0 and r['chevs'] > 0 and r['start'] and r['end'] for r in v), [(r['tiles'], r['dashes'], r['chevs'], r['start'], r['end']) for r in v])
    # 1-4 (좌우 입구, 가운데 코어): 지형 변경 → 2번 경로 갱신, 반복 재계산 누수 없음, 전투 단계에서도 표시
    pg.goto(url + Q + '&stage=1-4'); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); J(pg, "()=>G.choose('warrior')"); pg.wait_for_timeout(200); J(pg, "()=>{ G.manual=true; G.sim(.2); }")
    mem0 = J(pg, "()=>[G.scene.children.length, G.renderer.info.memory.geometries]")
    r0 = J(pg, "()=>G.routes[1].map(t=>t.join(','))")
    J(pg, """()=>{ const r=G.routes[1], [c,rr]=r[Math.floor(r.length/2)]; for (const [dc,dr] of [[0,0],[0,1],[0,-1]]) { const t=G.tileAt(c+dc,rr+dr); if (t && t.t!==6 && t.t!==7) { t.t=5; t.hp=t.max=0; G.refreshTile(t); } } G.computeDist(); G.sim(.1); }""")
    r1 = J(pg, "()=>G.routes[1].map(t=>t.join(','))"); v1 = J(pg, CHECK)
    ok('route2_updates_on_terrain_change', r1 != r0 and all(J(pg, "(k)=>G.tileAt(...k.split(',').map(Number)).t", k) != 5 for k in r1) and all(r['ribbon'] and r['end'] for r in v1), (len(r0), len(r1)))
    rec = "()=>new Promise(res=>{ for (let i=0;i<25;i++) G.computeDist(); G.sim(.2); requestAnimationFrame(()=>requestAnimationFrame(()=>res([G.scene.children.length, G.renderer.info.memory.geometries]))); })"
    mem1 = J(pg, rec); mem2 = J(pg, rec); mem3 = J(pg, rec)  # 재계산 75번: 씬 자식 수 고정, GPU 지오메트리 수 증가 없음
    ok('no_mesh_or_geometry_leak', mem1[0] == mem0[0] == mem3[0] and mem3[1] <= mem1[1], (mem0, mem1, mem2, mem3))
    J(pg, "()=>{ G.startWave(); G.sim(1); }"); vw = J(pg, CHECK); ok('shown_during_wave', J(pg, "()=>G.phase") == 'wave' and all(r['ribbon'] and r['dashes'] > 0 for r in vw))
    if SHOTS:
        os.makedirs(OUT, exist_ok=True)
        pg.goto(url + Q + '&stage=1-4'); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); J(pg, "()=>G.choose('warrior')"); pg.wait_for_timeout(300)
        J(pg, "()=>{ G.manual=true; G.sim(.5); G.cam.target.set(0,0,1); G.cam.r=46; G.cam.phi=.72; G.cam.theta=0; G.sim(.1); }"); pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}/two_entrances.png')
    print('console errors:', errs); ok('no_console_errors', not errs)
    n_ok = sum(res.values()); print(f'{n_ok}/{len(res)} ok', 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
