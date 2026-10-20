#!/usr/bin/env python3
"""전직(클래스 전직) 브라우저 테스트 (+ 스크린샷 shots/advance/).  python3 tests/advance.py [--shots] [--only ui|game]
① 여신탑 전직 탭(1024×600): 조건 체크리스트 · 분기 카드 · 확인 창 · 전직/재전직 · 상한 15 · 유료 영웅 소유권(서버) · 연구소 보너스 줄
② 실전: 분기 8종 스탯(G.hero.C) · 기본 공격 변형 카운터(G.advN) · Q 변형 · 오라 링 · 칭호 · 전직 없음 = hero.adv null"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/advance'; os.makedirs(OUT, exist_ok=True)
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
PICK = sys.argv[sys.argv.index('--br') + 1].split(',') if '--br' in sys.argv else None
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name, force=False):
    if SHOTS or force: J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
PACK = """([n, d]) => { const h=G.hero.g.position, a0=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy(i%3?'grunt':'imp', 40); const a=a0+(i-n/2)*.18, r=d+(i%3)*1.2;
  const x=h.x+Math.sin(a)*r, z=h.z+Math.cos(a)*r; e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; e.E={...e.E, spd:0}; } return G.enemies.length; }"""
AIM = "()=>{ const L=G.enemies.filter(e=>!e.dead); if(!L.length) return null; let x=0,z=0; for(const e of L){x+=e.g.position.x;z+=e.g.position.z;} x/=L.length; z/=L.length; G.mouseGround.set(x,0,z); const h=G.hero.g.position; G.hero.face=Math.atan2(x-h.x,z-h.z); return [x,z]; }"
TIGHT = """([n, d]) => { const h=G.hero.g.position, a=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy('grunt', 40); const x=h.x+Math.sin(a)*d+(i%3-1)*.5, z=h.z+Math.cos(a)*d+((i/3|0)-.5)*.6;
  e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; e.E={...e.E, spd:0}; } }"""
LINE = """([n, d]) => { const h=G.hero.g.position, a=G.hero.face; let x, z; for (let i=0;i<n;i++){ const e=G.spawnEnemy('grunt', 40); x=h.x+Math.sin(a)*(d+i*1.6); z=h.z+Math.cos(a)*(d+i*1.6);
  e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; e.E={...e.E, spd:0}; } G.__aim=[x,z]; }"""
CLEAR = "()=>{ for (const e of G.enemies) if(!e.dead) G.hurt(e, 1e9, '#fff'); G.sim(2); }"
def page(b, vw=1280, vh=800, login=True):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300)
    if login: pg.click('#lgGuest'); pg.wait_for_timeout(300)
    return c, pg
NUSER = [0]
def own_gunner(pg):  # 가짜 서버(hd3d_owned)에 로즈 소유권 — 실서버라면 관리자 승인 → 우편으로 생김
    NUSER[0] += 1; pg.fill('#lgEmail', f'adv{NUSER[0]}@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(300)
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users).slice(-1)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
def run(b, hero, br):
    c, pg = page(b, login=hero != 'gunner')
    if hero == 'gunner': own_gunner(pg)
    J(pg, """([hero, br]) => { const {Acc}=G.gear; Acc.update(d=>{ d.souls=999; d.hero=hero; d.stats={runs:1,kills:1,waves:1,souls:1}; d.eq[hero]={}; d.adv = br ? {[hero]:{b:br,n:1}} : {}; return d; }); }""", [hero, br])
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'" + (" && G.shop.Sh.heroOwned('gunner')" if hero == 'gunner' else ''), timeout=30000); pg.wait_for_timeout(800)
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()"); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.manual=true; G.gold=0; G.hero.hp=G.hero.max; G.advN={}; G.advDmg=0; }")
    return c, pg
def auto(pg, sec, n=9, d=5):
    J(pg, PACK, [n, d]); J(pg, AIM); J(pg, f"()=>G.sim({sec})")
def cast(pg, mid, aim=True):
    pg.mouse.move(5, 5); J(pg, AIM) if aim else J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); }"); J(pg, "()=>{ G.hero.skillCd=0; G.hero.atkT=0; }"); pg.keyboard.press('q'); J(pg, f"()=>G.sim({mid})")
EXP = {  # 분기 → (스탯 확인 JS, 기대)
  ('archer', 'wind'): "Math.abs(G.hero.C.rate-2.5)<1e-6", ('archer', 'hawk'): "Math.abs(G.hero.C.range-14.3)<1e-6 && Math.abs(G.hero.C.dmg-24*1.7)<1e-6",
  ('mage', 'flame'): "G.hero.C.aoe===3", ('mage', 'frost'): "Math.abs(G.hero.C.rate-.95*1.1)<1e-6",
  ('warrior', 'paladin'): "G.hero.C.hp===1250 && G.hero.C.armor===.55", ('warrior', 'berserk'): "G.hero.C.armor===.25 && Math.abs(G.hero.C.rate-1.69)<1e-6",
  ('gunner', 'duel'): "Math.abs(G.hero.C.rate-4.2*1.2)<1e-6", ('gunner', 'thorn'): "Math.abs(G.hero.C.dmg-26)<1e-6 && Math.abs(G.hero.C.rate-4.2*.6)<1e-6",
}
ATK = { 'wind': "G.advN.multi>0", 'hawk': "G.advN.ap>0", 'flame': "G.advN.burn>0 && G.advN.burnTick>0", 'frost': "G.advN.freeze>0",
  'paladin': "true", 'berserk': "G.advN.leech>0", 'duel': "G.advN.rico>0 && G.advN.ricoHit>0", 'thorn': "G.advN.splash>0 && G.advN.splashHit>0" }
SKL = { 'wind': (1.6, "G.advN.skill_storm===1 && G.enemies.some(e=>!e.dead&&e.slowT>0)"), 'hawk': (.6, "G.advN.skill_snipe===1 && G.advN.snipeHit>=2"),
  'flame': (1.8, "G.advN.skill_meteors===1 && G.enemies.filter(e=>!e.dead&&e.hp<1e6).length>=3"), 'frost': (1.15, "G.advN.glacierFreeze>=3 && G.advN.comet===12 && G.enemies.some(e=>!e.dead&&e.frozen&&e.stunT>1.5)"),
  'paladin': (1.2, "G.advN.sanctHit>0 && G.hero.sanctT>2 && G.enemies.some(e=>!e.dead&&e.slowT>0)"), 'berserk': (.5, "G.hero.spinT>3 && G.hero.spinR>4.3 && G.hero.spinSpd===1.3"),
  'duel': (2.0, "G.hero.roseT>0 && Math.abs(G.hero.roseDur-2.6875*1.4)<1e-3"), 'thorn': (1.4, "G.advN.shell===3") }
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    if ONLY != 'game':
        c, pg = page(b, 1024, 600)
        J(pg, """()=>{ const {Acc}=G.gear; Acc.update(d=>{ d.souls=900; d.hero='archer'; d.stats={runs:3,kills:1,waves:1,souls:1}; d.st={'1-1':3,'1-2':3,'1-3':3,'1-4':3,'1-5':3,'1-6':3}; d.heroLv.archer={hp:4,atk:6}; d.mat.crystal=25; return d; }); }""")
        pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
        J(pg, "()=>{ G.openBlessing(); G.blessTab('adv'); }"); pg.wait_for_timeout(300)
        ok('tab_visible', not hidden(pg, 'twAdv') and hidden(pg, 'twPerm') and J(pg, "()=>document.querySelectorAll('#twAdv .advCard').length") == 2)
        chk = J(pg, "()=>[...document.querySelectorAll('#twAdv .advChk li')].map(l=>l.className)")
        ok('checklist_unmet', chk == ['no', 'ok', 'no', 'no'], chk)
        ok('buttons_locked', J(pg, "()=>[...document.querySelectorAll('#twAdv .advBtn')].every(b=>b.disabled) && document.querySelector('#twAdv .why').textContent.includes('2장 보스')"))
        J(pg, """()=>{ const {Acc}=G.gear; Acc.update(d=>{ d.souls=2000; for (const id of ['2-1','2-2','2-3','2-4']) d.st[id]=2; d.hq={archer:{boss:1,clr:5}}; d.mat.essence=3; return d; }); G.blessTab('adv'); }"""); pg.wait_for_timeout(300)
        chk = J(pg, "()=>[...document.querySelectorAll('#twAdv .advChk li')].map(l=>l.className)"); ok('checklist_met', chk == ['ok'] * 4, chk)
        ok('buttons_open', J(pg, "()=>[...document.querySelectorAll('#twAdv .advBtn')].every(b=>!b.disabled)"))
        bb = J(pg, "()=>{ const r=document.getElementById('twBless').getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]; }"); ok('tablet_fits', bb[0] >= 0 and bb[1] >= 0 and bb[2] <= 1024 and bb[3] <= 600, bb)
        pg.click('#twAdv .advCard[data-b="wind"] h4'); pg.wait_for_timeout(200)
        ok('preview_ring', J(pg, "()=>{ const h=G.townHero(); return document.querySelector('#twAdv .advCard.pv').dataset.b; }") == 'wind')
        shot(pg, 'tab_adv_1024x600', force=True)
        J(pg, "()=>document.querySelector('#twAdv .advBtn[data-b=\"wind\"]').scrollIntoView()"); pg.click('#twAdv .advBtn[data-b="wind"]'); pg.wait_for_timeout(300)
        ok('confirm_open', not hidden(pg, 'advConfirm') and '바람의 순찰자' in pg.inner_text('#advConfirm') and '1500' in pg.inner_text('#advConfirm'))
        shot(pg, 'confirm_1024x600', force=True)
        pg.click('#acNo'); ok('confirm_cancel', hidden(pg, 'advConfirm') and J(pg, "()=>Object.keys(G.gear.Acc.load().adv).length") == 0)
        pg.click('#twAdv .advBtn[data-b="wind"]'); pg.wait_for_timeout(200); pg.click('#acOk'); pg.wait_for_timeout(400)
        sv = J(pg, "()=>{ const s=G.gear.Acc.load(); return [s.adv.archer, s.souls, s.mat.crystal, s.mat.essence||0]; }"); ok('advanced', sv == [{'b': 'wind', 'n': 1}, 500, 5, 0], sv)
        ok('cur_card', J(pg, "()=>document.querySelector('#twAdv .advCard.cur').dataset.b") == 'wind' and '바람의 순찰자' in pg.inner_text('#twAdv .advCur'))
        ok('hcard_title', '바람의 순찰자' in pg.inner_text('#twHeroes .hcard[data-h="archer"]'))
        shot(pg, 'tab_adv_done_1024x600', force=True)
        J(pg, "()=>G.blessTab('perm')"); ok('perm_cap_15', '/15' in pg.inner_text('#twPerm'), pg.inner_text('#twPerm')[:80])
        J(pg, "()=>{ G.gear.Acc.update(d=>{ d.souls=600; return d; }); G.blessTab('adv'); }"); pg.wait_for_timeout(200)
        J(pg, "()=>document.querySelector('#twAdv .advBtn[data-b=\"hawk\"]').scrollIntoView()"); pg.click('#twAdv .advBtn[data-b="hawk"]'); pg.wait_for_timeout(200)
        ok('switch_confirm', '재전직' in pg.inner_text('#advConfirm') and '500' in pg.inner_text('#advConfirm')); pg.click('#acOk'); pg.wait_for_timeout(300)
        sv = J(pg, "()=>{ const s=G.gear.Acc.load(); return [s.adv.archer, s.souls]; }"); ok('switched', sv == [{'b': 'hawk', 'n': 2}, 100], sv)
        J(pg, "()=>{ G.closeBlessing(); G.openLab(); G.labTab('arrow'); }"); pg.wait_for_timeout(300)
        ok('lab_bonus', not hidden(pg, 'labAdv') and '저격수 타워 피해 +10%' in pg.inner_text('#labAdv'), pg.inner_text('#labAdv'))
        J(pg, "()=>G.labTab('magic')"); ok('lab_bonus_other_type', hidden(pg, 'labAdv')); J(pg, "()=>G.closeLab()")
        # 유료 영웅: 세이브에 로즈 + 전직 기록이 있어도 서버 소유권이 없으면 로즈 전직 탭이 아니라 기본 영웅
        J(pg, "()=>{ G.gear.Acc.update(d=>{ d.hero='gunner'; d.adv.gunner={b:'duel',n:1}; return d; }); G.openBlessing(); G.blessTab('adv'); }"); pg.wait_for_timeout(300)
        ok('paid_not_owned', '로즈' not in pg.inner_text('#twAdv') and '장미' not in pg.inner_text('#twAdv'), pg.inner_text('#twAdv')[:60])
        c.close()
    if ONLY != 'ui':
        # 전직 없음: hero.adv null, 오라 없음, 칭호 없음
        c, pg = run(b, 'archer', None)
        ok('no_adv', J(pg, "()=>G.hero.adv===null && !G.hero.aura && G.hero.C.rate===2 && !G.hero.C.title && !document.getElementById('heroName').textContent.includes('순찰자')"), J(pg, "()=>document.getElementById('heroName').textContent"))
        c.close()
        for (h, br), stat in EXP.items():
            if PICK and br not in PICK: continue
            c, pg = run(b, h, br)
            ok(f'{br}_stats', J(pg, f"()=>!!G.hero.adv && G.hero.adv.k==='{br}' && ({stat})"), J(pg, "()=>[G.hero.C.hp,G.hero.C.dmg,G.hero.C.rate,G.hero.C.range,G.hero.C.armor,G.hero.C.aoe]"))
            ok(f'{br}_title_aura', J(pg, "()=>!!G.hero.aura && G.hero.aura.parent===G.hero.g && document.getElementById('heroName').textContent.includes(G.hero.adv.n) && document.getElementById('skillName').textContent===G.hero.adv.sk"), J(pg, "()=>document.getElementById('heroName').textContent"))
            if br == 'hawk':  # 체력 높은 적 우선: 멀리 있는 체력 큰 적을 먼저 노림
                J(pg, PACK, [4, 4]); J(pg, "()=>{ const L=G.enemies.filter(e=>!e.dead); const far=L[L.length-1]; far.hp=far.max=5e6; G.boss0=far; }"); J(pg, "()=>G.sim(1.2)")
                ok('hawk_prio', J(pg, "()=>G.boss0.hp<5e6 && G.advN.ap>0"), J(pg, "()=>[G.boss0.hp, G.advN]")); J(pg, CLEAR)
            if br == 'paladin': J(pg, "()=>{ G.advForceStun=true; }")
            if br == 'thorn': J(pg, TIGHT, [6, 5])  # 소폭발(반경 1.2) 검사용 밀집 무리
            auto(pg, 6 if h != 'warrior' else 4, d=5 if h != 'warrior' else 2)
            if br == 'paladin':
                J(pg, "()=>{ G.hero.advStunCd=0; G.heroDamage(5); G.advForceStun=false; }"); ok('paladin_stun', J(pg, "()=>G.advN.stun===1 && G.advN.stunHit>0 && G.enemies.some(e=>!e.dead&&e.stunT>0)"), J(pg, "()=>G.advN"))
            if br == 'berserk': J(pg, "()=>{ G.hero.hp=G.hero.max*.4 }"); ok('berserk_low_atk', J(pg, "()=>{ const q=G.hero.eq; if(q) q.crit=0; let s=0; for(let i=0;i<5;i++) s+=G.stat?G.stat.dmg():0; return true; }"))
            ok(f'{br}_attack', J(pg, f"()=>{ATK[br]}"), J(pg, "()=>G.advN"))
            if br == 'hawk': J(pg, CLEAR); J(pg, LINE, [3, 4])  # 일섬 저격: 일직선 위 적 3명
            mid, cond = SKL[br]; cast(pg, mid, br != 'hawk')
            ok(f'{br}_skill', J(pg, f"()=>{cond}"), J(pg, "()=>[G.advN, G.hero.skillCd, G.projs.map(p=>p.kind), G.mouseGround.toArray(), G.hero.g.position.toArray()]"))
            if br in ('wind', 'frost', 'paladin', 'thorn', 'hawk', 'flame'): shot(pg, f'ingame_{h}_{br}', force=br in ('frost', 'paladin', 'wind', 'thorn'))
            c.close()
    print('console errors:', len(errs), errs[:5])
    b.close()
srv.shutdown()
fails = [k for k, v in res.items() if not v]
print('FAILED:' if fails or errs else 'ALL OK', fails); sys.exit(1 if fails or errs else 0)
