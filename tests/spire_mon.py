#!/usr/bin/env python3
"""🗼 무한의 탑 T-3 몬스터 적합성: 던전 맵(?dgtest=1, 가짜 Supabase)에서 탑 풀 후보를 종류별로 3마리씩 스폰 → AI 자동 전투
 판정(종류마다): 콘솔/페이지 오류 0 · 스폰됨 · 영웅 쪽으로 다가옴(끼임 없음) · 영웅이 피해를 줌(또는 처치) · 25초 안에 정리되거나 계속 싸우는 중
 결과 OK/FAIL 줄 + 마지막에 JSON 요약 (docs/SPIRE_2026-10-24.md 에 허용/제외 기록). run_all 에는 없음 (개발용)
python3 tests/spire_mon.py [종류 …]"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
CANDS = [a for a in sys.argv[1:] if not a.startswith('-')] or [
    'icewolf', 'yeti', 'wisp', 'frostgolem', 'ember_slime', 'lavahound', 'magmagolem', 'gargoyle', 'wraith', 'ruin_guard', 'shield',  # 탑 풀 후보
    'digger', 'bomber', 'firebomber', 'siege', 'charger',  # 지금 제외 — 확인만
    'boss_forest', 'boss_snow', 'boss_fire', 'boss_ruins']  # 대보스 base 모델 (sp_* 는 T-5)
srv, url = serve(); errs, res, summ = [], {}, {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.on('console', lambda m: m.type == 'error' and errs.append('CE ' + m.text[:300]))
    pg.goto(url + '?seed=4242&rng=99&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', 'spmon@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000)
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden')", timeout=20000); pg.wait_for_timeout(1000)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
    # 모든 후보 모델 미리 (탑은 T-4 에서 층 구간 모델을 출발 때 불러옴)
    J(pg, "async(L)=>{ const C=await import('./src/render/characters.js'); const M=await import('./src/data/monsters.js'); const ks=new Set(); for (const k of L) { const E=M.ETYPES[k]; if (E&&E.model) ks.add(E.model); } for (const k of ks) await C.loadModel(k).catch(()=>{}); }", CANDS)
    ok('start_errors_0', not errs, errs[:3]); errs.clear()
    CLEAR = "()=>{ const D=G.dg; D.q=[]; D.gapT=1e9; D.wave=0; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); G.sim(1.5); G.heroes.forEach(h=>{ if (h.dead>0) { h.dead=0; h.hb&&h.hb.show(true); } h.hp=h.max; }); D.gapT=1e9; return G.enemies.filter(e=>!e.dead).length; }"
    J(pg, CLEAR)
    for k in CANDS:
        errs.clear(); J(pg, CLEAR)
        r = J(pg, """(k)=>{ const D=G.dg; D.q=[k,k,k]; D.spawnT=0; G.dgDmg=1; const near=e=>Math.min(...G.heroes.filter(h=>h.dead<=0).map(h=>Math.hypot(h.g.position.x-e.g.position.x, h.g.position.z-e.g.position.z)));
            const S={spawned:0, d0:null, dmin:1e9, hurt:false, killed:0, moved:0, t:0, alive:0};
            const seen=new Map();
            for (let i=0;i<250;i++) { G.sim(.1); D.gapT=1e9; S.t=+(i*.1).toFixed(1);
              for (const e of G.enemies) if (e.type===k && !seen.has(e)) seen.set(e, {x:e.g.position.x, z:e.g.position.z, d0:null});
              for (const [e,s] of seen) { if (e.dead) continue; if (e.state==='spawn') continue; const d=near(e); if (s.d0===null) s.d0=d; S.dmin=Math.min(S.dmin,d); S.moved=Math.max(S.moved, Math.hypot(e.g.position.x-s.x, e.g.position.z-s.z)); if (e.hp<e.max-0.5) S.hurt=true; }
              if (i>30 && !D.q.length && [...seen.keys()].every(e=>e.dead)) break; }
            S.spawned=seen.size; S.killed=[...seen.keys()].filter(e=>e.dead).length; S.alive=S.spawned-S.killed; if (S.killed) S.hurt=true;
            const d0s=[...seen.values()].map(s=>s.d0).filter(x=>x!==null); S.d0=d0s.length?Math.round(Math.min(...d0s)):null; S.dmin=Math.round(S.dmin); S.moved=Math.round(S.moved);
            S.down=G.heroes.filter(h=>h.dead>0).length; return S; }""", k)
        approach = r['dmin'] <= 6 or (r['d0'] is not None and r['d0'] - r['dmin'] >= 4)
        good = not errs and r['spawned'] >= 3 and approach and r['hurt']
        summ[k] = {'ok': good, **r, 'errs': errs[:2]}
        ok(f'mon_{k}', good, json.dumps(summ[k], ensure_ascii=False))
    b.close()
print('SUMMARY', json.dumps({k: v['ok'] for k, v in summ.items()}))
print('RESULT', 'PASS' if all(res.values()) else 'FAIL', sum(res.values()), '/', len(res))
