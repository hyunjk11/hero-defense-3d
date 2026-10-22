#!/usr/bin/env python3
"""던전 원정(파티 던전) 1층 테스트 (가짜 Supabase tests/sbmock.js).
 마을 던전 건물 → 입장 화면(파티 3명, 로즈는 서버 소유일 때만 — 저장 값 조작은 무시) → 출발(?dungeon=1&run=1) → 파티 4명 · 영웅별 장비/전직 ·
 타워/코어 없음 · 초상화 탭 = 조작 전환 · 바닥 탭 = 이동 · Q = 스킬 · 가장 가까운 영웅 타겟팅 · 입구에서 추적 · 일시정지/배속/탭 숨김 →
 AI 자동 전투로 1층 클리어 → 결과 → 마을 · 전멸 → 실패 화면 · 일반 판은 파티 1명 · 데스크톱 + 태블릿 1024x600 (터치 ≥44px) · 콘솔 오류 0
python3 tests/dungeon.py [--shots]   (스크린샷 shots/dungeon/*.png)"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/dungeon'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !e || e.classList.contains('hidden') || getComputedStyle(e).display==='none'; }}")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name, force=False):
    if SHOTS or force: J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=240000)
HIDE = "()=>{ Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
SHOW = "()=>{ delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }"
SIZES = "()=>[...document.querySelectorAll('#dgBar .dgP, #dgGiveUp, #skillBtn')].map(b=>{ const r=b.getBoundingClientRect(); return [b.id||b.className.split(' ')[0], Math.round(r.width), Math.round(r.height)]; })"

def login(pg, email, owned=False):
    pg.goto(url + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(400)
    # 장비·전직: 궁수(실바)에게 공격력 장비 + 바람의 순찰자 전직. 저장의 영웅 값을 유료 영웅으로 조작 (소유 기록 없음 → 무시되어야 함)
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=31; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.souls=50; d.stats={runs:1,kills:1,waves:1,souls:1}; const it={...E.makeItem('weapon','archer',3,r), id:'dgW'}; d.inv.push(it); d.eq.archer={weapon:'dgW'}; d.adv={...(d.adv||{}), archer:'wind'}; d.hero='gunner'; return d; }); }""")
    if owned: J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(600)

def start_run(pg):
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 데스크톱 1280x800 =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    login(pg, 'dg@test.kr', owned=False)
    ok('town_label', any('던전 원정' in t for t in J(pg, "()=>[...document.querySelectorAll('.tlabel')].map(e=>e.textContent)")))
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden') && document.querySelectorAll('.dgCard').length>=3", timeout=20000); pg.wait_for_timeout(1500)
    cards = J(pg, "()=>[...document.querySelectorAll('.dgCard:not(.lock)')].map(e=>e.dataset.cls)")
    ok('entry_party_no_rose', cards == ['warrior', 'archer', 'mage'], cards)
    ok('entry_rose_locked', J(pg, "()=>document.querySelectorAll('.dgCard.lock').length") == 1)
    ok('entry_no_budeul', 'mechanic' not in json.dumps(cards) and '버들' not in pg.inner_text('#dgPanel'))
    arch = pg.inner_text('.dgCard[data-cls="archer"]'); ok('entry_gear_adv_summary', '바람의 순찰자' in arch and '장비 1/3' in arch and '%' in arch, arch.replace('\n', ' | '))
    ok('entry_others_plain', '전직 없음' in pg.inner_text('.dgCard[data-cls="mage"]'))
    shot(pg, 'entry_desktop', True)
    # 소유 기록 추가 → 다시 열면 로즈 합류 (서버 확인)
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    J(pg, "()=>{ document.getElementById('dgClose').click(); G.openDungeon(); }"); pg.wait_for_function("()=>document.querySelectorAll('.dgCard[data-cls=\"gunner\"]').length===1", timeout=20000)
    ok('entry_rose_owned', J(pg, "()=>[...document.querySelectorAll('.dgCard:not(.lock)')].map(e=>e.dataset.cls)") == ['warrior', 'archer', 'mage', 'gunner'])
    start_run(pg)
    H = J(pg, "()=>G.heroes.map(h=>({cls:h.cls, adv:h.adv&&h.adv.n, atk:(h.eq&&h.eq.atk)||0, dmg:h.C.dmg, max:h.max}))")
    ok('run_party4', [h['cls'] for h in H] == ['warrior', 'archer', 'mage', 'gunner'], H)
    ok('run_per_hero_loadout', H[1]['adv'] == '바람의 순찰자' and H[0]['adv'] is None and H[2]['adv'] is None, H)
    ok('run_controlled_first', J(pg, "()=>G.hero===G.heroes[0] && G.hero.cls==='warrior'"))
    ok('run_no_towers_core', J(pg, "async()=>{ const t=await import('./src/world/terrain.js'); return G.towers.length===0 && !t.core.visible && G.tiles[0][0].t===4 && G.tiles[0][7].t===6; }"))
    ok('run_hud', hidden(pg, 'build') and hidden(pg, 'warpBtn') and not hidden(pg, 'dgBar') and J(pg, "()=>document.querySelectorAll('#dgBar .dgP').length") == 4 and '1층' in pg.inner_text('#dgTop'))
    sz = J(pg, SIZES); ok('touch_targets_desktop', all(w >= 44 and h >= 44 for _, w, h in sz), sz)
    # 초상화 탭 → 조작 전환, 바닥 탭 → 이동, Q → 스킬
    pg.tap('#dgBar .dgP[data-i="1"]'); J(pg, "()=>G.sim(.05)"); ok('portrait_switch', J(pg, "()=>G.hero.cls") == 'archer' and J(pg, "()=>document.querySelector('#dgBar .dgP[data-i=\"1\"]').classList.contains('ctl')"))
    tgt = J(pg, "async()=>{ const {camera}=await import('./src/render/scene.js'); const h=G.hero.g.position, v=new G.THREE.Vector3(h.x+6,0,h.z+3).project(camera); return [(v.x+1)/2*innerWidth, (1-v.y)/2*innerHeight]; }")
    pg.mouse.click(tgt[0], tgt[1]); J(pg, "()=>G.sim(1.5)"); p1 = J(pg, "()=>[G.hero.g.position.x, G.hero.g.position.z]")
    ok('ground_tap_moves', ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** .5 > 3, (p0, p1))
    J(pg, "()=>{ G.hero.skillCd=0; G.mouseGround.set(G.hero.g.position.x+4,0,G.hero.g.position.z); }"); pg.keyboard.press('q'); J(pg, "()=>G.sim(.05)")
    ok('q_skill_controlled', J(pg, "()=>G.hero.skillCd>1 && G.heroes[0].skillCd<=0"), J(pg, "()=>G.heroes.map(h=>h.skillCd)"))
    pg.keyboard.press('1'); J(pg, "()=>G.sim(.05)"); ok('key_switch', J(pg, "()=>G.hero.cls") == 'warrior')
    # 가장 가까운 영웅 타겟팅: 루나 옆에 튼튼한 적 1마리 → 루나만 피해
    r = J(pg, """()=>{ for (const e of G.enemies) { e.dead=true; } G.enemies.length=0; const L=G.heroes; L.forEach((h,i)=>{ h.hp=h.max; h.g.position.set(-14+i*9,0,-6); h.path=[]; });
      const m=L[2], e=G.spawnEnemy('grunt', 1, { x:m.g.position.x+1.2, z:m.g.position.z, tile:G.toTile(m.g.position.x+1.2, m.g.position.z) }); e.hp=e.max=1e7; e.state='walk';
      const savedAI=G.partyAI; G.partyAI=null; const hp0=L.map(h=>h.hp); G.sim(2); G.partyAI=savedAI; const d=L.map((h,i)=>Math.round(hp0[i]-h.hp)); e.dead=true; e.hb.show(false); G.enemies.length=0; return d; }""")
    ok('nearest_hero_targeted', r[2] > 0 and r[0] == 0 and r[1] == 0 and r[3] == 0, r)
    # 추적: 입구에서 나온 적이 영웅 쪽으로 (경로 비추종)
    r = J(pg, """()=>{ const L=G.heroes; L.forEach((h,i)=>{ h.hp=h.max; h.g.position.set(-2+i,0,1); h.path=[]; }); const e=G.spawnEnemy('imp', 1); e.hp=e.max=1e7; const d=()=>Math.min(...L.map(h=>h.g.position.distanceTo(e.g.position)));
      const savedAI=G.partyAI; G.partyAI=null; L.forEach(h=>{ h.cd=99; }); const d0=d(); G.sim(4); const d1=d(); G.partyAI=savedAI; L.forEach(h=>{ h.cd=0; }); e.dead=true; e.hb.show(false); G.enemies.length=0; return [Math.round(d0*10)/10, Math.round(d1*10)/10, e.next===null]; }""")
    ok('chase_from_entrance', r[1] < r[0] - 8 and r[1] < 3, r)
    # 일시정지 · 배속 · 탭 숨김(자동 일시정지 + 소리 끔)
    J(pg, "()=>{ G.setPaused(true); }"); ok('pause', J(pg, "()=>G.paused") and not hidden(pg, 'pauseOv')); J(pg, "()=>G.setPaused(false)")
    J(pg, "()=>G.setSpeed(2)"); ok('speed2', J(pg, "()=>G.speed") == 2 and '×2' in pg.inner_text('#speedBtn')); J(pg, "()=>G.setSpeed(1)")
    J(pg, "()=>{ G.manual=false; }"); J(pg, HIDE); hp_ = J(pg, "()=>[G.paused, G.Snd.bg.muted]"); J(pg, SHOW); J(pg, "()=>{ G.setPaused(false); G.manual=true; }")
    ok('tab_hide_pause_mute', hp_[0] is True and hp_[1] is True, hp_)
    # 1층: 역할 AI 자동 전투 (조작 영웅 = 세라, 가만히) → 클리어
    J(pg, """()=>{ const L=G.heroes; const off=[[0,0],[-2.2,1.8],[-2.2,-1.8],[-4,0]]; L.forEach((h,i)=>{ h.hp=h.max; h.skillCd=0; h.g.position.set(off[i][0],0,off[i][1]+1); h.path=[]; }); G.dgAiSkills=0; }""")
    shot_done = False; t = 0
    while t < 300 and not J(pg, "()=>!!G.dgResult"):
        J(pg, "()=>G.sim(2)"); t += 2
        if not shot_done and J(pg, "()=>G.enemies.filter(e=>!e.dead).length") >= 8:
            shot_done = True; J(pg, "()=>{ G.cam.target.set(0,0,1); }"); shot(pg, 'run_desktop', True)
    R = J(pg, "()=>G.dgResult"); st = J(pg, "()=>({wave:G.dg.wave, kills:G.stats.kills, hp:G.heroes.map(h=>Math.round(h.hp)+'/'+Math.round(h.max)), skills:G.dgAiSkills})")
    print('floor1', R, st, flush=True)
    ok('floor1_clear', R and R['win'] and R['alive'] >= 2, (R, st))
    ok('ai_used_skills', st['skills'] >= 3, st)
    ok('result_screen', not hidden(pg, 'stageClear') and '돌파' in pg.inner_text('#stageClear') and '영혼석' in pg.inner_text('#stageClear'))
    ok('reward_granted', J(pg, "()=>G.gear.Acc.load().souls") == 50 + 20, J(pg, "()=>G.gear.Acc.load().souls"))
    shot(pg, 'result_desktop', True)
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); ok('back_to_town', 'dungeon' not in pg.url and 'town=1' in pg.url, pg.url)
    # 전멸 → 실패 화면
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>document.querySelectorAll('.dgCard[data-cls=\"gunner\"]').length===1", timeout=20000); start_run(pg)
    J(pg, "()=>{ for (const h of G.heroes) G.heroDamage(1e9, h); G.sim(.3); }")
    ok('wipe_fail_screen', J(pg, "()=>G.dgResult && !G.dgResult.win") and '원정 실패' in pg.inner_text('#stageClear'))
    shot(pg, 'fail_desktop', True)
    c.close()
    # ===== 태블릿 가로 1024x600 =====
    c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True, is_mobile=False); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    login(pg, 'dgt@test.kr', owned=True)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>document.querySelectorAll('.dgCard[data-cls=\"gunner\"]').length===1", timeout=30000); pg.wait_for_timeout(500)
    fit = J(pg, "()=>{ const r=document.getElementById('dgPanel').getBoundingClientRect(), s=document.getElementById('dgStart').getBoundingClientRect(); return [r.top>=0 && r.bottom<=innerHeight+1, s.bottom<=innerHeight, Math.round(s.height)]; }")
    ok('tablet_entry_fits', fit[0] and fit[1] and fit[2] >= 44, fit); shot(pg, 'entry_tablet', True)
    pg.tap('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes.length===4", timeout=300000); J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
    sz = J(pg, SIZES); ok('touch_targets_tablet', all(w >= 44 and h >= 44 for _, w, h in sz), sz)
    ov = J(pg, "()=>{ const a=document.getElementById('dgBar').getBoundingClientRect(), b=document.getElementById('skillBtn').getBoundingClientRect(), c=document.getElementById('cam').getBoundingClientRect(); return [a.right<=b.left, b.right<=c.left, a.bottom<=innerHeight]; }")
    ok('tablet_layout_no_overlap', all(ov), ov)
    pg.tap('#dgBar .dgP[data-i="2"]'); J(pg, "()=>G.sim(.05)"); ok('tablet_portrait_tap', J(pg, "()=>G.hero.cls") == 'mage')
    J(pg, "()=>G.sim(14)"); shot(pg, 'run_tablet', True)
    J(pg, "async()=>{ (await import('./src/dungeon/run.js')).dgFinish(true); }"); shot(pg, 'result_tablet', True)
    c.close()
    # ===== 일반 판: 파티 1명 (기존 동작) =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=240000); J(pg, "()=>G.choose('mage')"); pg.wait_for_function("()=>G.phase==='build'", timeout=60000)
    ok('normal_party_1', J(pg, "()=>G.heroes.length===1 && G.heroes[0]===G.hero && !G.dungeon && G.hero.cls==='mage'"))
    c.close(); b.close()
print('console errors:', errs[:5])
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else 'ALL OK')
sys.exit(1 if fails or errs else 0)
