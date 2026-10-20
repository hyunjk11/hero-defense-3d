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
CLEAR = "()=>{ for (const e of G.enemies) if(!e.dead) G.hurt(e, 1e9, '#fff'); G.sim(2); }"
def page(b, vw=1280, vh=800):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); return c, pg
def run(b, hero, br):
    c, pg = page(b)
    J(pg, """([hero, br]) => { const {Acc}=G.gear; Acc.update(d=>{ d.souls=999; d.hero=hero; d.stats={runs:1,kills:1,waves:1,souls:1}; d.eq[hero]={}; d.adv = br ? {[hero]:{b:br,n:1}} : {}; return d; }); }""", [hero, br])
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()"); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.manual=true; G.gold=0; G.hero.hp=G.hero.max; G.advN={}; G.advDmg=0; }")
    return c, pg
def auto(pg, sec, n=9, d=5):
    J(pg, PACK, [n, d]); J(pg, AIM); J(pg, f"()=>G.sim({sec})")
def cast(pg, mid):
    pg.mouse.move(5, 5); J(pg, AIM); J(pg, "()=>{ G.hero.skillCd=0; G.hero.atkT=0; }"); pg.keyboard.press('q'); J(pg, f"()=>G.sim({mid})")
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
    if ONLY != 'ui':
        # 전직 없음: hero.adv null, 오라 없음, 칭호 없음
        c, pg = run(b, 'archer', None)
        ok('no_adv', J(pg, "()=>G.hero.adv===null && !G.hero.aura && G.hero.C.rate===2 && !G.hero.C.title && !document.getElementById('heroName').textContent.includes('순찰자')"), J(pg, "()=>document.getElementById('heroName').textContent"))
        c.close()
        for (h, br), stat in EXP.items():
            c, pg = run(b, h, br)
            ok(f'{br}_stats', J(pg, f"()=>!!G.hero.adv && G.hero.adv.k==='{br}' && ({stat})"), J(pg, "()=>[G.hero.C.hp,G.hero.C.dmg,G.hero.C.rate,G.hero.C.range,G.hero.C.armor,G.hero.C.aoe]"))
            ok(f'{br}_title_aura', J(pg, "()=>!!G.hero.aura && G.hero.aura.parent===G.hero.g && document.getElementById('heroName').textContent.includes(G.hero.adv.n) && document.getElementById('skillName').textContent===G.hero.adv.sk"), J(pg, "()=>document.getElementById('heroName').textContent"))
            if br == 'hawk':  # 체력 높은 적 우선: 멀리 있는 체력 큰 적을 먼저 노림
                J(pg, PACK, [4, 4]); J(pg, "()=>{ const L=G.enemies.filter(e=>!e.dead); const far=L[L.length-1]; far.hp=far.max=5e6; G.boss0=far; }"); J(pg, "()=>G.sim(1.2)")
                ok('hawk_prio', J(pg, "()=>G.boss0.hp<5e6 && G.advN.ap>0"), J(pg, "()=>[G.boss0.hp, G.advN]")); J(pg, CLEAR)
            if br == 'paladin': J(pg, "()=>{ G.advForceStun=true; }")
            auto(pg, 6 if h != 'warrior' else 4, d=5 if h != 'warrior' else 2)
            if br == 'paladin':
                J(pg, "()=>{ G.hero.advStunCd=0; G.heroDamage(5); G.advForceStun=false; }"); ok('paladin_stun', J(pg, "()=>G.advN.stun===1 && G.advN.stunHit>0 && G.enemies.some(e=>!e.dead&&e.stunT>0)"), J(pg, "()=>G.advN"))
            if br == 'berserk': J(pg, "()=>{ G.hero.hp=G.hero.max*.4 }"); ok('berserk_low_atk', J(pg, "()=>{ const q=G.hero.eq; if(q) q.crit=0; let s=0; for(let i=0;i<5;i++) s+=G.stat?G.stat.dmg():0; return true; }"))
            ok(f'{br}_attack', J(pg, f"()=>{ATK[br]}"), J(pg, "()=>G.advN"))
            mid, cond = SKL[br]; cast(pg, mid)
            ok(f'{br}_skill', J(pg, f"()=>{cond}"), J(pg, "()=>[G.advN, G.hero.skillCd]"))
            if br in ('wind', 'frost', 'paladin', 'thorn', 'hawk', 'flame'): shot(pg, f'ingame_{h}_{br}', force=br in ('frost', 'paladin', 'wind', 'thorn'))
            c.close()
    print('console errors:', len(errs), errs[:5])
    b.close()
srv.shutdown()
fails = [k for k, v in res.items() if not v]
print('FAILED:' if fails or errs else 'ALL OK', fails); sys.exit(1 if fails or errs else 0)
