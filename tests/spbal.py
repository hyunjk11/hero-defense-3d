#!/usr/bin/env python3
"""🗼 무한의 탑 균형 시뮬레이션 (개발용, run_all 에 없음). 연습 탑(?sptest=1) 을 AI 자동 전투로 오름 · 조작 영웅 가만히 · 축복 무작위(시드) · 합동 공격 준비되면 바로.
python3 tests/spbal.py [runs=1] [--from=N] [--gear=base|mid|high] [--rose] [--max=게임초]
 gear: base = 기본 3영웅 무장비 · mid = 희귀 장비+영구 강화 5 근사(공격 ×1.6 · 체력 ×1.7) · high = 전직+고유 근사(공격 ×2.6 · 체력 ×2.6)
 (장비 효과는 영웅 C.dmg / 최대 체력 배수로 근사 — 실제 장비·스킬 차이는 반영 안 됨)
 출력: 층별 시간 · 최저 체력% · 쓰러진 수 → 'TOP 도달 층' """
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
A = sys.argv[1:]; opt = lambda k, d: next((a.split('=', 1)[1] for a in A if a.startswith(f'--{k}=')), d)
N = int(next((a for a in A if a.isdigit()), '1')); FROM = int(opt('from', '1')); GEAR = opt('gear', 'base'); ROSE = '--rose' in A or GEAR != 'base'; MAXT = int(opt('max', '2400'))
GK = {'base': (1, 1), 'mid': (1.6, 1.7), 'high': (2.6, 2.6)}[GEAR]
srv, url = serve(); J = lambda pg, js: pg.evaluate(js)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for run in range(N):
        c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
        pg.on('pageerror', lambda x: print('PE', str(x)[:300], flush=True))
        pg.goto(url + f'?seed={22345 + run}&rng={877 + run}&flow=1&dgtest=1&sptest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
        pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', f'spbal{run}@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000)
        if ROSE: J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
        J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000)
        J(pg, "(n)=>import('./src/core/nav.js').then(m=>m.go({spire:%d}, 0))" % FROM)
        pg.wait_for_function("()=>window.G&&G.dungeon&&G.spire&&G.heroes&&G.heroes.length>=3", timeout=300000)
        J(pg, "()=>{ G.manual=true; G.pauseRender=true; let q=%d; G.dgRnd=()=>(q=(q*16807)%%2147483647)/2147483647; G._bal={fl:[], min:G.heroes.map(()=>1), t0:G.dg.t||0, cur:null};"
              " G.heroes.forEach(h=>{ h.C={...h.C, dmg:h.C.dmg*%s}; h.max=Math.round(h.max*%s); h.hp=h.max; }); }" % (99 + run, GK[0], GK[1]))
        t = 0
        while t < MAXT:
            r = J(pg, """()=>{ for (let i=0;i<20;i++) { G.sim(.1); const D=G.dg, B=G._bal, F=D.floors[D.floor]; G.heroes.forEach((h,k)=>{ if (h.dead<=0) B.min[k]=Math.min(B.min[k], h.hp/h.max); });
              if (G.dgResult) break; if (G.dgJoint && document.getElementById('dgJoint') && !document.getElementById('dgJoint').disabled && G.enemies.filter(e=>!e.dead).length>=4) G.dgJoint();
              if (D.blessing) G.dgTakeBless(D.blessing[Math.floor(G.dgRnd()*D.blessing.length)]);
              const f=F?F.floor:0; if (B.cur===null) B.cur=f; if (f!==B.cur) { B.fl.push({f:B.cur, t:Math.round(D.t-B.t0), min:B.min.map(x=>Math.round(x*100)), down:G.heroes.filter(h=>h.dead>0||h.hp<h.max*.31).length}); B.cur=f; B.t0=D.t; B.min=G.heroes.map(()=>1); } }
              return [!!G.dgResult, G.dg.floor]; }""")
            t += 2
            if r[0]: break
        R = J(pg, "()=>({top:G.dgResult&&G.dgResult.top, res:!!G.dgResult, fl:G._bal.fl, last:{f:G._bal.cur, t:Math.round(G.dg.t-G._bal.t0), min:G._bal.min.map(x=>Math.round(x*100))}, bless:G.dg.bless})")
        print('RUN', run, GEAR, 'from', FROM, 'TOP', R['top'] if R['res'] else f"(시간 끝 {R['last']['f']}층)", json.dumps(R, ensure_ascii=False), flush=True)
        c.close()
    b.close()
