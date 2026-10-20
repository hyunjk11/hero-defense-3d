#!/usr/bin/env python3
"""화산(3장) 가독성 · 블룸 검사 + 스크린샷.  python3 tests/volcanovis.py [--shots]
1) 3-1..3-4: 건설 단계(판 전체) + 1웨이브 진행 중(몬스터·불씨)을 1024x633에서 찍어 판 영역 밝기/대비 측정
   평균 35..170 (어둡지만 보임), 표준편차 > 22, 하얗게 날아간(>=245) 픽셀 < 3% (용암 블룸이 번져 하얘지지 않음), 완전 검정(<6) < 25%
2) 3-4 보스(화염의 군주): 운석 예고 + 용암 웅덩이 + 분노 상태에서 같은 기준, 장면 NaN 없음
3) 콘솔 오류 0.  --shots: shots/chapter3/3-1.png..3-4.png (웨이브 진행 중), boss.png"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import regress
from regress import ARGS, Q
from playwright.sync_api import sync_playwright
from PIL import Image; import numpy as np
SHOTS = '--shots' in sys.argv
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'chapter3'); os.makedirs(OUT, exist_ok=True)
srv, url = regress.serve(); errs, res, metrics = [], {}, {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
def board(path):
    a = np.asarray(Image.open(path).convert('L'), dtype=float); h, w = a.shape; b = a[int(h * .24):int(h * .88), int(w * .19):int(w * .8)]
    return {'mean': round(b.mean(), 1), 'std': round(b.std(), 1), 'clip': round(float((b >= 245).mean()) * 100, 2), 'black': round(float((b < 6).mean()) * 100, 1)}
good = lambda m: 35 <= m['mean'] <= 170 and m['std'] > 22 and m['clip'] < 3 and m['black'] < 25
NAN = "()=>{ let bad=0; G.scene.traverse(o=>{ const p=o.position; if(!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.z)) bad++; }); for (const e of G.enemies) if(!isFinite(e.hp)) bad++; return bad; }"
def shot(pg, name):
    pg.evaluate("()=>{ G.pauseRender=false; for (const id of ['note','banner']) { const e=document.getElementById(id); if (e) e.style.visibility='hidden'; } }"); pg.wait_for_timeout(1600); p = os.path.join(OUT, name + '.png'); pg.screenshot(path=p); m = board(p)
    if not SHOTS: os.remove(p)
    pg.evaluate("()=>{ for (const id of ['note','banner']) { const e=document.getElementById(id); if (e) e.style.visibility=''; } }"); return m
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1024, 'height': 633})
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    for st in ['3-1', '3-2', '3-3', '3-4']:
        pg.goto(url + Q + '&stage=' + st); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate("()=>G.choose('gunner')")
        pg.evaluate("()=>{ G.manual=true; G.sim(.5); }"); pg.wait_for_timeout(3200)
        m = metrics[st + '_build'] = shot(pg, f'_{st}_build'); ok(f'{st}_build_readable', good(m), m)
        # 1웨이브: 타워 몇 개 + 몬스터 진행 + 불씨
        pg.evaluate("""()=>{ G.gold=2000; const R=G.route||[], inG=(c,r)=>c>=0&&r>=0&&c<G.GW&&r<G.GH; let n=0; const types=['arrow','cannon','magic'];
          for (let i=4; i<R.length && n<3; i+=5) { const [c,r]=R[i]; let done=false; for (const [dc,dr] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[0,2],[0,-2]]) { const cc=c+dc, rr=r+dr; if (done||!inG(cc,rr)) continue; if (G.buildReason(cc,rr,types[n])===null && G.build(cc,rr,types[n])) { n++; done=true; } } }
          G.startWave(); G.sim(14); G.cam.r=50; G.sim(.05); }""")
        m = metrics[st] = shot(pg, st); ok(f'{st}_wave_readable', good(m) and pg.evaluate("()=>G.enemies.length") > 0, m)
        ok(f'{st}_no_nan', pg.evaluate(NAN) == 0)
    # 보스: 3-4 최종 웨이브, 화염의 군주를 타워 근처로 → 용암 웅덩이 + 운석 예고 + 분노
    r = pg.evaluate("""()=>{ G.coreHp=G.coreMax=1e6; for (const e of [...G.enemies]) G.hurt(e,1e9,'#fff',false); G.sim(3); G.phase='build'; G.wave=14; G.startWave(); const q0=[...G.spawnQ]; G.spawnQ=G.spawnQ.filter(t=>t==='boss_fire'); let k=0; while (G.spawnQ.length && k++<100) G.sim(.1);
        const bs=G.enemies.find(e=>e.type==='boss_fire'); const tw=G.towers[0]; const [x,z]=G.tileXZ(tw.c,tw.r); bs.g.position.set(x+3,0,z+1.5); bs.tile=G.toTile(x+3,z+1.5); bs.state='walk'; bs.spawnT=0; bs.E=Object.assign({},bs.E,{spd:1e-4});
        bs.hp=bs.max*.45; bs.abT.lavapool=.05; G.sim(2.2); bs.abT.meteor=.05; G.sim(.9); G.hero.g.position.set(x-4,0,z+4); G.cam.target.set(bs.g.position.x-1,0,bs.g.position.z+2); G.cam.r=30; G.sim(.05);
        return { q: q0.filter(t=>/^boss/.test(t)), hud: document.getElementById('bossName').textContent, boss: !!bs, enraged: !!bs.enraged, pools: G.stats.pools||0, marks: G.scene.children.filter(m=>m.userData&&m.userData.ring).length }; }""")
    ok('boss_final_wave_only_fire', r['q'] == ['boss_fire'] and r['hud'] == '화염의 군주', {'q': r['q'], 'hud': r['hud']})
    ok('boss_scene', r['boss'] and r['enraged'] and r['pools'] >= 1 and r['marks'] >= 1, r)
    m = metrics['boss'] = shot(pg, 'boss'); ok('boss_readable', good(m), m); ok('boss_no_nan', pg.evaluate(NAN) == 0)
    # 1-6 / 2-4 / 3-4 최종 웨이브: 챕터 보스 1마리만 (해골 군주 X), 보스 HP 바 이름 = 챕터 보스 이름
    for st, bt, nm in [('1-6', 'boss_forest', '숲의 군주'), ('2-4', 'boss_snow', '빙결의 군주'), ('3-4', 'boss_fire', '화염의 군주')]:
        pg.goto(url + Q + '&stage=' + st); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate("()=>G.choose('gunner')")
        r2 = pg.evaluate("()=>{ G.manual=true; G.coreHp=G.coreMax=1e6; G.phase='build'; G.wave=14; G.startWave(); const q=G.spawnQ.filter(t=>/^boss/.test(t)); let k=0; while (k++<600 && !G.enemies.some(e=>e.E.boss&&!e.dead)) G.sim(.1); G.sim(.05); return { q, hud: document.getElementById('bossName').textContent, alive: G.enemies.filter(e=>e.E.boss&&!e.dead).map(e=>e.type) }; }")
        ok(f'{st}_final_boss', r2['q'] == [bt] and r2['hud'] == nm and bt in r2['alive'], r2)
    print('console errors:', errs); ok('no_console_errors', not errs)
    json.dump(metrics, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=1)
    for f in os.listdir(OUT):
        if f.startswith('_'): os.remove(os.path.join(OUT, f))
    n = sum(res.values()); print(f'{n}/{len(res)} ok', 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
