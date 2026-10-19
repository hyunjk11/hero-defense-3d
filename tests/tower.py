#!/usr/bin/env python3
"""타워 성장(★ XP·분기) + 타워 연구소 브라우저 테스트.  python3 tests/tower.py [--shots]
  1) ?test&grow=1: 실제 처치로 XP, XP → ★★/★★★(별 표시·수치 상승), 진화 팝업 클릭/터치 선택, 6개 분기 전투(관통·집속탄·빙결), 판매 환급 = 성장 무관(무한 골드 불가)
  2) ?test (성장 없음): XP/별/장식/진화 버튼 없음
  3) 마을: 연구소 걸어가기 → 패널, 연구 클릭 구매, 새로고침 후 유지(저장 왕복)
  4) 연구 적용: 스테이지(?stage&run) · 도전 모드(지도 → 도전 시작) 출정 시 타워 수치/시작 별"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, Q, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'tower'); os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
def hook(pg): pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
BUILD3 = """()=>{ G.gold = 99999; const used = []; for (const ty of ['arrow','cannon','magic']) { const p = T_.grassNearRoute(2, 2, used); used.push(p.join(',')); G.build(p[0], p[1], ty); } return G.towers.length; }"""
popup = "()=>!document.getElementById('branchPop').classList.contains('hidden')"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ---------- 1) 성장 켜짐 ----------
    c = b.new_context(viewport={'width': 1280, 'height': 760}, has_touch=True); pg = c.new_page(); hook(pg)
    pg.goto(url + Q + '&grow=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); pg.evaluate("()=>G.choose('mage')"); pg.wait_for_timeout(1200)
    ok('built3', pg.evaluate(BUILD3) == 3)
    st0 = pg.evaluate("()=>G.towers.map(t=>({ty:t.type, s:t.stars, xp:t.xp, dmg:t.S.dmg, base:G.TOWERS[t.type].dmg[0], deco:!!t.deco, stars:t.deco?t.deco.stars.length:0}))")
    ok('start_star1', all(t['s'] == 1 and t['xp'] == 0 and t['dmg'] == t['base'] and t['deco'] and t['stars'] == 3 for t in st0), st0)
    # 실제 전투로 XP
    pg.evaluate("()=>{ G.coreHp = 999; G.startWave(); }")
    for i in range(40):
        pg.evaluate("()=>G.sim(1)")
        if pg.evaluate("()=>G.phase==='build'"): break
    xp = pg.evaluate("()=>G.towers.map(t=>Math.round(t.xp))"); kills = pg.evaluate("()=>Object.values(G.stats.kills).reduce((a,b)=>a+b,0)")
    ok('xp_from_combat', sum(xp) > 0 and kills > 0, (xp, kills))
    # XP → ★★
    r = pg.evaluate("()=>{ const t = G.towers[0], d0 = t.S.dmg, r0 = t.S.range; G.towerXp(t, G.GROW.XP_NEED[1] - t.xp); return [t.stars, t.S.dmg > d0, t.S.range > r0, t.deco.stars.filter(s=>s.material.emissive).length, t.branchPending||false]; }")
    ok('xp_to_star2', r[0] == 2 and r[1] and r[2] and r[3] == 2 and not r[4], r)
    pg.evaluate("()=>G.select(G.towers[0])"); pg.wait_for_timeout(200)
    ok('hud_shows_stars', '★★' in pg.inner_text('#tStats') and 'XP' in pg.inner_text('#tStats'), pg.inner_text('#tStats')[:80])
    # ★★★ → 진화 팝업 (자동), 터치로 선택
    pg.evaluate("()=>{ const t = G.towers[0]; G.towerXp(t, G.GROW.XP_NEED[2] - t.xp); }")
    pg.wait_for_function(popup, timeout=5000); pg.wait_for_timeout(400)
    ok('star3_popup', pg.evaluate("()=>G.towers[0].stars===3 && G.towers[0].branchPending===true && document.querySelectorAll('#branchPop .bpCard').length===2"))
    ok('evo_button', pg.evaluate("()=>!document.getElementById('tEvo').classList.contains('hidden')"))
    if SHOTS:
        pg.evaluate("()=>{ G.cam.target.set(G.towers[0].m.g.position.x, 0, G.towers[0].m.g.position.z); G.cam.r = 24; G.sim(.1); }"); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/branch_popup.png')
    d0 = pg.evaluate("()=>G.towers[0].S.dmg")
    pg.tap('#branchPop .bpCard[data-k="snipe"]'); pg.wait_for_timeout(300)
    r = pg.evaluate("()=>{ const t=G.towers[0]; return [t.branch, t.branchPending, t.S.dmg, t.S.range, document.getElementById('branchPop').classList.contains('hidden'), document.getElementById('tEvo').classList.contains('hidden')]; }")
    ok('branch_pick_touch', r[0] == 'snipe' and not r[1] and r[2] > d0 * 2 and r[4] and r[5], r)
    ok('branch_once', pg.evaluate("()=>G.chooseBranch(G.towers[0],'multi')") is False and pg.evaluate("()=>G.towers[0].branch") == 'snipe')
    # '나중에' → 타워 정보의 진화 버튼으로 다시 열기 → 클릭 선택
    pg.evaluate("()=>{ const t=G.towers[1]; G.towerXp(t, 99999); }"); pg.wait_for_function(popup, timeout=5000); pg.wait_for_timeout(300)
    pg.click('#bpLater'); pg.wait_for_timeout(200); ok('later_closes', not pg.evaluate(popup) and pg.evaluate("()=>G.towers[1].branchPending"))
    pg.evaluate("()=>G.select(G.towers[1])"); pg.wait_for_timeout(200); pg.click('#tEvo'); pg.wait_for_timeout(300); ok('evo_reopen', pg.evaluate(popup))
    pg.click('#branchPop .bpCard[data-k="pierce"]'); pg.wait_for_timeout(200); ok('cannon_pierce', pg.evaluate("()=>G.towers[1].branch") == 'pierce')
    pg.evaluate("()=>{ G.towerXp(G.towers[2], 99999); }"); pg.wait_for_function(popup, timeout=5000); pg.click('#branchPop .bpCard[data-k="frost"]'); pg.wait_for_timeout(200)
    ok('magic_frost', pg.evaluate("()=>[G.towers[2].branch, G.towers[2].S.chain, G.towers[2].S.slow]") == ['frost', 2, 0.7])
    # 나머지 분기 3개 (multi/blast/storm) 타워 추가 후 전투: 오류 없이 동작
    pg.evaluate("""()=>{ const used = G.towers.map(t=>t.c+','+t.r); for (const [ty, br] of [['arrow','multi'],['cannon','blast'],['magic','storm']]) { const p = T_.grassNearRoute(2, 3, used); if (!p) continue; used.push(p.join(',')); G.build(p[0], p[1], ty); const t = G.towers[G.towers.length-1]; G.towerXp(t, 99999); G.chooseBranch(t, br); } G.closeBranch && G.closeBranch(); }""")
    pg.wait_for_timeout(1200); pg.evaluate("()=>{ if (!document.getElementById('branchPop').classList.contains('hidden')) document.getElementById('bpLater').click(); }")
    brs = pg.evaluate("()=>G.towers.map(t=>t.branch)"); ok('six_branches', sorted(x for x in brs if x) == sorted(['snipe', 'pierce', 'frost', 'multi', 'blast', 'storm']), brs)
    pg.evaluate("""()=>{ window.__pp = { pierceMax: 0, frozen: 0, multi: 0 }; const f = G.sim; G.sim = (sec, h=.05) => { for (let t=0;t<sec;t+=h) { f(h, h); for (const p of G.projs) if (p.kind==='pierce') __pp.pierceMax = Math.max(__pp.pierceMax, p.hit.size); __pp.frozen += G.enemies.filter(e=>e.frozen&&!e.dead).length ? 1 : 0; __pp.multi = Math.max(__pp.multi, G.projs.filter(p=>p.kind==='arrow'&&p.color===0x7affc0).length); } }; G.coreHp = 999; G.wave = 5; G.startWave(); }""")
    for i in range(60):
        pg.evaluate("()=>G.sim(1)")
        if pg.evaluate("()=>G.phase==='build'"): break
    pp = pg.evaluate("()=>__pp"); ok('branches_in_combat', pp['frozen'] > 0 and pp['multi'] >= 2 and pp['pierceMax'] >= 1, pp)
    if SHOTS:
        pg.evaluate("()=>{ G.select(null); G.wave = 6; G.startWave(); G.sim(6); const t = G.towers[0]; G.cam.target.set(t.m.g.position.x + 2, 0, t.m.g.position.z); G.cam.r = 26; G.cam.phi = .95; G.sim(.1); }"); pg.wait_for_timeout(600)
        pg.screenshot(path=f'{OUT}/stars_ingame.png')
        pg.evaluate("()=>{ for (let i=0;i<80 && G.phase!=='build';i++) G.sim(1); }")
    # 판매: 환급은 투자 골드 기준(별·분기 무관) → 별 올린 타워를 사고팔아도 골드가 늘지 않음
    pg.evaluate("()=>{ G.coreHp = 999; for (const t of G.towers) { t.hp = t.max; } }")
    r = pg.evaluate("""()=>{ const t = G.towers[0], g0 = G.gold, inv = t.invest; G.select(t); G.sellTower(t); return [G.gold - g0, Math.floor(inv * .7)]; }""")
    ok('sell_refund_invest_only', r[0] == r[1], r)
    r = pg.evaluate("""()=>{ const g0 = G.gold; const p = T_.grassNearRoute(2, 3, G.towers.map(t=>t.c+','+t.r)); for (let i = 0; i < 5; i++) { G.build(p[0], p[1], 'arrow'); const t = G.towers[G.towers.length-1]; G.towerXp(t, 99999); G.chooseBranch(t, 'multi'); t.hp = t.max; G.sellTower(t); } return [g0, G.gold]; }""")
    pg.wait_for_timeout(1200); pg.evaluate("()=>{ if (!document.getElementById('branchPop').classList.contains('hidden')) document.getElementById('bpLater').click(); }")
    ok('no_infinite_money', r[1] < r[0], r)
    c.close()
    # ---------- 2) 성장 꺼짐 (?test) ----------
    c = b.new_context(viewport={'width': 1280, 'height': 760}); pg = c.new_page(); hook(pg)
    pg.goto(url + Q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); pg.evaluate("()=>G.choose('archer')"); pg.wait_for_timeout(800); pg.evaluate(BUILD3)
    r = pg.evaluate("()=>{ const t = G.towers[0]; const up = G.towerXp(t, 99999); G.select(t); return [G.grow, up, t.stars, t.xp, !!t.deco, t.S.dmg === G.TOWERS[t.type].dmg[0]]; }"); pg.wait_for_timeout(200)
    ok('nogrow_inert', r == [False, 0, 1, 0, False, True], r)
    ok('nogrow_ui', pg.evaluate("()=>document.getElementById('tEvo').classList.contains('hidden')") and '★' not in pg.inner_text('#tStats'))
    c.close()
    # ---------- 3) 마을 연구소 + 저장 왕복 ----------
    c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); pg.wait_for_timeout(500)
    pg.evaluate("()=>{ localStorage.setItem('hd3d_save', JSON.stringify({ souls: 5000, mat: { steel: 200, crystal: 40 }, stats: { runs: 2 } })); }")
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(1000)
    if SHOTS:
        pg.evaluate("()=>{ const [x,z,fx,fz]=G.townLab(); G.townTeleport(fx+6, fz+1); window.__k=setInterval(()=>{G.cam.target.set(x+1,3.2,-150+z); G.cam.r=22; G.cam.phi=1.02; G.cam.theta=-.55;},16); }"); pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/lab_building.png'); pg.evaluate("()=>clearInterval(window.__k)")
    pg.evaluate("()=>{ const [x,z,fx,fz]=G.townLab(); G.townTeleport(fx+3, fz+2); G.townGoal(fx, fz); }")
    pg.wait_for_function("()=>!document.getElementById('labPanel').classList.contains('hidden')", timeout=15000); ok('walk_opens_lab', True)
    for t, k, n in [('arrow', 'atk', 3), ('arrow', 'spd', 1), ('cannon', 'rng', 2)]:
        pg.click(f'#labTabs .ftab[data-t="{t}"]'); pg.wait_for_timeout(150)
        for i in range(n): pg.click(f'#labBody .labRow[data-k="{k}"] .lrBtn'); pg.wait_for_timeout(120)
    sv = pg.evaluate("()=>JSON.parse(localStorage.getItem('hd3d_save'))")
    ok('lab_buy_clicks', sv['research']['arrow']['atk'] == 3 and sv['research']['arrow']['spd'] == 1 and sv['research']['cannon']['rng'] == 2 and sv['souls'] < 5000 and sv['mat']['steel'] < 200, (sv['research'], sv['souls'], sv['mat']))
    ok('late_locked', pg.evaluate("()=>document.querySelector('#labBody .labRow[data-k=\"start\"] .lrBtn').disabled"))
    if SHOTS: pg.click('#labTabs .ftab[data-t="arrow"]'); pg.wait_for_timeout(700); pg.screenshot(path=f'{OUT}/lab_panel.png')
    pg.click('#labClose'); pg.wait_for_timeout(200); ok('lab_close', pg.evaluate("()=>document.getElementById('labPanel').classList.contains('hidden')"))
    pg.reload(); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    ok('save_roundtrip', pg.evaluate("()=>{ const s = G.gear.Acc.load(); return [s.research.arrow.atk, s.research.arrow.spd, s.research.cannon.rng, s.research.magic.atk]; }") == [3, 1, 2, 0])
    c.close()
    # ---------- 4) 연구 적용: 스테이지 / 도전 모드 ----------
    RS = json.dumps({ 'souls': 10, 'stats': { 'runs': 2 }, 'research': { 'arrow': { 'atk': 10, 'rng': 5, 'spd': 8, 'start': 4 }, 'magic': { 'atk': 2, 'start': 2 } } })
    c = b.new_context(viewport={'width': 1280, 'height': 760}); c.add_init_script(MOCK); c.add_init_script(f"if (!sessionStorage.getItem('__seeded')) {{ sessionStorage.setItem('__seeded','1'); localStorage.setItem('hd3d_save', JSON.stringify({RS})); }}"); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&flow=1&stage=1-1&run=1'); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=120000); pg.evaluate(HELP); pg.evaluate("()=>{ G.manual = true; }")
    pg.evaluate(BUILD3)
    r = pg.evaluate("()=>G.towers.map(t=>[t.type, t.stars, Math.round(t.xp), +(t.S.dmg / G.TOWERS[t.type].dmg[0]).toFixed(4), +(t.S.range / G.TOWERS[t.type].range[0]).toFixed(4), +(t.S.rate / G.TOWERS[t.type].rate[0]).toFixed(4)])")
    # arrow: 연구 피해 1.4 × ★★ 1.2 = 1.68, 사거리 1.15 × 1.05, 공속 1.24 × 1.08 · cannon: 연구 없음 · magic: 피해 1.08, 시작 XP 240(★1)
    ok('stage_research_applied', r[0][1] == 2 and r[0][2] == 1680 and abs(r[0][3] - 1.68) < 1e-3 and abs(r[0][4] - 1.2075) < 1e-3 and abs(r[0][5] - 1.3392) < 1e-3 and r[1][1:] == [1, 0, 1, 1, 1] and r[2][1] == 1 and r[2][2] == 240 and abs(r[2][3] - 1.08) < 1e-3, r)
    # 도전 모드: 마을 → 지도 → 도전 시작
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); pg.wait_for_timeout(500)
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
    pg.click('#twGo'); pg.wait_for_timeout(400); pg.click('#stTabs .chtab.chal'); pg.wait_for_timeout(300); pg.click('#stChalGo')
    pg.wait_for_function("()=>G.phase==='build' && G.hero", timeout=30000); pg.evaluate(HELP); pg.evaluate("()=>{ G.manual = true; }")
    pg.evaluate(BUILD3)
    r = pg.evaluate("()=>[G.stage||null, G.grow, G.towers.map(t=>[t.type, t.stars, +(t.S.dmg / G.TOWERS[t.type].dmg[0]).toFixed(4)])]")
    ok('challenge_research_applied', r[0] is None and r[1] and r[2][0] == ['arrow', 2, 1.68] and r[2][1] == ['cannon', 1, 1], r)
    c.close(); b.close()
print('errors', errs); ok('no_console_errors', not errs)
print(f"{sum(res.values())}/{len(res)}", 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
