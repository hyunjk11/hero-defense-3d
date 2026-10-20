#!/usr/bin/env python3
"""고유 아이템 궁극기 브라우저 테스트 (+ 스크린샷 shots/items/).  python3 tests/unique.py [--shots]
고유 무기 [E] 4종(뿌리 감옥 화살·절대영도·분화 일격·왕가의 처형) + 방어구/장신구 자동 발동 11종: 발동 횟수 G.uqN / G.legendN, 피해·빙결·속박·버프·부활 1회, 미장착 시 hero.uqs 없음."""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/items'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name):
    if SHOTS: J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
PACK = """([n, d]) => { const h=G.hero.g.position, a0=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy(i%3?'grunt':'imp', 40); const a=a0+(i-n/2)*.18, r=d+(i%3)*1.2;
  const x=h.x+Math.sin(a)*r, z=h.z+Math.cos(a)*r; e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; } return G.enemies.length; }"""
AIM = "()=>{ const L=G.enemies.filter(e=>!e.dead); if(!L.length) return null; let x=0,z=0; for(const e of L){x+=e.g.position.x;z+=e.g.position.z;} x/=L.length; z/=L.length; G.mouseGround.set(x,0,z); const h=G.hero.g.position; G.hero.face=Math.atan2(x-h.x,z-h.z); return [x,z]; }"
CLEAR = "()=>{ for (const e of G.enemies) if(!e.dead) G.hurt(e, 1e9, '#fff'); G.sim(2); }"
def run(b, hero, gear, tag):
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
    pg.mouse.click(640, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
    J(pg, """([hero, gear]) => { const {Acc,E}=G.gear; Acc.update(d=>{ d.souls=999; d.hero=hero; d.stats={runs:1,kills:1,waves:1,souls:1}; d.eq[hero]={};
      for (const [k,a] of gear) { const it={...E.makeUnique(k), a}; d.inv.push(it); d.eq[hero][it.s]=it.id; } return d; }); }""", [hero, gear])
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()"); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.manual=true; G.gold=0; G.legendSeed(7); G.uniqueSeed(9); G.legendN={}; G.legendDmg=0; G.uqN={}; G.uqDmg=0; G.hero.C.armor=0; G.hero.hp=G.hero.max; }")
    return c, pg
def legend_cast(pg, sk, mid, name):
    J(pg, PACK, [9, 5]); pg.mouse.move(5, 5); J(pg, AIM); J(pg, "()=>{ G.hero.lcd=0; G.sim(.2); }")
    pg.keyboard.press('e'); J(pg, "()=>G.sim(.05)"); ok(f'{sk}_cast', J(pg, f"()=>G.legendN['{sk}']") == 1 and J(pg, "()=>G.hero.lcd") > 1, J(pg, "()=>[G.legendN, G.hero.lsk, G.hero.lcd]"))
    J(pg, f"()=>G.sim({mid})"); name and shot(pg, name)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ---- 1) 실바: 실바누스 [E] + 포자 망토(every) + 이슬방울(onSkill), 각성 ★3 무기
    c, pg = run(b, 'archer', [['f_bow', 3], ['f_arm', 0], ['f_acc', 0]], 'a')
    ok('archer_uq_init', J(pg, "()=>G.hero.lsk==='rootshot' && G.hero.uqA===3 && G.hero.uqs.map(x=>x.k).sort().join()") == 'f_acc,f_arm' and not hidden(pg, 'legBtn') and '뿌리 감옥' in pg.inner_text('#legBtn'))
    cd = J(pg, "()=>[G.hero.lcd, (()=>{ return 0 })()]")
    legend_cast(pg, 'rootshot', .3, 'skill_rootshot')
    J(pg, "()=>G.sim(.3)"); st = J(pg, "()=>[G.legendRoot||0, G.enemies.filter(e=>!e.dead&&e.stunT>0).length, G.enemies.filter(e=>!e.dead&&e.vulnT>G.t).length, G.legendDmg]")
    ok('rootshot_root_and_vuln', st[0] >= 1 and st[1] >= 1 and st[2] >= 1 and st[3] > 0, st)
    cdr = J(pg, "()=>(G.hero.eq&&G.hero.eq.cdr)||0"); ok('rootshot_awaken_cd', J(pg, "()=>G.hero.lcd") < 10 * .96 ** 3 * (1 - cdr / 100) + .05, (J(pg, "()=>G.hero.lcd"), cdr))
    r0 = J(pg, "()=>G.hero.C.rate"); pg.keyboard.press('q'); J(pg, "()=>G.sim(.05)")
    ok('f_acc_rate_buff', J(pg, "()=>[G.uqN.f_acc, G.hero.uqRateT>5, Math.round(G.hero.uqRateM*100)]") == [1, True, 140])
    J(pg, "()=>{ G.uqForce=true; const x=G.hero.uqs.find(x=>x.k==='f_arm'); x.t=11.9; }"); d0 = J(pg, "()=>G.uqDmg"); J(pg, "()=>G.sim(.2)"); shot(pg, 'unique_spores')
    ok('f_arm_spores', J(pg, "()=>G.uqN.f_arm") == 1 and J(pg, "()=>G.uqDmg") > d0 and J(pg, "()=>G.enemies.some(e=>!e.dead&&e.slowT>0)"), J(pg, "()=>[G.uqN, G.uqDmg]"))
    J(pg, "()=>{ G.uqForce=false }")
    # 왕가의 처형 (로즈 무기 스킬을 실바에게 붙여 로직만 검사)
    J(pg, "()=>{ G.hero.lsk='execution'; G.legendN={}; G.legendExec=0; }"); legend_cast(pg, 'execution', .4, None)  # 실바 몸으로 쏘는 장면이라 스크린샷은 남기지 않음
    J(pg, "()=>G.sim(1.2)"); ok('execution_shots', J(pg, "()=>G.legendExec") == 8, J(pg, "()=>G.legendExec"))  # ★3 → 8연사
    J(pg, "()=>{ for (const e of G.enemies) if(!e.dead) { e.hp=1; } G.hero.lcd=0; G.legendN={}; }"); pg.keyboard.press('e'); J(pg, "()=>G.sim(.4)")
    ok('execution_refund', J(pg, "()=>G.hero.lcd") < 12 * .96 ** 3 * .6, J(pg, "()=>G.hero.lcd"))
    c.close()
    # ---- 2) 루나: 글라시아 [E] + 설인 털가죽(lowHp) + 눈꽃 방울(onSkill)
    c, pg = run(b, 'mage', [['s_staff', 0], ['s_arm', 0], ['s_acc', 0]], 'm')
    legend_cast(pg, 'zeroabs', .55, 'skill_zeroabs')
    ok('zeroabs_freeze', J(pg, "()=>[G.legendFreeze||0, G.enemies.filter(e=>!e.dead&&e.frozen&&e.stunT>1).length]")[1] >= 1, J(pg, "()=>[G.legendFreeze, G.legendDmg]"))
    J(pg, "()=>G.sim(2)"); ok('zeroabs_then_slow', J(pg, "()=>G.enemies.some(e=>!e.dead&&e.slowT>0&&e.slowAmt>=.5)"))
    pg.keyboard.press('q'); J(pg, "()=>G.sim(.6)"); d0 = J(pg, "()=>G.uqDmg"); J(pg, "()=>G.sim(1)"); shot(pg, 'unique_blizzard')
    ok('s_acc_blizzard', J(pg, "()=>G.uqN.s_acc") == 1 and J(pg, "()=>G.uqDmg") > d0, J(pg, "()=>[G.uqN, G.uqDmg]"))
    J(pg, "()=>{ G.hero.hp=G.hero.max*.4; G.heroDamage(G.hero.max*.1); }"); hb = J(pg, "()=>[G.uqN.s_arm, G.hero.uqBarT>3, G.hero.hp]")
    J(pg, "()=>G.heroDamage(100)"); ha = J(pg, "()=>G.hero.hp")
    ok('s_arm_barrier', hb[0] == 1 and hb[1] and abs((hb[2] - ha) - 30) < 1, (hb, ha))
    J(pg, "()=>{ G.hero.hp=G.hero.max*.4; G.heroDamage(G.hero.max*.1); }"); ok('s_arm_cooldown', J(pg, "()=>G.uqN.s_arm") == 1)
    shot(pg, 'unique_barrier')
    c.close()
    # ---- 3) 세라: 이그니스 [E] + 용암 갑주(onHit) + 불사조 깃털(onDeath)
    c, pg = run(b, 'warrior', [['v_sword', 0], ['v_arm', 0], ['v_acc', 0]], 'w')
    J(pg, PACK, [9, 3]); J(pg, "()=>{ for (const e of G.enemies) if(!e.dead){ const h=G.hero.g.position; e.g.position.set(h.x+Math.sin(G.hero.face)*3+Math.random(),0,h.z+Math.cos(G.hero.face)*3+Math.random()); } }")
    J(pg, "()=>{ G.legendPool=0 }"); legend_cast(pg, 'eruption', 1.0, 'skill_eruption'); J(pg, "()=>G.sim(1.2)")
    ok('eruption_pool', J(pg, "()=>G.legendPool") >= 2 and J(pg, "()=>G.legendDmg") > 0, J(pg, "()=>[G.legendPool, G.legendDmg]"))
    J(pg, "()=>{ for (const e of G.enemies) if(!e.dead) G.hurt(e, 1e9, '#fff'); G.sim(.5); G.uqN={}; for (const x of G.hero.uqs) x.cd=0; G.hero.hp=G.hero.max; G.uqForce=true; G.heroDamage(5); }"); ok('v_arm_counter', J(pg, "()=>G.uqN.v_arm") == 1); J(pg, "()=>{ G.heroDamage(5) }"); ok('v_arm_icd', J(pg, "()=>G.uqN.v_arm") == 1); J(pg, "()=>{ G.uqForce=false }")
    J(pg, "()=>G.heroDamage(1e7)"); ok('v_acc_revive', J(pg, "()=>[G.uqN.v_acc, G.hero.dead<=0, Math.round(G.hero.hp/G.hero.max*100)]") == [1, True, 50]); shot(pg, 'unique_phoenix')
    J(pg, "()=>G.heroDamage(1e7)"); ok('v_acc_once', J(pg, "()=>G.hero.dead>0 && G.uqN.v_acc===1"))
    J(pg, "()=>G.sim(5.5)")
    # 폐허·도전 고유: G.uq 교체 후 다시 적용
    J(pg, "()=>{ G.uq={ armor:{k:'r_arm',a:0}, acc:{k:'r_acc',a:0} }; G.uqInit(G.hero); G.uqN={}; G.uqDmg=0; }"); J(pg, CLEAR)
    J(pg, "()=>G.sim(5.2)"); ok('r_arm_shield_up', J(pg, "()=>G.hero.uqShield===true"))
    hp0 = J(pg, "()=>G.hero.hp"); J(pg, "()=>G.heroDamage(80)"); ok('r_arm_blocks', J(pg, "()=>[G.hero.hp, G.uqN.r_arm, G.hero.uqShield]") == [hp0, 1, False])
    J(pg, PACK, [6, 5]); J(pg, AIM); J(pg, "()=>{ G.hero.skillCd=0 }"); pg.keyboard.press('q'); J(pg, "()=>G.sim(2)"); ok('r_acc_wraiths', J(pg, "()=>G.uqN.r_acc") == 1 and J(pg, "()=>G.uqDmg") > 0, J(pg, "()=>[G.uqN, G.uqDmg]"))
    J(pg, "()=>{ G.uq={ armor:{k:'c_arm',a:0}, acc:{k:'c_ring',a:0} }; G.uqInit(G.hero); G.uqN={}; }"); J(pg, "()=>{ G.wave=11; G.sim(.1); }")
    ok('c_arm_abyss', J(pg, "()=>[G.uqN.c_arm, Math.round(G.hero.uqAtk*100)]") == [1, 103])
    J(pg, "()=>{ G.hero.skillCd=10; G.hero.lsk='eruption'; G.hero.lcd=9; for (let i=0;i<40;i++){ const e=G.spawnEnemy('imp',1); G.hurt(e,1e9,'#fff'); } }")
    ok('c_ring_cycle', J(pg, "()=>[G.uqN.c_ring, G.hero.lcd, G.hero.skillCd<=5.01]") == [1, 0, True], J(pg, "()=>[G.uqN, G.hero.lcd, G.hero.skillCd]"))
    J(pg, "()=>{ G.uq={ acc:{k:'c_acc',a:3} }; G.uqInit(G.hero); G.uqN={}; G.uqForce=true; }"); J(pg, PACK, [6, 5]); J(pg, "()=>{ G.hero.uqs[0].t=G.hero.uqs[0].U.p.cd*.96**3-.05; G.sim(.15); }")
    ok('c_acc_timestop', J(pg, "()=>[G.uqN.c_acc, G.enemies.filter(e=>!e.dead&&e.stunT>1.5).length>=3]") == [1, True], J(pg, "()=>G.uqN")); shot(pg, 'unique_timestop'); J(pg, "()=>{ G.uqForce=false }")
    J(pg, "()=>G.sim(4)"); ok('fx_cleanup', J(pg, "()=>G.lfx.length") == 0)
    c.close()
    # ---- 4) 고유 없음 → hero.uqs 없음 (훅 코드 경로 0)
    c, pg = run(b, 'archer', [], 'n'); ok('no_unique_no_hooks', J(pg, "()=>G.hero.uqs===undefined && G.hero.uqA===undefined && G.hero.uqAtk===undefined")); c.close()
    b.close()
print('console errors:', errs)
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else '')
sys.exit(1 if fails or errs else 0)
