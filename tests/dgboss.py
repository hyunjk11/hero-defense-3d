#!/usr/bin/env python3
"""던전 5층 보스(망령 여왕) 균형 시뮬레이션 (개발용, run_all 에 없음).
1~4층은 건너뛰고(층마다 축복 = 첫 카드, 층 끝 체력 70% 가정 → 5층 시작 85%) 5층만 AI 자동 전투 · 조작 영웅(세라) 가만히(피하기/막기 안 함) · 합동 공격 준비되면 바로.
python3 tests/dgboss.py [runs=2] [--geared]   (--geared = 로즈 포함 4명 · 장비 희귀 3부위 · 영구 강화 hp/atk 5)"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
N = int(next((a for a in sys.argv[1:] if a.isdigit()), '2')); GEAR = '--geared' in sys.argv
srv, url = serve(); J = lambda pg, js: pg.evaluate(js)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for run in range(N):
        c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
        pg.on('pageerror', lambda x: print('PE', str(x)[:300], flush=True))
        pg.goto(url + f'?seed={22345 + run}&rng={877 + run}&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
        pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', f'boss{run}@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000)
        if GEAR:
            J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
            J(pg, """()=>{ const {Acc,E}=G.gear; let q=51; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
              Acc.update(d=>{ d.souls=0; for (const c of ['warrior','archer','mage','gunner']) { d.eq[c]={}; for (const sl of ['weapon','armor','acc']) { const it={...E.makeItem(sl,c,2,r), id:'g'+c+sl}; d.inv.push(it); d.eq[c][sl]=it.id; } d.heroLv[c]={hp:5,atk:5}; } return d; }); }""")
        J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000)
        J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden')", timeout=20000); pg.wait_for_timeout(1500)
        pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000)
        J(pg, """async()=>{ G.manual=true; G.pauseRender=true; const M=await import('./src/data/dungeon.js'); let q=%d; G.dgRnd=()=>(q=(q*16807)%%2147483647)/2147483647;
          for (let f=0; f<4; f++) { const D=G.dg; D.q=[]; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); G.heroes.forEach(h=>{ h.hp=h.max*.7; h.ult=Math.min(100,(h.ult||0)+45); });
            const ch=M.blessChoices(D.bless, [...new Set(G.heroes.map(h=>M.ROLE[h.cls]))], G.dgRnd); D.blessing=ch; G.dgTakeBless(ch[0]); }
          G._bal={t0:G.dg.t, min:G.heroes.map(()=>1)}; }""" % (199 + run))
        t = 0
        while t < 600:
            r = J(pg, """()=>{ for (let i=0;i<20;i++) { G.sim(.1); const B=G._bal; G.heroes.forEach((h,k)=>{ if (h.dead<=0) B.min[k]=Math.min(B.min[k], h.hp/h.max); });
              if (G.dgResult) break; const boss=G.enemies.some(e=>e.type==='dg_lich'&&!e.dead); if (G.dgJoint && !document.getElementById('dgJoint').disabled && (boss || G.enemies.filter(e=>!e.dead).length>=4)) G.dgJoint(); }
              return !!G.dgResult; }""")
            t += 2
            if r: break
        R = J(pg, """()=>{ const b=G.enemies.find(e=>e.type==='dg_lich'); return {res:G.dgResult&&{win:G.dgResult.win, cleared:G.dgResult.cleared, joints:G.dgResult.joints}, t5:Math.round(G.dg.t-G._bal.t0), party:G.heroes.map(h=>h.cls),
          max:G.heroes.map(h=>Math.round(h.max)), dmg:G.heroes.map(h=>Math.round(h.C.dmg)), min:G._bal.min.map(x=>Math.round(x*100)), down:G.heroes.filter(h=>h.dead>0).map(h=>h.cls), boss:b?Math.round(b.hp/b.max*100):null, log:G.dgB.log, bless:G.dg.bless}; }""")
        print('RUN', run, 'geared4' if GEAR else 'base3', json.dumps(R, ensure_ascii=False), flush=True)
        c.close()
    b.close()
