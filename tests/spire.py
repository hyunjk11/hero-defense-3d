#!/usr/bin/env python3
"""🗼 무한의 탑 T-4 연습 탑 (가짜 Supabase tests/sbmock.js, ?sptest=1 · 데스크톱만)
 진입 go({spire:1}) → 탑 층 목록 · HUD 🗼 줄 · 1층 돌파 → 3초 뒤 2층(축복 없음) · 3층 정예(붉은 고리·체력 ×2.5) · 5층 중간 보스(해골 군주 체력 = 기본×hpMul×0.55) →
 보스층 돌파 = 축복 3택1 → 6층 · 어픽스(가속·철갑·재생) 효과 · 전멸 → 탑 결과 화면 · 21층 시작 = 출발 축복 2번 · SP_LIVE(T-10 공개) = ?sptest 없어도 탑 판 · 콘솔 오류 0
python3 tests/spire.py"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
SKIP = "()=>{ const D=G.dg, F=D.floors[D.floor]; D.q=[]; D.qe=[]; D.wave=F.waves.length-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9); G.sim(2.5); return [D.floor, F.floor, !!D.blessing, D.nextT>0, !!G.dgResult]; }"
HEAL = "()=>G.heroes.forEach(h=>{ if (h.dead>0) { h.dead=0; h.hb&&h.hb.show(true); } h.hp=h.max; })"
def login(pg, q, mail):
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', mail); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000)
def enter(pg, n):
    J(pg, "(n)=>import('./src/core/nav.js').then(m=>m.go({spire:n}, 0))", n)
    pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append('CE ' + m.text[:300]))
    login(pg, '?seed=5151&rng=31&flow=1&dgtest=1&sptest=1', 'sp1@test.kr'); enter(pg, 1)
    st = J(pg, "()=>({sp:G.spire, n:G.dg.floors.length, f0:G.dg.floors[0].floor, hud:document.getElementById('dgFloor').textContent, mode:G.dgEntryMode, url:location.search})")
    ok('enter_spire', st['sp'] and st['sp']['from'] == 1 and st['f0'] == 1 and st['n'] >= 3 and st['mode'] == 'practice' and 'spire=1' in st['url'], st)
    ok('hud_spire_line', st['hud'].startswith('🗼 1층') and '웨이브 1/3' in st['hud'], st['hud'])
    J(pg, "()=>G.sim(6)"); sp = J(pg, "()=>G.enemies.filter(e=>!e.dead).map(e=>[e.type, Math.round(e.max), !!e.elite])")
    ok('floor1_spawns_scaled', sp and all(not x[2] for x in sp) and any(x[0] == 'imp' and abs(x[1] - 40 * 1.9) < 1 for x in sp) if any(x[0] == 'imp' for x in sp) else bool(sp), sp[:6])
    r = J(pg, SKIP); ok('floor1_clear_no_bless_card', r[3] and not r[2] and not r[4], r)
    J(pg, "()=>G.sim(3.5)"); r = J(pg, "()=>[G.dg.floor, G.dg.floors[G.dg.floor].floor, G.dg.wave, document.getElementById('dgFloor').textContent]")
    ok('floor2_auto_next', r[1] == 2 and r[2] == 0 and '🗼 2층' in r[3], r)
    J(pg, SKIP); J(pg, "()=>G.sim(3.5)")  # → 3층 (정예)
    J(pg, HEAL); J(pg, "()=>{ for (let i=0;i<200 && G.dg.q.length;i++) G.sim(.1); G.sim(.5); }")
    el = J(pg, "async()=>{ const M=await import('./src/data/monsters.js'); const F=G.dg.floors[G.dg.floor]; const L=G.enemies.filter(e=>!e.dead && e.elite); return {f:F.floor, type:F.type, want:F.elite[0], n:L.length, ring:L.every(e=>!!e.eliteRing), hpOk:L.every(e=>Math.abs(e.max - M.ETYPES[e.type].hp*2.5*F.hpMul) < 1), sc:L.map(e=>+e.g.scale.x.toFixed(2))}; }")
    ok('floor3_elites', el['f'] == 3 and el['type'] == 'elite' and el['n'] >= 1 and el['n'] <= el['want'] and el['ring'] and el['hpOk'] and all(s == 1.25 for s in el['sc']), el)
    J(pg, SKIP); J(pg, "()=>G.sim(3.5)"); J(pg, SKIP); J(pg, "()=>G.sim(3.5)")  # → 5층
    J(pg, HEAL); J(pg, "()=>{ const D=G.dg; D.wave=0; D.q=[]; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); }")
    J(pg, "()=>{ for (let i=0;i<300 && !G.enemies.some(e=>!e.dead&&e.type==='boss');i++) G.sim(.1); }")
    bo = J(pg, "async()=>{ const S=await import('./src/data/spire.js'); const F=G.dg.floors[G.dg.floor]; const e=G.enemies.find(e=>!e.dead&&e.type==='boss'); return {f:F.floor, type:F.type, max:e&&Math.round(e.max), want:Math.round(3200*S.hpMul(5)*S.SP.bossHpK), hud:document.getElementById('dgFloor').textContent}; }")
    ok('floor5_midboss_hp', bo['f'] == 5 and bo['type'] == 'mid' and bo['max'] and abs(bo['max'] - bo['want']) <= 1 and '해골 군주' in bo['hud'], bo)
    r = J(pg, SKIP); bl = J(pg, "()=>{ const el=document.getElementById('dgBless'); return el && !el.classList.contains('hidden') && el.querySelector('.dgBT').textContent; }")
    ok('floor5_bless_card', r[2] and bl and '5층' in bl, (r, bl))
    J(pg, "()=>G.dgTakeBless(G.dg.blessing[0])"); r = J(pg, "()=>[G.dg.floors[G.dg.floor].floor, !!G.dg.blessing, Object.keys(G.dg.bless).length]")
    ok('floor6_after_bless', r[0] == 6 and not r[1] and r[2] == 1, r)
    # 어픽스 효과: 현재 층에 강제로 가속·철갑·재생 → 새로 스폰한 몬스터
    af = J(pg, """async()=>{ const M=await import('./src/data/monsters.js'), En=await import('./src/monsters/enemy.js'); const F=G.dg.floors[G.dg.floor]; F.affixes=['haste','armor','regen'];
        const e=En.spawnEnemy('grunt', F.hpMul), E0=M.ETYPES.grunt; G.sim(1.5); e.hp=e.max*.5; const h0=e.hp; const p=e.g.position.clone(); G.heroes.forEach(h=>{ h.atkT=99; h.g.position.set(30,0,30); }); G.sim(1);
        return {spd:+(e.E.spd/E0.spd).toFixed(2), armor:+((e.E.armor||0)-(E0.armor||0)).toFixed(2), regen:+((e.hp-h0)/e.max).toFixed(3), base:M.ETYPES.grunt.spd===E0.spd}; }""")
    ok('affix_haste_armor_regen', af['spd'] == 1.2 and af['armor'] == .15 and .005 <= af['regen'] <= .02, af)
    nE = J(pg, "async()=>{ const M=await import('./src/data/monsters.js'); return [M.ETYPES.grunt.spd, M.ETYPES.grunt.armor||0]; }")
    ok('etypes_untouched', nE[1] == 0 or nE[1] < .15, nE)
    J(pg, "()=>{ G.heroes.forEach(h=>{ h.hp=0; h.dead=5; }); G.sim(.5); }")
    rs = J(pg, "()=>({r:G.dgResult, vis:!document.getElementById('stageClear').classList.contains('hidden'), t:document.querySelector('#stageClear .scT')?.textContent, again:!!document.getElementById('spAgain')})")
    ok('wipe_result', rs['vis'] and rs['r'] and rs['r']['spire'] and rs['r']['top'] == 5 and rs['r']['from'] == 1 and '🗼' in rs['t'] and rs['again'], rs)
    ok('errors_0_run1', not errs, errs[:4]); errs.clear()
    # 21층 시작 = 출발 축복 2번 (따라잡기)
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown && 0)"); enter(pg, 23)
    s2 = J(pg, "()=>({from:G.spire.from, bless:!!G.dg.blessing, t:document.querySelector('#dgBless .dgBT')?.textContent, fl:G.dg.floor})")
    ok('catchup_bless_open', s2['from'] == 21 and s2['bless'] and '출발 축복' in s2['t'] and s2['fl'] == -1, s2)
    J(pg, "()=>G.dgTakeBless(G.dg.blessing[0])"); s3 = J(pg, "()=>({bless:!!G.dg.blessing, t:document.querySelector('#dgBless .dgBT')?.textContent})")
    J(pg, "()=>G.dgTakeBless(G.dg.blessing[0])"); s4 = J(pg, "()=>({bless:!!G.dg.blessing, f:G.dg.floors[G.dg.floor].floor, n:Object.values(G.dg.bless).reduce((a,b)=>a+b,0), hud:document.getElementById('dgFloor').textContent, hp:Math.round(G.dg.floors[0].hpMul*100)})")
    ok('catchup_two_then_21', s3['bless'] and s4 and not s4['bless'] and s4['f'] == 21 and s4['n'] == 2 and '🗼 21층' in s4['hud'], (s3, s4))
    ok('errors_0_run2', not errs, errs[:4]); errs.clear()
    # T-5: 탑 보스 sp_* (영웅 대상 능력) · 보통 어픽스 (광폭·저주·역할 저항)
    J(pg, HEAL); bs = J(pg, """async()=>{ const En=await import('./src/monsters/enemy.js'), S=await import('./src/data/spire.js'); const F=G.dg.floors[G.dg.floor]; F.affixes=[]; const out={};
        for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); G.dg.q=[];
        for (const t of ['sp_forest','sp_snow','sp_fire','sp_ruins']) { const s0={...G.stats}; const e=En.spawnEnemy(t, F.hpMul); e.g.position.set(G.heroes[0].g.position.x+3, 0, G.heroes[0].g.position.z);
          for (let i=0;i<160;i++) { G.sim(.1); G.heroes.forEach(h=>{ if (h.dead<=0) h.hp=Math.max(h.hp, h.max*.6); }); if (t==='sp_ruins'||t==='sp_fire') { if (e.hp>e.max*.45) e.hp=e.max*.45; } }
          const d=k=>(G.stats[k]||0)-(s0[k]||0); out[t]={max:Math.round(e.max), want:Math.round(3200*(t==='sp_fire'?3400/3200:t==='sp_ruins'?3600/3200:1)*F.hpMul*S.SP.bossHpK), dps:e.E.dps, heal:d('heals')+d('healed'), summon:d('summons'), meteorHero:d('meteorHero'), enr:!!e.enraged, dread:d('dreads'), dreadHero:d('dreadHero'), adds:G.enemies.filter(o=>!o.dead&&o!==e).length};
          for (const o of [...G.enemies]) if (!o.dead) G.hurt(o,1e9); G.sim(.5); G.heroes.forEach(h=>{ if (h.dead>0) { h.dead=0; h.hb&&h.hb.show(true); } h.hp=h.max; }); }
        return out; }""")
    ok('sp_bosses_hp_dps', all(abs(v['max'] - v['want']) <= 2 and v['dps'] < 170 for v in bs.values()), bs)
    ok('sp_fire_meteor_heroes', bs['sp_fire']['meteorHero'] >= 1 and bs['sp_fire']['enr'], bs['sp_fire'])
    ok('sp_ruins_dread_summon', bs['sp_ruins']['dread'] >= 1 and bs['sp_ruins']['dreadHero'] >= 1, bs['sp_ruins'])
    ok('sp_forest_summon', bs['sp_forest']['summon'] >= 1 and bs['sp_forest']['heal'] > 0, bs['sp_forest'])  # 소환된 고블린은 영웅이 금방 처치할 수 있어 남은 수(adds)는 안 봄
    af2 = J(pg, """async()=>{ const En=await import('./src/monsters/enemy.js'); const F=G.dg.floors[G.dg.floor]; const mage=G.heroes.find(h=>h.cls==='mage'), war=G.heroes.find(h=>h.cls==='warrior');
        const hit=(aff, who)=>{ F.affixes=aff; const e=En.spawnEnemy('golem', 1); e.g.position.set(40,0,40); const w0=G.mWho; G.mWho=who; const h0=e.hp; G.hurt(e, 100); G.mWho=w0; const d=h0-e.hp; G.hurt(e,1e9); return Math.round(d); };
        const r={none:hit([], mage), resM:hit(['resM'], mage), resMwar:hit(['resM'], war), resR:hit(['resR'], mage)};
        F.affixes=['frenzy']; const e=En.spawnEnemy('grunt',1); r.fr0=G.spireAtkK(e); e.hp=e.max*.2; r.fr1=G.spireAtkK(e); F.affixes=[]; r.fr2=G.spireAtkK(e); G.hurt(e,1e9);
        G.dg.floors[G.dg.floor+1].affixes=['curse']; const M0=G.dgM; G.dgM=x=>({...M0(x), regen:0}); const h=G.heroes[0]; h.hp=h.max*.5; G.dg.q=[]; G.dg.wave=F.waves.length-1; G.sim(.2); for (const o of [...G.enemies]) if (!o.dead) G.hurt(o,1e9); let pre=h.hp; for (let i=0;i<60 && G.dg.floor===G.dg.floors.indexOf(F);i++) { pre=h.hp; G.sim(.1); if (G.dg.blessing) G.dgTakeBless(G.dg.blessing[0]); }
        r.curseHp=Math.round(h.hp/h.max*1000)/10; r.preHp=Math.round(pre/h.max*1000)/10; r.gain=Math.round((h.hp-pre)/h.max*1000)/10; G.dgM=M0; r.fl=G.dg.floors[G.dg.floor].floor; return r; }""")
    ok('affix_res_magic_ranged', abs(af2['resM'] - af2['none'] * .65) <= 1 and af2['resMwar'] == af2['none'] and af2['resR'] == af2['none'], af2)
    ok('affix_frenzy', af2['fr0'] == 1 and af2['fr1'] == 1.3 and af2['fr2'] == 1, af2)
    ok('affix_curse_heal_half', 6.5 <= af2['gain'] <= 8.5, af2)  # 층 사이 회복 15% × 0.5 (층 넘어가는 그 순간의 증가분)
    ok('errors_0_t5', not errs, errs[:4]); errs.clear()
    # T-10 공개: ?sptest 없어도 탑 판 (SP_LIVE)
    c2 = b.new_context(viewport={'width': 1280, 'height': 800}); c2.add_init_script(MOCK); p2 = c2.new_page(); p2.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    login(p2, '?seed=5152&rng=32&flow=1&dgtest=1', 'sp2@test.kr'); enter(p2, 6)
    s5 = J(p2, "()=>({sp:G.spire===undefined, spE:G.spireE===undefined, f:G.dg.floors[0].n, hud:document.getElementById('dgFloor').textContent})")
    ok('live_no_sptest_spire', not s5['sp'] and not s5['f'].startswith('1층 · 해골 동굴') and '층' in s5['hud'], s5)
    ok('errors_0_run3', not errs, errs[:4])
    b.close()
print('RESULT', 'PASS' if all(res.values()) else 'FAIL', sum(res.values()), '/', len(res))
