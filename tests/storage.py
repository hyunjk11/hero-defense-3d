#!/usr/bin/env python3
"""📦 창고 브라우저 테스트 (2026-10-24, docs/STORAGE_2026-10-24.md). 데스크톱 1440x860.  python3 tests/storage.py [--shots]
레일 📦 → 창고 탭 · 옮기기(Shift+클릭·선택+버튼·더블클릭·되돌리기) · 장착 중 제외 · 필터·정렬 · 일괄 보관/꺼내기 · 확장(확인창) · 대장간 분해 목록에 창고 장비 없음
· 새로고침 유지 · 로그인(가짜 서버): 서버 행은 압축 문자열 · 서버에서 다시 불러오기 · 옛 클라이언트가 stor 를 지운 행 치유 · 콘솔 오류 0"""
import sys, os, json, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/storage'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
L = lambda pg: J(pg, "()=>{ const s=G.gear.Acc.load(); return { inv: s.inv.map(x=>x.id), stor: (s.stor||[]).map(x=>x.id), storX: s.storX||0, steel: s.mat.steel, souls: s.souls }; }")
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
tiles = lambda pg, col: J(pg, f"()=>[...document.querySelectorAll('#{col} .itile[data-id]')].map(e=>e.dataset.id)")
def shot(pg, name):
    if SHOTS: pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{name}.png')
SAVE = """()=>{ const {Acc,E}=G.gear; let q=11; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
  Acc.update(d=>{ d.hero='mage'; d.souls=5000; d.mat={steel:1000,crystal:5}; d.stats={runs:2,kills:5,waves:5,souls:5};
    d.inv=[{...E.makeItem('armor','mage',2,r), id:'eqA'}, {...E.makeItem('weapon','mage',0,r), id:'b0'}, {...E.makeItem('armor','mage',1,r), id:'b1'}, {...E.makeItem('acc','mage',2,r), id:'b2'},
      {...E.makeItem('weapon','mage',3,r), id:'b3'}, {...E.makeItem('acc','mage',4,r), id:'b4'}, {...E.makeItem('armor','mage',2,r), id:'b5'}, E.makeUnique('c_acc',0,0)];
    d.stor=[]; delete d.storX; d.eq.mage={armor:'eqA'}; d.uqLog={c_acc:1}; return d; }); }"""
def boot(c):
    pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000); return pg
def relogin(pg):  # 새로고침 → 인트로 클릭 → 저장된 세션으로 자동 로그인 · 서버 행 불러오기
    pg.reload(); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000); pg.mouse.click(720, 430)
    pg.wait_for_function("()=>G.gear&&G.gear.Acc.A.user&&G.screen==='menu'", timeout=60000); pg.wait_for_timeout(1500)
def to_town(pg):
    if J(pg, "()=>G.screen") != 'town': pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000)
    pg.wait_for_timeout(800)
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = boot(c)
    pg.mouse.click(720, 430); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); J(pg, SAVE); to_town(pg)
    ok('rail_button', not hidden(pg, 'twStor') and pg.inner_text('#twStorN') == '0/60', pg.inner_text('#twStorN'))
    pg.click('#twStor'); pg.wait_for_timeout(300)
    ok('open_tab', not hidden(pg, 'invPanel') and not hidden(pg, 'storBody') and J(pg, "()=>document.getElementById('invPanel').classList.contains('wide')") and '창고' in pg.inner_text('#invHead'), pg.inner_text('#invHead'))
    fit = J(pg, "()=>{ const r=document.getElementById('invPanel').getBoundingClientRect(); return [r.left>=0, r.top>=0, r.right<=innerWidth, r.bottom<=innerHeight]; }"); ok('panel_fits', all(fit), fit)
    bt = tiles(pg, 'stoBag'); ok('bag_excludes_equipped', 'eqA' not in bt and len(bt) == 7 and tiles(pg, 'stoStor') == [], bt)
    shot(pg, 'open')
    # 옮기기: Shift+클릭 / 선택+버튼 / 더블클릭 / 되돌리기
    pg.click('#stoBag .itile[data-id="b0"]', modifiers=['Shift']); pg.wait_for_timeout(150); s = L(pg)
    ok('shift_store', 'b0' in s['stor'] and 'b0' not in s['inv'] and 'b0' in tiles(pg, 'stoStor') and '1개 보관' in pg.inner_text('#stoMsg'), s)
    pg.click('#stoBag .itile[data-id="b1"]'); pg.wait_for_timeout(150); ok('select_card', pg.locator('#stoDetail .icard, #stoDetail .card, #stoMove').count() >= 1 and '보관' in pg.inner_text('#stoMove'))
    pg.click('#stoMove'); pg.wait_for_timeout(150); pg.dblclick('#stoBag .itile[data-id="b2"]'); pg.wait_for_timeout(150); s = L(pg)
    ok('button_dbl_store', set(['b0', 'b1', 'b2']) <= set(s['stor']) and len(s['inv']) == 5, s)
    pg.click('#stoStor .itile[data-id="b0"]', modifiers=['Shift']); pg.wait_for_timeout(150); s = L(pg); ok('take_back', 'b0' in s['inv'] and 'b0' not in s['stor'] and '1개 꺼냄' in pg.inner_text('#stoMsg'), s)
    ok('rail_count', pg.inner_text('#twStorN') == '2/60', pg.inner_text('#twStorN'))
    shot(pg, 'move')
    # 필터·정렬
    pg.click('#stoGrade .ftab[data-v="uq"]'); pg.wait_for_timeout(120); ok('filter_unique', tiles(pg, 'stoBag') == ['u_c_acc'] and tiles(pg, 'stoStor') == [], (tiles(pg, 'stoBag'), tiles(pg, 'stoStor')))
    pg.click('#stoGrade .ftab[data-v="all"]'); pg.click('#stoSlot .ftab[data-v="acc"]'); pg.wait_for_timeout(120)
    ok('filter_slot', sorted(tiles(pg, 'stoBag')) == ['b4', 'u_c_acc'] and tiles(pg, 'stoStor') == ['b2'], (tiles(pg, 'stoBag'), tiles(pg, 'stoStor')))
    pg.click('#stoSlot .ftab[data-v="all"]'); pg.select_option('#stoSort', 'power'); pg.wait_for_timeout(120)
    pw_ = J(pg, "()=>{ const s=G.gear.Acc.load(), E=G.gear.E; return [...document.querySelectorAll('#stoBag .itile[data-id]')].map(e=>E.power(s.inv.find(x=>x.id===e.dataset.id))); }")
    ok('sort_power', len(pw_) == 5 and pw_ == sorted(pw_, reverse=True), pw_)
    pg.select_option('#stoSort', 'grade'); pg.wait_for_timeout(100); ok('sort_grade_unique_first', tiles(pg, 'stoBag')[0] == 'u_c_acc', tiles(pg, 'stoBag'))
    # 일괄: 등급 2 필터로 보관 → 등급 2만, 전체로 꺼내기
    pg.click('#stoGrade .ftab[data-v="2"]'); pg.wait_for_timeout(100); pg.click('#stoAllIn'); pg.wait_for_timeout(150); s = L(pg)
    ok('bulk_store_filtered', 'b5' in s['stor'] and 'eqA' in s['inv'] and 'b3' in s['inv'], s)
    pg.click('#stoGrade .ftab[data-v="all"]'); pg.wait_for_timeout(100); pg.click('#stoAllIn'); pg.wait_for_timeout(150); s = L(pg)
    ok('bulk_store_all', s['inv'] == ['eqA'] and len(s['stor']) == 7 and 'u_c_acc' in s['stor'], s)
    ok('unique_still_owned', J(pg, "()=>G.gear.E.ownsUnique(G.gear.Acc.load(),'c_acc')"))
    pg.click('#stoAllOut'); pg.wait_for_timeout(150); s = L(pg); ok('bulk_take_all', len(s['inv']) == 8 and s['stor'] == [], s)
    pg.click('#stoGrade .ftab[data-v="all"]'); pg.click('#stoAllIn'); pg.wait_for_timeout(150)
    # 확장 (확인창 → 강철 120)
    st0 = L(pg)['steel']; pg.click('.stoExpGo[data-pay="steel"]'); pg.wait_for_selector('#gcOk', state='visible'); shot(pg, 'expand_confirm'); pg.click('#gcOk'); pg.wait_for_timeout(250); s = L(pg)
    ok('expand_steel', s['storX'] == 1 and s['steel'] == st0 - 120 and '70칸' in pg.inner_text('#stoMsg') and '/70' in pg.inner_text('#invHead'), (s, pg.inner_text('#stoMsg')))
    so0 = s['souls']; pg.click('.stoExpGo[data-pay="souls"]'); pg.wait_for_selector('#gcOk', state='visible'); pg.click('#gcNo'); pg.wait_for_timeout(200); ok('expand_cancel', L(pg)['souls'] == so0 and L(pg)['storX'] == 1)
    shot(pg, 'expand')
    # 탭 전환 · 대장간 분해 목록에 창고 장비 없음
    pg.click('#invTabs .ftab[data-v="bag"]')
    pg.wait_for_timeout(150); ok('bag_tab_back', hidden(pg, 'storBody') and not J(pg, "()=>document.getElementById('invPanel').classList.contains('wide')"))
    pg.click('#invClose'); J(pg, "()=>G.gear.openSmith()"); pg.wait_for_timeout(300); pg.click('#smTabs .ftab[data-t="dis"]'); pg.wait_for_timeout(150)
    ok('smith_ignores_storage', pg.locator('#disGrid .itile').count() == 0, pg.locator('#disGrid .itile').count())
    pg.click('#smClose')
    # 새로고침 유지
    before = L(pg); pg.reload(); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(720, 430); pg.wait_for_timeout(300)
    if pg.locator('#lgGuest').is_visible(): pg.click('#lgGuest'); pg.wait_for_timeout(300)
    print('screen after reload', J(pg, "()=>G.screen"), flush=True)
    to_town(pg); after = L(pg); ok('reload_persist', after['stor'] == before['stor'] and after['storX'] == 1 and after['inv'] == before['inv'], (before, after))
    c.close()
    # 로그인(가짜 서버): 압축 저장 · 서버에서 다시 · 옛 클라이언트 치유
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = boot(c)
    pg.mouse.click(720, 430); pg.fill('#lgEmail', 's@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(500)
    J(pg, SAVE); J(pg, "()=>{ const {Acc}=G.gear, SG=G.gear.SG; Acc.update(d=>{ SG.store(d, ['b1','b2','u_c_acc']); d.storX=2; return d; }); }")
    pg.wait_for_function("()=>localStorage.getItem('hd3d_dirty')===null && G.gear.Acc.A.sync==='saved'", timeout=60000)
    row = J(pg, "()=>Object.values(JSON.parse(localStorage.getItem('__mockdb')).hd3d_progress)[0].data")
    ok('cloud_packed', len(row.get('stor', [])) == 3 and all(isinstance(x, str) for x in row['stor']) and row.get('storX') == 2, row.get('stor'))
    J(pg, "()=>{ localStorage.removeItem('hd3d_save'); Object.keys(localStorage).filter(k=>k.startsWith('hd3d_stor_')).forEach(k=>localStorage.removeItem(k)); }")
    relogin(pg)
    s = L(pg); ok('cloud_reload_unpacked', sorted(s['stor']) == ['b1', 'b2', 'u_c_acc'] and s['storX'] == 2 and 'b1' not in s['inv'], s)
    ok('cloud_items_objects', J(pg, "()=>G.gear.Acc.load().stor.every(x=>typeof x==='object'&&x.m)"))
    # 옛 클라이언트가 저장: 서버 행에서 stor·storX 사라짐 → 이 기기 백업으로 복구 후 다시 저장
    pg.wait_for_function("()=>localStorage.getItem('hd3d_dirty')===null && G.gear.Acc.A.sync==='saved'", timeout=60000)
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const r=Object.values(d.hd3d_progress)[0]; delete r.data.stor; delete r.data.storX; r.updated_at=new Date(Date.now()+5000).toISOString(); localStorage.setItem('__mockdb', JSON.stringify(d)); localStorage.removeItem('hd3d_save'); }")
    relogin(pg)
    s = L(pg); ok('old_client_heal', sorted(s['stor']) == ['b1', 'b2', 'u_c_acc'] and s['storX'] == 2, s)
    try: pg.wait_for_function("()=>{ const r=Object.values(JSON.parse(localStorage.getItem('__mockdb')).hd3d_progress)[0].data; return Array.isArray(r.stor)&&r.stor.length===3; }", timeout=60000)
    except Exception: pass
    ok('old_client_heal_saved', len(J(pg, "()=>Object.values(JSON.parse(localStorage.getItem('__mockdb')).hd3d_progress)[0].data.stor||[]")) == 3)
    c.close()
    print('errors', errs); ok('no_console_errors', not errs, errs[:5])
    n = sum(res.values()); print(f'{n}/{len(res)} ok' + ('' if n == len(res) else ' FAILED')); sys.exit(0 if n == len(res) else 1)
