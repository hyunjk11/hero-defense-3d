#!/usr/bin/env python3
"""영웅 능력치 패널 테스트 (가짜 Supabase tests/sbmock.js) — src/ui/stats.js · data/herostats.js · combat/meter.js
 1) 일반 판 데스크톱: 📊 버튼/C 키 → 오버레이 (일시정지 안 함 · 시간 계속) · 수치 = 게임 stat (공속·사거리·스킬·쿨·공격력) · 웨이브 피해 미터 (총 피해 > 0, 스킬 비중, 처치 = 게임 처치 수) · 타워 피해 공용 칸 · Esc 닫기
 2) 일반 판 태블릿 1024x600 터치: 탭으로 열기 · 버튼 ≥48px · 화면 안 · 영웅 강화/건설 패널과 안 겹침
 3) 마을 (로그인 · 장비/전직 영웅): 📊 능력치 → 소유 영웅 탭 · 9행 내역 (출처: 장비 · 전직) · 전투력 · 예상 DPS · 탭 전환 · Esc
 4) 던전 파티: 마을 능력치 = 출정 영웅 실제 수치 (궁수 장비·전직) · C → 파티 탭 4명 이하 · 탭 전환 · 영웅별 미터
 스크린샷 shots/stats/*.png · 콘솔 오류 0      python3 tests/stats.py"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/stats'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
vis = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none'; }}")
RECT = "(id)=>{ const r=document.getElementById(id).getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom,r.width,r.height]; }"
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name): J(pg, RAF); pg.wait_for_timeout(300); pg.screenshot(path=f'{OUT}/{name}.png', timeout=240000)
def hook(pg): pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
overlap = lambda a, b: not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])
# 게임 stat (현재 영웅 문맥) vs 오버레이 수식 (치명 0 → 공격력도 난수 없음)
CMP = """()=>G.heroes.map(h=>G.withHero(h, ()=>{ const S=G.heroStat, L=G.statsUI.liveStats(h).F, c=(h.eq&&h.eq.crit)||0;
  const d=[['rate',S.rate(),L.rate],['range',S.range(),L.range],['skill',S.skillMul(),L.skillMul],['cd',S.skillCd(),L.cd]]; if(!c && !(h.adv&&h.adv.atk&&h.adv.atk.crit)) d.push(['dmg',S.dmg(),L.dmg]);
  return d.filter(([k,a,b])=>Math.abs(a-b)>1e-6*Math.max(1,Math.abs(a))).map(([k,a,b])=>[h.cls,k,a,b]); })).flat()"""
METER = "()=>{ const h=G.hero, m=h.dm; return {tot:m.tot, sk:m.sk, max:m.max, kills:m.kills, hits:m.hits, other:G.dmOther?G.dmOther.tot:-1, otherK:G.dmOther?G.dmOther.kills:0, gk:Object.values(G.stats.kills).reduce((a,b)=>a+b,0)}; }"

def town_login(pg, email):
    pg.goto(url + '?seed=12345&rng=777&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(400)
    # 궁수: 공격 장비 + 치명 장비 + 바람의 순찰자 전직 · 여신탑 공격 Lv.2
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=31; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.souls=50; d.stats={runs:1,kills:1,waves:1,souls:1}; const it={...E.makeItem('weapon','archer',3,r), id:'stW'}; const ac={...E.makeItem('acc','archer',3,r), id:'stA'}; d.inv.push(it, ac); d.eq.archer={weapon:'stW', acc:'stA'};
        d.adv={...(d.adv||{}), archer:{b:'wind',n:1}}; d.heroLv={...d.heroLv, archer:{hp:1, atk:2}}; d.hero='archer'; return d; }); }""")
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 1) 일반 판 데스크톱 =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=240000)
    J(pg, "()=>G.choose('archer')"); J(pg, "()=>G.sim(.3)")
    ok('battle_btn_visible', vis(pg, 'statBtn') and J(pg, "()=>document.getElementById('statBtn').title").find('(C)') > 0)
    ok('overlay_closed_default', not vis(pg, 'statOv'))
    pg.keyboard.press('c'); pg.wait_for_timeout(350)
    ok('c_opens_overlay', vis(pg, 'statOv') and J(pg, "()=>G.statsUI.isOpen()"))
    t0 = J(pg, "()=>G.t"); J(pg, "()=>G.sim(.5)"); ok('overlay_no_pause', not J(pg, "()=>!!G.paused") and J(pg, "()=>G.t") > t0)
    txt = pg.inner_text('#statOv'); ok('overlay_text', all(k in txt for k in ['전투력', '예상 DPS', '공격력', '공격 속도', '치명타 확률', '치명타 피해', '사거리', '체력', '스킬 피해', '실시간 DPS', '총 피해', '최고 한 방', '처치 수', '스킬 비중']), txt.replace('\n', ' | ')[:300])
    ok('stats_match_game', J(pg, CMP) == [], J(pg, CMP))
    # 영웅 강화 → 오버레이 수치 따라감
    J(pg, "()=>{ G.gold=5000; G.ups.atk=2; G.ups.spd=1; }"); pg.wait_for_timeout(400); ok('stats_match_after_ups', J(pg, CMP) == [], J(pg, CMP))
    ok('overlay_shows_ups_buff', '영웅 강화 공격 Lv.2' in pg.inner_text('#statOv'))
    # 타워 하나 + 웨이브 → 미터
    J(pg, "()=>{ G.startWave(); }"); J(pg, "()=>G.sim(14)")
    J(pg, "()=>{ const p=G.enemies.find(e=>!e.dead); if (p) { G.hero.skillCd=0; G.mouseWorld && G.mouseWorld.copy && G.mouseWorld.copy(p.g.position); } }")
    pg.keyboard.press('q'); J(pg, "()=>G.sim(6)"); pg.wait_for_timeout(400)
    M = J(pg, METER); ok('meter_total', M['tot'] > 0 and M['hits'] > 0 and M['max'] > 0 and M['max'] <= M['tot'], M)
    ok('meter_kills_match_game', M['kills'] + M['otherK'] == M['gk'], M)
    live = J(pg, "()=>{ const L=[...document.querySelectorAll('#statOv .ovC')].map(e=>e.innerText.replace(/\\n/g,' ')); return L; }")
    ok('overlay_live_values', any(x.startswith('총 피해') and not x.endswith(' 0') for x in live), live)
    shot(pg, 'battle_desktop')
    # 일시정지 중이면 그대로 (오버레이가 풀지 않음)
    pg.keyboard.press('p'); pg.wait_for_timeout(150); pg.keyboard.press('c'); pg.keyboard.press('c'); pg.wait_for_timeout(200)
    ok('paused_stays_paused', J(pg, "()=>!!G.paused") and vis(pg, 'statOv')); pg.keyboard.press('p'); pg.wait_for_timeout(150)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); ok('esc_closes_overlay', not vis(pg, 'statOv'))
    pg.click('#statBtn'); pg.wait_for_timeout(200); ok('btn_opens_overlay', vis(pg, 'statOv')); pg.click('#ovClose'); pg.wait_for_timeout(200); ok('x_closes_overlay', not vis(pg, 'statOv'))
    c.close()

    # ===== 2) 일반 판 태블릿 1024x600 =====
    c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True, is_mobile=True, device_scale_factor=2); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=240000)
    J(pg, "()=>G.choose('gunner')"); J(pg, "()=>G.sim(.3)"); J(pg, "()=>{ G.startWave(); G.sim(8); }")
    sb = J(pg, RECT, 'statBtn'); ok('tablet_btn_48', sb[4] >= 48 and sb[5] >= 48, sb)
    pg.tap('#statBtn'); pg.wait_for_timeout(400); ok('tablet_tap_opens', vis(pg, 'statOv'))
    ov = J(pg, RECT, 'statOv'); ok('tablet_overlay_in_view', ov[0] >= 0 and ov[1] >= 0 and ov[2] <= 1024 and ov[3] <= 600, ov)
    clash = [i for i in ['ups', 'build', 'bottom', 'cam', 'top'] if vis(pg, i) and overlap(ov, J(pg, RECT, i))]; ok('tablet_overlay_no_clash', not clash, clash)
    xb = J(pg, RECT, 'ovClose'); ok('tablet_close_48', xb[4] >= 48 and xb[5] >= 48, xb)
    ok('tablet_no_pause', not J(pg, "()=>!!G.paused"))
    shot(pg, 'battle_tablet')
    pg.tap('#ovClose'); pg.wait_for_timeout(300); ok('tablet_tap_close', not vis(pg, 'statOv'))
    c.close()

    # ===== 3) 마을 (데스크톱) → 4) 던전 파티 =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page(); hook(pg)
    town_login(pg, 'stats@test.kr')
    ok('town_btn_visible', vis(pg, 'twStats'))
    pg.click('#twStats'); pg.wait_for_timeout(500); ok('town_panel_open', vis(pg, 'statPanel'))
    tabs = J(pg, "()=>[...document.querySelectorAll('#statTabs .ftab')].map(b=>[b.dataset.h, b.classList.contains('on')])")
    ok('town_tabs_owned', [t[0] for t in tabs] == ['warrior', 'archer', 'mage'] and dict(tabs).get('archer'), tabs)
    rows = J(pg, "()=>[...document.querySelectorAll('#statBody .stRow')].map(r=>[r.dataset.k, r.innerText.replace(/\\n/g,' ')])")
    ok('town_rows_9', [r[0] for r in rows] == ['dmg', 'rate', 'crit', 'critX', 'range', 'hp', 'taken', 'skill', 'cd'], rows)
    dm = dict(rows)['dmg']; ok('town_breakdown_sources', '여신탑 공격 Lv.2' in dm and '전직 바람의 순찰자' in dm and '장비' in dm, dm)
    D = J(pg, "()=>{ const d=G.statsUI.townData('archer'); return {cp:d.cp, dps:d.F.dps, dmg:d.F.dmg, rate:d.F.rate, range:d.F.range, crit:d.F.crit, hp:d.F.hp, fx:d.fx.length, title:d.title}; }")
    cpT = pg.inner_text('#statCP'); ok('town_cp_dps', D['cp'] > 0 and cpT.replace(',', '') == str(D['cp']) and D['dps'] > 0 and '바람의 순찰자' in D['title'], (cpT, D))
    body = pg.inner_text('#statBody'); ok('town_text', all(k in body for k in ['전투력', '예상 DPS', '실효 체력', '장착 전설·고유 효과', '재사용 대기 감소', '피해 감소']), body[:200])
    shot(pg, 'town_desktop')
    pg.click('#statTabs .ftab[data-h="mage"]'); pg.wait_for_timeout(300)
    ok('town_tab_switch', J(pg, "()=>document.querySelector('#statTabs .ftab.on').dataset.h") == 'mage' and J(pg, "()=>G.statsUI.townData('mage').title") in pg.inner_text('#statBody .stHead'))
    pg.click('#twBag'); pg.wait_for_timeout(300); ok('bag_closes_stats', not vis(pg, 'statPanel') and vis(pg, 'invPanel'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.click('#twStats'); pg.wait_for_timeout(300); pg.keyboard.press('Escape'); pg.wait_for_timeout(200); ok('town_esc_closes', not vis(pg, 'statPanel'))
    pg.keyboard.press('c'); pg.wait_for_timeout(200); ok('town_c_no_overlay', not vis(pg, 'statOv'))
    # 던전 파티
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden') && document.querySelectorAll('.dgCard').length>=3", timeout=20000); pg.wait_for_timeout(1200)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
    A = J(pg, "()=>{ const h=G.heroes.find(h=>h.cls==='archer'); const F=G.statsUI.liveStats(h).F; return {dmg:F.dmg, rate:F.rate, range:F.range, crit:F.crit, hp:F.hp}; }")
    diff = {k: (D[k], A[k]) for k in A if abs(D[k] - A[k]) > 1e-6 * max(1, abs(D[k]))}
    ok('town_equals_sortie', not diff, diff)
    ok('dungeon_stats_match_game', J(pg, CMP) == [], J(pg, CMP))
    pg.keyboard.press('c'); pg.wait_for_timeout(400)
    n = len(J(pg, "()=>G.heroes")); tb = J(pg, "()=>[...document.querySelectorAll('#ovTabs .ftab')].map(b=>b.innerText)")
    ok('dungeon_party_tabs', vis(pg, 'statOv') and len(tb) == n and 2 <= n <= 4 and sum('🎮' in t for t in tb) == 1, tb)
    J(pg, "()=>G.sim(12)"); pg.wait_for_timeout(300)
    per = J(pg, "()=>G.heroes.map(h=>[h.cls, Math.round(h.dm.tot), h.dm.kills])"); ok('dungeon_meter_per_hero', sum(1 for p in per if p[1] > 0) >= 2, per)
    pg.click('#ovTabs .ftab[data-i="1"]'); pg.wait_for_timeout(400)
    hd = pg.inner_text('#ovBody .ovHd'); ok('dungeon_tab_switch', J(pg, "()=>document.querySelector('#ovTabs .ftab.on').dataset.i") == '1' and len(hd) > 0, hd)
    ok('dungeon_no_pause', not J(pg, "()=>!!G.paused"))
    shot(pg, 'dungeon_party')
    c.close()

    # ===== 3b) 마을 태블릿 =====
    c = b.new_context(viewport={'width': 1024, 'height': 600}, has_touch=True, is_mobile=True, device_scale_factor=2); c.add_init_script(MOCK); pg = c.new_page(); hook(pg)
    town_login(pg, 'stats2@test.kr')
    tw = J(pg, RECT, 'twStats'); ok('town_tablet_btn_48', tw[5] >= 48, tw)
    pg.tap('#twStats'); pg.wait_for_timeout(500); ok('town_tablet_open', vis(pg, 'statPanel'))
    small = J(pg, "()=>[...document.querySelectorAll('#statPanel button')].map(b=>{ const r=b.getBoundingClientRect(); return [b.innerText||b.id, Math.round(r.width), Math.round(r.height)]; }).filter(x=>x[1]<48||x[2]<48)")
    ok('town_tablet_touch_48', not small, small)
    sp = J(pg, RECT, 'statPanel'); ok('town_tablet_in_view', sp[0] >= 0 and sp[1] >= 0 and sp[2] <= 1024 and sp[3] <= 600, sp)
    ow = J(pg, "()=>{ const e=document.getElementById('statBody'); return [...e.querySelectorAll('.stRow')].filter(r=>r.scrollWidth>r.clientWidth+1).length; }"); ok('town_tablet_no_overflow', ow == 0, ow)
    shot(pg, 'town_tablet')
    pg.tap('#statClose'); pg.wait_for_timeout(300); ok('town_tablet_close', not vis(pg, 'statPanel'))
    c.close(); b.close()
ok('no_console_errors', not errs, errs[:5])
bad = [k for k, v in res.items() if not v]; print(f'\n{len(res) - len(bad)}/{len(res)} ok', 'FAIL: ' + ', '.join(bad) if bad else '', flush=True)
sys.exit(1 if bad else 0)
