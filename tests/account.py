#!/usr/bin/env python3
"""계정/클라우드 저장/화면 흐름 테스트 (가짜 Supabase 클라이언트 tests/sbmock.js — 네트워크·메일 없음).  python3 tests/account.py"""
import sys, os, json, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''):
    res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
def boot(c, q='?seed=12345&flow=1'):
    pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); return pg
J = lambda pg, js: pg.evaluate(js)
save = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('hd3d_save')||'{}')")
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb')||'{}')")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # 1) 게스트 진행 → 첫 회원가입 시 병합 → 출정/패배 보상 저장 → 로그아웃 시 게스트 복원 → 재로그인 자동
    c = b.new_context(viewport={'width': 1280, 'height': 760}); c.add_init_script(MOCK); pg = boot(c)
    ok('intro_shown', J(pg, '()=>G.screen') == 'intro'); pg.mouse.click(600, 400); pg.wait_for_timeout(400); ok('login_shown', J(pg, '()=>G.screen') == 'login')
    pg.click('#lgGuest'); pg.wait_for_timeout(300); ok('guest_menu', J(pg, '()=>G.screen') == 'menu' and '게스트' in pg.inner_text('#mnAcct'))
    J(pg, "()=>{ const s=JSON.parse(localStorage.getItem('hd3d_save')||'{}'); localStorage.setItem('hd3d_save', JSON.stringify({...s, souls: 120, bestWave: 4, stats:{runs:2,kills:10,waves:6,souls:120}})); }")
    pg.click('#mnAuth'); pg.wait_for_timeout(300); pg.fill('#lgEmail', 'a@test.kr'); pg.fill('#lgPw', '123'); pg.click('#lgUp'); pg.wait_for_timeout(300)
    ok('short_pw_msg', '6자' in pg.inner_text('#lgMsg'))
    pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=10000); pg.wait_for_timeout(800)
    d = db(pg); rows = list(d.get('hd3d_progress', {}).values())
    ok('merged_to_cloud', rows and rows[0]['data']['souls'] == 120 and rows[0]['data']['bestWave'] == 4, rows[0]['data']['souls'] if rows else None)
    ok('profile_row', len(d.get('hd3d_profiles', {})) == 1)
    pg.click('#mnCont'); pg.wait_for_timeout(500); ok('town', J(pg, '()=>G.screen') == 'town' and pg.inner_text('#twSouls') == '120')
    ok('perm_not_in_left_panel', J(pg, "()=>!document.querySelector('.twLeft #twPerm') && document.getElementById('twBless').classList.contains('hidden')"))
    pg.click('.hcard[data-h="warrior"]'); pg.wait_for_timeout(200)
    J(pg, "()=>{ const [x,z]=G.townTower(); G.townTeleport(x-8, z); G.townGoal(x-2.45, z); }")
    pg.wait_for_function("()=>!document.getElementById('twBless').classList.contains('hidden')", timeout=90000)
    ok('bless_opens_at_tower', '여신의 축복' in pg.inner_text('#twBless') and '전사' in pg.inner_text('#blessHero'))
    pg.click('.perm[data-k="hp"]'); pg.wait_for_timeout(200); s = save(pg)
    ok('hero_and_perm', s['hero'] == 'warrior' and s['heroLv']['warrior']['hp'] == 1 and s['souls'] == 90, (s['hero'], s['souls']))
    pg.click('#blessClose'); pg.wait_for_timeout(100); ok('bless_close', J(pg, "()=>document.getElementById('twBless').classList.contains('hidden')"))
    J(pg, "()=>{ G.townTeleport(0, 4); }"); pg.wait_for_timeout(200); J(pg, "()=>G.openBlessing()"); pg.wait_for_timeout(100); ok('bless_reopen_click', not J(pg, "()=>document.getElementById('twBless').classList.contains('hidden')")); J(pg, "()=>G.closeBlessing()")
    J(pg, '()=>G.depart ? 0 : 0'); pg.click('#twGo'); pg.click('.chtab[data-c="0"]'); pg.click('#stChalGo'); pg.wait_for_function("()=>G.phase==='build'", timeout=10000)
    ok('defense_started_with_perm', J(pg, '()=>[G.hero.cls, G.hero.max]') == ['warrior', 1060])
    J(pg, "()=>{ G.wave = 6; G.stats.kills = {grunt: 30}; G.coreHp = 0; }"); J(pg, "()=>import('./src/core/waves.js').then(m=>m.gameOver())"); pg.wait_for_timeout(1500)
    s = save(pg); ok('reward_saved', s['souls'] == 90 + 6 * 8 + 10 and s['bestWave'] == 6 and s['stats']['runs'] == 3, s['souls'])
    d = db(pg); ok('reward_in_cloud', list(d['hd3d_progress'].values())[0]['data']['souls'] == s['souls'])
    ok('over_town_btn', J(pg, "()=>!document.getElementById('overTown').classList.contains('hidden')"))
    pg.click('#overTown'); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=60000); pg.wait_for_timeout(800)
    pg.wait_for_function("()=>!document.getElementById('chestOv').classList.contains('hidden')", timeout=90000); ok('chest_reveal_wave6', True)
    for _ in range(8):
        if J(pg, "()=>document.getElementById('chestOv').classList.contains('hidden')"): break
        pg.wait_for_timeout(1500); pg.click('.cvStage', force=True)
    pg.wait_for_function("()=>!document.getElementById('townPop').classList.contains('hidden')", timeout=20000); s5 = J(pg, "()=>G.gear.Acc.load()"); ok('returned_to_town_autologin', pg.inner_text('#twSouls') == str(s5['souls']) and s5['souls'] >= s['souls'] and not s5['chests'], (pg.inner_text('#twSouls'), s['souls'], s5['souls']))  # 상자 개봉 영혼석 포함
    pg.click('#popOk'); pg.click('#twMenu'); pg.wait_for_timeout(300); pg.click('#mnAuth'); pg.wait_for_timeout(500)
    s = save(pg); ok('logout_restores_guest', s['souls'] == 120 and J(pg, '()=>G.screen') == 'login', s['souls'])
    pg.fill('#lgEmail', 'a@test.kr'); pg.fill('#lgPw', 'wrongpw1'); pg.click('#lgIn'); pg.wait_for_timeout(500); ok('wrong_pw_msg', '맞지 않' in pg.inner_text('#lgMsg'))
    pg.fill('#lgPw', 'secret12'); pg.click('#lgIn'); pg.wait_for_function("()=>G.screen==='menu'", timeout=10000); pg.wait_for_timeout(500)
    ok('relogin_cloud_wins', save(pg)['souls'] == s5['souls'], (save(pg)['souls'], s5['souls']))  # 상자 개봉 결과(중복 → 영혼석)가 무작위라 고정값 148 대신 귀환 후 저장값과 비교
    pg.close(); pg = boot(c); pg.mouse.click(600, 400); pg.wait_for_function("()=>G.screen==='menu'", timeout=10000); ok('auto_login', 'a@test.kr' in pg.inner_text('#mnAcct'))
    # 오프라인 → dirty 유지 → 복구 시 재시도
    J(pg, "()=>localStorage.setItem('__mockflags', JSON.stringify({offline:true}))"); pg.click('#mnCont'); pg.wait_for_timeout(300); pg.click('.hcard[data-h="archer"]'); pg.wait_for_timeout(3600)
    ok('offline_dirty', J(pg, "()=>localStorage.getItem('hd3d_dirty')") == '1' and '오프라인' in pg.inner_text('#twAcct'), pg.inner_text('#twAcct'))
    J(pg, "()=>localStorage.setItem('__mockflags', '{}')"); pg.wait_for_timeout(3800)
    ok('retry_synced', J(pg, "()=>localStorage.getItem('hd3d_dirty')") is None and list(db(pg)['hd3d_progress'].values())[0]['data']['hero'] == 'archer')
    c.close()
    # 2) 테이블 없음 → '서버 준비 중' + 로컬 저장
    c = b.new_context(); c.add_init_script(MOCK); c.add_init_script("localStorage.setItem('__mockflags', JSON.stringify({noTables:true}))"); pg = boot(c)
    pg.mouse.click(600, 400); pg.fill('#lgEmail', 'b@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=10000); pg.wait_for_timeout(500)
    ok('no_tables_msg', '서버 준비 중' in pg.inner_text('#mnAcct'), pg.inner_text('#mnAcct'))
    pg.click('#mnNew'); pg.wait_for_timeout(300); pg.click('.hcard[data-h="archer"]'); ok('no_tables_local_save', save(pg)['hero'] == 'archer'); c.close()
    # 3) 이메일 인증이 켜진 경우: 세션 없음 → 안내
    c = b.new_context(); c.add_init_script(MOCK); c.add_init_script("localStorage.setItem('__mockflags', JSON.stringify({confirm:true}))"); pg = boot(c)
    pg.mouse.click(600, 400); pg.fill('#lgEmail', 'c@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_timeout(800)
    ok('confirm_msg', '인증' in pg.inner_text('#lgMsg') or '로그인되지' in pg.inner_text('#lgMsg'), pg.inner_text('#lgMsg')); c.close()
    # 4) ?test 는 기존 흐름(영웅 선택 화면) 그대로
    c = b.new_context(); pg = c.new_page(); pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000)
    ok('test_mode_skips_flow', J(pg, '()=>G.phase') == 'select' and not J(pg, '()=>G.screen')); c.close()
    b.close()
fail = [k for k, v in res.items() if not v]; print('errors', errs[:5]); print('FAIL ' + ','.join(fail) if fail or errs else 'ALL OK'); sys.exit(1 if fail or errs else 0)
