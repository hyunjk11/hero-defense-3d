#!/usr/bin/env python3
"""유료 영웅 진서윤(격투가) 테스트 (가짜 Supabase tests/sbmock.js, 네트워크 없음).  python3 tests/seoyun.py [--shots]
잠김(마을 카드·상점 상품) → 구매 신청 → (구버전 서버: '서버 업데이트 필요') → 관리자 승인 → 우편 받기 → 해금·선택 → 출정 →
3연타(주먹·주먹·돌려차기 · 넉백 없음 · 공속 2.08) → 장풍(약 0.4초 / 완전 1.2초 관통 · 사거리 밖 모든 적) ↔ 근접 전환 → [Q] 냥냥 진각(도약·내려찍기·기절) → 🐯 백호진천권(제자리·피해·충격파·연출 정리) · 🐉 천룡파 유도 → 던전 출전 고르기(서윤 bruiser AI) →
태블릿 1024x600 터치 ≥44px → 모델 못 받을 때 대체 모델 · 콘솔 오류 0 · NaN/검은 화면 없음.
스크린샷 shots/seoyun/: select.png, shop.png, combo.png, jangpung.png, slam.png, dungeon_pick.png, dungeon_run.png, tablet_town.png, tablet_run.png, fallback.png"""
import sys, os, pathlib, io
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/seoyun'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !e || e.classList.contains('hidden'); }}")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
CAM = "([r,th,ph])=>import('./src/render/scene.js').then(({cam,updateCam})=>{ const p=G.hero.g.position; cam.target.set(p.x,1.2,p.z); cam.r=r; cam.phi=ph; cam.theta=th; updateCam&&updateCam(); })"
def lum(png):
    from PIL import Image, ImageStat
    return ImageStat.Stat(Image.open(io.BytesIO(png)).convert('L')).mean[0]
def frame(pg, name=None, r=14, th=.4, ph=.9):
    J(pg, CAM, [r, th, ph]); J(pg, RAF); png = pg.screenshot(timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
    if SHOTS and name: open(f'{OUT}/{name}.png', 'wb').write(png)
    return lum(png)
def pshot(pg, name, force=False):
    if SHOTS or force: J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb')||'{}')")
SH = "G.shop.Sh"
def hook(pg, E=errs, ignore=()):
    pg.on('dialog', lambda d: d.accept()); pg.on('pageerror', lambda x: E.append('PE ' + str(x)[:300]))
    pg.on('console', lambda m: m.type == 'error' and not any(s in m.text for s in ignore) and E.append(m.text[:200]))
def boot(c, q='?seed=12345&rng=777&flow=1', E=errs, ignore=()):
    pg = c.new_page(); hook(pg, E, ignore); pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000); return pg
def login(pg, email, up=True):
    if J(pg, '()=>G.screen') == 'intro': pg.mouse.click(640, 400); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'town': pg.click('#twMenu'); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'menu': pg.click('#mnAuth'); pg.wait_for_timeout(500)
    pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp' if up else '#lgIn'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(600)
def town(pg): J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(900)
def sstat(pg): pg.wait_for_function(f"()=>{SH}.S.status!=='loading'", timeout=20000); return J(pg, f"()=>{SH}.S.status")
OWN = "(it)=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned=d.hd3d_owned||{}; d.hd3d_owned[u+':'+it]={user_id:u,item:it}; localStorage.setItem('__mockdb', JSON.stringify(d)); }"
CLEAR = "()=>{ for (const e of G.enemies) { e.dead=true; e.hb&&e.hb.show(false); if(e.g) e.g.visible=false; } G.enemies.length=0; }"
# 적 배치: [type, 앞쪽 거리, 옆 오프셋] — 체력 매우 큼 (피해 합계로 검사)
PUT = """(L)=>{ const h=G.hero.g.position, f=G.hero.face, out=[]; for (const [ty, d, s] of L) { const x=h.x+Math.sin(f)*d+Math.cos(f)*s, z=h.z+Math.cos(f)*d-Math.sin(f)*s;
  const e=G.spawnEnemy(ty, 40, { x, z, tile:G.toTile(x,z) }); e.g.position.set(x, e.g.position.y, z); e.state='walk'; e.spawnT=0; e.next=null; e.path=null; e.spd0=e.spd; e.spd=0; e.spdK=1e-9; /* 이동 속도 배수 ≈0 = 제자리 (ai.js 는 spdK||1 이라 0 은 무시됨 · 코어 쪽으로 걸어가 버리면 사거리 밖) */ e.max=e.hp=1e6; out.push(G.enemies.indexOf(e)); } window.__bp=G.enemies.filter(e=>!e.dead); return out.length; }"""
DMG = "()=>window.__bp.reduce((a,e)=>a+(e.max-Math.max(0,e.hp)),0)"
FIN = "()=>Number.isFinite(G.hero.g.position.x) && Number.isFinite(G.hero.hp) && G.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.g.position.x)&&Number.isFinite(e.g.position.z))"
SPOT = """()=>{ const ok=(c,r)=>{ for(let dc=-2;dc<=2;dc++) for(let dr=-2;dr<=2;dr++){ const t=G.tileAt(c+dc,r+dr); if(!t||t.tower||t.bar||(t.t!==G.T.GRASS&&t.t!==G.T.CARVED)) return false; } return true; };
  let best=null, bd=1e9; for(let c=2;c<G.GW-2;c++) for(let r=2;r<G.GH-2;r++){ const d=Math.hypot(c-G.CORE[0],r-G.CORE[1]); if(d<5||d>=bd||!ok(c,r)) continue; bd=d; best=[c,r]; }
  if(!best) { // 스테이지 맵에 5x5 빈 땅이 없으면: 코어 근처 5x5 (암반·포털·코어·타워 없는 곳) 를 파서 만듦 (테스트 전용)
    const okc=(c,r)=>{ for(let dc=-2;dc<=2;dc++) for(let dr=-2;dr<=2;dr++){ const t=G.tileAt(c+dc,r+dr); if(!t||t.tower||t.bar||t.t===G.T.BEDROCK||t.t===G.T.SPAWN||t.t===G.T.CORE) return false; } return true; };
    for(let c=2;c<G.GW-2;c++) for(let r=2;r<G.GH-2;r++){ const d=Math.hypot(c-G.CORE[0],r-G.CORE[1]); if(d<5||d>=bd||!okc(c,r)) continue; bd=d; best=[c,r]; }
    if(!best) return null; for(let dc=-2;dc<=2;dc++) for(let dr=-2;dr<=2;dr++){ const t=G.tileAt(best[0]+dc,best[1]+dr); if(t.t!==G.T.GRASS&&t.t!==G.T.CARVED) G.carve(t); } }
  const [x,z]=G.tileXZ(best[0],best[1]); G.hero.g.position.set(x,0,z); G.hero.path=[]; G.hero.face=0; G.hero.g.rotation.y=0; return best; }"""
FTN = "()=>({...G.ftN})"

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 1) 구버전 서버(schema.sql 다시 실행 전): 주문 → '서버 업데이트 필요' (게임은 정상) =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); c.add_init_script("localStorage.setItem('__mockflags', JSON.stringify({oldSchema:true}))"); pg = boot(c)
    login(pg, 'old@test.kr'); town(pg); sstat(pg)
    r = J(pg, f"()=>{SH}.order('hero_fighter')"); ok('old_schema_order_msg', not r['ok'] and r.get('outdated') and '서버 업데이트 필요' in r['msg'], r)
    r = J(pg, f"()=>{SH}.order('hero_gunner')"); ok('old_schema_rose_still_ok', r['ok'], r)
    ok('old_schema_locked_card', J(pg, "()=>{ const b=document.querySelector('.hcard[data-h=fighter]'); return !!b && b.classList.contains('locked'); }"))
    c.close()
    # ===== 2) 회원 p: 잠김 → 상점 → 구매 신청 =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = boot(c)
    login(pg, 'p@test.kr'); town(pg); sstat(pg)
    ok('town_locked', J(pg, "()=>{const b=document.querySelector('.hcard[data-h=fighter]'); return !!b && b.classList.contains('locked') && b.innerText.includes('🔒') && b.innerText.includes('서윤')}"))
    pg.click('.hcard[data-h="fighter"]'); pg.wait_for_timeout(500)
    ok('locked_opens_product', not hidden(pg, 'shopPanel') and J(pg, "()=>G.shop.ui().prod") == 'hero_fighter' and J(pg, "()=>G.gear.Acc.load().hero") != 'fighter')
    pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('구매 신청')", timeout=20000)
    tabs = J(pg, "()=>[...document.querySelectorAll('#shopTabs .shopTab')].map(b=>b.dataset.k)")
    ok('shop_tabs', 'hero_gunner' in tabs and 'hero_fighter' in tabs and 'hero_mechanic' not in tabs, tabs)
    ok('shop_texts', '서윤' in pg.inner_text('.shopTitle') and '₩9,900' in pg.inner_text('#shopPrice') and '격투가' in pg.inner_text('.pvName') and '장풍' in pg.inner_text('#shopBody') and '냥냥 진각' in pg.inner_text('#shopBody') and 'undefined' not in pg.inner_text('#shopBody'), pg.inner_text('#shopBody')[:300].replace('\n', ' | '))
    pg.wait_for_timeout(1500)
    if SHOTS: J(pg, RAF); pg.locator('#shopPanel').screenshot(path=f'{OUT}/shop.png'); J(pg, "()=>{ G.pauseRender=false }")
    pg.click('#shopBuyBtn'); pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('승인 대기')", timeout=20000)
    ok('order_pending', [(o['item'], o['status']) for o in db(pg)['hd3d_orders'].values()] == [('hero_fighter', 'pending')])
    J(pg, "()=>G.shop.closeShop(true)")
    J(pg, "()=>G.gear.Acc.update(d=>({...d, hero:'fighter'}))"); pg.wait_for_timeout(300)
    ok('save_tamper_no_unlock', J(pg, f"()=>!{SH}.heroOwned('fighter') && document.querySelector('.hcard.sel').dataset.h!=='fighter'"))
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); const a=await c.from('hd3d_owned').insert({item:'hero_fighter'}); return a.error&&a.error.code; }"); ok('owned_unwritable', r == '42501', r)
    # ---- 관리자 승인 → 우편 · 지급 목록에 서윤
    login(pg, 'hyunjk11@daum.net'); town(pg); pg.click('#twAdmin'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length>0", timeout=20000)
    ok('admin_sees_order', '서윤' in pg.inner_text('#admBody'))
    pg.click('#admBody .admOk'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.includes('승인 완료')", timeout=20000)
    ok('approved_mail', any((m.get('reward') or {}).get('hero') == 'fighter' for m in db(pg)['hd3d_mail'].values()))
    pg.click('#admTabs .ftab[data-t="mail"]'); opts = J(pg, "()=>[...document.querySelectorAll('#amHero option')].map(o=>o.value)"); ok('admin_hero_options', 'fighter' in opts and 'gunner' in opts, opts)
    pg.click('#admClose')
    # ---- p: 우편 받기 → 해금 → 선택
    login(pg, 'p@test.kr', up=False); town(pg); sstat(pg)
    pg.click('#twMail'); pg.wait_for_function("()=>document.querySelectorAll('#mailList .mClaim').length===1", timeout=20000)
    ok('mail_item', '서윤' in pg.inner_text('#mailList'))
    pg.click('#mailList .mClaim'); pg.wait_for_function("()=>document.getElementById('mailMsg').innerText.includes('해금')", timeout=20000)
    ok('unlocked', J(pg, f"()=>{SH}.heroOwned('fighter') && !{SH}.heroOwned('gunner') && !document.querySelector('.hcard[data-h=fighter]').classList.contains('locked')") and any(k.endswith(':hero_fighter') for k in db(pg)['hd3d_owned']))
    r = J(pg, f"()=>{SH}.order('hero_fighter')"); ok('owned_cannot_buy', not r['ok'] and '보유' in r['msg'], r)
    pg.click('#mailClose')
    pg.click('.hcard[data-h="fighter"]'); pg.wait_for_function("()=>G.townHero && G.townHero() && G.townHero().cls==='fighter'", timeout=60000); pg.wait_for_timeout(2500)
    ok('selected', J(pg, "()=>G.gear.Acc.load().hero") == 'fighter' and '서윤' in pg.inner_text('.hcard.sel'))
    ok('town_model_real', J(pg, "()=>{ const h=G.townHero(); return !!(h && h.acts && h.acts.includes('JabLs')) && !h.fallback; }"))
    pshot(pg, 'select', True)
    # 전직 탭: 서윤 전직(SA-1~4) 출시 뒤 = 두 갈래(🐯 백호권성 · 🐉 천기권사)와 조건 표시 ('준비 중' 시절 검사였음)
    adv = J(pg, "async()=>{ const m=await import('./src/ui/advance.js'); m.renderAdv(); return document.getElementById('twAdv').innerText; }")
    ok('advance_tab', '백호권성' in adv and '천기권사' in adv and 'undefined' not in adv, adv[:200])
    # ===== 3) 출정: 3연타 · 장풍 · Q =====
    J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=240000); pg.wait_for_timeout(500)
    ok('in_run', J(pg, "()=>G.hero.cls") == 'fighter' and J(pg, "()=>!!(G.hero.ft && G.hero.ch.acts.JabLs && G.hero.ch.acts.SpinK && G.hero.ch.acts.PalmS && G.hero.ch.acts.SlamS)"), J(pg, "()=>[G.hero.cls, Object.keys(G.hero.ch.acts)]"))
    ok('hud', '서윤' in pg.inner_text('#heroName') and '냥냥 진각' in pg.inner_text('#skillName'))
    print('spot', J(pg, SPOT))
    J(pg, "()=>{ G.manual=true; G.hero.C={...G.hero.C, armor:1}; G.sim(.5); }")
    J(pg, PUT, [['grunt', 1.8, 0], ['grunt', 1.6, 1.0], ['imp', 2.0, -1.0], ['grunt', 2.4, .4]]); n0 = J(pg, FTN); d0 = J(pg, DMG)
    pos0 = J(pg, "()=>window.__bp.map(e=>[e.g.position.x,e.g.position.z])")
    J(pg, "()=>G.sim(.9)"); c1 = frame(pg, 'combo', 9, .6, .95)
    for _ in range(6): J(pg, "()=>G.sim(.25)")
    n1 = J(pg, FTN); ok('combo_jab_jab_kick', n1['jab'] - n0['jab'] >= 2 and n1['kick'] - n0['kick'] >= 1 and n1['kickHits'] - n0['kickHits'] >= 2, n1)
    ok('combo_ratio', (n1['jab'] - n0['jab']) >= 2 * (n1['kick'] - n0['kick']) - 1, n1)
    ok('combo_damage', J(pg, DMG) > d0)
    pos1 = J(pg, "()=>window.__bp.map(e=>[e.g.position.x,e.g.position.z])")
    ok('kick_no_knockback', max(((a[0] - b_[0]) ** 2 + (a[1] - b_[1]) ** 2) ** .5 for a, b_ in zip(pos0, pos1)) < .2, (pos0, pos1))  # 2026-10-24 패치: 발차기 넉백 제거
    ok('rate_minus20', abs(J(pg, "()=>G.hero.C.rate") - 2.08) < 1e-6, J(pg, "()=>G.hero.C.rate"))
    ok('no_charge_when_melee', n1['charge'] == n0['charge'], n1)
    # 2026-10-24 패치: 거리 전환 — 사거리(2.6) 밖 '일반 지상 적' 에게도 장풍 (근접 주먹 X) → 가까워지면 다시 주먹
    J(pg, CLEAR); J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.hero.ft.n=0; G.sim(.3); }"); J(pg, PUT, [['grunt', 6, 0]]); n0 = J(pg, FTN)
    J(pg, "()=>G.sim(1.6)"); n1 = J(pg, FTN)
    ok('jp_far_ground', n1['charge'] > n0['charge'] and n1['jpFull'] > n0['jpFull'] and n1['jab'] == n0['jab'] and J(pg, DMG) > 0, n1)
    J(pg, CLEAR); J(pg, "()=>{ G.hero.ft.jp=null; G.sim(.6); }"); J(pg, PUT, [['grunt', 1.8, 0]]); n0 = J(pg, FTN); J(pg, "()=>G.sim(1.2)"); n1 = J(pg, FTN)
    ok('melee_near_ground', n1['jab'] > n0['jab'] and n1['charge'] == n0['charge'], n1)
    J(pg, CLEAR); J(pg, "()=>{ G.hero.ft.jp=null; G.sim(.6); }")
    # 장풍 약: 박쥐 1마리(비행) 7 앞 → 충전 0.7초 → 근접 적 등장 → 약 장풍 발사
    J(pg, CLEAR); J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.hero.ft.n=0; G.sim(.3); }"); J(pg, PUT, [['bat', 7, 0]]); n0 = J(pg, FTN); d0 = J(pg, DMG)
    J(pg, "()=>G.sim(.7)"); ok('charge_started', J(pg, "()=>!!G.hero.ft.jp && G.hero.ft.glow.some(x=>x.g.visible)") and J(pg, FTN)['charge'] == n0['charge'] + 1, J(pg, FTN))
    jp = frame(pg, 'charge', 10, .9, .85)
    J(pg, "()=>{ const h=G.hero.g.position, f=G.hero.face, x=h.x+Math.sin(f)*1.3, z=h.z+Math.cos(f)*1.3; const e=G.spawnEnemy('grunt', 40, {x, z, tile:G.toTile(x,z)}); e.g.position.set(x,0,z); e.spd=0; e.next=null; e.max=e.hp=1e6; e.spawnT=0; }")
    J(pg, "()=>G.sim(1.2)"); n1 = J(pg, FTN)
    ok('jp_weak', n1['jpWeak'] == n0['jpWeak'] + 1 and n1['jpFull'] == n0['jpFull'] and n1['jpHits'] > n0['jpHits'] and J(pg, DMG) > d0, n1)
    # 장풍 완전: 박쥐 3마리 일렬(5 · 7.5 · 10) → 1.2초 충전 → 관통 기파
    J(pg, CLEAR); J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.sim(.6); }"); J(pg, PUT, [['bat', 5, 0], ['bat', 7.5, .3], ['bat', 9.6, -.3]]); n0 = J(pg, FTN)
    J(pg, "()=>G.sim(1.0)"); ok('still_charging_1s', J(pg, "()=>!!G.hero.ft.jp") and J(pg, FTN)['jpWeak'] == n0['jpWeak'])
    J(pg, "()=>G.sim(.35)"); J(pg, "()=>G.sim(.12)"); jw = frame(pg, 'jangpung', 13, 1.1, .8)
    J(pg, "()=>G.sim(.8)"); n1 = J(pg, FTN); dm = J(pg, "()=>window.__bp.map(e=>Math.round(e.max-e.hp))")
    ok('jp_full_pierce', n1['jpFull'] == n0['jpFull'] + 1 and n1['jpHits'] - n0['jpHits'] >= 3 and all(x > 0 for x in dm), (n1, dm))
    ok('jp_full_mul', min(dm) >= J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); return stat.dmg()*2.5*0.5; }"), dm)
    # [Q] 냥냥 진각: 지상 무리 5 앞 → 도약 → 400% · 1초 기절 · 땅 갈라짐
    J(pg, CLEAR); J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.hero.ft.jp=null; G.sim(.6); }")
    J(pg, PUT, [['grunt', 5, 0], ['grunt', 5.6, 1], ['imp', 5.4, -1], ['grunt', 6.2, .2], ['bat', 5.2, .5]]); n0 = J(pg, FTN); d0 = J(pg, DMG)
    J(pg, "()=>{ const h=G.hero.g.position, f=G.hero.face; G.mouseGround.set(h.x+Math.sin(f)*5.4, 0, h.z+Math.cos(f)*5.4); G.hero.skillCd=0; }"); p0 = J(pg, "()=>[G.hero.g.position.x, G.hero.g.position.z]")
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.25)")
    ok('q_leap', J(pg, "()=>!!G.hero.ft.leap && G.hero.g.position.y > 1 && G.hero.skillCd > 5") and J(pg, FTN)['q'] == n0['q'] + 1, J(pg, "()=>[G.hero.g.position.y, G.hero.skillCd]"))
    J(pg, "()=>G.sim(.45)"); sl = frame(pg, 'slam', 12, .5, .85); n1 = J(pg, FTN)
    p1 = J(pg, "()=>[G.hero.g.position.x, G.hero.g.position.z]")
    ok('q_landed_forward', not J(pg, "()=>!!G.hero.ft.leap") and ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** .5 > 3, (p0, p1))
    ok('q_slam_hits_stun', n1['qHits'] - n0['qHits'] >= 5 and n1['qStun'] - n0['qStun'] >= 4 and J(pg, "()=>window.__bp.filter(e=>!e.E.fly && e.stunT>0).length") >= 4, n1)
    ok('q_slam_damage', J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); return window.__bp.every(e=>e.max-e.hp >= stat.dmg()*4*0.6); }"), J(pg, "()=>window.__bp.map(e=>Math.round(e.max-e.hp))"))
    ok('q_bat_not_stunned', J(pg, "()=>window.__bp.filter(e=>e.E.fly).every(e=>!(e.stunT>0))"))
    J(pg, "()=>{ G.hero.cd=99; G.sim(1.3); G.hero.cd=0; }"); ok('q_stun_ends', J(pg, "()=>window.__bp.every(e=>!(e.stunT>0))"))
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.05)"); ok('q_cooldown', J(pg, FTN)['q'] == n1['q'])
    J(pg, "()=>{ G.hero.skillCd=0; G.sim(.1) }"); pg.tap('#skillBtn'); J(pg, "()=>G.sim(.05)"); ok('q_touch', J(pg, FTN)['q'] == n1['q'] + 1)
    J(pg, "()=>G.sim(1.5)")
    # 사망 중 충전 정리 · 부활
    J(pg, CLEAR); J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.sim(.3); }"); J(pg, PUT, [['bat', 7, 0]]); J(pg, "()=>G.sim(.6)")
    J(pg, "()=>{ G.hero.C={...G.hero.C, armor:0}; G.heroDamage(1e7); }")
    ok('death_clears_charge', J(pg, "()=>G.hero.dead>0 && !G.hero.ft.jp && !G.hero.ft.leap && G.hero.ft.glow.every(x=>!x.g.visible)"))
    J(pg, CLEAR); J(pg, "()=>G.sim(8)"); ok('respawn', J(pg, "()=>G.hero.dead<=0 && G.hero.hp===G.hero.max"))
    ok('no_nan', J(pg, FIN)); fl = frame(pg, None, 15, .3)
    ok('not_black', min(c1, jp, jw, sl, fl) > 25, (c1, jp, jw, sl, fl))
    c.close()
    # ===== 3b) 2026-10-24 패치: 🐯 백호진천권(제자리 땅 내려치기) · 🐉 천룡파(유도) =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = boot(c)
    login(pg, 'tq@test.kr'); J(pg, OWN, 'hero_fighter'); town(pg); sstat(pg); pg.wait_for_function(f"()=>{SH}.heroOwned('fighter')", timeout=20000)
    def depart(br):
        J(pg, "(br)=>G.gear.Acc.update(d=>{ d.hero='fighter'; d.adv={...(d.adv||{}), fighter:{b:br, n:1}}; return d; })", br)
        J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero&&G.hero.cls==='fighter'", timeout=240000); pg.wait_for_timeout(500)
        J(pg, "()=>{ G.manual=true; G.hero.C={...G.hero.C, armor:1}; }"); J(pg, SPOT); J(pg, "()=>G.sim(.3)")
    depart('tiger')
    ok('tq_hud', J(pg, "()=>G.hero.adv && G.hero.adv.k==='tiger' && document.getElementById('skillName').textContent==='백호진천권' && !!G.hero.ch.acts.QuakeS"), J(pg, "()=>[document.getElementById('skillName').textContent, Object.keys(G.hero.ch.acts)]"))
    # 앞·뒤·옆 지상 적 6 (반경 6 안 — 그중 2 는 예전 반경 4.6 밖 5.3) + 바깥 지상 2 (8 · 8.5 = 충격파만, waveR 10 안) + 박쥐 1
    J(pg, PUT, [['grunt', 2.5, 0], ['grunt', -2.5, .5], ['imp', 0, 3], ['grunt', 0, -5.3], ['grunt', 3, 2.5], ['imp', -4.1, -3.4], ['grunt', 8, 0], ['grunt', -8.5, 1], ['bat', 2, -1]])
    J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.hero.skillCd=0; G.ftN.tq=0; G.ftN.tqImpact=0; G.ftN.tqHits=0; G.ftN.tqStop=0; G.ftN.tqWaveHits=0; G.ftN.tiger=0; }")
    n0 = J(pg, FTN); p0 = J(pg, "()=>G.hero.g.position.toArray()")
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.2)")
    L = J(pg, "()=>{ const L=G.hero.ft.leap; return L && [L.kind, G.hero.g.position.y, G.hero.skillCd, G.ftN.tqLive||0, !!L.hit]; }")
    ok('tq_cast_in_place', L and L[0] == 'quake' and abs(L[1] - p0[1]) < .05 and L[2] > 5 and L[3] > 0 and not L[4], L)
    J(pg, "()=>G.sim(.25)"); imp = frame(pg, 'tq_impact', 12, .5, .85); n1 = J(pg, FTN)
    pos = J(pg, "()=>G.hero.g.position.toArray()")
    ok('tq_no_jump', ((pos[0] - p0[0]) ** 2 + (pos[2] - p0[2]) ** 2) ** .5 < .15 and abs(pos[1] - p0[1]) < .05, (p0, pos))
    ok('tq_impact', n1.get('tqImpact') == 1 and n1.get('tqStop') == 1 and n1.get('tiger') == 1 and n1.get('tqHits', 0) >= 6, n1)
    ok('tq_radius', J(pg, "async()=>{ const {TQ}=await import('./src/data/fighter.js'); const h=G.hero.g.position, d=e=>Math.hypot(e.g.position.x-h.x, e.g.position.z-h.z); return TQ.R===6 && TQ.waveR===10 && [3,5].every(i=>d(window.__bp[i])>4.6 && d(window.__bp[i])<=6) && [6,7].every(i=>d(window.__bp[i])>6 && !(window.__bp[i].stunT>0)); }"), J(pg, "()=>window.__bp.map(e=>+Math.hypot(e.g.position.x-G.hero.g.position.x, e.g.position.z-G.hero.g.position.z).toFixed(2))"))
    ok('tq_damage_stun', J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); const L=window.__bp.slice(0,6); return L.every(e=>e.max-e.hp >= stat.dmg()*5*0.6 && e.stunT>0); }"), J(pg, "()=>window.__bp.map(e=>[Math.round(e.max-e.hp), +(e.stunT||0).toFixed(2)])"))
    ok('tq_bat_untouched', J(pg, "()=>!(window.__bp[8].stunT>0)"))
    ok('tq_fx_spawned', J(pg, "()=>(G.ftN.tqLive||0) >= 8"), J(pg, "()=>G.ftN.tqLive"))
    J(pg, "()=>G.sim(.6)"); aft = frame(pg, 'tq_after', 12, .5, .85)
    ok('tq_shockwave', J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); return G.ftN.tqWave===1 && G.ftN.tqWaveHits>=8 && [6,7].every(i=>window.__bp[i].max-window.__bp[i].hp >= stat.dmg()*2*0.6); }"), J(pg, "()=>[G.ftN.tqWave, G.ftN.tqWaveHits, window.__bp.map(e=>Math.round(e.max-e.hp))]"))
    J(pg, "()=>G.sim(.3)"); ok('tq_cast_ends', J(pg, "()=>!G.hero.ft.leap && G.hero.skillCd>3"), J(pg, "()=>[G.hero.ft.leap&&G.hero.ft.leap.t, G.hero.skillCd]"))  # 히트스톱만큼 게임 시간이 늦음
    J(pg, "()=>{ G.hero.cd=99; G.sim(3); G.hero.cd=0; }"); ok('tq_fx_cleaned', J(pg, "()=>(G.ftN.tqLive||0)===0"), J(pg, "()=>G.ftN.tqLive"))
    ok('tq_no_nan', J(pg, FIN)); ok('tq_not_black', min(imp, aft) > 25, (imp, aft))
    # 🐉 천룡파: 축에서 벗어난 적 3 (직선 폭 밖) → 용이 휘어 쫓아가 맞힘
    J(pg, CLEAR); town(pg); depart('dragon')
    J(pg, PUT, [['grunt', 7, 3.2], ['grunt', 12, 4.6], ['grunt', 17, 4.2]])  # 직선(반폭 1.9) 밖 한쪽으로 휘어진 줄
    pg.mouse.move(5, 5); J(pg, "()=>{ const h=G.hero.g.position, f=G.hero.face; G.mouseGround.set(h.x+Math.sin(f)*8, 0, h.z+Math.cos(f)*8); G.hero.cd=0; G.hero.atkT=0; G.hero.skillCd=0; G.ftN.dw=0; G.ftN.dwHits=0; G.ftN.dwTurn=0; G.ftN.dwHome=0; }")
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.55)"); dr = frame(pg, 'dragon_homing', 15, .5, .85)
    J(pg, "()=>G.sim(1.2)"); n2 = J(pg, FTN)
    ok('dw_homing', n2.get('dw') == 1 and n2.get('dwTurn', 0) > 0 and n2.get('dwHits', 0) >= 3, n2)
    ok('dw_offaxis_hit', J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); return window.__bp.every(e=>e.max-e.hp >= stat.dmg()*5*0.6); }"), J(pg, "()=>window.__bp.map(e=>Math.round(e.max-e.hp))"))
    J(pg, "()=>G.sim(2)"); ok('dw_cleaned', J(pg, "()=>(G.ftN.dwLive||0)===0"), J(pg, "()=>G.ftN.dwLive")); ok('dw_not_black', dr > 25 and J(pg, FIN), dr)
    c.close()
    # ===== 4) 던전 원정: 출전 고르기 → 서윤(bruiser) AI =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = boot(c, '?seed=12345&rng=777&flow=1&dgtest=1')
    login(pg, 'dg@test.kr'); J(pg, OWN, 'hero_fighter'); town(pg); sstat(pg)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>document.querySelectorAll('.dgCard.pick[data-cls=\"fighter\"]').length===1", timeout=30000); pg.wait_for_timeout(800)
    ON = "()=>[...document.querySelectorAll('.dgCard.pick.on')].map(e=>e.dataset.cls)"
    ok('dg_default_pick', J(pg, ON) == ['warrior', 'archer', 'mage', 'fighter'] and '측면' in pg.inner_text('.dgCard[data-cls="fighter"]'), J(pg, ON))
    pg.tap('.dgCard.pick[data-cls="archer"]'); pg.tap('.dgCard.pick[data-cls="mage"]'); pg.tap('.dgCard.pick[data-cls="warrior"]'); pg.wait_for_timeout(200)
    ok('dg_min1', J(pg, ON) == ['fighter'] and '최소' not in pg.inner_text('#banner'), J(pg, ON))
    pg.tap('.dgCard.pick[data-cls="fighter"]'); pg.wait_for_timeout(200); ok('dg_min1_block', J(pg, ON) == ['fighter'] and '최소' in pg.inner_text('#banner'))
    pg.tap('.dgCard.pick[data-cls="warrior"]'); pg.tap('.dgCard.pick[data-cls="mage"]'); pg.wait_for_timeout(200); ok('dg_pick3', J(pg, ON) == ['warrior', 'mage', 'fighter'])
    pshot(pg, 'dungeon_pick', True)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length===3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
    ok('dg_party', J(pg, "()=>G.heroes.map(h=>h.cls)") == ['warrior', 'mage', 'fighter'] and J(pg, "()=>!!G.heroes[2].ft && !!G.heroes[2].ch.acts.JabLs"))
    J(pg, "()=>{ G.dgAiSkills=0; }"); f0 = J(pg, FTN); t = 0; shot_done = False
    # 3단계부터 던전이 5층: 1층 돌파 = 축복 3택1 대기(D.blessing) — 결과 화면(dgResult)은 5층 완주/전멸 때만 뜸
    while t < 240 and not J(pg, "()=>!!(G.dg.blessing || G.dgResult)"):
        J(pg, "()=>G.sim(2)"); t += 2
        if not shot_done and J(pg, "()=>G.enemies.filter(e=>!e.dead).length") >= 6:
            shot_done = True; J(pg, "()=>{ G.cam.target.copy(G.heroes[2].g.position); }"); pshot(pg, 'dungeon_run', True)
    f1 = J(pg, FTN); R = J(pg, "()=>({res:G.dgResult, bless:G.dg.blessing, floor:G.dg.floor, cleared:G.dg.cleared, t:Math.round(G.dg.t)})"); print('dungeon', R, f1, flush=True)
    ok('dg_fighter_ai_fights', f1['jab'] + f1['kick'] - f0['jab'] - f0['kick'] >= 5, f1)
    ok('dg_floor_clear', R['cleared'] >= 1 and (bool(R['bless']) or bool(R['res'] and R['res']['win'])), R)
    ok('dg_no_nan', J(pg, "()=>G.heroes.every(h=>Number.isFinite(h.g.position.x)&&Number.isFinite(h.hp))"))
    c.close()
    # ===== 5) 태블릿 1024x600: 마을 카드 · 상점 탭 · 전투 버튼 터치 ≥44px =====
    c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True, is_mobile=False); c.add_init_script(MOCK); pg = boot(c)
    login(pg, 't@test.kr'); J(pg, OWN, 'hero_fighter'); town(pg); sstat(pg); pg.wait_for_function(f"()=>{SH}.heroOwned('fighter')", timeout=20000)
    pg.tap('.hcard[data-h="fighter"]'); pg.wait_for_timeout(1500)
    sz = J(pg, "()=>{ const r=document.querySelector('.hcard[data-h=fighter]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), r.right<=innerWidth+1 && r.bottom<=innerHeight+1]; }")
    ok('tablet_card44', sz[0] >= 44 and sz[1] >= 44 and sz[2], sz)
    J(pg, "()=>G.shop.openShop('hero_fighter')"); pg.wait_for_timeout(900)
    ts = J(pg, "()=>[...document.querySelectorAll('#shopTabs .shopTab, #shopBuyBtn')].map(b=>{ const r=b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), r.bottom<=innerHeight+1]; })")
    ok('tablet_shop44', len(ts) >= 3 and all(w >= 44 and h >= 44 and v for w, h, v in ts), ts)
    J(pg, "()=>G.shop.closeShop(true)"); pshot(pg, 'tablet_town', True)
    J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=240000); pg.wait_for_timeout(500)
    J(pg, "()=>{ G.manual=true; }"); J(pg, SPOT); J(pg, "()=>G.sim(.3)")
    bs = J(pg, "()=>[...document.querySelectorAll('#skillBtn')].map(b=>{ const r=b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })")
    ok('tablet_skill44', bs and all(w >= 44 and h >= 44 for w, h in bs), bs)
    J(pg, PUT, [['grunt', 4.5, 0], ['grunt', 5, 1], ['imp', 5, -1]]); J(pg, "()=>{ const h=G.hero.g.position, f=G.hero.face; G.mouseGround.set(h.x+Math.sin(f)*4.8, 0, h.z+Math.cos(f)*4.8); G.hero.skillCd=0; G.sim(.1); }")
    q0 = J(pg, FTN)['q']; pg.tap('#skillBtn'); J(pg, "()=>G.sim(.4)"); ok('tablet_q_tap', J(pg, FTN)['q'] == q0 + 1)
    J(pg, "()=>G.sim(.3)"); tb = frame(pg, 'tablet_run', 12, .5); ok('tablet_not_black', tb > 25, tb)
    c.close()
    # ===== 6) 모델 파일을 못 받으면: 대체 모델(세라 몸 + 주황 색조 + 고양이 귀) 로 정상 진행 =====
    fe = []; c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK)
    c.route('**/seoyun_meshy.glb', lambda r: r.fulfill(status=404, body='nope'))
    pg = boot(c, E=fe, ignore=('Failed to load resource', '404'))
    login(pg, 'fb@test.kr'); J(pg, OWN, 'hero_fighter'); town(pg); sstat(pg); pg.wait_for_function(f"()=>{SH}.heroOwned('fighter')", timeout=20000)
    pg.click('.hcard[data-h="fighter"]'); pg.wait_for_timeout(1500)
    J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=240000); pg.wait_for_timeout(500)
    ok('fallback_model', J(pg, "()=>G.hero.cls==='fighter' && G.hero.ch.fallback===true && (globalThis.__hd3dModelFallback||[]).includes('seoyun_meshy')"), J(pg, "()=>[G.hero.cls, G.hero.ch.fallback, globalThis.__hd3dModelFallback]"))
    J(pg, "()=>{ G.manual=true; G.hero.C={...G.hero.C, armor:1}; }"); J(pg, SPOT); J(pg, "()=>G.sim(.3)")
    J(pg, PUT, [['grunt', 1.8, 0], ['grunt', 2, 1]]); f0 = J(pg, FTN); d0 = J(pg, DMG)
    for _ in range(8): J(pg, "()=>G.sim(.25)")
    f1 = J(pg, FTN); ok('fallback_combo', f1['jab'] > f0['jab'] and f1['kick'] > f0['kick'] and J(pg, DMG) > d0, f1)
    J(pg, CLEAR); J(pg, "()=>{ G.hero.cd=0; G.hero.atkT=0; G.sim(.3); }"); J(pg, PUT, [['bat', 6, 0]]); J(pg, "()=>G.sim(2.2)")
    ok('fallback_jp', J(pg, FTN)['jpFull'] + J(pg, FTN)['jpWeak'] > f1['jpFull'] + f1['jpWeak'])
    fb = frame(pg, 'fallback', 9, .5); ok('fallback_not_black', fb > 25 and J(pg, FIN), fb)
    ok('fallback_no_errors', not fe, fe[:3])
    c.close(); b.close()
print('console errors:', errs[:5])
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else 'ALL OK')
sys.exit(1 if fails or errs else 0)
