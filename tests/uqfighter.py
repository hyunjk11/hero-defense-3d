#!/usr/bin/env python3
"""서윤 고유 무기 '묘신 너클 호랑냥이'(d_fist) 브라우저 테스트 (가짜 Supabase tests/sbmock.js).  python3 tests/uqfighter.py
던전 상점 목록(🏅450 · 부족/구매/보유 중) → 우편 받기 → 도감 고유 칸 → 두 번째 구매 막힘 →
메달 원정 완주: 드롭 실패 = 천장 +1 · 드롭(목 플래그 dgUqRoll) = 결과 화면 알림 + 우편 → 연습 원정(게스트) = 드롭/메달 없음 →
[E] 묘신 냥발 장풍: 직선 관통(비행 포함) · 밀쳐내기 · 받는 피해 증가 · ★3 냥발 도장 폭발(기절) · 콘솔 오류 0.
스크린샷 shots/seoyun/: uq_shop.png, uq_shop_owned.png, uq_codex.png, uq_drop_result.png, uq_catpaw.png"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/seoyun'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !e || e.classList.contains('hidden'); }}")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name, sel=None):
    J(pg, RAF)
    if sel: pg.locator(sel).screenshot(path=f'{OUT}/{name}.png', timeout=180000)
    else: pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000)
    J(pg, "()=>{ G.pauseRender=false }")
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb')||'{}')")
def setdb(pg, js): J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; " + js + "; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
flags = lambda pg, f: J(pg, "(f)=>localStorage.setItem('__mockflags', JSON.stringify(f))", f)
def page(b, vp=(1280, 800)):
    c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    return c, pg
def login(pg, email):
    pg.goto(url + '?seed=12345&rng=777&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(400)
    J(pg, "()=>G.gear.Acc.update(d=>{ d.souls=50; d.stats={runs:1,kills:1,waves:1,souls:1}; return d; })")
    town(pg)
def town(pg): J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(600)
def shop(pg, medals):
    J(pg, "()=>{ const p=document.getElementById('dgPanel'); if (p && !p.classList.contains('hidden')) document.getElementById('dgClose').click(); G.openDungeon(); }")
    pg.wait_for_function("()=>!!document.getElementById('dgShopBtn')", timeout=30000); pg.click('#dgShopBtn')
    pg.wait_for_function(f"()=>document.querySelectorAll('.dgShopIt').length===6 && document.getElementById('dgShopMedals').textContent==='{medals}'", timeout=30000); pg.wait_for_timeout(300)
UQI = "()=>{ const e=document.querySelector('.dgShopIt[data-id=dg_uq_fist]'); return e && { cls:e.className, txt:e.innerText, btn:e.querySelector('button').textContent, dis:e.querySelector('button').disabled }; }"
BACKDATE = "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); for (const r of Object.values(d.dg_runs||{})) if (r.status==='active') r.started-=3600e3; localStorage.setItem('__mockdb', JSON.stringify(d)); }"
MEDALS = "()=>!!(G.dgResult && G.dgResult.medals)"
def ranked_win(pg):
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!!document.getElementById('dgStart') && !document.getElementById('dgStart').disabled && (document.getElementById('dgDay')||{}).innerText.includes('남은 입장')", timeout=30000)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }"); J(pg, BACKDATE)
    J(pg, "async()=>{ (await import('./src/dungeon/run.js')).dgFinish(true); }"); pg.wait_for_function(MEDALS, timeout=30000); pg.wait_for_timeout(400)
    return J(pg, "()=>G.dgResult")
def claim_all(pg):
    pg.click('#twMail'); pg.wait_for_function("()=>document.querySelectorAll('#mailList .mClaim').length>=1", timeout=20000)
    while J(pg, "()=>document.querySelectorAll('#mailList .mClaim').length") > 0:
        n = J(pg, "()=>document.querySelectorAll('#mailList .mClaim').length"); pg.click('#mailList .mClaim >> nth=0')
        pg.wait_for_function(f"()=>document.querySelectorAll('#mailList .mClaim').length<{n}", timeout=20000); pg.wait_for_timeout(300)
    t = pg.inner_text('#mailMsg'); pg.click('#mailClose'); return t
OWNS = "()=>G.gear.E.ownsUnique(G.gear.Acc.load(),'d_fist')"

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 1) 던전 상점: 449 = 부족 → 450 = 구매 → 우편 → 받기 → 보유 중 · 다시 못 삼 =====
    c, pg = page(b); login(pg, 'uqshop@test.kr')
    setdb(pg, "d.dg_wallet={[u]:{medals:449,earned:449,spent:0,titles:[]}}"); shop(pg, 449)
    it = J(pg, UQI); ok('shop_listed', it and '묘신 너클 호랑냥이' in it['txt'] and '계정당 1개' in it['txt'] and '🏅 450' in it['btn'] and 'uq' in it['cls'].split(), it)
    ok('shop_lack_449', it and 'lack' in it['cls'].split() and it['dis'], it)
    setdb(pg, "d.dg_wallet[u].medals=450; d.dg_wallet[u].earned=450"); shop(pg, 450)
    it = J(pg, UQI); ok('shop_ok_450', it and 'ok' in it['cls'].split() and not it['dis'], it)
    ok('shop_touch44', J(pg, "()=>{ const r=document.querySelector('.dgBuy[data-buy=dg_uq_fist]').getBoundingClientRect(); return r.width>=44 && r.height>=44; }"))
    shot(pg, 'uq_shop', '#dgPanel')
    J(pg, "()=>G.dgLastBuy=null"); pg.click('.dgBuy[data-buy="dg_uq_fist"]'); pg.wait_for_function("()=>G.dgLastBuy && G.dgLastBuy.ok", timeout=20000); pg.wait_for_timeout(400)
    it = J(pg, UQI); ok('shop_bought_owned', pg.inner_text('#dgShopMedals') == '0' and it and 'own' in it['cls'].split() and '보유 중' in it['btn'] and it['dis'], it)
    D = db(pg); u = list(D['users'].values())[0]['id']; W = D['dg_wallet'][u]
    ok('server_wallet', W['uniques'] == ['d_fist'] and W['spent'] == 450 and [x['item'] for x in D['dg_buys']] == ['dg_uq_fist'], W)
    ms = [m for m in D['hd3d_mail'].values() if (m.get('reward') or {}).get('items') == [{'k': 'uq', 'u': 'd_fist'}]]; ok('shop_mail', len(ms) == 1 and not ms[0]['claimed'], ms)
    r = J(pg, "async()=>{ const DS=await import('./src/account/dungeon.js'); return DS.dgBuy('dg_uq_fist'); }"); ok('second_buy_blocked', not r['ok'] and '계정당 1개' in r['msg'], r)
    setdb(pg, "d.dg_wallet[u].medals=999"); r = J(pg, "async()=>{ const DS=await import('./src/account/dungeon.js'); return DS.dgBuy('dg_uq_fist'); }")
    ok('second_buy_blocked_rich', not r['ok'] and db(pg)['dg_wallet'][u]['medals'] == 999 and len(db(pg)['dg_buys']) == 1, r)
    shop(pg, 999); shot(pg, 'uq_shop_owned', '#dgPanel'); J(pg, "()=>document.getElementById('dgClose').click()")
    ok('not_owned_before_claim', not J(pg, OWNS))
    claim_all(pg); ok('claimed_unique', J(pg, OWNS) and J(pg, "()=>G.gear.Acc.load().uqLog.d_fist") == 1)
    # ---- 도감: 고유 탭에 서윤 무기 칸 (획득 경로 표기)
    J(pg, "()=>G.gear.openInv()"); pg.wait_for_timeout(300); pg.click('#invTabs .ftab[data-v="codex"]'); pg.wait_for_timeout(200)
    pg.click('#codexBody .cxTabs .ftab[data-c="0"]'); pg.wait_for_timeout(400)
    cx = J(pg, "()=>{ const e=document.querySelector('#codexBody .uqCell[data-k=d_fist]'); return e && { have:e.classList.contains('have'), txt:e.innerText }; }")
    n = J(pg, "()=>[document.querySelectorAll('#codexBody .uqCell').length, Object.keys(G.gear.E ? {} : {}).length]")
    ok('codex_cell', cx and cx['have'] and '묘신 너클 호랑냥이' in cx['txt'] and '던전' in cx['txt'] and '450' in cx['txt'] and 'undefined' not in cx['txt'], cx)
    ok('codex_count16', n[0] == 16, n)
    pg.hover('#codexBody .uqCell[data-k="d_fist"]'); pg.wait_for_timeout(250)
    tip = J(pg, "()=>{ const t=document.getElementById('itemTip'); return t && !t.classList.contains('hidden') ? t.innerText : ''; }"); ok('codex_tip_skill', '냥발 장풍' in tip, tip[:200])
    shot(pg, 'uq_codex', '#invPanel'); pg.mouse.move(5, 5)
    J(pg, "()=>{ const p=document.getElementById('invPanel'); p && p.classList.add('hidden'); document.getElementById('itemTip').classList.add('hidden'); }")
    # ---- 상점: 서버 기록이 지워져도(옛 계정) 이 세이브에 있으면 '보유 중' (메달 낭비 방지)
    setdb(pg, "d.dg_wallet[u].uniques=[]"); J(pg, "async()=>{ const DS=await import('./src/account/dungeon.js'); DS.DGS.st='idle'; }"); shop(pg, 999)
    it = J(pg, UQI); ok('shop_owned_by_save', it and 'own' in it['cls'].split() and it['dis'], it); J(pg, "()=>document.getElementById('dgClose').click()")
    # ===== 2) [E] 묘신 냥발 장풍 (서윤 + 각성 ★3) =====
    setdb(pg, "d.hd3d_owned=d.hd3d_owned||{}; d.hd3d_owned[u+':hero_fighter']={user_id:u,item:'hero_fighter'}"); J(pg, "()=>G.shop.Sh.verifyOwned()")
    J(pg, """()=>{ const {Acc,E}=G.gear; Acc.update(d=>{ d.chests=d.chests.filter(c=>!(c.it&&c.it.uq==='d_fist')); d.inv=d.inv.filter(x=>x.uq!=='d_fist'); const it={...E.makeUnique('d_fist'), a:3}; d.inv.push(it); d.eq.fighter={weapon:it.id}; return d; }); }""")
    town(pg); pg.click('.hcard[data-h="fighter"]'); pg.wait_for_function("()=>G.townHero && G.townHero() && G.townHero().cls==='fighter'", timeout=60000); pg.wait_for_timeout(1500)
    J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=240000); pg.wait_for_timeout(500)
    ok('hero_has_catpaw', J(pg, "()=>G.hero.cls==='fighter' && G.hero.lsk==='catpaw' && G.hero.uqA===3") and not hidden(pg, 'legBtn') and '냥발 장풍' in pg.inner_text('#legBtn'), J(pg, "()=>[G.hero.cls, G.hero.lsk, G.hero.uqA]"))
    J(pg, "()=>{ G.manual=true; G.gold=0; G.legendN={}; G.legendDmg=0; G.hero.C={...G.hero.C, armor:1}; G.hero.hp=G.hero.max; G.hero.face=0; G.hero.g.rotation.y=0; G.sim(.3); }")
    # 앞으로 일렬: 3 · 5.5 · 8(박쥐=비행) · 10.5 · 13 + 옆으로 빗나간 1마리(6, 옆 4) — 체력 매우 큼
    PUT = """(L)=>{ const h=G.hero.g.position, f=G.hero.face; window.__bp=[]; for (const [ty, d, s] of L) { const x=h.x+Math.sin(f)*d+Math.cos(f)*s, z=h.z+Math.cos(f)*d-Math.sin(f)*s;
      const e=G.spawnEnemy(ty, 40, { x, z, tile:G.toTile(x,z) }); e.g.position.set(x, e.g.position.y, z); e.state='walk'; e.spawnT=0; e.next=null; e.path=null; e.spd=0; e.spdK=1e-9; e.max=e.hp=1e7; window.__bp.push(e); }
      G.mouseGround.set(h.x+Math.sin(f)*10, 0, h.z+Math.cos(f)*10); return window.__bp.length; }"""
    J(pg, PUT, [['grunt', 3, 0], ['grunt', 5.5, .5], ['bat', 8, -.4], ['grunt', 10.5, .3], ['imp', 13, 0], ['grunt', 6, 4.2]])
    pg.mouse.move(640, 300); J(pg, "()=>{ G.hero.atkT=9; G.hero.ft&&(G.hero.ft.jp=null); }")
    p0 = J(pg, "()=>window.__bp.map(e=>[e.g.position.x,e.g.position.z])"); n0 = J(pg, "()=>({...G.ftN})")
    pg.mouse.move(640, 300); J(pg, "()=>{ const h=G.hero.g.position, f=G.hero.face; G.mouseGround.set(h.x+Math.sin(f)*10, 0, h.z+Math.cos(f)*10); G.hero.lcd=0; }"); pg.keyboard.press('e'); J(pg, "()=>G.sim(.05)")
    ok('catpaw_cast', J(pg, "()=>G.legendN.catpaw") == 1 and J(pg, "()=>G.hero.lcd") > 5 and J(pg, "()=>G.ftN.catpaw") == (n0.get('catpaw') or 0) + 1, J(pg, "()=>[G.legendN, G.hero.lcd, G.ftN.catpaw]"))
    J(pg, "()=>G.sim(.32)"); shot(pg, 'uq_catpaw')
    J(pg, "()=>G.sim(.9)"); n1 = J(pg, "()=>({...G.ftN})"); dm = J(pg, "()=>window.__bp.map(e=>Math.round(e.max-Math.max(0,e.hp)))")
    p1 = J(pg, "()=>window.__bp.map(e=>[e.g.position.x,e.g.position.z])")
    ok('catpaw_pierce_line', (n1.get('catpawHits') or 0) - (n0.get('catpawHits') or 0) >= 5 and all(x > 0 for x in dm[:5]), (n1, dm))
    ok('catpaw_hits_flying', dm[2] > 0, dm)
    base = J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); return stat.dmg()*3.6; }")
    ok('catpaw_mul', min(dm[:4]) >= base * .9, (dm, base))
    ok('catpaw_knockback', max(((a[0] - q[0]) ** 2 + (a[1] - q[1]) ** 2) ** .5 for a, q in zip(p0[:4], p1[:4])) > .5, (p0, p1))
    ok('catpaw_vuln', J(pg, "()=>window.__bp.slice(0,4).filter(e=>e.vulnT>G.t && e.vulnAmt>=.2).length") >= 3)
    ok('catpaw_a3_boom', (n1.get('catpawBoom') or 0) - (n0.get('catpawBoom') or 0) == 1 and dm[5] == 0, (n1, dm))
    ok('catpaw_legend_dmg', J(pg, "()=>G.legendDmg") > 0)
    J(pg, "()=>{ G.sim(.1); }"); pg.keyboard.press('e'); J(pg, "()=>G.sim(.05)"); ok('catpaw_cooldown', J(pg, "()=>G.legendN.catpaw") == 1)
    ok('finite', J(pg, "()=>Number.isFinite(G.hero.g.position.x) && G.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.g.position.x))"))
    c.close()
    # ===== 3) 메달 원정 드롭: 실패 → 천장 +1 · (목 dgUqRoll) 드롭 → 결과 알림 + 우편 · 이후 드롭 없음 =====
    c, pg = page(b); login(pg, 'uqdrop@test.kr')
    R = ranked_win(pg); M = R['medals']; ok('miss_pity', M['ok'] and M['win'] and M['uq'] is None and hidden(pg, 'dgUqDrop'), M)
    D = db(pg); u = list(D['users'].values())[0]['id']; ok('miss_pity_server', D['dg_wallet'][u]['uq_pity'] == 1 and D['dg_wallet'][u]['uniques'] == [], D['dg_wallet'][u])
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); pg.wait_for_timeout(500)
    flags(pg, {'dgUqRoll': True}); R = ranked_win(pg); M = R['medals']
    tx = pg.inner_text('#stageClear'); ok('drop_result', M['ok'] and M['uq'] == 'd_fist' and M['mail'] and '묘신 너클 호랑냥이' in tx and '우편함' in tx, (M, tx[-200:]))
    D = db(pg); ok('drop_server', D['dg_wallet'][u]['uniques'] == ['d_fist'] and D['dg_wallet'][u]['uq_pity'] == 0 and sum(1 for m in D['hd3d_mail'].values() if (m.get('reward') or {}).get('items') == [{'k': 'uq', 'u': 'd_fist'}]) == 1, D['dg_wallet'][u])
    shot(pg, 'uq_drop_result')
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); pg.wait_for_timeout(500)
    R = ranked_win(pg); M = R['medals']; D = db(pg)
    ok('no_second_drop', M['ok'] and M['uq'] is None and sum(1 for m in D['hd3d_mail'].values() if (m.get('reward') or {}).get('items')) == 1, M)
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); pg.wait_for_timeout(500)
    claim_all(pg); ok('drop_claimed', J(pg, OWNS)); shop(pg, D['dg_wallet'][u]['medals']); it = J(pg, UQI); ok('drop_then_shop_owned', it and 'own' in it['cls'].split(), it)
    c.close()
    # ===== 4) 연습 원정(게스트): 드롭·메달·서버 정산 없음 =====
    c, pg = page(b); pg.goto(url + '?seed=12345&rng=777&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
    J(pg, "()=>G.gear.Acc.update(d=>{ d.souls=50; d.stats={runs:1,kills:1,waves:1,souls:1}; return d; })"); flags(pg, {'dgUqRoll': True}); town(pg)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!!document.getElementById('dgStart') && (document.getElementById('dgDay')||{}).innerText.includes('연습 원정')", timeout=30000)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }"); J(pg, "async()=>{ (await import('./src/dungeon/run.js')).dgFinish(true); }"); pg.wait_for_timeout(1500)
    R = J(pg, "()=>G.dgResult"); D = db(pg)
    ok('practice_no_drop', R and R['mode'] == 'practice' and not R.get('medals') and hidden(pg, 'dgUqDrop') and not J(pg, OWNS) and not any((m.get('reward') or {}).get('items') for m in (D.get('hd3d_mail') or {}).values()) and not D.get('dg_runs'), (R, D.get('dg_runs')))
    c.close(); b.close()
srv.shutdown()
print('console errors:', len(errs)); [print('  ', e) for e in errs[:10]]
ok('no_console_errors', not errs)
nf = sum(1 for v in res.values() if not v); print(f'{len(res) - nf}/{len(res)}', 'ALL OK' if not nf else f'{nf} FAIL'); sys.exit(1 if nf else 0)
