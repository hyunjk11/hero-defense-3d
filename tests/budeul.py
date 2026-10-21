#!/usr/bin/env python3
"""유료 영웅 버들(메카닉) 테스트 (가짜 Supabase tests/sbmock.js, 네트워크 없음).  python3 tests/budeul.py [--shots]
잠김(마을·상점 2개 상품) → 구매 신청 → 관리자 승인 → 우편 받기 → 해금·출정 → 드릴/해머 기본 공격 피해·넉백 → [Q] 변신(슬로모션·무적·모델 교체·
보호막·로봇 공격) → 10초 후 로켓 펀치 피니시 → 원래 모델 → 전설 건틀릿(과부하 드릴 proc / 기가 해머 낙하 [E]) → 로봇 중 사망 시 복귀 · 콘솔 오류 0 · NaN/검은 화면 없음.
스크린샷 shots/budeul/: shop.png, budeul_ingame.png, budeul_attack.png, transform.png, robot.png"""
import sys, os, pathlib, io
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
import subprocess
# 버들이 숨김(data/heroes.js CLASSES.mechanic.hidden)이면 건너뜀 — 테스트는 지우지 않음. hidden 을 false 로 되돌리면 다시 실행됨
if subprocess.run(['node', '-e', "import('./src/data/heroes.js').then(m => process.exit(m.isHidden('mechanic') ? 0 : 1))"], cwd=os.path.join(os.path.dirname(__file__), '..')).returncode == 0:
    print('SKIP budeul: 버들(메카닉) 숨김 중 (src/data/heroes.js hidden: true)'); sys.exit(0)
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/budeul'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
CAM = "([r,th])=>import('./src/render/scene.js').then(({cam,updateCam})=>{ const p=G.hero.g.position; cam.target.set(p.x,1.2,p.z); cam.r=r; cam.phi=.9; cam.theta=th; updateCam(); })"
def lum(png):  # 화면 평균 밝기 (검은 화면 검사)
    from PIL import Image, ImageStat
    return ImageStat.Stat(Image.open(io.BytesIO(png)).convert('L')).mean[0]
def frame(pg, name=None, r=15, th=.4):
    J(pg, CAM, [r, th]); J(pg, RAF); png = pg.screenshot(timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
    if SHOTS and name: open(f'{OUT}/{name}.png', 'wb').write(png)
    return lum(png)
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb')||'{}')")
SH = "G.shop.Sh"
def boot(c, q='?seed=12345&rng=777&flow=1&budeul=1'):
    pg = c.new_page(); pg.on('dialog', lambda d: d.accept()); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000); return pg
def login(pg, email, up=True):
    if J(pg, '()=>G.screen') == 'intro': pg.mouse.click(640, 400); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'town': pg.click('#twMenu'); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'menu': pg.click('#mnAuth'); pg.wait_for_timeout(500)
    pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp' if up else '#lgIn'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(600)
def town(pg): J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(900)
def sstat(pg): pg.wait_for_function(f"()=>{SH}.S.status!=='loading'", timeout=15000); return J(pg, f"()=>{SH}.S.status")
PACK = """([n, d]) => { const h=G.hero.g.position, a0=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy(i%3?'grunt':'imp', 40); const a=a0+(i-n/2)*.22, r=d+(i%3)*.8;
  const x=h.x+Math.sin(a)*r, z=h.z+Math.cos(a)*r; e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; } return G.enemies.length; }"""
HPB = "()=>window.__bp.reduce((a,e)=>a+(e.dead?e.max:e.max-Math.max(0,e.hp)),0)"
SNAP = "()=>{ window.__bp=G.enemies.filter(e=>!e.dead); }"
FACE = "()=>{ const L=G.enemies.filter(e=>!e.dead); if(!L.length) return; let x=0,z=0; for(const e of L){x+=e.g.position.x;z+=e.g.position.z;} x/=L.length; z/=L.length; G.mouseGround.set(x,0,z); const h=G.hero.g.position; G.hero.face=Math.atan2(x-h.x,z-h.z); }"
FIN = "()=>Number.isFinite(G.hero.g.position.x) && Number.isFinite(G.hero.hp) && G.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.g.position.x)&&Number.isFinite(e.g.position.z))"

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = boot(c)
    # ---- 1) 회원 p: 버들 잠김 → 잠긴 카드 → 상점(버들 상품) → 구매 신청
    login(pg, 'p@test.kr'); town(pg); sstat(pg)
    ok('town_locked', J(pg, "()=>{const b=document.querySelector('.hcard[data-h=mechanic]'); return !!b && b.classList.contains('locked') && b.innerText.includes('🔒') && b.innerText.includes('버들') && b.innerText.includes('상점에서 구매')}"))
    pg.click('.hcard[data-h="mechanic"]'); pg.wait_for_timeout(500)
    ok('locked_opens_mech_product', not hidden(pg, 'shopPanel') and J(pg, "()=>G.shop.ui().prod") == 'hero_mechanic' and J(pg, "()=>G.gear.Acc.load().hero") != 'mechanic')
    pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('구매 신청')", timeout=15000)
    ok('two_products', J(pg, "()=>[...document.querySelectorAll('#shopTabs .shopTab')].map(b=>b.dataset.k)") == ['hero_gunner', 'hero_mechanic'] and '버들' in pg.inner_text('.shopTitle') and '₩9,900' in pg.inner_text('#shopPrice'))
    ok('shop_texts', '변신' in pg.inner_text('#shopBody') and '메카닉' in pg.inner_text('.pvName') and 'undefined' not in pg.inner_text('#shopBody'))
    pg.wait_for_timeout(900)
    if SHOTS: J(pg, RAF); pg.locator('#shopPanel').screenshot(path=f'{OUT}/shop.png'); J(pg, "()=>{ G.pauseRender=false }")
    pg.click('.shopTab[data-k="hero_gunner"]'); pg.wait_for_timeout(300); ok('tab_switch', '로즈' in pg.inner_text('.shopTitle') and J(pg, "()=>G.shop.ui().prod") == 'hero_gunner')
    pg.click('.shopTab[data-k="hero_mechanic"]'); pg.wait_for_timeout(300)
    pg.click('#shopBuyBtn'); pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('승인 대기')", timeout=15000)
    ok('order_pending', [(o['item'], o['status']) for o in db(pg)['hd3d_orders'].values()] == [('hero_mechanic', 'pending')] and '버들' in pg.inner_text('#shopMsg'))
    pg.click('.shopTab[data-k="hero_gunner"]'); pg.wait_for_timeout(300); ok('other_product_independent', '구매 신청' in pg.inner_text('#shopBuyBtn'))
    J(pg, "()=>G.shop.closeShop(true)")
    J(pg, "()=>G.gear.Acc.update(d=>({...d, hero:'mechanic'}))"); pg.wait_for_timeout(300)
    ok('save_tamper_no_unlock', J(pg, f"()=>!{SH}.heroOwned('mechanic') && document.querySelector('.hcard.sel').dataset.h!=='mechanic'"))
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); const a=await c.from('hd3d_owned').insert({item:'hero_mechanic'}); return a.error&&a.error.code; }"); ok('owned_unwritable', r == '42501', r)
    # ---- 2) 관리자 승인 → 우편
    login(pg, 'hyunjk11@daum.net'); town(pg); pg.click('#twAdmin'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length>0", timeout=15000)
    ok('admin_sees_mech_order', '버들' in pg.inner_text('#admBody'))
    pg.click('#admBody .admOk'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.includes('승인 완료')", timeout=15000)
    ok('approved_mail', any((m.get('reward') or {}).get('hero') == 'mechanic' for m in db(pg)['hd3d_mail'].values()))
    pg.click('#admTabs .ftab[data-t="mail"]'); ok('admin_hero_options', J(pg, "()=>[...document.querySelectorAll('#amHero option')].map(o=>o.value)") == ['', 'gunner', 'mechanic'])
    pg.click('#admClose')
    # ---- 3) p: 받기 → 해금 → 선택 → 출정 (전설 건틀릿 과부하 드릴 장착)
    login(pg, 'p@test.kr', up=False); town(pg); sstat(pg)
    ok('locked_before_claim', J(pg, "()=>document.querySelector('.hcard[data-h=mechanic]').classList.contains('locked')"))
    pg.click('#twMail'); pg.wait_for_function("()=>document.querySelectorAll('#mailList .mClaim').length===1", timeout=15000)
    ok('mail_icon', '🛠️' in pg.inner_text('#mailList') and '버들' in pg.inner_text('#mailList'))
    pg.click('#mailList .mClaim'); pg.wait_for_function("()=>document.getElementById('mailMsg').innerText.includes('해금')", timeout=15000)
    ok('unlocked', J(pg, f"()=>{SH}.heroOwned('mechanic') && !{SH}.heroOwned('gunner') && !document.querySelector('.hcard[data-h=mechanic]').classList.contains('locked')") and any(k.endswith(':hero_mechanic') for k in db(pg)['hd3d_owned']))
    r = J(pg, f"()=>{SH}.order('hero_mechanic')"); ok('owned_cannot_buy', not r['ok'] and '보유' in r['msg'], r)
    pg.click('#mailClose')
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=97; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.inv.push({...E.makeItem('weapon','mechanic',4,r), id:'lgM', u:'overdrill'}); d.eq.mechanic={weapon:'lgM'}; return d; }); }""")
    pg.click('.hcard[data-h="mechanic"]'); pg.wait_for_timeout(600)
    ok('selectable', J(pg, "()=>G.gear.Acc.load().hero") == 'mechanic' and '버들' in pg.inner_text('.hcard.sel') and J(pg, "()=>!!G.townHero()"))
    J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=180000); pg.wait_for_timeout(500)
    ok('in_run', J(pg, "()=>[G.hero.cls, G.hero.lsk, !!G.hero.robot, !!G.hero.ch.tips.drill]") == ['mechanic', 'overdrill', True, True], J(pg, "()=>[G.hero.cls, G.hero.lsk]"))
    st = J(pg, "async()=>{ const C=(await import('./src/data/heroes.js')).CLASSES, H=C.mechanic; return {hp:H.hp, dmg:H.dmg, rate:H.rate, range:H.range, armor:H.armor, cd:H.cd, max:G.hero.max, maxOther:Math.max(...Object.entries(C).filter(([k])=>k!=='mechanic').map(([,c])=>c.hp))}; }")
    ok('highest_hp', st['hp'] > st['maxOther'], st)
    ok('hud_name', '버들' in pg.inner_text('#heroName') and '변신' in pg.inner_text('#skillName'))
    # ---- 4) 기본 공격: 드릴(다단)/해머(넉백) 교대
    # 코어(밝은 수정) 옆이 아닌 탁 트인 풀밭으로 영웅 이동(앞쪽 +z 방향도 비어 있는 곳) → 스크린샷이 잘 보이게
    spot = J(pg, """()=>{ const ok=(c,r)=>{ for(let dc=-1;dc<=1;dc++) for(let dr=-1;dr<=1;dr++){ const t=G.tileAt(c+dc,r+dr); if(!t||t.tower||t.bar||(t.t!==G.T.GRASS&&t.t!==G.T.CARVED)) return false; } return true; };
      for(const need2 of [1,0]){ let best=null, bd=1e9; for(let c=1;c<G.GW-1;c++) for(let r=1;r<G.GH-1;r++){ const d=Math.hypot(c-G.CORE[0],r-G.CORE[1]); if(d<6||d>=bd||!ok(c,r)||(need2&&!ok(c,r+3))) continue; bd=d; best=[c,r]; }
        if(best){ const [x,z]=G.tileXZ(best[0],best[1]); G.hero.g.position.set(x,0,z); G.hero.path=[]; G.hero.face=0; G.hero.g.rotation.y=0; return [...best, need2]; } } return null; }""")
    print('spot', spot)
    J(pg, "()=>G.sim(.6)"); i0 = frame(pg, 'budeul_ingame', 8, .35)  # 적 없이 서 있는 모습 (깨끗한 스크린샷)
    J(pg, "()=>{ G.manual=true; G.legendSeed(7); G.legendN={}; G.legendDmg=0; G.hero.C={...G.hero.C, armor:1}; }")
    J(pg, PACK, [8, 2.2]); J(pg, FACE); J(pg, SNAP); h0 = J(pg, HPB); n0 = J(pg, "()=>({...G.mechN})")
    J(pg, "()=>G.sim(.35)"); a1 = frame(pg, 'budeul_attack', 9, .5)
    for _ in range(8): J(pg, "()=>G.sim(.25)")
    n1 = J(pg, "()=>G.mechN")
    ok('drill_and_hammer', n1['drill'] > n0['drill'] and n1['hammer'] > n0['hammer'] and n1['drillHits'] >= 3, n1)
    ok('attacks_damage', J(pg, HPB) > h0, (h0, J(pg, HPB)))
    ok('hammer_knockback', n1['knock'] > n0['knock'])
    i1 = frame(pg, None, 13, .35); ok('not_black_ingame', i0 > 25 and a1 > 25 and i1 > 25, (i0, a1, i1))
    for _ in range(60):
        if J(pg, "()=>G.legendN['overdrill']||0"): break
        J(pg, "()=>G.sim(.25)")
    J(pg, "()=>G.sim(.7)"); ok('overdrill_proc', J(pg, "()=>(G.legendN['overdrill']||0)>=1 && G.mechN.overdrill>=1 && G.legendDmg>0"), J(pg, "()=>[G.legendN, G.legendDmg]"))
    # ---- 5) [Q] 변신 → 로봇 10초 → 로켓 펀치 → 복귀
    J(pg, "()=>G.sim(1.2)"); J(pg, FACE); J(pg, "()=>{ G.hero.skillCd=0; }"); hp0 = J(pg, "()=>G.hero.hp")
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.05)")
    ok('q_transform_start', J(pg, "()=>G.mechN.tf===1 && G.hero.mech.busy>0 && G.hero.mech.inv && G.slowT>0 && G.hero.skillCd>20"), J(pg, "()=>[G.mechN.tf, G.hero.mech.busy, G.slowT, G.hero.skillCd]"))
    J(pg, "()=>{ G.hero.C={...G.hero.C, armor:0}; G.heroDamage(300); }"); ok('invulnerable_during_tf', J(pg, "()=>G.hero.hp") == hp0)
    J(pg, "()=>G.sim(.2)")  # 슬로 모션: 실제 0.2초 → 게임 시간 ~0.07초
    ok('slowmo', 0 < J(pg, "()=>G.hero.mech.seq.t") < .12, J(pg, "()=>G.hero.mech.seq.t"))
    J(pg, "()=>{ let n=0; while(!G.hero.mech.seq.swap && n++<200) G.sim(.02); while(G.hero.mech.seq && !G.hero.mech.seq.land && n++<400) G.sim(.02); G.sim(.1); }"); t0 = frame(pg, 'transform', 13, .45)  # 착지 직후(섬광이 걷힌 뒤): 충격파·균열·파편
    ok('swap_robot_model', J(pg, "()=>G.hero.ch===G.hero.robot && G.hero.robot.root.visible && !G.hero.human.root.visible"))
    J(pg, "()=>G.sim(1)")
    ok('robot_active', J(pg, "()=>G.hero.robo && G.hero.mech.rT>8 && G.hero.mech.busy===0 && !G.hero.mech.inv && G.hero.mech.shield>0 && G.mechN.knock>0"), J(pg, "()=>[G.hero.robo, G.hero.mech]"))
    ok('robot_bigger_range', J(pg, "async()=>{ const {stat}=await import('./src/heroes/hero.js'); return stat.range() > G.hero.C.range*1.4; }"))
    sh0 = J(pg, "()=>G.hero.mech.shield"); hp1 = J(pg, "()=>G.hero.hp"); J(pg, "()=>G.heroDamage(100)")
    ok('shield_absorbs', J(pg, "()=>G.hero.mech.shield") < sh0 and J(pg, "()=>G.hero.hp") == hp1, (sh0, J(pg, "()=>G.hero.mech.shield")))
    J(pg, "()=>{ G.hero.C={...G.hero.C, armor:1}; }")
    q2 = J(pg, "()=>G.mechN.tf"); J(pg, "()=>{ G.hero.skillCd=0; G.castSkill(); }"); ok('no_double_transform', J(pg, "()=>G.mechN.tf") == q2)
    J(pg, "()=>{ G.hero.skillCd=20; }")
    if J(pg, "()=>G.enemies.filter(e=>!e.dead).length") < 5: J(pg, PACK, [8, 3])
    J(pg, FACE); J(pg, SNAP); h2 = J(pg, HPB); r0 = J(pg, "()=>G.mechN.robotHits")
    for _ in range(10): J(pg, "()=>G.sim(.3)")
    ok('robot_attacks_damage', J(pg, "()=>G.mechN.robotHits") > r0 and J(pg, HPB) > h2, (r0, J(pg, "()=>G.mechN.robotHits")))
    r1 = frame(pg, 'robot', 14, .4); ok('not_black_robot', r1 > 25 and t0 > 25, (t0, r1))
    ok('no_nan_robot', J(pg, FIN))
    J(pg, "()=>{ let n=0; while(G.hero.robo && n++<400) G.sim(.05); }")
    ok('finisher', J(pg, "()=>G.mechN.finisher===1 && G.hero.mech.busy>0"), J(pg, "()=>[G.mechN.finisher, G.hero.mech.busy]"))
    J(pg, "()=>G.sim(1.5)")
    ok('back_to_human', J(pg, "()=>!G.hero.robo && G.hero.ch===G.hero.human && G.hero.human.root.visible && !G.hero.robot.root.visible && G.hero.mech.busy===0 && G.hero.mech.shield===0 && G.hero.hb.y<4"))
    ok('fx_cleanup_mid', J(pg, FIN))
    # ---- 6) 기가 해머 낙하 [E]
    J(pg, "()=>{ G.hero.lsk='gigahammer'; G.hero.lcd=0; G.legendN={}; G.sim(.2); }"); pg.wait_for_timeout(100); J(pg, "()=>G.sim(.1)")
    ok('legbtn_shown', not hidden(pg, 'legBtn') and '기가 해머' in pg.inner_text('#legBtn'))
    if J(pg, "()=>G.enemies.filter(e=>!e.dead).length") < 5: J(pg, PACK, [8, 3])
    pg.mouse.move(5, 5); J(pg, FACE); J(pg, SNAP); h3 = J(pg, HPB); pg.keyboard.press('e'); J(pg, "()=>G.sim(.05)")
    ok('giga_cast', J(pg, "()=>G.legendN['gigahammer']===1 && G.mechN.giga===1 && G.hero.lcd>5"))
    J(pg, "()=>G.sim(.6)"); ok('giga_damage_stun', J(pg, HPB) > h3 and J(pg, "()=>G.enemies.some(e=>!e.dead&&e.stunT>0)"), (h3, J(pg, HPB)))
    J(pg, "()=>{ G.hero.lcd=0; G.sim(.6) }"); pg.tap('#legBtn'); J(pg, "()=>G.sim(.05)"); ok('giga_touch', J(pg, "()=>G.legendN['gigahammer']") == 2)
    # ---- 7) 로봇 중 사망 → 즉시 원래 모습, 부활 후 다시 변신 가능
    J(pg, "()=>{ G.sim(3); G.hero.skillCd=0; G.castSkill(); G.sim(2.5); }"); ok('robot_again', J(pg, "()=>G.hero.robo"))
    J(pg, "()=>{ G.hero.C={...G.hero.C, armor:0}; G.hero.mech.shield=0; G.heroDamage(1e7); }")
    ok('death_reverts', J(pg, "()=>G.hero.dead>0 && !G.hero.robo && G.hero.ch===G.hero.human && !G.hero.robot.root.visible"))
    J(pg, "()=>G.sim(5.5)"); ok('respawn', J(pg, "()=>G.hero.dead<=0 && G.hero.hp===G.hero.max"))
    J(pg, "()=>{ G.hero.skillCd=0; G.castSkill(); G.sim(2.5); }"); ok('transform_after_respawn', J(pg, "()=>G.hero.robo && G.mechN.tf===3"))
    J(pg, "()=>G.sim(13)"); ok('fx_cleanup', J(pg, "()=>!G.hero.robo && G.lfx.length===0") and J(pg, FIN), J(pg, "()=>G.lfx.length"))
    fl = frame(pg, None, 15, .3); ok('not_black_end', fl > 25, fl)
    c.close()
    # ---- 8) 다른 계정은 버들 잠김 + 비소유 상태로 출정 시도 → 기본 영웅
    c = b.new_context(); c.add_init_script(MOCK); pg = boot(c); login(pg, 'q@test.kr'); town(pg); sstat(pg)
    ok('other_user_locked', J(pg, f"()=>!{SH}.heroOwned('mechanic') && document.querySelector('.hcard[data-h=mechanic]').classList.contains('locked')"))
    J(pg, "()=>G.gear.Acc.update(d=>({...d, hero:'mechanic'}))"); J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=180000)
    ok('tampered_run_not_mechanic', J(pg, '()=>G.hero.cls') != 'mechanic', J(pg, '()=>G.hero.cls'))
    c.close(); b.close()
print('console errors:', errs[:5])
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else 'ALL OK')
sys.exit(1 if fails or errs else 0)
