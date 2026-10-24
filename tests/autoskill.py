#!/usr/bin/env python3
"""⚡ 스킬 자동 사용 (2026-10-24, heroes/autoskill.js · core/autoskill.js).  python3 tests/autoskill.py   (데스크톱 1440x860 만)
 - 기본 off · HUD AUTO 버튼(#autoSkillBtn) · 설정 칸 2개(#stAutoSkill 메뉴 ↔ #sndAutoSkill 전투) · Z 키 · localStorage hd3d_autoSkill · 새로고침 후 유지
 - 켜면: 적 없음 → 안 씀 · 약한 1마리 → 안 씀 · 밀집 3+ → 자동 시전(무리 쪽) · 끄면 안 씀 · 손으로 Q 그대로
 - 모든 영웅·전직 Q (실바·루나·세라·로즈·서윤 + 전직 10종) 밀집에 자동 시전 · NaN 없음
 - 던전 파티: 조작 영웅 자동 시전 · 조작 전환 후 새 조작 영웅도 · 끄면 조작 영웅은 손으로만(파티 AI 는 그대로) · 마을에선 안 씀(Z 무시) · 콘솔 오류 0"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
VW, VH = 1440, 860
# 적 배치: [type, 앞쪽 거리, 옆 오프셋] — 제자리 · 체력 매우 큼 (seoyun.py 와 같은 방식)
PUT = """(L)=>{ const h=G.hero.g.position, f=G.hero.face; for (const [ty, d, s, hp] of L) { const x=h.x+Math.sin(f)*d+Math.cos(f)*s, z=h.z+Math.cos(f)*d-Math.sin(f)*s;
  const e=G.spawnEnemy(ty, 40, { x, z, tile:G.toTile(x,z) }); e.g.position.set(x, e.g.position.y, z); e.state='walk'; e.spawnT=0; e.next=null; e.path=null; e.spd=0; e.spdK=1e-9; e.max=1e6; e.hp=hp||1e6; } return G.enemies.filter(e=>!e.dead).length; }"""
CLEAR = "()=>{ for (const e of G.enemies) { e.dead=true; e.hb&&e.hb.show(false); if(e.g) e.g.visible=false; } G.enemies.length=0; G.projs.length=0; }"
PACK = [['grunt', 1.8, 0], ['imp', 2.2, .5], ['grunt', 2.6, -.5], ['imp', 2.0, .2]]  # 앞 2m 에 4마리 (제자리·지점·직선 모양 모두 3+)
ST = "()=>({on:G.autoSkill, ls:localStorage.getItem('hd3d_autoSkill'), cls:document.getElementById('autoSkillBtn').className, txt:document.getElementById('autoSkillBtn').innerText.replace(/\\n/g,' '), st:document.getElementById('stAutoSkill').checked, snd:document.getElementById('sndAutoSkill').checked})"
N = "()=>G.autoSkillN||0"
VIS = "()=>{ const b=document.getElementById('autoSkillBtn'), r=b.getBoundingClientRect(), s=getComputedStyle(b); return s.display!=='none' && s.visibility!=='hidden' && r.width>=40 && r.height>=40 && r.bottom<=innerHeight && r.right<=innerWidth; }"
FIN = "()=>Number.isFinite(G.hero.g.position.x) && Number.isFinite(G.hero.hp) && G.enemies.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.g.position.x))"
def prep(pg):  # 판단 준비: 적 정리 · 쿨 0 · 시전 상태 초기화
    J(pg, CLEAR); J(pg, "()=>{ const h=G.hero; h.skillCd=0; h.atkT=0; h.spinT=0; h.roseT=0; h.snipeT=0; h.warpT=0; if (h.ft) h.ft.leap=null; h.hp=h.max; h.dead=0; G.autoSkillT=0; G.sim(.1); }")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 1) 일반 스테이지 (?test=1) =====
    pg = b.new_context(viewport={'width': VW, 'height': VH}).new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1', timeout=120000); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP)
    J(pg, "()=>{ G.choose('mage'); G.manual=true; G.hero.C={...G.hero.C, armor:1}; }"); J(pg, "()=>G.sim(.3)")
    s = J(pg, ST); ok('default_off', s['on'] is False and s['ls'] is None and 'on' not in s['cls'].split() and 'OFF' in s['txt'] and not s['st'] and not s['snd'], s)
    ok('hud_button_visible', J(pg, VIS))
    prep(pg); J(pg, PUT, PACK); J(pg, "()=>G.sim(1)"); ok('off_no_autocast', J(pg, N) == 0 and J(pg, "()=>G.hero.skillCd") == 0)
    pg.click('#autoSkillBtn'); s = J(pg, ST); ok('button_turns_on', s['on'] is True and s['ls'] == '1' and 'on' in s['cls'].split() and 'ON' in s['txt'] and s['st'] and s['snd'], s)
    prep(pg); J(pg, "()=>G.sim(1.5)"); ok('no_enemies_no_cast', J(pg, N) == 0 and J(pg, "()=>G.hero.skillCd") == 0)
    prep(pg); J(pg, PUT, [['grunt', 6, 0, 40]]); J(pg, "()=>G.sim(1)"); ok('single_weak_no_cast', J(pg, N) == 0 and J(pg, "()=>G.hero.skillCd") == 0, J(pg, "()=>G.autoSkillLast"))
    prep(pg); J(pg, PUT, [['grunt', 7, 0], ['imp', 7.6, .6], ['grunt', 6.5, -.6], ['imp', 7.2, 1]]); J(pg, "()=>G.sim(.6)")
    L = J(pg, "()=>({n:G.autoSkillN||0, cd:G.hero.skillCd, last:G.autoSkillLast, met:G.projs.filter(p=>p.kind==='meteor').length, c:(()=>{ const E=G.enemies.filter(e=>!e.dead); return [E.reduce((a,e)=>a+e.g.position.x,0)/E.length, E.reduce((a,e)=>a+e.g.position.z,0)/E.length]; })()})")
    ok('cluster_autocast', L['n'] == 1 and L['cd'] > 0 and L['last']['why'] == 'cluster' and L['last']['n'] >= 3 and abs(L['last']['x'] - L['c'][0]) < 1.5 and abs(L['last']['z'] - L['c'][1]) < 1.5, L)
    J(pg, "()=>G.sim(2)"); ok('cluster_hit', J(pg, "()=>G.enemies.filter(e=>!e.dead && e.hp<e.max).length") >= 3)
    # 쿨 중엔 다시 안 씀
    n0 = J(pg, N); J(pg, "()=>G.sim(1)"); ok('respects_cooldown', J(pg, N) == n0)
    # 손으로 Q (켜진 채): 적 없음 → 자동은 안 쓰고, Q 키는 그대로 시전
    prep(pg); pg.mouse.move(VW // 2, VH // 2 - 80); n0 = J(pg, N); pg.keyboard.press('q'); J(pg, "()=>G.sim(.1)")
    ok('manual_q_still_works', J(pg, "()=>G.hero.skillCd") > 0 and J(pg, N) == n0)
    prep(pg); J(pg, "()=>G.castSkill()"); ok('manual_button_path', J(pg, "()=>G.hero.skillCd") > 0)
    # Z 키 끄기/켜기 · 끄면 밀집이어도 안 씀
    pg.keyboard.press('z'); s = J(pg, ST); ok('z_turns_off', s['on'] is False and s['ls'] == '0' and 'on' not in s['cls'].split() and not s['snd'], s)
    prep(pg); J(pg, PUT, PACK); n0 = J(pg, N); J(pg, "()=>G.sim(1)"); ok('off_again_no_cast', J(pg, N) == n0 and J(pg, "()=>G.hero.skillCd") == 0)
    pg.keyboard.press('z'); ok('z_turns_on', J(pg, ST)['on'] is True)
    J(pg, "()=>G.sim(.5)"); ok('on_again_casts', J(pg, N) == n0 + 1)
    # 보스 한 마리 → 지점 광역도 씀
    prep(pg); J(pg, PUT, [['grunt', 6, 0]]); J(pg, "()=>{ const e=G.enemies.find(e=>!e.dead); e.E={...e.E, boss:true}; G.sim(.6); }")
    ok('boss_single_cast', J(pg, "()=>G.autoSkillLast&&G.autoSkillLast.why") == 'boss')
    # 모든 영웅·전직 Q
    COMBOS = [('archer', None), ('mage', None), ('warrior', None), ('gunner', None), ('fighter', None), ('archer', 'wind'), ('archer', 'hawk'), ('mage', 'flame'), ('mage', 'frost'),
              ('warrior', 'paladin'), ('warrior', 'berserk'), ('gunner', 'duel'), ('gunner', 'thorn'), ('fighter', 'tiger'), ('fighter', 'dragon')]
    bad = []
    for cls, br in COMBOS:
        J(pg, CLEAR)
        J(pg, "async([c, br])=>{ const A=await import('./src/data/advance.js'); G.perm={}; G.adv=br?A.ADV[c][br]:null; G.choose(c); G.manual=true; G.hero.C={...G.hero.C, armor:1}; }", [cls, br]); J(pg, "()=>G.sim(.3)")
        prep(pg); J(pg, PUT, PACK); n0 = J(pg, N); J(pg, "()=>G.sim(1.2)")
        r = J(pg, "()=>({cls:G.hero.cls, sk:G.hero.adv&&G.hero.adv.skill, n:G.autoSkillN||0, cd:G.hero.skillCd, why:G.autoSkillLast&&G.autoSkillLast.why})")
        if not (r['cls'] == cls and r['n'] == n0 + 1 and r['cd'] > 0 and (br is None or r['sk'])): bad.append((cls, br, r))
        J(pg, "()=>G.sim(1.5)")
        if not J(pg, FIN): bad.append((cls, br, 'NaN'))
    ok('all_heroes_and_advances_autocast', not bad and len(COMBOS) == 15, bad)
    # 새로고침 후 유지 → 메뉴 설정 칸으로 끄기 → 새로고침 후 꺼짐
    pg.reload(); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); s = J(pg, ST)
    ok('persist_on_after_reload', s['on'] is True and 'on' in s['cls'].split() and s['st'] and s['snd'], s)
    J(pg, "()=>{ const e=document.getElementById('stAutoSkill'); e.checked=false; e.dispatchEvent(new Event('change')); }"); s = J(pg, ST)
    ok('setting_off_synced', s['on'] is False and s['ls'] == '0' and not s['snd'] and 'on' not in s['cls'].split(), s)
    pg.reload(); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); s = J(pg, ST); ok('persist_off_after_reload', s['on'] is False and not s['st'], s)
    ok('help_lists_z', J(pg, "()=>G.help.HELP.find(s=>s.id==='battle').k.some(([k,d])=>k==='Z'&&d.includes('자동'))"))
    pg.context.close()
    # ===== 2) 던전 파티 (가짜 Supabase) =====
    c = b.new_context(viewport={'width': VW, 'height': VH}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&flow=1&dgtest=1', timeout=120000); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', 'auto1@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(400)
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(600)
    J(pg, "()=>G.setAutoSkill(true, true)"); pg.wait_for_timeout(1500); pg.keyboard.press('z')
    ok('town_no_cast_z_ignored', J(pg, "()=>[G.autoSkill, G.autoSkillN||0, G.phase]") == [True, 0, 'town'], J(pg, "()=>[G.autoSkill, G.autoSkillN||0, G.phase]"))
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden')", timeout=20000); pg.wait_for_timeout(1500)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.dg.q=[]; G.heroes.forEach(h=>{ h.C={...h.C, armor:1}; }); }")
    s = J(pg, ST); ok('dungeon_on_persisted', s['on'] is True and 'on' in s['cls'].split() and J(pg, VIS), s)
    def dg_try(tag):
        J(pg, CLEAR); J(pg, "()=>{ G.heroes.forEach(h=>{ h.skillCd = h===G.hero ? 0 : 99; h.spinT=0; h.roseT=0; h.snipeT=0; if (h.ft) h.ft.leap=null; }); G.autoSkillT=0; G.hero.path=[]; }")
        J(pg, PUT, PACK); n0 = J(pg, N); J(pg, "()=>G.sim(.8)")
        return J(pg, "(n0)=>({n:(G.autoSkillN||0)-n0, cls:G.hero.cls, cd:G.hero.skillCd, last:G.autoSkillLast, others:G.heroes.filter(h=>h!==G.hero).map(h=>h.skillCd>90)})", n0)
    r = dg_try('lead'); ok('dungeon_controlled_autocast', r['n'] == 1 and r['cd'] > 0 and r['last']['cls'] == r['cls'] and all(r['others']), r)
    J(pg, "()=>G.dgPick(1)"); J(pg, "()=>G.sim(.1)"); r = dg_try('swap'); ok('dungeon_after_swap_autocast', r['n'] == 1 and r['cls'] == J(pg, "()=>G.heroes[1].cls") and r['cd'] > 0, r)
    J(pg, "()=>G.setAutoSkill(false, true)"); r = dg_try('off'); ok('dungeon_off_controlled_manual_only', r['n'] == 0 and r['cd'] == 0, r)
    # 끈 상태에서도 파티 AI(조작하지 않는 영웅)는 원래대로 Q 를 씀
    J(pg, "()=>{ G.dgAiSkills=0; G.heroes.forEach(h=>{ if (h!==G.hero) { h.skillCd=0; h.aiT=0; h.g.position.copy(G.hero.g.position); } }); G.sim(1.2); }")
    ok('party_ai_unchanged', J(pg, "()=>G.dgAiSkills||0") >= 1, J(pg, "()=>G.dgAiSkills"))
    ok('dungeon_finite', J(pg, FIN))
    c.close(); b.close()
ok('no_console_errors', not errs, errs[:3])
print('ALL OK' if all(res.values()) else 'FAILED', len(res)); sys.exit(0 if all(res.values()) else 1)
