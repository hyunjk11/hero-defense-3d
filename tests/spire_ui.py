#!/usr/bin/env python3
"""🗼 무한의 탑 T-8 입장 화면 (가짜 Supabase tests/sbmock.js · 데스크톱 1440x860 만 — 태블릿 테스트 없음)
 SP_LIVE(T-10 공개) = ?sptest 없어도 탭 · 탭 [⚔ 원정][🗼 무한의 탑][🏪 상점] · 시작 층 칩(체크포인트 · 🔒 다음) · 다음 5개 층 미리보기(어픽스) · 다음 첫 돌파 보상 ·
 탑 전용 파티(hd3d_sppick) · 랭킹(이번 주/전체 · 내 순위) · 11층 출발 = 정식 · HUD 🗼 줄 · 결과 화면 · 서버 업데이트 필요 · 콘솔 오류 0
python3 tests/spire_ui.py [--shots]   (스크린샷 /workspace/report_shots/spire_*.png)"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = os.environ.get('SP_SHOTS', '/workspace/report_shots')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:500], flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name):
    if SHOTS: os.makedirs(OUT, exist_ok=True); J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=240000); print('shot', f'{OUT}/{name}.png')
txt = lambda pg, sel: J(pg, f"()=>(document.querySelector('{sel}')||{{}}).innerText||''")
def login(pg, q, email):
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(300)
def town(pg):
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(500)
def openp(pg):
    J(pg, "()=>{ const c=document.getElementById('dgClose'); if (c) c.click(); G.openDungeon(); }"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden') && document.querySelectorAll('.dgCard').length>=3", timeout=20000); pg.wait_for_timeout(400)
def spire_tab(pg, want='#spGo'):
    pg.click('#dgTabs [data-view=spire]'); pg.wait_for_function(f"()=>!!document.querySelector('{want}') && !/확인 중/.test((document.getElementById('spHead')||{{}}).innerText||'')", timeout=20000); pg.wait_for_timeout(300)
SEED = """()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const me=Object.values(d.users)[0].id; const k=new Date(Date.now()+9*3600e3), dow=(k.getUTCDay()+6)%7, wk=new Date(Date.UTC(k.getUTCFullYear(),k.getUTCMonth(),k.getUTCDate()-dow)).toISOString().slice(0,10);
  d.sp_best={...(d.sp_best||{}), [me]:{best:12, at:Date.now()-5e6, cleared:10}, o1:{best:31, at:Date.now()-9e6, cleared:30}, o2:{best:18, at:Date.now()-8e6, cleared:15}};
  d.sp_weeks={...(d.sp_weeks||{}), [me+'|'+wk]:{user_id:me, week:wk, best:12, at:Date.now()-5e6}, ['o1|'+wk]:{user_id:'o1', week:wk, best:24, at:Date.now()-9e6}, ['o2|'+wk]:{user_id:'o2', week:wk, best:12, at:Date.now()-9.5e6}};
  d.hd3d_profiles={...(d.hd3d_profiles||{}), o1:{nickname:'별빛기사'}, o2:{nickname:'눈꽃마녀'}, [me]:{...((d.hd3d_profiles||{})[me]||{}), nickname:'나의용사'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); return wk; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ---- T-10 공개: ?sptest 없어도 탭 [⚔ 원정][🗼 무한의 탑][🏪 상점] ----
    c0 = b.new_context(viewport={'width': 1440, 'height': 860}); c0.add_init_script(MOCK); p0 = c0.new_page(); p0.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    login(p0, '?seed=5171&rng=51&flow=1&dgtest=1', 'spu0@test.kr'); town(p0); openp(p0)
    ok('live_no_sptest_tabs', J(p0, "()=>!!document.getElementById('dgTabs') && !!document.querySelector('#dgTabs [data-view=spire]')"), txt(p0, '#dgPanel .gtitle'))
    c0.close()
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append('CE ' + m.text[:300]))
    login(pg, '?seed=5172&rng=52&flow=1&dgtest=1&sptest=1', 'spu1@test.kr'); town(pg); openp(pg)
    tb = J(pg, "()=>[...document.querySelectorAll('#dgTabs .ftab')].map(b=>[b.dataset.view, b.textContent, b.classList.contains('on')])")
    ok('tabs_three', [x[0] for x in tb] == ['party', 'spire', 'shop'] and tb[0][2] and '무한의 탑' in tb[1][1], tb)
    spire_tab(pg)
    v = J(pg, "()=>({t:document.querySelector('#dgPanel .gtitle').textContent, chips:[...document.querySelectorAll('.spChip')].map(b=>[b.textContent,b.disabled,b.classList.contains('on')]), pv:[...document.querySelectorAll('.spPv .spPvN')].map(e=>e.textContent), next:document.getElementById('spNext').innerText, go:document.getElementById('spGo').textContent, head:document.getElementById('spHead').innerText, cards:document.querySelectorAll('.spParty .dgCard.pick').length})")
    ok('spire_tab_fresh', '무한의 탑' in v['t'] and v['chips'][0] == ['1층', False, True] and v['chips'][-1][1] and '6층' in v['chips'][-1][0] and v['pv'] == ['1층', '2층', '3층', '4층', '5층'] and '5층' in v['next'] and '영혼석 400' in v['next'] and '1층부터' in v['go'] and '최고 0층' in v['head'] and '30/30' in v['head'] and v['cards'] >= 3, v)
    wk = J(pg, SEED); openp(pg); spire_tab(pg)
    v = J(pg, "()=>({chips:[...document.querySelectorAll('.spChip')].map(b=>[b.textContent,b.disabled,b.classList.contains('on')]), head:document.getElementById('spHead').innerText, go:document.getElementById('spGo').textContent})")
    ok('chips_checkpoints', [x[0] for x in v['chips']] == ['1층', '6층', '11층', '🔒 16층'] and v['chips'][2][2] and v['chips'][3][1] and '11층부터' in v['go'] and '최고 12층' in v['head'] and '이번 주 12층' in v['head'] and '주간 3위' in v['head'], v)
    pg.click('.spChip[data-from="6"]'); pg.wait_for_timeout(200)
    v = J(pg, "()=>({pv:[...document.querySelectorAll('.spPv')].map(e=>[e.querySelector('.spPvN').textContent, e.className, e.querySelectorAll('.spAff').length, [...e.querySelectorAll('.spAff')].map(a=>a.title)]), cu:document.querySelector('.spCu').textContent, go:document.getElementById('spGo').textContent, next:document.getElementById('spNext').innerText})")
    ok('preview_from6_affixes', [x[0] for x in v['pv']] == ['6층', '7층', '8층', '9층', '10층'] and 'boss' in v['pv'][4][1] and 'elite' in v['pv'][2][1] and all(x[2] >= 1 for x in v['pv'][:4]) and all('—' in t for x in v['pv'] for t in x[3]) and '출발 축복 없음' in v['cu'] and '6층부터' in v['go'] and '15층' in v['next'], v)
    pg.click('.spChip[data-from="11"]'); pg.wait_for_timeout(200); ok('catchup_11', '출발 축복 1번' in txt(pg, '.spCu'), txt(pg, '.spCu'))
    shot(pg, 'spire_tab')
    # 탑 전용 파티: 카드 토글은 hd3d_sppick 에만 (원정 hd3d_dgpick 그대로)
    dg0 = J(pg, "()=>localStorage.getItem('hd3d_dgpick')")
    pg.click('.spParty .dgCard.pick[data-cls="archer"]'); pg.wait_for_timeout(200)
    pk = J(pg, "()=>[localStorage.getItem('hd3d_sppick'), localStorage.getItem('hd3d_dgpick'), document.getElementById('spPickN').innerText]")
    ok('own_party_key', pk[0] and 'archer' not in json.loads(pk[0]) and pk[1] == dg0 and '출전 2' in pk[2], (pk, dg0))
    pg.click('.spParty .dgCard.pick[data-cls="archer"]'); pg.wait_for_timeout(200)
    # 랭킹
    pg.click('#spRankBtn'); pg.wait_for_function("()=>document.querySelectorAll('.spRk').length>=1", timeout=20000)
    rk = J(pg, "()=>({rows:[...document.querySelectorAll('.spRk')].map(r=>[r.querySelector('.spRkNick').textContent, r.querySelector('.spRkF').textContent, r.classList.contains('me')]), me:document.getElementById('spRkMe').innerText})")
    ok('rank_week', [x[0] for x in rk['rows']] == ['별빛기사', '눈꽃마녀', '나의용사 (나)'] and rk['rows'][2][2] and '3위' in rk['me'], rk)
    shot(pg, 'spire_rank')
    pg.click('.spRkTabs [data-k=all]'); pg.wait_for_function("()=>G.spRank && G.spRank.kind==='all' && document.querySelectorAll('.spRk').length>=3", timeout=20000)
    rk = J(pg, "()=>({rows:[...document.querySelectorAll('.spRk')].map(r=>[r.querySelector('.spRkNick').textContent, r.querySelector('.spRkF').textContent]), me:document.getElementById('spRkMe').innerText})")
    ok('rank_all', [x[1] for x in rk['rows']] == ['31층', '18층', '12층'] and '3위' in rk['me'], rk)
    pg.click('#spRkBack'); pg.wait_for_timeout(200); ok('rank_back', J(pg, "()=>!!document.getElementById('spGo')"))
    # 상점 탭 · 원정 탭 왕복
    pg.click('#dgTabs [data-view=shop]'); pg.wait_for_timeout(400); a = txt(pg, '#dgPanel .gtitle')
    pg.click('#dgTabs [data-view=party]'); pg.wait_for_timeout(400); bq = J(pg, "()=>!!document.getElementById('dgStart')")
    ok('tabs_shop_party', '던전 상점' in a and bq, a)
    ok('errors_0_ui', not errs, errs[:4]); errs.clear()
    # 11층 출발 → 정식 탑 · 탑 파티 · HUD 🗼 줄
    spire_tab(pg); pg.click('.spChip[data-from="11"]'); pg.wait_for_timeout(200); pg.click('#spGo')
    pg.wait_for_function("()=>window.G&&G.dungeon&&G.heroes&&G.heroes.length>=3&&G.spire", timeout=300000); J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
    s = J(pg, "()=>({mode:G.dgEntryMode, from:G.spire.from, party:G.dg.party, bless:!!G.dg.blessing})")
    ok('depart_11_ranked', s['mode'] == 'ranked' and s['from'] == 11 and s['bless'], s)
    J(pg, "()=>{ for (let i=0;i<3 && G.dg.blessing;i++) { G.dgTakeBless(G.dg.blessing[0]); G.sim(.1); } }")
    J(pg, "()=>{ for (let i=0;i<70;i++) G.sim(.1); }")
    hud = J(pg, "()=>({hud:document.getElementById('dgFloor').textContent, f:G.dg.floors[G.dg.floor].floor, aff:G.dg.floors[G.dg.floor].affixes, n:G.enemies.filter(e=>!e.dead).length})")
    ok('hud_affix_line', hud['f'] == 11 and hud['hud'].startswith('🗼 11층') and len(hud['aff']) >= 1 and '웨이브' in hud['hud'], hud)
    shot(pg, 'spire_floor')
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); for (const r of Object.values(d.sp_runs||{})) if (r.status==='active') r.started-=3600e3; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    for i in range(4):  # 11~14층 돌파 → 15층 중간 보스 돌파
        J(pg, "()=>{ const D=G.dg, F=D.floors[D.floor]; D.q=[]; D.qe=[]; D.wave=F.waves.length-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9); G.sim(2.5); for (let i=0;i<40 && (D.nextT>0);i++) G.sim(.1); }")
    J(pg, "()=>{ const D=G.dg; D.wave=0; D.q=[]; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); G.sim(.2); const F=D.floors[D.floor]; D.q=[]; D.qe=[]; D.wave=F.waves.length-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9); G.sim(2.5); }")
    pg.wait_for_function("()=>G.spire.pings.length>=1", timeout=20000)
    J(pg, "()=>{ for (let i=0;i<5 && G.dg.blessing;i++) { G.dgTakeBless(G.dg.blessing[0]); G.sim(.2); } G.sim(1); G.heroes.forEach(h=>{ h.hp=0; h.dead=5; }); G.sim(.5); }")
    pg.wait_for_function("()=>{ const m=document.getElementById('spRecRes'); return m && !/저장 중/.test(m.textContent); }", timeout=20000)
    rr = J(pg, "()=>({t:document.querySelector('#stageClear .scT').textContent, rw:document.querySelector('#stageClear .scRw').innerText, r:G.dgResult})")
    ok('result_ranked_15', '15층 돌파' in rr['t'] and '신기록' in rr['rw'] and '최고 기록 15층' in rr['rw'] and '영혼석 +' in rr['rw'] and rr['r']['server']['top'] == 15, rr)
    J(pg, "()=>{ const e=document.getElementById('esPanel')||document.querySelector('.endStats'); if (e && !e.classList.contains('hidden')) e.classList.add('hidden'); }")
    shot(pg, 'spire_result')
    ok('errors_0_run', not errs, errs[:4]); errs.clear()
    # 서버 업데이트 필요 (noSpire)
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); pg.wait_for_timeout(400)
    J(pg, "()=>localStorage.setItem('__mockflags', '{\"noSpire\":true}')"); openp(pg); spire_tab(pg)
    v = J(pg, "()=>({head:document.getElementById('spHead').innerText, chips:[...document.querySelectorAll('.spChip[data-from]')].map(b=>b.dataset.from)})")
    ok('missing_tab', '서버 업데이트 필요' in v['head'] and v['chips'] == ['1'], v)
    pg.click('#spRankBtn'); pg.wait_for_function("()=>/서버 업데이트 필요/.test(document.getElementById('spRkList').innerText)", timeout=20000); ok('missing_rank_msg', True)
    J(pg, "()=>localStorage.setItem('__mockflags', '{}')")
    ok('errors_0_missing', not errs, errs[:4])
    b.close()
print('RESULT', 'PASS' if all(res.values()) else 'FAIL', sum(res.values()), '/', len(res))
