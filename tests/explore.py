#!/usr/bin/env python3
"""탐색형 버그 찾기 (Playwright): 인트로→로그인→마을→모든 창→챕터 1~4 스테이지→도전 모드→마을, 영웅·전직 분기별, 1024×600 / 1366×768.
콘솔 error/warning · pageerror · 실패한 요청 · HTTP 4xx/5xx · NaN · 일시정지 유지 · 예외를 모아 보고합니다 (하나라도 있으면 exit 1).
  python3 tests/explore.py base   # 기본 4영웅 × 챕터 1~4 (+도전)
  python3 tests/explore.py adv    # 8개 전직 분기
  python3 tests/explore.py smoke  # 궁수 1-1 + 도전만 (빠름)
결과: tests/logs/explore_<plan>.json"""
import sys, os, pathlib, json, time, traceback
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, REPO + '/tests'); os.chdir(REPO)
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(REPO) / 'tests/sbmock.js').read_text(encoding='utf-8')
srv, url = serve()
LOG = []; CUR = ['']
def note(kind, msg):
    m = f'[{CUR[0]}] {kind}: {msg}'; LOG.append(m); print(m, flush=True)
def J(pg, js, a=None):
    for k in range(6):
        try: return pg.evaluate(js, a) if a is not None else pg.evaluate(js)
        except Exception as e:
            if 'is not defined' in str(e) or 'Execution context was destroyed' in str(e) or 'navigation' in str(e):
                pg.wait_for_timeout(1500)
                try: pg.wait_for_function('()=>window.G&&G.ready', timeout=120000)
                except Exception: pass
                continue
            raise
    raise RuntimeError('J retries exhausted: ' + js[:80])
def hook(pg):
    pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: m.type in ('error', 'warning') and note('console.' + m.type, m.text[:300]))
    pg.on('pageerror', lambda x: note('pageerror', str(x)[:500]))
    pg.on('requestfailed', lambda r: ('ERR_ABORTED' in str(r.failure) and '/audio/' in r.url) or note('reqfail', r.url + ' ' + str(r.failure)))
    pg.on('response', lambda r: r.status >= 400 and note('http%d' % r.status, r.url))
def wait(pg, js, t=120000):
    try: pg.wait_for_function(js, timeout=t); return True
    except Exception as e: note('timeout', js[:120]); return False
NU = [0]
def start(b, vw, vh, gunner=False):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=vw < 1100); c.add_init_script(MOCK); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&rng=777&flow=1'); wait(pg, '()=>window.G&&G.ready&&G.screen')
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(500)
    if gunner:
        NU[0] += 1; pg.fill('#lgEmail', f'ex{NU[0]}{int(time.time())}@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); wait(pg, "()=>G.screen==='menu'", 15000)
        J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users).slice(-1)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    else:
        pg.click('#lgGuest'); pg.wait_for_timeout(400)
    return c, pg
SETUP = """([hero, br]) => { const {Acc, E}=G.gear; Acc.update(d=>{ d.souls=99999; d.hero=hero; d.stats={runs:3,kills:100,waves:20,souls:100};
  for (const id of Object.keys(G.stageSel.ST.STAGES)) d.st[id]=3; d.mat.crystal=200; d.mat.essence=20; d.mat.steel=(d.mat.steel||0)+500;
  d.adv = br ? {[hero]:{b:br,n:1}} : {}; d.heroLv[hero]={hp:6,atk:6}; d.hq={[hero]:{boss:2}};
  let q=11; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; E.addChests(d, Array.from({length:6}, (_,i)=>({ it: i===5 ? E.makeUnique('f_bow') : E.makeItem(E.SLOT_KEYS[i%3], hero, i%5, r, 1+i%4), src: i%2?'boss':'chest' }))); return d; }); return Acc.load().chests.length; }"""
def town_windows(pg, tag):
    CUR[0] = tag + '/town'
    J(pg, "()=>{ G.openBlessing(); }"); pg.wait_for_timeout(500); J(pg, "()=>G.blessTab('adv')"); pg.wait_for_timeout(500)
    J(pg, "()=>{ const c=document.querySelector('#twAdv .advCard'); c&&c.click(); }"); pg.wait_for_timeout(300)
    J(pg, "()=>{ const b=[...document.querySelectorAll('#twAdv .advBtn')].find(b=>!b.disabled); b&&b.click(); }"); pg.wait_for_timeout(300)
    J(pg, "()=>{ const n=document.getElementById('acNo'); n&&n.click(); }"); J(pg, "()=>G.blessTab('perm')"); pg.wait_for_timeout(300); J(pg, "()=>G.closeBlessing()")
    J(pg, "()=>G.gear.openSmith()"); pg.wait_for_timeout(500)
    J(pg, "()=>{ for (const b of document.querySelectorAll('#smithPanel .ftab')) { b.click(); } }"); pg.wait_for_timeout(300); J(pg, "()=>G.gear.closeSmith()")
    J(pg, "()=>G.openLab()"); pg.wait_for_timeout(500); J(pg, "()=>{ for (const b of document.querySelectorAll('#labPanel .ftab')) b.click(); }"); pg.wait_for_timeout(200); J(pg, "()=>G.closeLab()")
    pg.click('#twBag'); pg.wait_for_timeout(500)
    J(pg, "()=>{ const t=document.querySelector('#invTabs [data-v=codex]'); t&&t.click(); }"); pg.wait_for_timeout(500)
    J(pg, "()=>{ for (const b of document.querySelectorAll('#codexBody .cxTabs .ftab')) { b.click(); } }"); pg.wait_for_timeout(300)
    J(pg, "()=>{ const t=document.querySelector('#invTabs [data-v=bag]'); t&&t.click(); }"); pg.wait_for_timeout(300)
    J(pg, "()=>G.gear.closeSmith(true)"); pg.click('#twMail'); pg.wait_for_timeout(600); J(pg, "()=>G.shop.closeMail()")
    J(pg, "()=>G.shop.openShop()"); pg.wait_for_timeout(800); J(pg, "()=>G.shop.closeShop()")
    if J(pg, "()=>G.gear.chestCount()") > 0:
        pg.click('#twChest'); pg.wait_for_timeout(800)
        J(pg, "()=>{ const b=[...document.querySelectorAll('button')].find(b=>/모두 열기/.test(b.textContent) && b.offsetParent); b&&b.click(); }")
        wait(pg, "()=>G.gear.chestCount()===0", 60000); pg.wait_for_timeout(1500)
        for _ in range(30):
            if J(pg, "()=>document.getElementById('chestOv').classList.contains('hidden')"): break
            J(pg, "()=>{ const ov=document.getElementById('chestOv'); const b=document.getElementById('cbOk')&&document.getElementById('cbOk').offsetParent?document.getElementById('cbOk'):[...ov.querySelectorAll('button')].find(b=>b.offsetParent); if(b) b.click(); else ov.click(); }"); pg.wait_for_timeout(500)
    pg.click('#twMenu'); pg.wait_for_timeout(500); pg.click('#mnSet'); pg.wait_for_timeout(300); J(pg, "()=>{ const e=document.getElementById('stBgMute'); e.click(); e.click(); }"); pg.click('#mnSet')
    pg.click('#mnCont'); wait(pg, "()=>G.screen==='town'", 30000); pg.wait_for_timeout(500)
def play_run(pg, tag, waves=3):
    CUR[0] = tag
    J(pg, HELP); J(pg, "()=>{ G.gold=99999; }")
    J(pg, """()=>{ let n=0; const used=[]; for (const tool of ['arrow','cannon','magic','arrow','cannon','magic']) { const p=T_.grassNearRoute(4+n*3, 2, used); if(!p) continue; used.push(p[0]+','+p[1]); if (G.build(p[0],p[1],tool)) n++; } return n; }""")
    J(pg, "()=>G.setSpeed(2)")
    for w in range(waves):
        if J(pg, "()=>G.phase") != 'build': break
        J(pg, "()=>G.startWave()"); pg.wait_for_timeout(1500)
        J(pg, "()=>{ G.castSkill(); }"); pg.wait_for_timeout(1000)
        J(pg, "()=>G.setPaused(true)"); pg.wait_for_timeout(600); p = J(pg, "()=>[G.paused, G.t]"); pg.wait_for_timeout(600); p2 = J(pg, "()=>G.t")
        if p[0] is not True or abs(p2 - p[1]) > 1e-9: note('BUG?', f'pause did not hold: {p} {p2}')
        J(pg, "()=>G.setPaused(false)")
        for k in range(40):
            ph = J(pg, "()=>G.phase")
            if ph != 'wave': break
            J(pg, "()=>{ G.sim(3); if (G.hero && G.hero.skillCd<=0) G.castSkill(); }")
        bad = J(pg, "()=>{ const b=[]; for (const e of G.enemies) if(!isFinite(e.g.position.x)||!isFinite(e.hp)) b.push(e.type); if(G.hero&&!isFinite(G.hero.g.position.x)) b.push('hero'); return b; }")
        if bad: note('NaN', str(bad))
    st = J(pg, "()=>({phase:G.phase, wave:G.wave, speed:G.speed, core:G.coreHp, en:G.enemies.length, info:G.renderer.info.memory})")
    note('info', json.dumps(st))
HIT = """()=>{ const b=document.getElementById('retreat'); b.scrollIntoView({block:'nearest'}); const r=b.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
  return document.elementsFromPoint(x,y).slice(0,4).map(n=>n.tagName+'#'+n.id+'.'+String(n.className).slice(0,40)); }"""
def click_retreat(pg):
    # 타워 ★★★ 진화 팝업(#branchPop, 전체 화면 모달 · 게임은 계속)이 떠 있으면 사용자처럼 '나중에'로 닫음 — 의도된 동작
    # 여러 타워가 동시에 ★★★ 이 되면 팝업이 줄지어(queue, 250ms 간격) 다시 뜨므로 안 뜰 때까지 반복
    for _ in range(12):
        if not J(pg, "()=>{ const p=document.getElementById('branchPop'); if (p.classList.contains('hidden')) return false; document.getElementById('bpLater').click(); return true; }"): break
        pg.wait_for_timeout(1200)
    pg.wait_for_timeout(300)
    try: pg.click('#retreat', timeout=8000)
    except Exception as e:
        note('BUG?', 'retreat not clickable; at point: ' + json.dumps(J(pg, HIT), ensure_ascii=False) + ' ' + str(e).split('\n')[-1][:200])
        J(pg, "()=>document.getElementById('retreat').click()")
    pg.wait_for_timeout(300); J(pg, "()=>{ const p=document.getElementById('gConfirm'); if (p && !p.classList.contains('hidden')) document.getElementById('gcOk').click(); }")  # Q-1 게임 확인창
    pg.wait_for_timeout(3000)
def retreat_to_town(pg):
    ph = J(pg, "()=>G.phase")
    if ph == 'build': click_retreat(pg)
    elif ph == 'wave':
        J(pg, "()=>{ for (const e of G.enemies) if(!e.dead) G.hurt(e,1e9,'#fff'); G.spawnQ.length=0; G.sim(3); }")
        if J(pg, "()=>G.phase") == 'build': click_retreat(pg)
    if J(pg, "()=>G.screen==='town' || G.phase") is True or J(pg, "()=>G.phase") != 'over':
        wait(pg, "()=>window.G&&G.ready&&G.screen==='town'", 120000); pg.wait_for_timeout(800); return
    # close result popups (chest reveal) then town
    for _ in range(20):
        if J(pg, "()=>document.getElementById('chestOv').classList.contains('hidden')"): break
        J(pg, "()=>{ const ov=document.getElementById('chestOv'); const b=document.getElementById('cbOk')&&document.getElementById('cbOk').offsetParent?document.getElementById('cbOk'):[...ov.querySelectorAll('button')].find(b=>b.offsetParent); if(b) b.click(); else ov.click(); }"); pg.wait_for_timeout(400)
    J(pg, "()=>document.getElementById('overTown').click()"); wait(pg, "()=>window.G&&G.ready&&G.screen==='town'", 120000); pg.wait_for_timeout(800)
def stage(pg, tag, sid, waves=3):
    CUR[0] = tag + '/' + sid
    J(pg, "(id)=>G.stageSel.departStage(id)", sid); pg.wait_for_timeout(4000)
    if not wait(pg, "()=>window.G&&G.ready&&G.phase==='build'&&G.hero", 180000): return
    play_run(pg, tag + '/' + sid, waves); retreat_to_town(pg)
def challenge(pg, tag):
    CUR[0] = tag + '/chal'
    pg.click('#twGo'); pg.wait_for_timeout(500); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()")
    if not wait(pg, "()=>G.phase==='build'&&G.hero", 120000): return
    play_run(pg, tag + '/chal', 3); retreat_to_town(pg)
def session(b, vw, vh, hero, br, stages, chal=True):
    tag = f'{vw}x{vh}/{hero}' + (f'+{br}' if br else ''); CUR[0] = tag
    c, pg = start(b, vw, vh, gunner=hero == 'gunner')
    try:
        J(pg, SETUP, [hero, br]); pg.click('#mnCont'); wait(pg, "()=>G.screen==='town'" + (" && G.shop.Sh.heroOwned('gunner')" if hero == 'gunner' else ''), 60000); pg.wait_for_timeout(800)
        h = J(pg, "()=>G.townHero()"); 
        if not h or h['cls'] != hero: note('BUG?', f'town hero {h} != {hero}')
        town_windows(pg, tag)
        for sid in stages: stage(pg, tag, sid)
        if chal: challenge(pg, tag)
        CUR[0] = tag; note('done', J(pg, "()=>({screen:G.screen, adv:G.adv&&G.adv.k})") )
    except Exception as e: note('EXC', repr(e)[:400] + ' @ ' + ' / '.join(f'{f.name}:{f.lineno}' for f in traceback.extract_tb(e.__traceback__)[-3:]))
    c.close()
PLAN = sys.argv[1] if len(sys.argv) > 1 else 'base'
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    if PLAN == 'base':
        session(b, 1024, 600, 'archer', None, ['1-1', '2-1', '3-1', '4-1'])
        session(b, 1366, 768, 'mage', None, ['1-2', '2-2', '3-2', '4-2'])
        session(b, 1024, 600, 'warrior', None, ['1-3', '2-3', '3-3', '4-3'], chal=False)
        session(b, 1366, 768, 'gunner', None, ['1-4', '2-4', '3-4', '4-4'])
    elif PLAN == 'adv':
        i = 0
        for hero, brs in [('archer', ['wind', 'hawk']), ('mage', ['flame', 'frost']), ('warrior', ['paladin', 'berserk']), ('gunner', ['duel', 'thorn'])]:
            for br in brs:
                vw, vh = (1024, 600) if i % 2 == 0 else (1366, 768); session(b, vw, vh, hero, br, [f'{1 + i % 4}-{1 + (i // 4) % 4}'], chal=(i % 3 == 0)); i += 1
    elif PLAN == 'one':  # python3 tests/explore.py one <hero> <branch|-> <w>x<h> <stage>
        hero, br, wh, sid = sys.argv[2:6]; vw, vh = map(int, wh.split('x')); session(b, vw, vh, hero, None if br == '-' else br, [sid], chal=False)
    else:
        session(b, 1024, 600, 'archer', None, ['1-1'], chal=True)
    b.close()
print('\n===== SUMMARY =====')
bad = [m for m in LOG if ' info:' not in m and ' done:' not in m]
for m in bad: print(m)
os.makedirs('tests/logs', exist_ok=True); json.dump(LOG, open(f'tests/logs/explore_{PLAN}.json', 'w'), ensure_ascii=False, indent=0)
if not bad: print('OK   explore', PLAN, 'clean')
else: print(f'FAIL explore {PLAN}: {len(bad)} issue(s)'); sys.exit(1)
