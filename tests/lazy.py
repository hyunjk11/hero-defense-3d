#!/usr/bin/env python3
"""지연 로딩(P-2) 테스트 + 첫 로딩 용량 측정.  python3 tests/lazy.py [--measure-only]
 - 첫 방문(인트로) / 스테이지 출정(마법사·버들) / 마을(총사 저장): G.ready 까지 받은 바이트·모델 목록
 - 인트로·마을: 백그라운드로 나머지 모델이 모두 도착(G.allModels) · 영웅 단상에 5명 · 상점 미리보기(미보유 유료 영웅) 모델 표시
 - 스테이지 출정: 필요한 모델만(다른 영웅 없음, 버들이면 장비·변신 로봇 포함) · 바로 판 시작
 - 마을에서 아직 안 받은 영웅으로 바꾸면 도착 후 교체 · 콘솔 오류 0. 결과 shots/improve/p3_firstload.json"""
import sys, os, json, pathlib, re
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
import subprocess
HIDE = subprocess.run(['node', '-e', "import('./src/data/heroes.js').then(m => process.exit(m.isHidden('mechanic') ? 0 : 1))"], cwd=os.path.join(os.path.dirname(__file__), '..')).returncode == 0  # 버들 숨김 중
HIDDEN_MODELS = ['budeul_meshy', 'budeul_gear', 'mech_robot_meshy'] if HIDE else []
LAZY_ONLY = ['rose_rifle_meshy', 'rose_rifle_gun']  # 로즈 2차 전직(장미 저격수) 전용 — 백그라운드가 아니라 전직 장착 시에만 받음 (3deef3e)
_root = pathlib.Path(__file__).parent.parent
N_ALL = len(re.findall(r"'([\w]+)'", re.search(r'const ALL_ASSETS = \[(.*?)\];', (_root / 'src/render/characters.js').read_text(encoding='utf-8')).group(1)))  # 전체 모델 수 (영웅 추가 시 자동 — 진서윤으로 15→16)
N_VIS = int(subprocess.run(['node', '-e', "import('./src/data/heroes.js').then(m => console.log(m.VISIBLE_HEROES.length))"], cwd=_root, capture_output=True, text=True).stdout)  # 마을 카드 수 = 보이는 영웅 (진서윤으로 4→5)
NA = lambda pg: J(pg, "()=>import('./src/render/characters.js').then(m => m.ASSETS.length)")
MEASURE = '--measure-only' in sys.argv; OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res, M = [], {}, {}
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
def run(pw, name, q, save=None):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 760}); c.add_init_script(MOCK)
    if save: c.add_init_script(f"if (!sessionStorage.getItem('__seeded')) {{ sessionStorage.setItem('__seeded', '1'); localStorage.setItem('hd3d_save', JSON.stringify({json.dumps(save)})); localStorage.setItem('hd3d_mode', 'guest'); }}")
    pg = c.new_page(); got, ready = [], {'v': False}
    pg.on('pageerror', lambda x: errs.append(name + ' PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(name + ' ' + m.text[:200]))
    def fin(r):
        try: sz = r.sizes()['responseBodySize']
        except Exception: sz = 0
        got.append((ready['v'], r.url.split('?')[0].replace(url, ''), sz))
    pg.on('requestfinished', fin)
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); ready['v'] = True
    first = [g for g in got if not g[0]]; mods = sorted(u.split('/')[-1][:-4] for _, u, _ in first if u.startswith('models/'))
    M[name] = {'first_MB': round(sum(s for _, _, s in first) / 1e6, 2), 'models_MB': round(sum(s for _, u, s in first if u.startswith('models/')) / 1e6, 2), 'models': mods, 'requests': len(first)}
    print(name, json.dumps(M[name], ensure_ascii=False), flush=True); return b, pg, got, M[name]
with sync_playwright() as pw:
    b, pg, got, m = run(pw, 'intro_first_visit', '?seed=12345&flow=1')
    if not MEASURE:
        ok('intro_only_hero_first', m['models'] == ['mage_meshy'], m['models'])
        pg.wait_for_function('()=>G.allModels', timeout=240000); ok('intro_bg_all_models', J(pg, '()=>Object.keys(G.GL).length') == NA(pg) - len(LAZY_ONLY) == N_ALL - len(LAZY_ONLY) - len(HIDDEN_MODELS), J(pg, '()=>Object.keys(G.GL).sort()'))
        ok('podium_all_heroes', J(pg, "()=>{ let n = 0; G.scene.traverse(o => { if (o.isSkinnedMesh && !o.userData.ol) n++; }); return n; }") >= 5 - (1 if HIDE else 0))
        ok('no_hidden_models_requested', not any(u.split('/')[-1][:-4] in HIDDEN_MODELS for _, u, _ in got if u.startswith('models/')))
    b.close()
    b, pg, got, m = run(pw, 'stage_run_mage', '?seed=12345&stage=1-1&run=1')
    if not MEASURE:
        pg.wait_for_function("()=>G.phase==='build'", timeout=60000)
        ok('stage_only_needed', 'mage_meshy' in m['models'] and not any(k in m['models'] for k in ['archer_meshy', 'warrior_meshy', 'gunner_meshy', 'budeul_meshy', 'mech_robot_meshy']) and 'sk_minion' in m['models'], m['models'])
        pg.wait_for_timeout(1500); ok('stage_no_bg_loading', not any(u.startswith('models/') for r, u, _ in got if r), [u for r, u, _ in got if r and u.startswith('models/')])
        ok('stage_hero_mage', J(pg, '()=>G.hero.cls') == 'mage')
    b.close()
    b, pg, got, m = run(pw, 'stage_run_mechanic', '?seed=12345&stage=1-1&run=1&budeul=1', save={'hero': 'mechanic'})
    if not MEASURE and not HIDE: ok('stage_mechanic_models', all(k in m['models'] for k in ['budeul_meshy', 'budeul_gear', 'mech_robot_meshy', 'mage_meshy']), m['models'])
    if not MEASURE and HIDE:  # 숨김: 버들 저장 → 실바(궁수)로 이전·저장, 버들 모델은 받지 않음
        pg.wait_for_function("()=>G.phase==='build'", timeout=60000)
        ok('hidden_saved_hero_migrated', J(pg, "()=>[G.hero.cls, JSON.parse(localStorage.getItem('hd3d_save')).hero]") == ['archer', 'archer'], J(pg, "()=>G.hero.cls"))
        ok('hidden_models_not_loaded', not any(u.split('/')[-1][:-4] in HIDDEN_MODELS for _, u, _ in got if u.startswith('models/')), m['models'])
    b.close()
    b, pg, got, m = run(pw, 'town_gunner_saved', '?seed=12345&flow=1&town=1', save={'hero': 'gunner'})
    if not MEASURE:
        ok('town_first_gunner_and_fallback', m['models'] == ['gunner_meshy', 'mage_meshy'], m['models'])
        pg.wait_for_function("()=>G.screen==='town'", timeout=60000); ok('town_hero_shown', J(pg, '()=>!!G.townHero()'))
        ok('town_hero_mage_fallback', J(pg, '()=>G.townHero().cls') == 'mage')  # 게스트 = 총사 미보유 → 마법사
        # 아직 안 받았을 수 있는 무료 영웅으로 교체 → 모델 도착 후 교체
        pg.click('.hcard[data-h="warrior"]'); pg.wait_for_function("()=>G.townHero() && G.townHero().cls==='warrior'", timeout=120000); ok('town_switch_lazy_hero', True)
        PAIDK = 'hero_gunner' if HIDE else 'hero_mechanic'
        J(pg, f"()=>G.shop.openShop('{PAIDK}')"); pg.wait_for_function(f"()=>G.shop.pvKey()==='{PAIDK}'", timeout=120000); ok('shop_preview_paid_hero', True)
        if HIDE:
            ok('hidden_not_in_shop', J(pg, "()=>{ G.shop.openShop('hero_mechanic'); const t = document.getElementById('shopPanel').innerText; return !t.includes('버들') && !t.includes('메카닉'); }"))
            ok('hidden_not_in_town_cards', J(pg, "()=>!document.querySelector('#twHeroes .hcard[data-h=\"mechanic\"]') && document.querySelectorAll('#twHeroes .hcard').length === " + str(N_VIS)), N_VIS)
        pg.wait_for_function('()=>G.allModels', timeout=240000); ok('town_bg_all_models', J(pg, '()=>Object.keys(G.GL).length') == NA(pg) - len(LAZY_ONLY), J(pg, '()=>Object.keys(G.GL).sort()'))
        ok('town_no_hidden_models', not any(u.split('/')[-1][:-4] in HIDDEN_MODELS for _, u, _ in got if u.startswith('models/')))
    b.close()
    if HIDE and not MEASURE:  # 숨김: 영웅 선택 화면에 버들 카드 없음, choose('mechanic') → 기본 영웅
        b, pg, got, m = run(pw, 'select_hidden', '?seed=12345&test=1')
        ok('hidden_not_selectable', J(pg, "()=>{ const c = document.querySelector('.card[data-cls=\"mechanic\"]'); const vis = c && getComputedStyle(c).display !== 'none'; G.choose('mechanic'); return [!!vis, G.hero.cls]; }") == [False, 'archer'])
        ok('select_no_hidden_models', not any(u.split('/')[-1][:-4] in HIDDEN_MODELS for _, u, _ in got if u.startswith('models/')))
        b.close()
    if not MEASURE and not HIDE:  # 변신 로봇 모델이 없을 때 변신(Q)은 쿨다운 소모 없이 막히고, 모델이 오면 정상 변신
        b, pg, got, m = run(pw, 'robot_guard', '?seed=12345&test=1')
        r = J(pg, """async () => { G.choose('mechanic'); const R = G.GL.mech_robot_meshy; delete G.GL.mech_robot_meshy; const H = await import('./src/heroes/hero.js'); H.spawnHero('mechanic');
          const h = G.hero, tf0 = G.mechN.tf; G.castSkill(); const blocked = [G.mechN.tf - tf0, h.skillCd, h.robot === null, document.getElementById('banner').textContent];
          G.GL.mech_robot_meshy = R; G.castSkill(); G.sim(3); return { blocked, after: [G.mechN.tf - tf0, !!h.robot, h.skillCd > 0, h.ch === h.robot] }; }""")
        ok('robot_missing_blocks_transform', r['blocked'][0] == 0 and r['blocked'][1] == 0 and r['blocked'][2] and '준비' in r['blocked'][3], r)
        ok('robot_arrives_transform_ok', r['after'] == [1, True, True, True], r)
        b.close()
M.pop('robot_guard', None); M.pop('select_hidden', None)
json.dump(M, open(f'{OUT}/p3_firstload{"_" + sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else ""}.json', 'w'), indent=1, ensure_ascii=False)
if MEASURE: print('errors', errs[:5]); sys.exit(0)
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
