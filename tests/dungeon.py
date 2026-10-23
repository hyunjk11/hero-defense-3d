#!/usr/bin/env python3
"""던전 원정(파티 던전) 1층 테스트 (가짜 Supabase tests/sbmock.js).
 마을 던전 건물 → 입장 화면(파티 3명, 로즈·서윤은 서버 소유일 때만 · 출전 영웅 고르기 최대 4명 — 저장 값 조작은 무시) → 출발(?dungeon=1&run=1) → 파티 4명 · 영웅별 장비/전직 ·
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
SIZES = "()=>[...document.querySelectorAll('#dgBar .dgP, #dgGiveUp, #skillBtn, #dgJoint')].map(b=>{ const r=b.getBoundingClientRect(); return [b.id||b.className.split(' ')[0], Math.round(r.width), Math.round(r.height)]; })"

# 층 건너뛰기(테스트): 남은 웨이브·적 제거 → 다음 스텝에 층 돌파 (마지막 층이면 결과, 아니면 축복 3택1)
SKIP = """async()=>{ const {FLOORS}=await import('./src/data/dungeon.js'); const D=G.dg; D.q=[]; D.wave=FLOORS[D.floor].waves.length-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9); G.sim(2.5); return [D.floor, !!D.blessing, !!G.dgResult]; }"""
BLESS_OK = "()=>{ const el=document.getElementById('dgBless'); if (!el || el.classList.contains('hidden')) return null; return [...el.querySelectorAll('.dgBc')].map(b=>{ const r=b.getBoundingClientRect(); return [b.dataset.id, Math.round(r.width), Math.round(r.height), r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight]; }); }"
def pick_bless(pg, avoid=('heal',), tap=False, prefer='haste'):
    cards = J(pg, BLESS_OK); i = next((k for k, c in enumerate(cards) if c[0] == prefer), None)
    if i is None: i = next((k for k, c in enumerate(cards) if c[0] not in avoid), 0)
    sel = f'#dgBless .dgBc[data-i="{i}"]'; pg.tap(sel) if tap else pg.click(sel); J(pg, "()=>G.sim(.1)"); return cards[i][0]

# ===== 4단계: 5층 보스 '망령 여왕 모르비아' (dungeon/boss.js) =====
BOSS = "G.enemies.find(e=>e.type==='dg_lich'&&!e.dead)"
def boss_ready(pg):  # 보스 출현(spawn 연출 끝)까지 + 졸개 제거
    pg.wait_for_function("()=>G.dgBossModel", timeout=120000)
    for _ in range(40):
        if J(pg, "()=>{ G.sim(.5); const b=%s; return !!b && b.state!=='spawn' && G.dg.q.length===0; }" % BOSS): break
    J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead && e.type!=='dg_lich') G.hurt(e,1e9); G.sim(.1); }")
def place(pg, spots):  # 영웅 i → 보스 기준 (dx, dz)
    J(pg, "(S)=>{ const b=%s; S.forEach(([i,dx,dz])=>{ const h=G.heroes[i]; if (!h) return; h.g.position.set(b.g.position.x+dx,0,b.g.position.z+dz); h.path=[]; h.aiGoal=null; }); }" % BOSS, spots)
def boss_checks(pg, tag):
    boss_ready(pg)
    st = J(pg, "()=>{ const b=%s; return b && {lich:!!b.m.lich, model:G.dgBossModel, hp:Math.round(b.hp), max:Math.round(b.max), boss:!!b.E.boss, h:b.E.h}; }" % BOSS)
    ok(f'boss_{tag}_meshy_model', st and st['lich'] and st['model'] == 'meshy' and st['boss'], st)
    if tag == 'desktop':
        fb = J(pg, "async()=>{ const C=await import('./src/render/characters.js'); const s=C.GL.lich_meshy; delete C.GL.lich_meshy; let m; try { m=C.makeEnemyModel('dg_lich'); } finally { C.GL.lich_meshy=s; } const r=[!m.lich, !!m.crown, !!(m.acts&&m.acts.Death_A)]; m.mats&&m.mats.forEach(x=>x.dispose()); return r; }")
        ok('boss_fallback_model', all(fb), fb)  # Meshy 모델을 못 받으면 해골 마법사 + 보라 색조 + 왕관
    # 보스 중앙 · 세라 조작(가만히) · 세라를 실바 앞 선 위에 · 루나·4번째는 옆으로 → 창 = 실바(가장 먼 후방) 대상, 세라가 막음
    J(pg, "()=>{ const b=%s; b.g.position.set(-8,0,0); b.bz.lanceT=99; b.bz.circT=99; b.bz.hold=0; b.atkCd=99; }" % BOSS)
    J(pg, "async()=>{ const H=await import('./src/heroes/hero.js'); H.setControlled(G.heroes[0]); }")
    place(pg, [[0, 7, 0.2], [1, 10, 0], [2, 3, 7], [3, 3, -6]])
    J(pg, "()=>{ G.heroes.forEach(h=>{ h.dead=0; h.hp=h.max; }); const b=%s; b.bz.lanceT=0; G.sim(.1); }" % BOSS)
    L = J(pg, "()=>{ const f=G.dgB.fx.find(f=>f.k==='lance'); return f && {tgt:f.tgt, guard:f.guard, n:G.dgB.log.lance, banner:document.getElementById('banner').innerText}; }")
    ok(f'boss_{tag}_lance_telegraph', L and L['n'] == 1 and L['tgt'] in (1, 2, 3) and '영혼의 창' in L['banner'], L)
    if tag == 'desktop':
        hp1 = J(pg, "()=>G.heroes.map(h=>h.hp)")
        J(pg, "()=>G.sim(2.3)"); lg = J(pg, "()=>({...G.dgB.log, hp:G.heroes.map(h=>Math.round(h.hp)), max:G.heroes.map(h=>Math.round(h.max))})")
        tgt = L['tgt']
        ok('boss_lance_blocked_by_sera', lg['blocked'] == 1 and lg['lanceHit'] == 0 and lg['hp'][tgt] >= round(hp1[tgt]) - 1 and lg['hp'][0] < lg['max'][0], (lg, L))
        # 세라를 선에서 치움 → 대상이 맞음 (큰 피해)
        place(pg, [[0, 2, 9], [1, 10, 0], [2, 3, 7], [3, 3, -6]])
        J(pg, "()=>{ G.heroes.forEach(h=>{ h.hp=h.max; }); const b=%s; b.bz.lanceT=0; b.bz.hold=0; G.sim(.1); }" % BOSS)
        L2 = J(pg, "()=>{ const f=G.dgB.fx.find(f=>f.k==='lance'&&!f.fired); return f && [f.tgt, f.guard]; }")
        J(pg, "()=>{ const f=G.dgB.fx.find(f=>f.k==='lance'&&!f.fired); if (f) f.guard=-1; G.sim(2.3); }")  # 막을 AI 가 없을 때 (조작 영웅 세라는 가만히)
        lg2 = J(pg, "()=>({...G.dgB.log, hp:G.heroes.map(h=>Math.round(h.hp)), max:G.heroes.map(h=>Math.round(h.max))})")
        ok('boss_lance_hits_backline', lg2['lanceHit'] + lg2['lanceMiss'] == 1 and (lg2['lanceHit'] == 0 or lg2['hp'][L2[0]] < lg2['max'][L2[0]] * .7), (lg2, L2))
        # AI 막기: 세라가 아닌 영웅을 조작 → 세라(AI)가 막기 지점으로 달려감
        J(pg, "async()=>{ const H=await import('./src/heroes/hero.js'); H.setControlled(G.heroes[2]); }")
        place(pg, [[0, 4, 6], [1, 10, 0], [2, 3, 7], [3, 3, -6]])
        J(pg, "()=>{ G.heroes.forEach(h=>{ h.hp=h.max; }); const b=%s; b.bz.lanceT=0; b.bz.hold=0; G.sim(.1); }" % BOSS)
        g = J(pg, "()=>{ const f=G.dgB.fx.find(f=>f.k==='lance'&&!f.fired); return f && [f.tgt, f.guard]; }")
        J(pg, "()=>G.sim(2.3)"); lg3 = J(pg, "()=>({...G.dgB.log})")
        ok('boss_lance_ai_intercept', g and g[1] == 0 and lg3['blocked'] == 2, (g, lg3))
        # 망령의 원: 조작 영웅(루나)은 가만히 → 맞음 · AI 영웅은 피함
        place(pg, [[0, 4, 3], [1, 10, -3], [2, 9, 6], [3, 6, -6]])
        J(pg, "()=>{ G.heroes.forEach(h=>{ h.hp=h.max; }); const b=%s; b.bz.circT=0; b.bz.hold=0; b.bz.lanceT=99; G.sim(.1); }" % BOSS)
        nc = J(pg, "()=>G.dgB.fx.filter(f=>f.k==='circ'&&!f.fired).length")
        J(pg, "()=>G.sim(2.2)"); lc = J(pg, "()=>({...G.dgB.log, hp:G.heroes.map(h=>Math.round(h.hp)), max:G.heroes.map(h=>Math.round(h.max))})")
        alive = J(pg, "()=>G.heroes.filter(h=>h.dead<=0).length")
        ok('boss_circles', nc == 3 and lc['circles'] == 1 and lc['hp'][2] < lc['max'][2] and 1 <= lc['circleHits'] < alive, (nc, lc))
        # 소환 75% · 분노 50% (원 5개 · 창 2연속) · 소환 40%
        J(pg, "()=>{ const b=%s; b.hp=b.max*.7; b.bz.lanceT=99; b.bz.circT=99; G.sim(.2); }" % BOSS)
        sm = J(pg, "()=>[G.dgB.log.summons, G.dgB.log.summoned, G.dgB.log.phase2, G.enemies.filter(e=>e.summoned).length]")
        ok('boss_summon_75', sm[0] == 1 and sm[1] == 3 and sm[3] >= 1 and not sm[2], sm)
        J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead && e.type!=='dg_lich') G.hurt(e,1e9); const b=%s; b.hp=b.max*.45; b.bz.hold=0; G.sim(.2); }" % BOSS)
        ph = J(pg, "()=>{ const b=%s; return [G.dgB.log.phase2, b.spdK, document.getElementById('banner').innerText]; }" % BOSS)
        ok('boss_phase2', ph[0] and ph[1] > 1, ph)
        J(pg, "()=>{ const b=%s; b.bz.hold=0; b.bz.circT=0; b.bz.lanceT=99; G.sim(.1); }" % BOSS)
        ok('boss_phase2_circles5', J(pg, "()=>G.dgB.fx.filter(f=>f.k==='circ'&&!f.fired).length") == 5)
        J(pg, "()=>{ G.sim(2.2); const b=%s; b.bz.hold=0; b.bz.lanceT=0; b.bz.circT=99; G.sim(.1); G.sim(1.2); }" % BOSS)
        ok('boss_phase2_double_lance', J(pg, "()=>G.dgB.log.lance") >= 5, J(pg, "()=>G.dgB.log"))
        J(pg, "()=>{ const b=%s; b.hp=b.max*.35; G.sim(.2); }" % BOSS)
        ok('boss_summon_40', J(pg, "()=>G.dgB.log.summons") == 2)
        J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead && e.type!=='dg_lich') G.hurt(e,1e9); G.heroes.forEach(h=>{ h.dead=0; h.hp=h.max; }); G.sim(2.5); }")
    # 스크린샷: 창 + 원 예고 동시에
    J(pg, "()=>{ const b=%s; b.g.position.set(-4,0,-4); b.g.rotation.y=Math.PI/2; for (const e of [...G.enemies]) if (!e.dead && e.type!=='dg_lich') G.hurt(e,1e9); G.sim(1.8); }" % BOSS)  # 기둥 없는 곳 (화면에서 잘 보이게)
    place(pg, [[0, 5, 1], [1, 11, 0], [2, 8, 5], [3, 7, -5]])
    J(pg, "()=>{ const b=%s; b.bz.hold=0; b.bz.lanceT=0; b.bz.circT=99; G.sim(.1); b.bz.hold=0; b.bz.circT=0; b.bz.lanceT=99; G.sim(.6); G.cam.target.set(b.g.position.x+5,0,b.g.position.z); b.flash=0; const fl=document.getElementById('dgFlash'); if (fl) fl.classList.remove('on'); document.querySelectorAll('.dmg').forEach(d=>d.remove()); }" % BOSS)
    shot(pg, f'boss_{tag}', True)
    J(pg, "()=>G.sim(2)")
def login(pg, email, owned=False):
    pg.goto(url + '?seed=12345&rng=777&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(400)
    # 장비·전직: 궁수(실바)에게 공격력 장비 + 바람의 순찰자 전직. 저장의 영웅 값을 유료 영웅으로 조작 (소유 기록 없음 → 무시되어야 함)
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=31; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.souls=50; d.stats={runs:1,kills:1,waves:1,souls:1}; const it={...E.makeItem('weapon','archer',3,r), id:'dgW'}; d.inv.push(it); d.eq.archer={weapon:'dgW'}; d.adv={...(d.adv||{}), archer:{b:'wind',n:1}}; d.hero='gunner'; return d; }); }""")
    if owned: J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(600)

# 5단계: 가짜 서버의 판 시작 시각을 1시간 앞당김 (테스트는 G.sim 으로 빨리 감기 → 서버의 '층당 20초' 상한에 안 걸리게)
BACKDATE = "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); for (const r of Object.values(d.dg_runs||{})) if (r.status==='active') r.started-=3600e3; localStorage.setItem('__mockdb', JSON.stringify(d)); }"
MEDALS = "()=>!!(G.dgResult && G.dgResult.medals)"
def start_run(pg):
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }"); J(pg, BACKDATE)

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
    ok('entry_paid_locked', len(J(pg, "()=>[...document.querySelectorAll('.dgCard.lock')].map(e=>e.innerText)")) == 2 and '서윤' in pg.inner_text('#dgPanel') and '로즈' in pg.inner_text('#dgPanel'))  # 로즈 · 서윤 잠김 카드
    ok('entry_pick_default', J(pg, "()=>[...document.querySelectorAll('.dgCard.pick.on')].map(e=>e.dataset.cls)") == ['warrior', 'archer', 'mage'] and '출전 3 / 4' in pg.inner_text('#dgPickN'))
    ok('entry_no_budeul', 'mechanic' not in json.dumps(cards) and '버들' not in pg.inner_text('#dgPanel'))
    arch = pg.inner_text('.dgCard[data-cls="archer"]'); ok('entry_gear_adv_summary', '바람의 순찰자' in arch and '장비 1/3' in arch and '%' in arch, arch.replace('\n', ' | '))
    ok('entry_others_plain', '전직 없음' in pg.inner_text('.dgCard[data-cls="mage"]'))
    pg.wait_for_function("()=>(document.getElementById('dgDay')||{}).innerText.includes('남은 입장')", timeout=20000)
    dy = pg.inner_text('#dgDay'); ok('entry_day_status', '오늘 남은 입장 3/3' in dy and '던전 메달 0' in dy and not J(pg, "()=>document.getElementById('dgStart').disabled"), dy)
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
    p0 = J(pg, "()=>[G.hero.g.position.x, G.hero.g.position.z]")
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
      const savedAI=G.partyAI; G.partyAI=null; L.forEach(h=>{ h.cd=99; }); const d0=d(); G.sim(6); const d1=d(); G.partyAI=savedAI; L.forEach(h=>{ h.cd=0; }); e.dead=true; e.hb.show(false); G.enemies.length=0; return [Math.round(d0*10)/10, Math.round(d1*10)/10, e.next===null]; }""")
    ok('chase_from_entrance', r[1] < r[0] - 8 and r[1] < 3, r)
    # U-11: 같은 대상 0.15초 안 피해 숫자는 하나로 합침 (G.t 고정 상태에서 5번 → 숫자 1개 '50') · 창이 지나면 새 숫자 · 던전 동시 상한 30
    r = J(pg, """async()=>{ const L=G.heroes, h=L[0]; const e=G.spawnEnemy('grunt', 1, { x:h.g.position.x+1.5, z:h.g.position.z, tile:G.toTile(h.g.position.x+1.5, h.g.position.z) }); e.hp=e.max=1e7;
      const n=()=>document.querySelectorAll('#fx .dmg').length, n0=n(); for (let i=0;i<5;i++) G.hurt(e, 10, '#fff'); const n1=n(), t1=e.dnEl&&e.dnEl.textContent, sum=!!(e.dnEl&&e.dnEl.classList.contains('sum'));
      const el0=e.dnEl; e.dnT=G.t-1; G.hurt(e, 7, '#fff'); const fresh=e.dnEl!==el0 && e.dnEl && e.dnEl.textContent;
      e.dead=true; e.hb.show(false); G.enemies.splice(G.enemies.indexOf(e),1); return [n1-n0, t1, sum, fresh]; }""")
    ok('u11_dmg_merge', r[0] == 1 and r[1] == '50' and r[2] and r[3] == '7', r)
    # 일시정지 · 배속 · 탭 숨김(자동 일시정지 + 소리 끔)
    J(pg, "()=>{ G.setPaused(true); }"); ok('pause', J(pg, "()=>G.paused") and not hidden(pg, 'pauseOv')); J(pg, "()=>G.setPaused(false)")
    J(pg, "()=>G.setSpeed(2)"); ok('speed2', J(pg, "()=>G.speed") == 2 and '×2' in pg.inner_text('#speedBtn')); J(pg, "()=>G.setSpeed(1)")
    J(pg, "()=>{ G.manual=false; }"); J(pg, HIDE); hp_ = J(pg, "()=>[G.paused, G.Snd.bg.muted]"); J(pg, SHOW); J(pg, "()=>{ G.setPaused(false); G.manual=true; }")
    ok('tab_hide_pause_mute', hp_[0] is True and hp_[1] is True, hp_)
    # 1층: 역할 AI 자동 전투 (조작 영웅 = 세라, 가만히) → 클리어
    J(pg, """()=>{ const L=G.heroes; const off=[[0,0],[-2.2,1.8],[-2.2,-1.8],[-4,0]]; L.forEach((h,i)=>{ h.hp=h.max; h.skillCd=0; h.g.position.set(off[i][0],0,off[i][1]+1); h.path=[]; }); G.dgAiSkills=0; }""")
    shot_done = False; t = 0
    while t < 300 and not J(pg, "()=>!!(G.dg.blessing || G.dgResult)"):
        J(pg, "()=>G.sim(2)"); t += 2
        if not shot_done and J(pg, "()=>G.enemies.filter(e=>!e.dead).length") >= 8:
            shot_done = True; J(pg, "()=>{ G.cam.target.set(0,0,1); }"); shot(pg, 'run_desktop', True)
    st = J(pg, "()=>({floor:G.dg.floor, bless:G.dg.blessing, res:G.dgResult, wave:G.dg.wave, kills:G.stats.kills, hp:G.heroes.map(h=>Math.round(h.hp)+'/'+Math.round(h.max)), alive:G.heroes.filter(h=>h.dead<=0).length, ult:G.heroes.map(h=>Math.round(h.ult||0)), skills:G.dgAiSkills, t:Math.round(G.dg.t)})")
    print('floor1', st, flush=True)
    ok('floor1_clear', st['bless'] and not st['res'] and st['alive'] >= 2 and st['floor'] == 0, st)
    ok('ai_used_skills', st['skills'] >= 3, st)
    ok('ult_charged', all(u > 20 for u in st['ult']), st['ult'])
    # ===== 축복 3택1 =====
    cards = J(pg, BLESS_OK); ok('bless_panel', cards and len(cards) == 3 and len({c[0] for c in cards}) == 3 and all(c[1] >= 44 and c[2] >= 44 and c[3] for c in cards), cards)
    ok('bless_text', '돌파' in pg.inner_text('#dgBless') and '2층' in pg.inner_text('#dgBless'))
    shot(pg, 'bless_desktop', True)
    J(pg, "()=>G.sim(3)"); ok('bless_waits', J(pg, "()=>G.dg.floor===0 && !!G.dg.blessing && !G.enemies.some(e=>!e.dead)"))
    rate0 = J(pg, "()=>G.withHero(G.heroes[1], ()=>G.heroStat.rate())") if J(pg, "()=>!!G.heroStat") else None
    b1 = pick_bless(pg)
    ok('bless_next_floor', J(pg, "()=>G.dg.floor===1 && !G.dg.blessing && G.dg.bless[%r]===1 && document.getElementById('dgBless').classList.contains('hidden')" % b1) and '2층' in pg.inner_text('#dgTop'), b1)
    if b1 == 'haste' and rate0: ok('bless_haste_applies', abs(J(pg, "()=>G.withHero(G.heroes[1], ()=>G.heroStat.rate())") / rate0 - 1.15) < 1e-6)
    ok('bless_icon_top', J(pg, "()=>document.querySelectorAll('#dgBl i').length") == 1)
    # ===== 쓰러진 영웅: 이 층은 쉬고 다음 층에 30% 로 복귀 =====
    J(pg, "()=>{ G.heroDamage(1e9, G.heroes[1]); G.sim(.2); }")
    ok('down_sits_out', J(pg, "()=>G.heroes[1].dead>0 && G.heroes[1].hp===0"))
    r = J(pg, SKIP); ok('floor2_clear_bless', r[1] and r[0] == 1, r)
    ok('down_still_down_in_bless', J(pg, "()=>G.heroes[1].dead>0"))
    b2 = pick_bless(pg)
    rv = J(pg, "()=>{ const h=G.heroes[1]; return [h.dead, Math.round(h.hp), Math.round(h.max*.3), h.hb ? 1 : 0, G.dg.floor]; }")
    ok('down_returns_30pct', rv[0] <= 0 and abs(rv[1] - rv[2]) <= max(3, rv[2] * .05) and rv[4] == 2, (rv, b2))  # 30% (+ 0.1초 동안 전직 회복 등 약간)
    # ===== 3층 =====
    J(pg, "()=>G.sim(7)"); ok('floor3_running', J(pg, "()=>G.dg.floor===2 && G.enemies.some(e=>!e.dead)") and '3층' in pg.inner_text('#dgTop'))
    J(pg, "()=>{ G.cam.target.set(0,0,1); }"); shot(pg, 'floor3_desktop', True)
    # ===== 합동 공격 =====
    J(pg, "()=>{ G.heroes.forEach(h=>{ h.ult=60; }); G.sim(.2); }")
    nr = J(pg, "()=>{ const n0=G.dg.joints; document.getElementById('dgJoint').click(); return [n0===G.dg.joints, document.getElementById('dgJoint').disabled, document.getElementById('dgJoint').classList.contains('ready')]; }")
    ok('joint_not_ready', nr[0] and nr[1] and not nr[2], nr)
    J(pg, "()=>{ G.heroes.forEach(h=>{ h.ult=100; h.skillCd=0; }); G.heroes[3] && (G.heroes[3].ult=40, G.heroDamage(1e9, G.heroes[3])); G.sim(.2); }")  # 쓰러진 로즈는 조건에서 빠짐
    ok('joint_ready', J(pg, "()=>{ const b=document.getElementById('dgJoint'); return !b.disabled && b.classList.contains('ready'); }"))
    J(pg, "()=>{ G.cam.target.set(0,0,1); }"); shot(pg, 'joint_ready_desktop', True)
    J(pg, """()=>{ for (let i=0;i<6;i++) { const e=G.spawnEnemy('grunt', 1); e.state='walk'; } G.sim(1.5); }""")
    pre = J(pg, "()=>G.enemies.filter(e=>!e.dead&&e.dying===undefined).map(e=>{ e._pre=1; return e.hp; })")
    pg.tap('#dgJoint'); J(pg, "()=>G.sim(.2)")
    jr = J(pg, "()=>({n:G.dg.joints, ult:G.heroes.filter(h=>h.dead<=0).map(h=>h.ult), cd:G.heroes.filter(h=>h.dead<=0).map(h=>h.skillCd>0)})")
    ok('joint_casts_all', jr['n'] == 1 and all(u < 3 for u in jr['ult']) and all(jr['cd']), jr)
    J(pg, "()=>{ G.pauseRender=false; }"); pg.wait_for_timeout(250); shot(pg, 'joint_desktop', True); J(pg, "()=>{ G.pauseRender=true; }")
    J(pg, "()=>G.sim(.8)"); hits = J(pg, "()=>G.dgJointHits||0"); ok('joint_screen_aoe', hits >= min(6, len(pre)) and len(pre) >= 6, (hits, len(pre)))
    ok('joint_kills_grunts', J(pg, "()=>G.enemies.filter(e=>e._pre&&e.type==='grunt'&&!e.dead).length") == 0)
    # 4층 → 5층(보스 방) → 완주
    r = J(pg, SKIP); ok('floor3_clear', r[1] and r[0] == 2, r); pick_bless(pg)
    r = J(pg, SKIP); ok('floor4_clear', r[1] and r[0] == 3, r); pick_bless(pg)
    ok('floor5_boss_room', J(pg, "()=>G.dg.floor===4") and '5층' in pg.inner_text('#dgTop'))
    J(pg, "async()=>{ const D=G.dg; D.q=[]; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); G.sim(6); }")
    ok('floor5_boss_spawns', J(pg, "()=>G.dg.wave===1 && (G.dg.q.includes('dg_lich') || G.enemies.some(e=>e.type==='dg_lich'))"), J(pg, "()=>[G.dg.wave, G.dg.q.slice(0,5)]"))
    boss_checks(pg, 'desktop')
    r = J(pg, SKIP); R = J(pg, "()=>G.dgResult"); print('result', R, flush=True)
    ok('boss_fx_cleared', J(pg, "()=>G.dgB.fx.length===0 && !G.enemies.some(e=>e.type==='dg_lich'&&!e.dead)"))
    ok('all_floors_clear', R and R['win'] and R['cleared'] == 5 and R['got'] == 0 and R['mode'] == 'ranked' and R['joints'] == 1 and len(R['bless']) >= 1, R)
    pg.wait_for_function(MEDALS, timeout=30000); M = J(pg, "()=>G.dgResult.medals")
    ok('medals_full_clear', M['ok'] and M['medals'] == 15 and M['total'] == 15 and M['floors'] == 5 and M['win'] and not M['capped'], M)
    tx = pg.inner_text('#stageClear'); ok('result_screen', not hidden(pg, 'stageClear') and '완주' in tx and '던전 메달 +15' in tx and '보유 15' in tx and J(pg, "()=>document.querySelectorAll('.dgFloors span.ok').length") == 5, tx.replace('\n', ' | '))
    ok('reward_no_souls_ranked', J(pg, "()=>G.gear.Acc.load().souls") == 50, J(pg, "()=>G.gear.Acc.load().souls"))  # 메달 원정 = 영혼석 대신 메달
    ok('medals_not_in_save', 'medal' not in json.dumps(J(pg, "()=>G.gear.Acc.load()")))
    shot(pg, 'result_desktop', True)
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); ok('back_to_town', 'dungeon' not in pg.url and 'town=1' in pg.url, pg.url)
    # 전멸 → 실패 화면
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>document.querySelectorAll('.dgCard[data-cls=\"gunner\"]').length===1", timeout=20000); start_run(pg)
    r = J(pg, SKIP); pick_bless(pg)
    J(pg, "()=>{ for (const h of G.heroes) G.heroDamage(1e9, h); G.sim(.3); }")
    R = J(pg, "()=>G.dgResult"); ok('wipe_fail_screen', R and not R['win'] and R['cleared'] == 1 and R['got'] == 0 and '원정 실패' in pg.inner_text('#stageClear') and '1층 돌파' in pg.inner_text('#stageClear'), R)
    pg.wait_for_function(MEDALS, timeout=30000); M = J(pg, "()=>G.dgResult.medals")
    ok('wipe_reward_medals', M['ok'] and M['medals'] == 2 and M['total'] == 17 and '던전 메달 +2' in pg.inner_text('#stageClear'), M)
    shot(pg, 'fail_desktop', True)
    # ===== 하루 3회: 오늘 2회 썼음 → 남은 1 · (서버에 1회 더 기록) → 0/3 이면 출발 막힘 =====
    pg.click('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); pg.wait_for_timeout(500)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>(document.getElementById('dgDay')||{}).innerText.includes('남은 입장 1/3')", timeout=20000)
    ok('entry_left_1_medals', '던전 메달 17' in pg.inner_text('#dgDay'), pg.inner_text('#dgDay'))
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id, day=new Date(Date.now()+9*3600e3).toISOString().slice(0,10); d.dg_runs.x3={token:'x3',user_id:u,day,status:'done',started:Date.now(),medals:0}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    J(pg, "()=>{ document.getElementById('dgClose').click(); G.openDungeon(); }"); pg.wait_for_function("()=>(document.getElementById('dgDay')||{}).innerText.includes('남은 입장 0/3')", timeout=20000)
    ok('daily_limit_button', J(pg, "()=>document.getElementById('dgStart').disabled") and '오늘 입장 끝' in pg.inner_text('#dgStart'))
    J(pg, "()=>{ const b=document.getElementById('dgStart'); b.disabled=false; b.click(); }"); pg.wait_for_function("()=>G.dgEntry && G.dgEntry.blocked", timeout=20000); pg.wait_for_timeout(800)
    ok('daily_limit_server_blocks', '하루 3회' in pg.inner_text('#banner') and 'dungeon' not in pg.url and J(pg, "()=>G.screen") == 'town', pg.inner_text('#banner'))
    # ===== 던전 상점: 메달 17 → 고유 정수(15) 사기 → 우편 → 받기 = 세이브에 정수 +3 · 칭호(60)는 부족 =====
    pg.click('#dgShopBtn'); pg.wait_for_function("()=>document.querySelectorAll('.dgShopIt').length===6 && document.getElementById('dgShopMedals').textContent==='17'", timeout=20000)
    stt = J(pg, "()=>[...document.querySelectorAll('.dgShopIt')].map(e=>[e.dataset.id, e.className.split(' ')[1], e.querySelector('button').disabled])")
    ok('shop_items', [x[0] for x in stt] == ['dg_steel', 'dg_souls', 'dg_crystal', 'dg_essence', 'dg_title', 'dg_uq_fist'] and stt[3][1] == 'ok' and stt[4][1] == 'lack' and stt[4][2], stt)
    ok('shop_touch44', all(w >= 44 and h >= 44 for w, h in J(pg, "()=>[...document.querySelectorAll('.dgBuy,#dgBack')].map(b=>{ const r=b.getBoundingClientRect(); return [r.width, r.height]; })")))
    es0 = J(pg, "()=>G.gear.Acc.load().mat.essence||0")
    # Q-1 공용 확인창: 구매 → #gConfirm (메달 가격) · 취소 = 안 삼 · 다시 눌러 확인
    J(pg, "()=>G.dgLastBuy=null"); pg.click('.dgBuy[data-buy="dg_essence"]'); pg.wait_for_timeout(300)
    ok('q1_dgshop_confirm', J(pg, "()=>{ const e=document.getElementById('gConfirm'); return !!e && !e.classList.contains('hidden') && e.innerText.includes('던전 상점') && e.innerText.includes('메달'); }"))
    os.makedirs('shots/improve', exist_ok=True); pg.screenshot(path='shots/improve/confirm_dgshop.png')
    pg.click('#gcNo'); pg.wait_for_timeout(500); ok('q1_dgshop_cancel', J(pg, "()=>G.dgLastBuy===null && document.getElementById('gConfirm').classList.contains('hidden')") and J(pg, "()=>G.gear.Acc.load().mat.essence||0") == es0 and not hidden(pg, 'dgPanel'))
    pg.click('.dgBuy[data-buy="dg_essence"]'); pg.click('#gcOk'); pg.wait_for_function("()=>G.dgLastBuy && G.dgLastBuy.ok", timeout=20000); pg.wait_for_timeout(300)
    ok('shop_buy_essence', pg.inner_text('#dgShopMedals') == '2' and '우편함' in pg.inner_text('#banner'), pg.inner_text('#dgShopMedals'))
    mid = J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const m=Object.values(d.hd3d_mail).find(m=>m.reward&&m.reward.essence===3); return m&&m.id; }")
    r = J(pg, "async(id)=>{ const Sh=await import('./src/account/shop.js'); return await Sh.claim(id); }", mid)
    ok('shop_mail_claim_essence', r['ok'] and J(pg, "()=>G.gear.Acc.load().mat.essence||0") == es0 + 3, r)
    ok('shop_buy_not_enough', J(pg, "async()=>{ const DS=await import('./src/account/dungeon.js'); const r=await DS.dgBuy('dg_steel'); return !r.ok && r.msg.includes('부족'); }"))
    # 관리자 메달 우편 (받기 = 서버 지갑) → 칭호 사기
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.seq=(d.seq||0)+1; d.hd3d_mail[d.seq]={id:d.seq,user_id:u,title:'메달 선물',body:'',reward:{medals:100},claimed:false,claimed_at:null,created_at:new Date().toISOString()}; localStorage.setItem('__mockdb', JSON.stringify(d)); window._mm=d.seq; }")
    r = J(pg, "async()=>{ const Sh=await import('./src/account/shop.js'); const r=await Sh.claim(window._mm); const DS=await import('./src/account/dungeon.js'); await DS.dgStatus(); return [r.ok, DS.DGS.medals, G.gear.Acc.load().souls]; }")
    ok('admin_medal_mail_claim', r[0] and r[1] == 102 and r[2] == 50, r)
    J(pg, "()=>{ document.getElementById('dgBack').click(); document.getElementById('dgShopBtn').click(); }"); pg.wait_for_function("()=>document.getElementById('dgShopMedals').textContent==='102'", timeout=20000)
    G0 = "()=>G.dgLastBuy=null"; J(pg, G0); pg.click('.dgBuy[data-buy="dg_title"]'); pg.click('#gcOk'); pg.wait_for_function("()=>G.dgLastBuy && G.dgLastBuy.ok", timeout=20000); pg.wait_for_timeout(300)
    ok('shop_buy_title', pg.inner_text('#dgShopMedals') == '42' and '망령 사냥꾼' in pg.inner_text('#dgPanel') and J(pg, "()=>document.querySelector('.dgShopIt[data-id=dg_title]').classList.contains('own')"))
    J(pg, "()=>{ document.getElementById('banner') && document.getElementById('banner').classList.add('hidden'); }"); shot(pg, 'shop_desktop', True)
    # ===== schema.sql 다시 실행 전 (서버 함수 없음): '서버 업데이트 필요' + 연습 원정(임시 영혼석) · 상점 닫힘 =====
    J(pg, "()=>localStorage.setItem('__mockflags', JSON.stringify({noDungeon:true}))")
    J(pg, "()=>{ document.getElementById('dgClose').click(); G.openDungeon(); }"); pg.wait_for_function("()=>(document.getElementById('dgDay')||{}).innerText.includes('서버 업데이트 필요')", timeout=20000)
    ok('missing_update_needed', '연습 원정' in pg.inner_text('#dgDay') and not J(pg, "()=>document.getElementById('dgStart').disabled"), pg.inner_text('#dgDay'))
    pg.click('#dgShopBtn'); pg.wait_for_timeout(600); ok('missing_shop_closed', '서버 업데이트 필요' in pg.inner_text('#dgPanel') and J(pg, "()=>[...document.querySelectorAll('.dgBuy')].every(b=>b.disabled)"))
    J(pg, "()=>document.getElementById('dgBack').click()"); start_run(pg)
    ok('missing_practice_run', J(pg, "()=>G.dgEntryMode") == 'practice' and '연습' in pg.inner_text('#dgTop'))
    s0 = J(pg, "()=>G.gear.Acc.load().souls"); J(pg, "async()=>{ (await import('./src/dungeon/run.js')).dgFinish(true); }"); pg.wait_for_timeout(300)
    R = J(pg, "()=>G.dgResult"); tx = pg.inner_text('#stageClear')
    ok('missing_practice_reward', R['mode'] == 'practice' and R['why'] == 'missing' and R['got'] == 80 and J(pg, "()=>G.gear.Acc.load().souls") == s0 + 80 and '서버 업데이트 필요' in tx and '영혼석' in tx, (R, tx.replace('\n', ' | ')))
    J(pg, "()=>localStorage.removeItem('__mockflags')")
    c.close()
    # ===== 태블릿 가로 1024x600 =====
    c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True, is_mobile=False); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    login(pg, 'dgt@test.kr', owned=True)
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users)[0].id; d.hd3d_owned[u+':hero_fighter']={user_id:u,item:'hero_fighter'}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>document.querySelectorAll('.dgCard[data-cls=\"gunner\"]').length===1", timeout=30000); pg.wait_for_timeout(500)
    fit = J(pg, "()=>{ const r=document.getElementById('dgPanel').getBoundingClientRect(), s=document.getElementById('dgStart').getBoundingClientRect(); return [r.top>=0 && r.bottom<=innerHeight+1, s.bottom<=innerHeight, Math.round(s.height)]; }")
    ok('tablet_entry_fits', fit[0] and fit[1] and fit[2] >= 44, fit)
    # 출전 고르기: 5명 중 기본 앞 4명 · 서윤 탭 → 최대 4명 안내 · 로즈 빼고 서윤 넣기 · 카드 터치 ≥44px
    ON = "()=>[...document.querySelectorAll('.dgCard.pick.on')].map(e=>e.dataset.cls)"
    pg.wait_for_function("()=>document.querySelectorAll('.dgCard.pick').length===5", timeout=30000)
    ok('tablet_pick_default4', J(pg, ON) == ['warrior', 'archer', 'mage', 'gunner'], J(pg, ON))
    pg.tap('.dgCard.pick[data-cls="fighter"]'); pg.wait_for_timeout(200); ok('tablet_pick_max4', J(pg, ON) == ['warrior', 'archer', 'mage', 'gunner'] and '최대' in pg.inner_text('#banner'))
    pg.tap('.dgCard.pick[data-cls="gunner"]'); pg.wait_for_timeout(150); pg.tap('.dgCard.pick[data-cls="fighter"]'); pg.wait_for_timeout(150)
    ok('tablet_pick_swap', J(pg, ON) == ['warrior', 'archer', 'mage', 'fighter'] and '출전 4 / 4' in pg.inner_text('#dgPickN'), J(pg, ON))
    cs = J(pg, "()=>[...document.querySelectorAll('.dgCard.pick')].map(b=>{ const r=b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), r.bottom<=innerHeight+1]; })")
    ok('tablet_pick_touch44', all(w >= 44 and h >= 44 for w, h, _ in cs), cs)
    fit = J(pg, "()=>{ const s=document.getElementById('dgStart').getBoundingClientRect(); return s.bottom<=innerHeight && s.top>=0; }"); ok('tablet_start_visible_after_pick', fit)
    shot(pg, 'entry_tablet', True)
    pg.tap('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes.length===4", timeout=300000); J(pg, "()=>{ G.manual=true; G.pauseRender=true; }"); J(pg, BACKDATE)
    ok('tablet_run_picked_party', J(pg, "()=>G.heroes.map(h=>h.cls)") == ['warrior', 'archer', 'mage', 'fighter'], J(pg, "()=>G.heroes.map(h=>h.cls)"))
    sz = J(pg, SIZES); ok('touch_targets_tablet', all(w >= 44 and h >= 44 for _, w, h in sz), sz)
    ov = J(pg, "()=>{ const a=document.getElementById('dgBar').getBoundingClientRect(), b=document.getElementById('skillBtn').getBoundingClientRect(), c=document.getElementById('cam').getBoundingClientRect(); return [a.right<=b.left, b.right<=c.left, a.bottom<=innerHeight]; }")
    ok('tablet_layout_no_overlap', all(ov), ov)
    pg.tap('#dgBar .dgP[data-i="2"]'); J(pg, "()=>G.sim(.05)"); ok('tablet_portrait_tap', J(pg, "()=>G.hero.cls") == 'mage')
    J(pg, "()=>G.sim(14)"); shot(pg, 'run_tablet', True)
    r = J(pg, SKIP); cards = J(pg, BLESS_OK); ok('tablet_bless_fits', r[1] and cards and len(cards) == 3 and all(c[1] >= 44 and c[2] >= 44 and c[3] for c in cards), cards)
    shot(pg, 'bless_tablet', True); pick_bless(pg, tap=True); ok('tablet_bless_tap', J(pg, "()=>G.dg.floor===1 && !G.dg.blessing"))
    J(pg, "()=>{ G.heroes.forEach(h=>{ h.ult=100; }); G.sim(2); }"); sz = J(pg, SIZES)
    jo = J(pg, "()=>{ const a=document.getElementById('dgJoint').getBoundingClientRect(), b=document.getElementById('dgBar').getBoundingClientRect(), s=document.getElementById('skillBtn').getBoundingClientRect(); return [a.bottom<=b.top, a.right<=s.left, a.top>=0, Math.round(a.width), Math.round(a.height)]; }")
    ok('tablet_joint_layout', all(jo[:3]) and jo[3] >= 44 and jo[4] >= 44, jo); shot(pg, 'joint_tablet', True)
    pg.tap('#dgJoint'); J(pg, "()=>G.sim(.2)"); ok('tablet_joint_tap', J(pg, "()=>G.dg.joints===1"))
    J(pg, "()=>{ G.dgStartFloor(4); const D=G.dg; D.q=[]; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); G.sim(6); }")
    boss_checks(pg, 'tablet')
    J(pg, "async()=>{ (await import('./src/dungeon/run.js')).dgFinish(true); }"); pg.wait_for_function(MEDALS, timeout=30000); pg.wait_for_timeout(300)
    M = J(pg, "()=>G.dgResult.medals"); ok('tablet_result_medals', M['ok'] and M['medals'] == 15 and '던전 메달 +15' in pg.inner_text('#stageClear'), M)
    fit = J(pg, "()=>{ const r=document.querySelector('.dgRes').getBoundingClientRect(), b=document.getElementById('dgTown').getBoundingClientRect(); return [r.top>=0, b.bottom<=innerHeight, Math.round(b.height)]; }"); ok('tablet_result_fits', fit[0] and fit[1] and fit[2] >= 44, fit)
    shot(pg, 'result_tablet', True)
    # 태블릿 던전 상점 (1024x600 안에 · 터치 ≥44px)
    pg.tap('#dgTown'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=300000); pg.wait_for_timeout(500)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>(document.getElementById('dgDay')||{}).innerText.includes('남은 입장 2/3')", timeout=20000)
    pg.tap('#dgShopBtn'); pg.wait_for_function("()=>document.querySelectorAll('.dgShopIt').length===6 && document.getElementById('dgShopMedals').textContent==='15'", timeout=20000)
    fit = J(pg, "()=>{ const r=document.getElementById('dgPanel').getBoundingClientRect(); return [r.top>=0 && r.bottom<=innerHeight+1, ...[...document.querySelectorAll('.dgBuy,#dgBack')].map(b=>{ const q=b.getBoundingClientRect(); return q.bottom<=innerHeight && q.height>=44 && q.width>=44; })]; }")
    ok('tablet_shop_fits', all(fit), fit)
    shot(pg, 'shop_tablet', True)
    c.close()
    # ===== 일반 판: 파티 1명 (기존 동작) =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=240000); J(pg, "()=>G.choose('mage')"); pg.wait_for_function("()=>G.phase==='build'", timeout=60000)
    ok('normal_party_1', J(pg, "()=>G.heroes.length===1 && G.heroes[0]===G.hero && !G.dungeon && G.hero.cls==='mage'"))
    ok('gate_dgtest_only', J(pg, "async()=>{ const m=await import('./src/data/dungeon.js'); return m.DG_LIVE || !m.DG_OPEN; }"))  # 공개 전에는 ?dgtest=1 없이는 꺼짐
    c.close(); b.close()
print('console errors:', errs[:5])
fails = [k for k, v in res.items() if not v]; print(f'{len(res) - len(fails)}/{len(res)} ok', 'FAILED: ' + ', '.join(fails) if fails else 'ALL OK')
sys.exit(1 if fails or errs else 0)
