#!/usr/bin/env python3
"""폐허(4장) 가독성 · 블룸 검사 + 스크린샷.  python3 tests/ruinsvis.py [--shots]
1) 4-1..4-4: 건설 단계(판 전체) + 웨이브 진행 중(몬스터·넋)을 1024x633에서 찍어 판 영역 밝기/대비 측정
   평균 50..175 (어둡지 않음), 표준편차 > 22, 하얗게 날아간(>=245) 픽셀 < 3% (유령불 블룸·안개가 하얗게 덮지 않음), 완전 검정(<6) < 15%
   + 가장자리 안개만: 판 영역 평균 채도/대비가 안개에 묻히지 않음(판 중앙 대비 > 18), 고대 성벽 칸 존재
2) 4-4 보스(망국의 왕): 소환 예고 + 저주 봉인 + 어둠의 파동(2페이즈) 상태에서 같은 기준, 장면 NaN 없음, 보스 바 이름
3) 유령불 셰이더: uv 밖/긴 시간에도 유한·0..1.3, 4) 콘솔 오류 0.  --shots: shots/chapter4/4-1.png..4-4.png (웨이브 진행 중), boss.png"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import regress
from regress import ARGS, Q
from playwright.sync_api import sync_playwright
from PIL import Image; import numpy as np
SHOTS = '--shots' in sys.argv
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'chapter4'); os.makedirs(OUT, exist_ok=True)
srv, url = regress.serve(); errs, res, metrics = [], {}, {}
STAGE_SP = {'4-1': 2, '4-2': 3, '4-3': 4, '4-5': 4, '4-6': 4, '4-4': 4}; STAGE_SP = {k: [0] * v for k, v in STAGE_SP.items()}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
def board(path):
    a = np.asarray(Image.open(path).convert('L'), dtype=float); h, w = a.shape; b = a[int(h * .24):int(h * .88), int(w * .19):int(w * .8)]
    c = a[int(h * .4):int(h * .72), int(w * .35):int(w * .65)]  # 판 중앙: 안개가 덮으면 대비가 사라짐
    return {'mean': round(b.mean(), 1), 'std': round(b.std(), 1), 'clip': round(float((b >= 245).mean()) * 100, 2), 'black': round(float((b < 6).mean()) * 100, 1), 'mid': round(c.std(), 1)}
good = lambda m: 50 <= m['mean'] <= 175 and m['std'] > 22 and m['clip'] < 3 and m['black'] < 15 and m['mid'] > 18
NAN = "()=>{ let bad=0; G.scene.traverse(o=>{ const p=o.position; if(!isFinite(p.x)||!isFinite(p.y)||!isFinite(p.z)) bad++; }); for (const e of G.enemies) if(!isFinite(e.hp)) bad++; return bad; }"
def shot(pg, name):
    pg.evaluate("()=>{ G.pauseRender=false; for (const id of ['note','banner']) { const e=document.getElementById(id); if (e) e.style.visibility='hidden'; } }"); pg.wait_for_timeout(1600); p = os.path.join(OUT, name + '.png'); pg.screenshot(path=p); m = board(p)
    if not SHOTS: os.remove(p)
    pg.evaluate("()=>{ for (const id of ['note','banner']) { const e=document.getElementById(id); if (e) e.style.visibility=''; } }"); return m
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1024, 'height': 633})
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    for st in ['4-1', '4-2', '4-3', '4-5', '4-6', '4-4']:  # 4-5·4-6 = 2026-10-21 새 스테이지 (보스 4-4 앞)
        pg.goto(url + Q + '&stage=' + st, timeout=120000); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate("()=>G.choose('gunner')")
        pg.evaluate("()=>{ G.manual=true; G.sim(.5); }"); pg.wait_for_timeout(3200)
        m = metrics[st + '_build'] = shot(pg, f'_{st}_build'); ok(f'{st}_build_readable', good(m), m)
        ok(f'{st}_walls', pg.evaluate("()=>G.tiles.flat().filter(t=>t.wall).length") >= 12 and pg.evaluate("()=>G.SPAWNS.length") == len(STAGE_SP[st]))
        # 1웨이브: 타워 몇 개 + 몬스터 진행 + 불씨
        pg.evaluate("""()=>{ G.gold=2000; const R=G.route||[], inG=(c,r)=>c>=0&&r>=0&&c<G.GW&&r<G.GH; let n=0; const types=['arrow','cannon','magic'];
          for (let i=4; i<R.length && n<3; i+=5) { const [c,r]=R[i]; let done=false; for (const [dc,dr] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,-1],[0,2],[0,-2]]) { const cc=c+dc, rr=r+dr; if (done||!inG(cc,rr)) continue; if (G.buildReason(cc,rr,types[n])===null && G.build(cc,rr,types[n])) { n++; done=true; } } }
          G.startWave(); G.sim(14); G.cam.r=50; G.sim(.05); }""")
        m = metrics[st] = shot(pg, st); ok(f'{st}_wave_readable', good(m) and pg.evaluate("()=>G.enemies.length") > 0, m)
        ok(f'{st}_no_nan', pg.evaluate(NAN) == 0)
    # 보스: 4-4 최종 웨이브, 망국의 왕을 타워 근처로 → 저주 + 소환 예고 + 어둠의 파동(2페이즈)
    r = pg.evaluate("""()=>{ G.coreHp=G.coreMax=1e6; for (const e of [...G.enemies]) G.hurt(e,1e9,'#fff',false); G.sim(3); G.phase='build'; G.wave=14; G.startWave(); const q0=[...G.spawnQ]; G.spawnQ=G.spawnQ.filter(t=>t==='boss_ruins'); let k=0; while (G.spawnQ.length && k++<100) G.sim(.1);
        const bs=G.enemies.find(e=>e.type==='boss_ruins'); const tw=G.towers[0]; const [x,z]=G.tileXZ(tw.c,tw.r); bs.g.position.set(x+3,0,z+1.5); bs.tile=G.toTile(x+3,z+1.5); bs.state='walk'; bs.spawnT=0; bs.E=Object.assign({},bs.E,{spd:1e-4});
        bs.abT.curse=.05; G.sim(2.2); bs.hp=bs.max*.45; G.sim(2.6); bs.abT.summon=.05; G.sim(.7); G.hero.g.position.set(x-4,0,z+4); G.cam.target.set(bs.g.position.x-1,0,bs.g.position.z+2); G.cam.r=30; G.sim(.05);
        return { q: q0.filter(t=>/^boss/.test(t)), hud: document.getElementById('bossName').textContent, boss: !!bs, p2: !!bs.phase2, curses: G.stats.curses||0, dreads: G.stats.dreads||0, summonMarks: G.scene.children.filter(m=>m.userData&&m.userData.dread).length, cursed: G.towers.filter(t=>t.curseT>0).length, dark: !!bs.shDark }; }""")
    ok('boss_final_wave_only_ruins', r['q'] == ['boss_ruins'] and r['hud'] == '망국의 왕', {'q': r['q'], 'hud': r['hud']})
    ok('boss_scene', r['boss'] and r['p2'] and r['curses'] >= 1 and r['dreads'] == 1 and r['summonMarks'] >= 3 and r['dark'], r)
    m = metrics['boss'] = shot(pg, 'boss'); ok('boss_readable', good(m), m); ok('boss_no_nan', pg.evaluate(NAN) == 0)
    r3 = pg.evaluate("()=>{ G.sim(1.2); return { guards: G.enemies.filter(e=>e.type==='ruin_guard'&&!e.dead).length, marks: G.scene.children.filter(m=>m.userData&&m.userData.dread).length }; }")
    ok('boss_summoned_guards', r3['guards'] >= 3 and r3['marks'] == 0, r3)
    # 유령불 셰이더: uv 밖(-0.05, 1.05)과 긴 시간(999.9)에도 유한, 0..1.3
    fl = pg.evaluate(r"""()=>{ const T=G.THREE; let mat=null; G.scene.traverse(o=>{ if(o.material&&o.material.uniforms&&o.material.uniforms.cA) mat=o.material; }); if(!mat) return null; const out=[];
      const geo=new T.PlaneGeometry(2,2), uv=geo.attributes.uv;
      for (const t of [0, 1.7, 333.3, 999.9]) for (const v of [-.05, 0, .3, .7, 1, 1.05]) { for(let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i) < .5 ? .3 : .5, v); uv.needsUpdate=true;
        const m=mat.clone(); m.blending=T.NoBlending; m.uniforms=T.UniformsUtils.clone(mat.uniforms); m.uniforms.uT.value=t; const q=new T.Mesh(geo,m), sc=new T.Scene(); sc.add(q); const cam=new T.OrthographicCamera(-1,1,1,-1,0,10); cam.position.z=1;
        const rt=new T.WebGLRenderTarget(4,4,{type:T.FloatType}); const R=G.renderer, prev=R.getRenderTarget(); R.setRenderTarget(rt); R.setClearColor(0,0); R.clear(); R.render(sc,cam); const px=new Float32Array(64); R.readRenderTargetPixels(rt,0,0,4,4,px); R.setRenderTarget(prev); rt.dispose();
        out.push([t, v, Math.min(...px), Math.max(...px), px.every(Number.isFinite)]); }
      return out; }""")
    ok('ghostfire_shader_finite', fl and all(x[4] and x[2] >= -1e-6 and x[3] <= 1.3001 for x in fl), (fl or [])[:3])
    # 1-6 / 2-4 / 3-4 / 4-4 최종 웨이브: 챕터 보스 1마리만 (해골 군주 X), 보스 HP 바 이름 = 챕터 보스 이름
    for st, bt, nm in [('1-6', 'boss_forest', '숲의 군주'), ('2-4', 'boss_snow', '빙결의 군주'), ('3-4', 'boss_fire', '화염의 군주'), ('4-4', 'boss_ruins', '망국의 왕')]:
        pg.goto(url + Q + '&stage=' + st, timeout=120000); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate("()=>G.choose('gunner')")
        r2 = pg.evaluate("()=>{ G.manual=true; G.coreHp=G.coreMax=1e6; G.phase='build'; G.wave=14; G.startWave(); const q=G.spawnQ.filter(t=>/^boss/.test(t)); let k=0; while (k++<600 && !G.enemies.some(e=>e.E.boss&&!e.dead)) G.sim(.1); G.sim(.05); return { q, hud: document.getElementById('bossName').textContent, alive: G.enemies.filter(e=>e.E.boss&&!e.dead).map(e=>e.type) }; }")
        ok(f'{st}_final_boss', r2['q'] == [bt] and r2['hud'] == nm and bt in r2['alive'], r2)
    print('console errors:', errs); ok('no_console_errors', not errs)
    json.dump(metrics, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=1)
    for f in os.listdir(OUT):
        if f.startswith('_'): os.remove(os.path.join(OUT, f))
    n = sum(res.values()); print(f'{n}/{len(res)} ok', 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
