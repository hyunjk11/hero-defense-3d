#!/usr/bin/env python3
"""✨ 타워 초월 (하드 전용) 브라우저 테스트 — 1440×860 데스크톱만.  python3 tests/awaken.py [--report DIR]  (단독 실행)
docs/TOWER_AWAKEN_2026-10-24.md · 해금 = 연구소 3종 만렙 AND 지금 하드 판에 화살·대포·마법 각 1기 이상 Lv.3+★★★+진화
 1) 하드 1-1 출정(연구소 일부만) → 세 타워 Lv.3·★★★ · 분기 2종 → 🔒 체크리스트(연구소 줄 + 판 안 줄, 종류별 ✔/✖)
 2) 세 번째 진화 → 판 안 조건 OK 여도 연구소 미달이면 잠김 유지 → 테스트 훅으로 연구소 만렙 → 해금 배너·G.awkOpen·✨ 초월 버튼
 3) 종류별 구매(240/320/340G, 내구도·피해 ×1.3, 왕관 장식) · 종류별 최대 2기 · 대포 관통 불길
 4) 효과 계측: 꿰뚫기·일제사격(천궁) · 불바다(화염 포루, 상한 8) · 천뢰+기절(뇌전 첨탑)
 5) 노말 1-1: 같은 조건이어도 체크리스트/초월 없음 · 콘솔 오류 0"""
import sys, os, pathlib, shutil
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/awaken'; os.makedirs(OUT, exist_ok=True)
REP = sys.argv[sys.argv.index('--report') + 1] if '--report' in sys.argv else None
LIVE = sys.argv[sys.argv.index('--live') + 1] if '--live' in sys.argv else None  # 라이브 사이트 스크린샷용 (게스트)
srv, url = (None, LIVE.rstrip('/') + '/') if LIVE else serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:300], flush=True)
J = lambda pg, js: pg.evaluate(js)
VW, VH = 1440, 860
LAB_PART = "{arrow:{atk:10,rng:5,spd:8,start:4},cannon:{atk:9,rng:5,spd:8,start:4},magic:{atk:0,rng:0,spd:0,start:0}}"
SAVE = "{ v:1, hero:'mage', souls:500, st:{'1-1':3,'1-2':3,'1-3':2,'1-4':3,'1-5':3,'1-6':2}, starRw:3, stats:{runs:9,kills:100,waves:60,souls:500}, research:" + LAB_PART + " }"
def boot(b):
    c = b.new_context(viewport={'width': VW, 'height': VH}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    for k in range(2):
        try: pg.goto(url + '?seed=12345&flow=1', timeout=120000); break
        except Exception as e: print('goto retry', e)
    pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(VW // 2, VH // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=60000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.gear.Acc.store(" + SAVE + "); }"); return c, pg
def go_stage(pg, q):
    pg.goto(url + '?seed=12345&rng=777&flow=1&' + q, timeout=180000); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=240000); pg.wait_for_timeout(500); pg.evaluate(HELP)
    J(pg, "()=>{ G.manual=true; G.gold=99999; document.getElementById('branchPop').classList.add('hidden'); }")
def shot(pg, path, clear=True):
    J(pg, "()=>{ G.pauseRender=false; document.getElementById('branchPop').classList.add('hidden'); }")
    if clear: J(pg, "()=>{ const b = document.getElementById('banner'); if (!/초월 해금/.test(b.innerText)) b.style.opacity = 0; }"); pg.wait_for_timeout(700); J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(200); pg.screenshot(path=path, timeout=240000); J(pg, "()=>G.pauseRender=false")
    J(pg, "()=>{ document.getElementById('banner').style.opacity = ''; }")
    if REP: shutil.copy(path, os.path.join(REP, os.path.basename(path)))
# 타워 세우기 + Lv.3 + ★★★ (+ 분기). 반환: 타워 index 목록
SETUP = """(spec)=>{ const XP = G.GROW.XP_NEED[2], out = [];
  for (const [ty, br] of spec) { const used = G.towers.map(t => t.c + ',' + t.r); let p = null; for (let i = 3; i < 30 && !p; i += 2) p = T_.grassNearRoute(i, 2, used); if (!p || !G.build(p[0], p[1], ty)) return 'build fail ' + ty;
    const tw = G.towers[G.towers.length - 1]; G.upgradeTower(tw); G.upgradeTower(tw); G.towerXp(tw, XP - tw.xp + 1); if (br) G.chooseBranch(tw, br); out.push(G.towers.length - 1); }
  document.getElementById('branchPop').classList.add('hidden'); return out; }"""
AWK_UI = """()=>{ const e = document.getElementById('tAwk'), m = {}; e.querySelectorAll('.awkM').forEach(i => m[i.dataset.k] = i.classList.contains('on'));
  return { vis: !e.classList.contains('hidden') && e.offsetHeight > 0, txt: e.innerText, m, up: document.getElementById('tUp').innerText, upDis: document.getElementById('tUp').disabled, name: document.getElementById('tName').innerText,
    inView: (r => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth)(e.getBoundingClientRect()) }; }"""
def frame(pg, idx, r=30):  # 카메라를 타워들 가운데로
    J(pg, f"()=>{{ const T = {idx}.map(i => G.towers[i]).filter(Boolean); let x = 0, z = 0; T.forEach(t => {{ x += t.m.g.position.x; z += t.m.g.position.z; }}); G.cam.target.set(x / T.length, 0, z / T.length); G.cam.r = {r}; G.cam.phi = .9; G.sim(.02); }}")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c, pg = boot(b)
    go_stage(pg, 'stage=1-1&run=1&hard=1')
    ok('hard_run', J(pg, "()=>G.hard===true && !G.awkOpen && G.grow"), J(pg, "()=>[G.hard, G.awkOpen, G.grow]"))
    idx = J(pg, f"()=>({SETUP})([['arrow','multi'],['cannon','blast'],['magic',null]])"); ok('setup3', isinstance(idx, list) and len(idx) == 3, idx)
    J(pg, f"()=>G.select(G.towers[{idx[0]}])"); pg.wait_for_timeout(300); u = J(pg, AWK_UI)
    lab = {k: v for k, v in u['m'].items() if k.startswith('lab')}; st = {k: v for k, v in u['m'].items() if k.startswith('stage')}
    ok('locked_checklist_lab_and_stage', u['vis'] and u['inView'] and '🔒 초월' in u['txt'] and '연구소' in u['txt'] and lab == {'lab-arrow': True, 'lab-cannon': False, 'lab-magic': False} and st == {'stage-arrow': True, 'stage-cannon': True, 'stage-magic': False}, u)
    ok('locked_button_max_level', u['up'].strip() == '최대 레벨' and u['upDis'], u['up'])
    pg.wait_for_timeout(1200); J(pg, "()=>G.sim(2.5)"); frame(pg, idx); shot(pg, f'{OUT}/awaken_locked.png')  # 별·진화 연출이 걷힌 뒤
    # 세 번째 진화: 판 안 조건 OK, 연구소 미달 → 잠김 유지
    J(pg, f"()=>{{ G.chooseBranch(G.towers[{idx[2]}], 'storm'); document.getElementById('branchPop').classList.add('hidden'); G.select(G.towers[{idx[0]}]); }}"); pg.wait_for_timeout(300); u = J(pg, AWK_UI)
    ok('stage_ok_lab_missing_stays_locked', J(pg, "()=>!G.awkOpen") and all(v for k, v in u['m'].items() if k.startswith('stage')) and not u['m']['lab-magic'], u['m'])
    # 테스트 훅: 연구소 만렙 (판 시작 때 저장에서 읽는 G.research 를 바꿈) → 다음 확인 시점에 해금
    J(pg, "()=>G.sim(1.5)")  # 진화 연출이 걷힌 뒤 (스크린샷용)
    J(pg, "()=>{ const M = {atk:10,rng:5,spd:8,start:4}; G.research = {arrow:{...M}, cannon:{...M}, magic:{...M}}; G.checkAwaken(); }"); pg.wait_for_timeout(900)
    bn = J(pg, "()=>document.getElementById('banner').innerText")
    ok('unlock_banner', J(pg, "()=>G.awkOpen===true && G.awkN.open===1") and '초월 해금' in bn, bn)
    J(pg, f"()=>G.select(G.towers[{idx[0]}])"); pg.wait_for_timeout(300); u = J(pg, AWK_UI)
    ok('awaken_button', u['up'].startswith('✨ 초월 (240G)') and not u['upDis'] and '초월 가능' in u['txt'], u)
    J(pg, "()=>G.sim(.45)"); frame(pg, idx); shot(pg, f'{OUT}/awaken_unlock.png')  # 빛기둥 진행 중
    # 구매 (#tUp 클릭)
    COST = {'arrow': 240, 'cannon': 320, 'magic': 340}
    for i, ty in zip(idx, ['arrow', 'cannon', 'magic']):
        J(pg, f"()=>G.select(G.towers[{i}])"); pg.wait_for_timeout(150)
        before = J(pg, f"()=>{{ const t = G.towers[{i}]; return {{ g: G.gold, d: t.S.dmg, mx: t.max, inv: t.invest }}; }}")
        pg.click('#tUp'); pg.wait_for_timeout(250)
        after = J(pg, f"()=>{{ const t = G.towers[{i}]; return {{ g: G.gold, d: t.S.dmg, mx: t.max, inv: t.invest, awk: !!t.awk, deco: !!(t.deco && t.deco.awk), runes: t.deco && t.deco.awk ? t.deco.awk.runes.length : -1, name: document.getElementById('tName').innerText, up: document.getElementById('tUp').innerText }}; }}")
        ok(f'buy_{ty}', after['awk'] and before['g'] - after['g'] == COST[ty] and after['inv'] - before['inv'] == COST[ty] and abs(after['d'] / before['d'] - 1.3) < 1e-6 and after['mx'] == round(before['mx'] * 1.3)
           and after['deco'] and '✨' in after['name'] and '초월 완료' in after['up'], (before, after))
    tc = J(pg, f"()=>[G.towers[{idx[0]}].B.targets, G.towers[{idx[1]}].B.cluster, G.towers[{idx[2]}].S.chain, G.awkN.buy]")
    ok('branch_bonus_targets', tc[0] == 4 and tc[1] >= 2 and tc[3] == 3, tc)
    # 종류별 최대 2기: 화살 2기 더 (두 번째 OK, 세 번째 막힘) · 대포 관통 1기 더
    more = J(pg, f"()=>({SETUP})([['arrow','snipe'],['arrow','multi'],['cannon','pierce']])")
    r = J(pg, f"()=>{{ const [a2, a3, c2] = {more}.map(i => G.towers[i]); const o = [G.awakenTower(a2), G.awakenTower(a3), G.awakenTower(c2)]; G.select(a3); return {{ o, n: G.towers.filter(t => t.type==='arrow' && t.awk).length, txt: document.getElementById('tAwk').innerText, dis: document.getElementById('tUp').disabled }}; }}")
    ok('cap_2_per_type', r['o'] == [True, False, True] and r['n'] == 2 and '최대 2기' in r['txt'] and r['dis'], r)
    # 효과: 타워들 주변에 적을 모아 전투
    J(pg, "()=>{ G.awkN.pierce = G.awkN.volley = G.awkN.pool = G.awkN.poolHit = G.awkN.thunder = G.awkN.stun = G.awkN.line = 0; G.coreHp = G.coreMax = 99999; }")
    SPAWN = """(ids, K = 5)=>{ const T = ids.map(i => G.towers[i]); let n = 0; for (const t of T) for (let k = 0; k < K; k++) { const a = k * 1.26 + t.c, d = 2.5 + (k % 3) * .9;
      const e = T_.enemyAt(k % 2 ? 'golem' : 'grunt', t.m.g.position.x + Math.cos(a) * d, t.m.g.position.z + Math.sin(a) * d); e.hp = e.max = 1e6; n++; } return n; }"""
    allIdx = idx + more
    for rnd in range(6):
        J(pg, f"()=>({SPAWN})({allIdx})"); J(pg, "()=>{ G.phase='wave'; G.sim(2.5); }")
        N = J(pg, "()=>G.awkN")
        if all(N.get(k, 0) > 0 for k in ['pierce', 'volley', 'pool', 'poolHit', 'thunder', 'stun', 'line']): break
    N = J(pg, "()=>({...G.awkN, pools: G.awkPools.length})")
    ok('effect_pierce_volley', N.get('pierce', 0) > 0 and N.get('volley', 0) > 0, N)
    ok('effect_fire_pool', N.get('pool', 0) > 0 and N.get('poolHit', 0) > 0 and N.get('line', 0) > 0 and 0 < N['pools'] <= 8, N)
    ok('effect_thunder', N.get('thunder', 0) > 0 and N.get('stun', 0) > 0, N)
    # 스크린샷: 세 초월 타워가 효과를 내는 순간 (불바다·천뢰·화살)
    J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9, '#fff', false); G.sim(3.5); }")
    J(pg, f"()=>({SPAWN})({idx}, 3)")
    for _ in range(40):
        if J(pg, "()=>{ const n = G.awkN.thunder; G.sim(.25); return G.awkN.thunder > n && G.awkPools.length >= 1; }"): break
    J(pg, f"()=>G.select(G.towers[{idx[2]}])"); frame(pg, idx, 23); shot(pg, f'{OUT}/awaken_towers.png')
    sell = J(pg, f"()=>{{ const t = G.towers[{idx[0]}], g = G.gold; t.hp = t.max; const want = Math.floor(t.invest * .7); G.sellTower(t); return [G.gold - g, want]; }}")
    ok('sell_refund_includes_awaken', sell[0] == sell[1] and sell[1] >= int((60 + 55 + 95 + 240) * .7), sell)
    # 노말 1-1: 같은 연구소·타워여도 없음
    go_stage(pg, 'stage=1-1&run=1')
    J(pg, "()=>{ const M = {atk:10,rng:5,spd:8,start:4}; G.research = {arrow:{...M}, cannon:{...M}, magic:{...M}}; }")
    idn = J(pg, f"()=>({SETUP})([['arrow','multi'],['cannon','blast'],['magic','storm']])")
    J(pg, f"()=>{{ G.checkAwaken(); G.select(G.towers[{idn[0]}]); }}"); pg.wait_for_timeout(300); u = J(pg, AWK_UI)
    tried = J(pg, f"()=>G.awakenTower(G.towers[{idn[0]}])")  # 훅으로 직접 시도해도 거절
    ok('normal_no_awaken', J(pg, f"()=>G.hard===false && !G.awkOpen && !G.towers.some(t=>t.awk)") and tried is False and not u['vis'] and u['up'].strip() == '최대 레벨' and u['upDis'], (u, tried))
    c.close(); b.close()
ok('no_console_errors', not errs, errs[:5])
fails = [k for k, v in res.items() if not v]; print(f'\n{len(res) - len(fails)}/{len(res)} OK' + (f' FAIL: {fails}' if fails else '')); sys.exit(1 if fails else 0)
