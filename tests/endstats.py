#!/usr/bin/env python3
"""판 종료 통계 (📊 통계) 브라우저 테스트 (가짜 Supabase tests/sbmock.js) — src/ui/endstats.js · data/endstats.js
 1) 스테이지 클리어 데스크톱 1280x800 (실제 웨이브 2개 + 화살탑): 결과 화면 그대로(클리어·보상·귀환) + 📊 통계 버튼 → #endStats
    영웅 카드 6칸 = 미터 값 (총 피해·평균 DPS·최고 한 방·처치·받은 피해·스킬 비중) · 타워별 피해 = G.dmTowers · 웨이브별 시간 = G.waveLog · 화면 안·가로 넘침 없음 · C/Esc/← 결과로
 2) 하드 클리어 태블릿 1024x600 터치: 탭으로 열기 · 버튼 ≥48px · 화면 안 · 넘침 없음 · ✕ 닫기
 3) 패배 (#over, 도전/열린 판 = ?test=1): 📊 통계 버튼 · 진행 중 웨이브 표시 · C 키
 4) 던전 결과 (파티원별): 영웅 카드 = 파티 인원 · 합동 공격 라벨 · 영웅별 미터 일치
 스크린샷 shots/stats/end_*.png · 콘솔 오류 0      python3 tests/endstats.py"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/stats'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:300], flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
vis = lambda pg, id: J(pg, f"()=>{{ const e=document.getElementById('{id}'); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none'; }}")
RECT = "(id)=>{ const r=document.getElementById(id).getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom,r.width,r.height]; }"
def hook(pg): pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
def shot(pg, name): J(pg, "()=>{ G.pauseRender=true; }"); pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/{name}.png', timeout=240000)
# 패널 배치: 화면 안 · 가로 넘침 · 항목 잘림 · 맨 위 요소가 패널 (결과 화면 위)
LAY = """()=>{ const p=document.getElementById('endStats'), r=p.getBoundingClientRect(); const clip=[...p.querySelectorAll('.esHero,.esRow,.esW,.esC,.esSum,.esSub,.esG')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className);
  const top=document.elementFromPoint((r.left+r.right)/2, r.top+30); return { r:[Math.round(r.left),Math.round(r.top),Math.round(r.right),Math.round(r.bottom)], inView: r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight, hs: p.scrollWidth>p.clientWidth+1, vs: p.scrollHeight>p.clientHeight+1, clip, onTop: !!top && p.contains(top) }; }"""
# 화면 값 = 집계 값 = 미터 (영웅별 6칸)
CMPH = """async()=>{ const ES=await import('./src/data/endstats.js'), A=G.endStats, L=G.heroes.length?G.heroes:[G.hero]; const bad=[];
  const cards=[...document.querySelectorAll('#endStats .esHero')]; if (cards.length!==L.length) bad.push(['cards', cards.length, L.length]);
  L.forEach((h,i)=>{ const a=A.heroes[i], c=cards[i]; if (!a||!c) return; if (a.cls!==h.cls||c.dataset.cls!==h.cls) bad.push(['cls',i]);
    if (Math.abs(a.tot-h.dm.tot)>1e-6||a.max!==h.dm.max||a.kills!==h.dm.kills||Math.abs(a.taken-h.dm.taken)>1e-6||Math.abs(a.sk-h.dm.sk)>1e-6) bad.push(['meter',h.cls]);
    const v=Object.fromEntries([...c.querySelectorAll('.esC')].map(e=>[e.querySelector('span').innerText, e.querySelector('b').innerText]));
    const want={'총 피해':ES.fmtBig(a.tot),'평균 DPS':ES.fmtDps(a.dps),'최고 한 방':ES.fmtBig(a.max),'처치':ES.fmtBig(a.kills),'받은 피해':ES.fmtBig(a.taken),'스킬 비중':ES.fmtPct(a.skPct)};
    for (const k in want) if (v[k]!==want[k]) bad.push([h.cls,k,v[k],want[k]]); if (Math.abs(a.dps - a.tot/Math.max(1,A.span))>1e-9) bad.push(['dps',h.cls]); });
  return bad; }"""
TOWERS = """()=>{ const A=G.endStats, live=(G.dmTowers||[]).filter(t=>(t.dmT||0)>0||(t.dmK||0)>0); const rows=[...document.querySelectorAll('#endStats .esRow')].map(r=>r.innerText.replace(/\\n/g,' '));
  return { n: rows.length, want: Math.min(6, live.length), sorted: A.towers.every((t,i)=>!i||A.towers[i-1].dmT>=t.dmT), sum: Math.round(live.reduce((s,t)=>s+t.dmT,0)), other: Math.round(G.dmOther.tot), names: rows.slice(0,3) }; }"""
WAVES = """()=>{ const A=G.endStats, W=[...document.querySelectorAll('#endStats .esW')]; return { n: W.length, log: G.waveLog.length, labels: W.map(w=>w.querySelector('span').innerText), times: W.map(w=>w.querySelector('b').innerText), sec: A.waves.map(w=>Math.round(w.sec*10)/10), live: W.filter(w=>w.classList.contains('live')).length, fast: W.filter(w=>w.classList.contains('fast')).length }; }"""
SMALL = "()=>[...document.querySelectorAll('#endStats button, #scStats, #overStats')].filter(b=>b.offsetParent).map(b=>{ const r=b.getBoundingClientRect(); return [b.id||b.innerText, b.offsetWidth, b.offsetHeight, Math.round(r.width), Math.round(r.height)]; }).filter(x=>x.slice(1).some(v=>v<48))"
def boot(b, vw, vh, save_js=None, touch=False):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=touch, is_mobile=touch, device_scale_factor=2 if touch else 1); c.add_init_script(MOCK); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>window.G&&G.screen==='town'", timeout=60000); pg.wait_for_timeout(400)
    if save_js: J(pg, "()=>{ G.gear.Acc.store(" + save_js + "); }")
    return c, pg
def go_stage(pg, q):
    pg.goto(url + '?seed=12345&rng=777&flow=1&' + q); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=240000); pg.wait_for_timeout(500); J(pg, HELP)
def play_waves(pg, n, tower=True):  # 실제 웨이브 (미터에 영웅·타워 피해가 쌓이게)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; G.gold=9999; }")
    if tower: J(pg, "()=>{ const s=T_.grassNearRoute(4, 3, []); G.build(s[0], s[1], 'arrow'); const s2=T_.grassNearRoute(8, 3, [s[0]+','+s[1]]); if (s2) G.build(s2[0], s2[1], 'cannon'); }")
    for _ in range(n):
        J(pg, "()=>G.startWave()")
        for _ in range(80):
            if J(pg, "()=>{ G.sim(2); return G.phase!=='wave'; }"): break
def finish_stage(pg):
    J(pg, "()=>{ G.manual=true; G.wave=G.stage.waves-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9,'#fff',false); G.spawnQ=[]; G.spawnE=null; G.sim(1); }")
    for _ in range(40):
        ph = J(pg, "()=>{ if (G.phase==='build') G.startWave(); G.spawnQ.length=0; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9,'#fff',false); G.sim(1); return G.phase; }")
        if ph not in ('wave', 'build'): break
    pg.wait_for_function("()=>!document.getElementById('stageClear').classList.contains('hidden')", timeout=60000); pg.wait_for_timeout(600)
CH1 = "{ v:1, hero:'archer', souls:500, st:{'1-1':3,'1-2':3,'1-3':2,'1-4':3,'1-5':3,'1-6':2}, starRw:3, stats:{runs:9,kills:100,waves:60,souls:500} }"

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ===== 1) 스테이지 클리어 데스크톱 =====
    c, pg = boot(b, 1280, 800)
    go_stage(pg, 'stage=1-1&run=1'); ok('closed_before_end', not vis(pg, 'endStats') and not J(pg, "()=>!!document.getElementById('scStats')"))
    play_waves(pg, 2); M0 = J(pg, "()=>({tot:G.hero.dm.tot, waves:G.waveLog.map(w=>[w.n, w.t1>=0]), tw:G.dmTowers.length})"); ok('played_waves', M0['tot'] > 0 and M0['waves'][:2] == [[1, True], [2, True]] and M0['tw'] >= 1, M0)
    finish_stage(pg)
    t = pg.inner_text('#stageClear'); ok('clear_screen_intact', '스테이지 클리어' in t and '영혼석' in t and vis(pg, 'stageClear') and J(pg, "()=>!!document.getElementById('scTown')"), t[:120].replace('\n', ' '))
    ok('clear_btn', J(pg, "()=>{ const b=document.getElementById('scStats'), t=document.getElementById('scTown'); return !!b && b.nextElementSibling===t && b.innerText.includes('통계'); }"))
    ok('kind_clear', J(pg, "()=>G.endStatsUI.kind()") == 'clear' and J(pg, "()=>!!G.endStats && G.endStats.heroes.length===1"))
    pg.click('#scStats'); pg.wait_for_timeout(400); ok('clear_opens', vis(pg, 'endStats') and vis(pg, 'stageClear'))
    txt = pg.inner_text('#endStats'); ok('clear_text', all(k in txt for k in ['전투 통계', '영웅별', '총 피해', '평균 DPS', '최고 한 방', '처치', '받은 피해', '스킬 비중', '타워별 피해', '웨이브별 클리어 시간', '전투 시간']), txt.replace('\n', ' | ')[:300])
    bad = J(pg, CMPH); ok('clear_hero_values', bad == [], bad)
    T = J(pg, TOWERS); ok('clear_towers', T['n'] == T['want'] >= 1 and T['sorted'] and abs(T['sum'] - T['other']) <= 1 and any('화살탑' in x or '대포탑' in x for x in T['names']), T)
    W = J(pg, WAVES); ok('clear_waves', W['n'] == W['log'] >= 2 and W['labels'][:2] == ['W1', 'W2'] and W['live'] == 0 and W['fast'] == 1 and all(':' in x for x in W['times']), W)
    L = J(pg, LAY); ok('clear_layout', L['inView'] and not L['hs'] and not L['clip'] and L['onTop'], L)
    shot(pg, 'end_clear_desktop'); J(pg, "()=>{ G.pauseRender=false; }")
    pg.keyboard.press('c'); pg.wait_for_timeout(200); ok('c_closes', not vis(pg, 'endStats'))
    pg.keyboard.press('c'); pg.wait_for_timeout(200); ok('c_opens', vis(pg, 'endStats')); ok('no_battle_overlay', not vis(pg, 'statOv'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); ok('esc_closes', not vis(pg, 'endStats') and vis(pg, 'stageClear'))
    pg.click('#scStats'); pg.wait_for_timeout(200); pg.click('#esBack'); pg.wait_for_timeout(200); ok('back_closes', not vis(pg, 'endStats') and vis(pg, 'stageClear'))
    c.close()

    # ===== 2) 하드 클리어 태블릿 1024x600 =====
    c, pg = boot(b, 1024, 600, CH1, touch=True)
    go_stage(pg, 'stage=1-1&run=1&hard=1'); ok('hard_run', J(pg, "()=>G.hard===true"))
    play_waves(pg, 1); finish_stage(pg)
    t = pg.inner_text('#stageClear'); ok('hard_clear_intact', '하드' in t and '스테이지 클리어' in t, t[:80].replace('\n', ' '))
    sb = J(pg, RECT, 'scStats'); ok('tablet_btn_48', sb[4] >= 48 and sb[5] >= 48 and sb[3] <= 600, sb)
    pg.tap('#scStats'); pg.wait_for_timeout(600); ok('tablet_opens', vis(pg, 'endStats'))
    L = J(pg, LAY); ok('tablet_layout', L['inView'] and not L['hs'] and not L['clip'] and L['onTop'], L); ok('tablet_fits_no_scroll', not L['vs'], L)
    sm = J(pg, SMALL); ok('tablet_touch_48', not sm, sm)
    bad = J(pg, CMPH); ok('tablet_hero_values', bad == [], bad)
    shot(pg, 'end_tablet'); J(pg, "()=>{ G.pauseRender=false; }")
    pg.tap('#esClose'); pg.wait_for_timeout(300); ok('tablet_close', not vis(pg, 'endStats') and vis(pg, 'stageClear'))
    c.close()

    # ===== 3) 패배 (#over · 열린 판 = 도전) =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&rng=777&test=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=240000)
    J(pg, "()=>G.choose('mage')"); J(pg, "()=>G.sim(.3)"); J(pg, HELP)
    J(pg, "()=>{ G.gold=9999; const s=T_.grassNearRoute(4, 3, []); G.build(s[0], s[1], 'magic'); G.startWave(); }")
    for _ in range(30):
        if J(pg, "()=>{ G.sim(2); return G.hero.dm.hits>5 && G.dmOther.tot>0; }"): break
    ok('over_btn_hidden_before', not vis(pg, 'overStats'))
    J(pg, "()=>import('./src/core/waves.js').then(m=>m.gameOver())"); pg.wait_for_timeout(500)
    ok('over_screen', vis(pg, 'over') and vis(pg, 'overStats') and J(pg, "()=>G.endStatsUI.kind()") == 'over')
    pg.click('#overStats'); pg.wait_for_timeout(300); ok('over_opens', vis(pg, 'endStats'))
    W = J(pg, WAVES); ok('over_live_wave', W['n'] == W['log'] >= 1 and W['live'] == 1 and W['times'][-1].endswith('…'), W)
    bad = J(pg, CMPH); ok('over_hero_values', bad == [], bad)
    T = J(pg, TOWERS); ok('over_towers', T['n'] == T['want'] and T['n'] >= 1 and '마법탑' in T['names'][0], T)
    L = J(pg, LAY); ok('over_layout', L['inView'] and not L['hs'] and not L['clip'] and L['onTop'], L)
    shot(pg, 'end_over_desktop'); J(pg, "()=>{ G.pauseRender=false; }")
    pg.keyboard.press('c'); pg.wait_for_timeout(200); ok('over_c_closes', not vis(pg, 'endStats') and vis(pg, 'over'))
    c.close()

    # ===== 4) 던전 결과 (파티원별) =====
    c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); hook(pg)
    pg.goto(url + '?seed=12345&rng=777&flow=1&dgtest=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', 'endstats@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.souls=50; d.stats={runs:1,kills:1,waves:1,souls:1}; return d; }); }")
    J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
    J(pg, "()=>G.openDungeon()"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden') && document.querySelectorAll('.dgCard').length>=3", timeout=20000); pg.wait_for_timeout(1200)
    pg.click('#dgStart'); pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); pg.wait_for_timeout(300)
    J(pg, "()=>{ G.manual=true; G.pauseRender=true; }"); J(pg, "()=>G.sim(14)")
    J(pg, "async()=>{ const H=await import('./src/heroes/hero.js'); H.heroDamage(25, G.heroes[1]); }")
    J(pg, "async()=>{ (await import('./src/dungeon/run.js')).dgFinish(false); }"); pg.wait_for_timeout(600)
    ok('dg_result', vis(pg, 'stageClear') and '원정' in pg.inner_text('#stageClear') and J(pg, "()=>!!document.getElementById('scStats') && document.getElementById('scStats').nextElementSibling===document.getElementById('dgTown')") and J(pg, "()=>G.endStatsUI.kind()") == 'dungeon')
    pg.click('#scStats'); pg.wait_for_timeout(400); ok('dg_opens', vis(pg, 'endStats'))
    n = J(pg, "()=>G.heroes.length"); per = J(pg, "()=>G.endStats.heroes.map(h=>[h.cls, Math.round(h.tot), h.taken>0])")
    ok('dg_party_cards', J(pg, "()=>document.querySelectorAll('#endStats .esHero').length") == n and 3 <= n <= 4 and sum(1 for p in per if p[1] > 0) >= 2 and per[1][2], per)
    bad = J(pg, CMPH); ok('dg_hero_values', bad == [], bad)
    txt = pg.inner_text('#endStats'); W = J(pg, WAVES); ok('dg_labels', '파티' in txt and '던전에는 타워가 없어요' in txt and W['labels'][:1] == ['1-1'], (W['labels'], txt[:160].replace('\n', ' ')))
    L = J(pg, LAY); ok('dg_layout', L['inView'] and not L['hs'] and not L['clip'] and L['onTop'], L)
    shot(pg, 'end_dungeon')
    c.close()

    b.close()
ok('no_console_errors', not errs, errs[:5])
bad = [k for k, v in res.items() if not v]; print(f'\n{len(res) - len(bad)}/{len(res)} ok', 'FAIL: ' + ', '.join(bad) if bad else '', flush=True)
sys.exit(1 if bad else 0)
