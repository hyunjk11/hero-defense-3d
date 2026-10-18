#!/usr/bin/env python3
"""전설 무기 고유 스킬 브라우저 테스트 (+ 스크린샷 shots/legend/).  python3 tests/legend.py [--shots] [--only archer,mage]
영웅마다: 전설 무기 장착 → 출정 → proc(시드 난수) 발동 확인 → active 스킬로 바꿔 버튼 클릭 / 터치 탭 / E 키 발동 확인.
가방·대장간 금색 스킬 표시, 강화 후 유지, 구 세이브(스킬 없는 전설) 결정적 배정·저장 왕복, 콘솔 오류 0."""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/legend'; os.makedirs(OUT, exist_ok=True)
ONLY = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else ['archer', 'mage', 'warrior']
SK = {'archer': ('multishot', 'pierce'), 'mage': ('frostorb', 'meteorstorm'), 'warrior': ('boomerang', 'quake')}
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name):
    if SHOTS: J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
# 영웅 근처에 적 무리 배치 (체력 넉넉히, 바로 걷기 상태)
PACK = """([n, d]) => { const h=G.hero.g.position, a0=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy(i%3?'grunt':'imp', 40); const a=a0+(i-n/2)*.18, r=d+(i%3)*1.2;
  const x=h.x+Math.sin(a)*r, z=h.z+Math.cos(a)*r; e.g.position.set(x,0,z); e.tile=G.toTileXZ?G.toTileXZ(x,z):e.tile; e.state='walk'; e.spawnT=0; e.next=null; } return G.enemies.length; }"""
def aimAt(pg):  # 영웅이 적을 바라보게 하고 마우스를 적 무리 중심으로
    return J(pg, "()=>{ const L=G.enemies.filter(e=>!e.dead); if(!L.length) return null; let x=0,z=0; for(const e of L){x+=e.g.position.x;z+=e.g.position.z;} x/=L.length; z/=L.length; G.mouseGround.set(x,0,z); const h=G.hero.g.position; G.hero.face=Math.atan2(x-h.x,z-h.z); return [x,z]; }")
def hpSum(pg): return J(pg, "()=>G.enemies.reduce((a,e)=>a+(e.dead?e.max:e.max-e.hp),0)")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for hi, hero in enumerate(ONLY):
        proc, act = SK[hero]
        c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
        pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
        pg.goto(url + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
        pg.mouse.click(640, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
        # 저장: 스킬 지정 전설(proc), 같은 영웅의 다른 전설(active), 구 세이브 형식(u 없음) 전설
        J(pg, """([hero, proc, act]) => { const {Acc,E}=G.gear; let q=hero.length*97; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
          Acc.update(d=>{ d.souls=99999; d.mat={steel:999,crystal:99}; d.hero=hero;
            const w1={...E.makeItem('weapon',hero,4,r), id:'lgP', u:proc}, w2={...E.makeItem('weapon',hero,4,r), id:'lgA', u:act}, w3={...E.makeItem('weapon',hero,4,r), id:'lgOld'}; delete w3.u;
            d.inv.push(w1, w2, w3, {...E.makeItem('weapon',hero,3,r), id:'ep1'}); d.eq[hero]={...(d.eq[hero]||{}), weapon:'lgP'}; return d; }); }""", [hero, proc, act])
        pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(1200)
        s = J(pg, "()=>G.gear.Acc.load()"); inv = {x['id']: x for x in s['inv']}
        ok(f'{hero}_save_keeps_skill', inv['lgP'].get('u') == proc and inv['lgA'].get('u') == act and 'u' not in inv['ep1'], (inv['lgP'].get('u'), inv['lgA'].get('u')))
        ok(f'{hero}_legacy_assigned', inv['lgOld'].get('u') in SK[hero] and J(pg, "()=>G.gear.E.legendKey({...G.gear.Acc.load().inv.find(x=>x.id==='lgOld'), u:undefined})") == inv['lgOld'].get('u'), inv['lgOld'].get('u'))
        # 저장 왕복: 직렬화 → clean
        rt = J(pg, "async ()=>{ const P=await import('./src/account/progress.js'); const s=P.clean(JSON.parse(JSON.stringify(G.gear.Acc.load()))); return s.inv.map(x=>[x.id,x.u||null]); }")
        ok(f'{hero}_roundtrip', dict(rt).get('lgP') == proc and dict(rt).get('lgA') == act and dict(rt).get('ep1') is None, rt)
        # 가방: 금색 스킬 표시 + 타일 배지
        pg.click('#twBag'); pg.wait_for_timeout(300); pg.click('#invGrid .itile[data-id="lgA"]'); pg.wait_for_timeout(150)
        name_act = J(pg, f"()=>G.gear.E.LSK['{act}'].n")
        ok(f'{hero}_inv_gold_skill', name_act in pg.inner_text('#invDetail .lsk') and J(pg, "()=>getComputedStyle(document.querySelector('#invDetail .lskH')).color") == 'rgb(255, 210, 58)' and pg.locator('#invGrid .itile[data-id="lgA"] .lst').count() == 1 and pg.locator('#invGrid .itile[data-id="ep1"] .lst').count() == 0)
        pg.hover('#invGrid .itile[data-id="lgP"]'); pg.wait_for_timeout(200); ok(f'{hero}_tooltip_skill', not hidden(pg, 'itemTip') and J(pg, f"()=>G.gear.E.LSK['{proc}'].n") in pg.inner_text('#itemTip'))
        if hi == 0: shot(pg, 'tooltip')
        pg.click('#invClose')
        # 대장간: 강화 화면에 표시, 강화 후 유지
        J(pg, "()=>G.gear.openSmith()"); pg.click('#smTabs .ftab[data-t="enh"]'); pg.click('.smList .itile[data-id="lgA"]'); pg.wait_for_timeout(150)
        ok(f'{hero}_smith_skill', name_act in pg.inner_text('.enhInfo'))
        for _ in range(3): J(pg, "()=>G.gear.doEnhance('lgA', true)"); pg.wait_for_timeout(80)
        pg.wait_for_timeout(300); a2 = J(pg, "()=>G.gear.Acc.load().inv.find(x=>x.id==='lgA')"); ok(f'{hero}_enhance_keeps', a2['e'] >= 1 and a2.get('u') == act, (a2['e'], a2.get('u')))
        if hi == 0: shot(pg, 'blacksmith')
        J(pg, "()=>G.gear.closeSmith(true)")
        # 출정 (도전 모드)
        pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); pg.click('#stChalGo'); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(500)
        ok(f'{hero}_hero_has_proc', J(pg, "()=>G.hero.lsk") == proc and hidden(pg, 'legBtn'))
        J(pg, "()=>{ G.manual=true; G.toTileXZ=(x,z)=>G.toTile(x,z); G.gold=0; G.legendSeed(4242); G.legendN={}; G.hero.C.armor=1; }")
        J(pg, PACK, [9, 5]); aimAt(pg); h0 = hpSum(pg)
        # proc: 시드 난수로 자연 발동 (강제 없음)
        n = 0
        for i in range(60):
            J(pg, "()=>G.sim(.25)"); n = J(pg, f"()=>G.legendN['{proc}']||0")
            if n: break
        ok(f'{hero}_proc_seeded', n >= 1, f'after {(i+1)*.25:.2f}s')
        for _ in range(3): J(pg, "()=>G.sim(.1)")
        shot(pg, f'{proc}')
        J(pg, "()=>G.sim(1.5)"); ok(f'{hero}_proc_damage', hpSum(pg) > h0)
        # 결정성: 같은 시드 → 같은 발동 순서 (난수 함수 직접 비교)
        # active: 무기를 바꿔 다시 출정한 것과 같은 상태로
        J(pg, f"()=>{{ G.hero.lsk='{act}'; G.hero.lcd=0; G.legendN={{}}; G.sim(.2); }}")
        pg.wait_for_timeout(100); J(pg, "()=>G.sim(.2)")
        ok(f'{hero}_legbtn_shown', not hidden(pg, 'legBtn') and name_act in pg.inner_text('#legBtn'))
        if J(pg, "()=>G.enemies.filter(e=>!e.dead).length") < 5: J(pg, PACK, [9, 5])
        pg.mouse.move(5, 5); aimAt(pg); h1 = hpSum(pg)
        pg.click('#legBtn'); J(pg, "()=>G.sim(.05)")
        ok(f'{hero}_active_click', J(pg, f"()=>G.legendN['{act}']") == 1 and J(pg, "()=>G.hero.lcd") > 1)
        J(pg, "()=>G.sim(.1)"); cdp = J(pg, "()=>{ G.sim(.2); return [document.getElementById('legCd').textContent, getComputedStyle(document.getElementById('legBtn')).getPropertyValue('--p')] }")
        ok(f'{hero}_cd_ring', cdp[0] != '' and cdp[1].strip() not in ('', '0%'), cdp)
        mid = {'pierce': .35, 'meteorstorm': 1.2, 'quake': .5}[act]
        J(pg, f"()=>G.sim({mid})"); shot(pg, act)
        J(pg, "()=>G.sim(2.5)"); ok(f'{hero}_active_damage', hpSum(pg) > h1)
        if act == 'quake': pass
        # 쿨타임 중엔 발동 안 함
        pg.click('#legBtn'); J(pg, "()=>G.sim(.05)"); ok(f'{hero}_cd_blocks', J(pg, f"()=>G.legendN['{act}']") == 1)
        # 터치 탭
        J(pg, "()=>{ G.hero.lcd=0; G.sim(.2); }"); pg.wait_for_timeout(50)
        if J(pg, "()=>G.enemies.filter(e=>!e.dead).length") < 5: J(pg, PACK, [9, 5])
        if act == 'quake': J(pg, "()=>{ for (const e of G.enemies) if(!e.dead){ const h=G.hero.g.position; e.g.position.set(h.x+Math.sin(G.hero.face)*3+Math.random(),0,h.z+Math.cos(G.hero.face)*3+Math.random()); } }")
        pg.tap('#legBtn'); J(pg, "()=>G.sim(.05)"); ok(f'{hero}_active_touch', J(pg, f"()=>G.legendN['{act}']") == 2)
        if act == 'quake':
            J(pg, "()=>G.sim(.75)"); st = J(pg, "()=>G.enemies.filter(e=>!e.dead&&e.stunT>0).length"); ok('warrior_quake_stun', st >= 1, st)
            J(pg, "()=>G.sim(1.2)"); ok('warrior_stun_ends', J(pg, "()=>G.enemies.filter(e=>!e.dead&&e.stunT>0).length") == 0)
        else: J(pg, "()=>G.sim(2)")
        # E 키
        J(pg, "()=>{ G.hero.lcd=0; }"); pg.keyboard.press('e'); J(pg, "()=>G.sim(.05)"); ok(f'{hero}_active_key', J(pg, f"()=>G.legendN['{act}']") == 3)
        J(pg, "()=>G.sim(3)"); ok(f'{hero}_fx_cleanup', J(pg, "()=>G.lfx.length") == 0, J(pg, "()=>G.lfx.length"))
        if hero == 'mage':
            J(pg, "()=>{ G.hero.lsk='frostorb'; G.legendForce=true; G.hero.licd=0; }")
            if J(pg, "()=>G.enemies.filter(e=>!e.dead).length") < 5: J(pg, PACK, [9, 5])
            aimAt(pg)
            for _ in range(30):
                J(pg, "()=>G.sim(.2)")
                if J(pg, "()=>G.enemies.some(e=>!e.dead&&e.frozen)"): break
            ok('mage_frost_freeze', J(pg, "()=>G.enemies.some(e=>!e.dead&&e.frozen&&e.stunT>0)")); J(pg, "()=>{ G.legendForce=false }")
        c.close()
    # 전설 무기 없이: lsk 없음, 버튼 숨김 (일반 출정)
    c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000); pg.mouse.click(640, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
    J(pg, "()=>G.gear.Acc.update(d=>{ d.souls=10; d.hero='warrior'; d.stats={runs:1,kills:1,waves:1,souls:1}; const {E}=G.gear; let q=5; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; d.inv.push({...E.makeItem('weapon','warrior',3,r), id:'ep2'}); d.eq.warrior={weapon:'ep2'}; return d; })")
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); pg.click('#stChalGo'); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000)
    J(pg, "()=>G.sim ? 0 : 0"); pg.wait_for_timeout(400); ok('no_legend_no_button', J(pg, "()=>G.hero.lsk===undefined && G.legend===null") and hidden(pg, 'legBtn'))
    pg.keyboard.press('e'); pg.wait_for_timeout(200); ok('no_legend_e_noop', J(pg, "()=>Object.keys(G.legendN).length") == 0)
    b.close()
print('console errors:', errs)
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else '')
sys.exit(1 if fails or errs else 0)
