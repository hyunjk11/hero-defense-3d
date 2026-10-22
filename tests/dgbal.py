#!/usr/bin/env python3
"""던전 5층 균형 시뮬레이션 (개발용, run_all 에 없음): 기본 3영웅(로즈 옵션) AI 자동 전투 · 조작 영웅 가만히 · 축복 무작위(시드) · 합동 공격 준비되면 바로.
python3 tests/dgbal.py [runs=2] [--rose]  → 층별 시간 · 최저 체력% · 쓰러진 수"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
N = int(next((a for a in sys.argv[1:] if a.isdigit()), '2')); ROSE = '--rose' in sys.argv
srv, url = serve(); J = lambda pg, js: pg.evaluate(js)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for run in range(N):
        c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
        pg.on('pageerror', lambda x: print('PE', str(x)[:300], flush=True))
        pg.goto(url + f'?seed={12345 + run}&rng={777 + run}&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
        pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', f'bal{run}@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000)
        if ROSE: J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
        J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000)
        J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden')", timeout=20000); pg.wait_for_timeout(1500)
        pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000)
        J(pg, "()=>{ G.manual=true; G.pauseRender=true; let q=%d; G.dgRnd=()=>(q=(q*16807)%%2147483647)/2147483647; G._bal={fl:[], min:G.heroes.map(()=>1), t0:0}; }" % (99 + run))
        t = 0
        while t < 900:
            r = J(pg, """()=>{ for (let i=0;i<20;i++) { G.sim(.1); const D=G.dg, B=G._bal; G.heroes.forEach((h,k)=>{ if (h.dead<=0) B.min[k]=Math.min(B.min[k], h.hp/h.max); });
              if (G.dgResult) break; if (G.dgJoint && document.getElementById('dgJoint') && !document.getElementById('dgJoint').disabled && G.enemies.filter(e=>!e.dead).length>=4) G.dgJoint();
              if (D.blessing) { B.fl.push({f:D.floor+1, t:Math.round(D.t-B.t0), min:B.min.map(x=>Math.round(x*100)), down:G.heroes.filter(h=>h.dead>0).length, joints:D.joints, b:D.blessing.slice()}); B.t0=D.t; B.min=G.heroes.map(()=>1); G.dgTakeBless(D.blessing[0]); } }
              return [!!G.dgResult, G.dg.floor]; }""")
            t += 2
            if r[0]: break
        R = J(pg, "()=>({res:G.dgResult, fl:G._bal.fl, last:{f:G.dg.floor+1, t:Math.round(G.dg.t-G._bal.t0), min:G._bal.min.map(x=>Math.round(x*100)), down:G.heroes.filter(h=>h.dead>0).length}, bless:G.dg.bless})")
        print('RUN', run, 'rose' if ROSE else 'base3', json.dumps(R, ensure_ascii=False), flush=True)
        c.close()
    b.close()
