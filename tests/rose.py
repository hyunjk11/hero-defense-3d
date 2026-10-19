#!/usr/bin/env python3
"""유료 영웅 로즈(총사) 출정 테스트: 소유(가짜 서버 hd3d_owned) → 마을에서 선택 → 출정 → 쌍권총 연사 · Q 로즈 피니시 · 전설 쌍권총(도탄 난사 proc / 장미 탄막 [E]) · 콘솔 오류 0.
python3 tests/rose.py [--shots]   (스크린샷 shots/shop/rose_ingame.png, rose_skill.png)"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/shop'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name):
    if SHOTS: J(pg, "async()=>{ const {cam}=await import('./src/render/scene.js'); const p=G.hero.g.position; cam.target.set(p.x-1.5,0,p.z); cam.r=19; cam.phi=.85; cam.theta=.35; }"); J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
PACK = """([n, d]) => { const h=G.hero.g.position, a0=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy(i%3?'grunt':'imp', 40); const a=a0+(i-n/2)*.18, r=d+(i%3)*1.2;
  const x=h.x+Math.sin(a)*r, z=h.z+Math.cos(a)*r; e.g.position.set(x,0,z); e.tile=G.toTileXZ?G.toTileXZ(x,z):e.tile; e.state='walk'; e.spawnT=0; e.next=null; } return G.enemies.length; }"""
AIM = "()=>{ const L=G.enemies.filter(e=>!e.dead); if(!L.length) return null; let x=0,z=0; for(const e of L){x+=e.g.position.x;z+=e.g.position.z;} x/=L.length; z/=L.length; G.mouseGround.set(x,0,z); const h=G.hero.g.position; G.hero.face=Math.atan2(x-h.x,z-h.z); return [x,z]; }"
HP = "()=>G.enemies.reduce((a,e)=>a+(e.dead?e.max:e.max-e.hp),0)"
HPB = "()=>window.__bp.reduce((a,e)=>a+(e.dead?e.max:e.max-Math.max(0,e.hp)),0)"  # 탄막 직전 살아 있던 적 기준 (죽은 적이 G.enemies에서 빠져도 합계가 줄지 않게)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
    pg.mouse.click(640, 400); pg.wait_for_timeout(300); pg.fill('#lgEmail', 'rose@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(500)
    # 가짜 서버에 소유권 기록 (실서버라면 관리자 승인 → 우편 받기로 생김) + 전설 쌍권총(도탄 난사) 지급
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=97; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.souls=10; d.stats={runs:1,kills:1,waves:1,souls:1}; d.inv.push({...E.makeItem('weapon','gunner',4,r), id:'lgR', u:'ricochet'}); d.eq.gunner={weapon:'lgR'}; return d; }); }""")
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town' && G.shop.Sh.heroOwned('gunner')", timeout=20000); pg.wait_for_timeout(500)
    pg.click('.hcard[data-h="gunner"]'); pg.wait_for_timeout(600); ok('rose_selected', J(pg, "()=>G.gear.Acc.load().hero") == 'gunner')
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); pg.click('#stChalGo'); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(500)
    ok('rose_in_run', J(pg, "()=>[G.hero.cls, G.hero.lsk]") == ['gunner', 'ricochet'], J(pg, "()=>[G.hero.cls, G.hero.lsk]"))
    st = J(pg, "async()=>{ const H=(await import('./src/data/heroes.js')).CLASSES.gunner; return {hp:H.hp,dmg:H.dmg,rate:H.rate,range:H.range,speed:H.speed,armor:H.armor,cd:H.cd,max:G.hero.max}; }"); print('rose stats', st)
    J(pg, "()=>{ G.manual=true; G.toTileXZ=(x,z)=>G.toTile(x,z); G.legendSeed(7); G.legendN={}; G.legendDmg=0; G.hero.C.armor=1; }")
    J(pg, PACK, [9, 5]); J(pg, "()=>G.enemies.forEach(e=>{ if(!e.dead){ e.max=e.hp=1e6; } })"); J(pg, AIM); h0 = J(pg, HP); s0 = J(pg, "()=>G.gunN.shots")
    for _ in range(12): J(pg, "()=>G.sim(.25)")
    n = J(pg, "()=>G.gunN.shots") - s0; ok('rose_shoots', n >= 8 and J(pg, HP) > h0, f'shots {n}'); shot(pg, 'rose_ingame')
    for _ in range(80):
        if J(pg, "()=>G.legendN['ricochet']||0"): break
        J(pg, "()=>G.sim(.25)")
    J(pg, "()=>G.sim(.6)"); ok('ricochet_proc', J(pg, "()=>(G.legendN['ricochet']||0)") >= 1 and J(pg, "()=>G.legendDmg") > 0, J(pg, "()=>[G.legendN, G.legendDmg]"))
    # Q 로즈 피니시 (키)
    J(pg, AIM); h1 = J(pg, HP); k0 = J(pg, "()=>G.gunN.skill"); J(pg, "()=>{ G.hero.skillCd=0 }"); pg.keyboard.press('q'); J(pg, "()=>G.sim(.05)")
    ok('q_cast', J(pg, "()=>G.gunN.skill") == k0 + 1 and J(pg, "()=>G.hero.skillCd") > 1, J(pg, "()=>[G.gunN, G.hero.skillCd]"))
    J(pg, "()=>G.sim(.6)"); shot(pg, 'rose_skill'); J(pg, "()=>G.sim(2.5)"); ok('q_damage', J(pg, HP) > h1)
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.05)"); ok('q_cooldown_blocks', J(pg, "()=>G.gunN.skill") == k0 + 1)
    # 스킬 버튼 터치
    J(pg, "()=>{ G.hero.skillCd=0; G.sim(.1) }"); pg.tap('#skillBtn'); J(pg, "()=>G.sim(.05)"); ok('q_touch', J(pg, "()=>G.gunN.skill") == k0 + 2)
    J(pg, "()=>G.sim(3)")
    # 장미 탄막 [E] (active 전설)
    J(pg, "()=>{ G.hero.lsk='rosebarrage'; G.hero.lcd=0; G.legendN={}; G.sim(.2); }"); pg.wait_for_timeout(100); J(pg, "()=>G.sim(.2)")
    ok('legbtn_shown', not hidden(pg, 'legBtn') and '장미 탄막' in pg.inner_text('#legBtn'))
    if J(pg, "()=>G.enemies.filter(e=>!e.dead).length") < 5: J(pg, PACK, [9, 5])
    pg.mouse.move(5, 5); J(pg, AIM); J(pg, "()=>{ window.__bp=G.enemies.filter(e=>!e.dead) }"); h2 = J(pg, HPB); pg.keyboard.press('e'); J(pg, "()=>G.sim(.05)")
    ok('barrage_cast', J(pg, "()=>G.legendN['rosebarrage']") == 1 and J(pg, "()=>G.hero.lcd") > 1)
    J(pg, "()=>G.sim(.4)"); shot(pg, 'rose_barrage'); J(pg, "()=>G.sim(2.5)"); ok('barrage_damage', J(pg, HPB) > h2, (h2, J(pg, HPB)))
    J(pg, "()=>{ G.hero.lcd=0; G.sim(.2) }"); pg.tap('#legBtn'); J(pg, "()=>G.sim(.05)"); ok('barrage_touch', J(pg, "()=>G.legendN['rosebarrage']") == 2)
    J(pg, "()=>G.sim(4)"); ok('fx_cleanup', J(pg, "()=>G.lfx.length") == 0, J(pg, "()=>G.lfx.length"))
    ok('no_nan', J(pg, "()=>Number.isFinite(G.hero.g.position.x) && G.enemies.every(e=>Number.isFinite(e.hp))"))
    b.close()
print('console errors:', errs[:5])
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else 'ALL OK')
sys.exit(1 if fails or errs else 0)
