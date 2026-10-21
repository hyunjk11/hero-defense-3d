#!/usr/bin/env python3
"""하드 모드 브라우저 테스트 (2026-10-21, docs/HARD_2026-10-21.md).  python3 tests/hard.py   (단독 실행 — 다른 브라우저 테스트와 병렬 X)
 - 잠김: 새 저장 → 노말/하드 토글의 하드 버튼 잠김, 누르면 해금 방법 안내, 노말 유지
 - 옛 저장 호환: hst 없는 저장(1장 보스 클리어) → 1장 하드 열림, 2장 하드 잠김, 노말 별 그대로
 - 원정 지도: 1440×860 / 1024×600 에서 토글·노드·이름표 겹침/잘림 없음, 하드 노드(붉은)·정보 패널(하드 별·보상 2배). 스크린샷 shots/hard/
 - 하드 출정(지도 → 출정 버튼 → hard=1): 하드 표시(상단 🔥 하드), 체력 배수, 웨이브 미리보기 정예, 실제 정예 출현(크기·붉은 고리·체력), 클리어 → 하드 별 저장·노말 별 그대로·보상, 다음 하드 해금
 - 주소만 바꿔 잠긴 하드로 들어오면 노말로, 노말 출정에는 정예 없음, 콘솔 오류 없음"""
import sys, os, pathlib, re
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/hard'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:300], flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
CH1 = "{'1-1':3,'1-2':3,'1-3':2,'1-4':3,'1-5':3,'1-6':2}"
LAYOUT = r"""()=>{ const m = document.getElementById('stMap').getBoundingClientRect(), N = [...document.querySelectorAll('#stMap .snode')], R = N.map(n => n.getBoundingClientRect()), L = N.map(n => n.querySelector('.nm').getBoundingClientRect()), S = N.map(n => n.querySelector('.stars').getBoundingClientRect());
  const T = document.querySelector('#stMap .modeTog'), t = T ? T.getBoundingClientRect() : null, hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1, inside = r => r.left >= m.left - 1 && r.top >= m.top - 1 && r.right <= m.right + 1 && r.bottom <= m.bottom + 1;
  let ov = []; for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { if (hit(R[i], R[j]) || hit(L[i], L[j])) ov.push(N[i].dataset.id + '/' + N[j].dataset.id); }
  const tov = t ? N.filter((n, i) => hit(t, R[i]) || hit(t, L[i]) || hit(t, S[i])).map(n => n.dataset.id) : [];
  const I = document.getElementById('stInfo'), ib = I.getBoundingClientRect(), clip = [...I.children].filter(c => { const r = c.getBoundingClientRect(); return r.bottom > ib.bottom + 1 || r.right > ib.right + 1; }).map(c => c.className || c.tagName);
  const go = document.getElementById('stGo'), gr = go && go.getBoundingClientRect(), P = document.getElementById('stagePanel').getBoundingClientRect();
  return { n: N.length, out: R.filter(r => !inside(r)).length + L.filter(r => !inside(r)).length, ov, tog: !!t, togIn: t ? inside(t) : null, tov, clip, goVis: !go || (gr.bottom <= innerHeight && gr.bottom <= P.bottom + 1 && gr.height > 20), hardNodes: document.querySelectorAll('#stMap .snode.hard').length }; }"""
def boot(b, vw, vh, save_js=None):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=vw < 1100); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(400)
    if save_js: J(pg, "()=>{ G.gear.Acc.store(" + save_js + "); }")
    return c, pg
def shot(pg, path): J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(600); pg.screenshot(path=path); J(pg, "()=>G.pauseRender=false")
def open_map(pg, ch):
    J(pg, "()=>G.stageSel.openStageSel()"); pg.wait_for_timeout(250); pg.click(f'.chtab[data-c="{ch}"]'); pg.wait_for_timeout(250)
def go_stage_wait(pg):
    pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=180000); pg.wait_for_timeout(500); pg.evaluate(HELP)
def finish_stage(pg, waves):
    J(pg, f"()=>{{ G.manual=true; G.wave={waves}-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9,'#fff',false); G.spawnQ=[]; G.spawnE=null; G.sim(1); }}")
    for _ in range(40):
        ph = J(pg, "()=>{ if (G.phase==='build') G.startWave(); G.spawnQ.length=0; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9,'#fff',false); G.sim(1); return G.phase; }")
        if ph not in ('wave', 'build'): break
    pg.wait_for_function("()=>!document.getElementById('stageClear').classList.contains('hidden')", timeout=60000)

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ---------- 1. 잠김 (새 저장) ----------
    c, pg = boot(b, 1024, 600)
    open_map(pg, 1); L = J(pg, LAYOUT)
    lk = J(pg, "()=>{ const h=document.querySelector('.modeTog .hardB'); return h ? { locked: h.classList.contains('locked'), title: h.title, txt: h.textContent } : null; }")
    ok('locked_toggle_shown', L['tog'] and lk and lk['locked'] and '1-6' in lk['title'] and '보스' in lk['title'], lk)
    pg.click('.modeTog .hardB'); pg.wait_for_timeout(300); tip = J(pg, "()=>{ const t=document.getElementById('itemTip'); return t && !t.classList.contains('hidden') ? t.innerText : ''; }")
    ok('locked_click_explains', '1-6' in tip and '하드' in tip and L['hardNodes'] == 0 and J(pg, "()=>document.querySelectorAll('#stMap .snode.hard').length") == 0, tip)
    shot(pg, f'{OUT}/map_locked_1024x600.png')
    ok('locked_ch2_no_toggle', (pg.click('.chtab[data-c="2"]') or True) and J(pg, "()=>!document.querySelector('#stMap .modeTog') && !!document.querySelector('.lockVeil')"))
    c.close()
    # ---------- 2. 옛 저장(hst 없음) 호환 + 지도 배치 ----------
    OLD = "{ v:1, hero:'mage', souls:500, st:" + CH1 + ", starRw:3, stats:{runs:9,kills:100,waves:60,souls:500} }"
    for vw, vh in [(1440, 860), (1024, 600)]:
        tag = f'{vw}x{vh}'; c, pg = boot(b, vw, vh, OLD)
        sv = J(pg, "()=>G.gear.Acc.load()"); ok(f'oldsave_loads@{tag}', sv['hst'] == {} and sv['st'].get('1-6') == 2 and sv['souls'] == 500, (sv['hst'], sv['st']))
        open_map(pg, 1); L = J(pg, LAYOUT); ok(f'map_normal_layout@{tag}', L['n'] == 6 and L['out'] == 0 and not L['ov'] and L['togIn'] and not L['tov'] and not L['clip'] and L['goVis'], L)
        en = J(pg, "()=>{ const h=document.querySelector('.modeTog .hardB'); return h && !h.classList.contains('locked'); }"); ok(f'toggle_enabled_ch1@{tag}', en)
        shot(pg, f'{OUT}/map_normal_{tag}.png')
        pg.click('.modeTog .hardB'); pg.wait_for_timeout(300); L = J(pg, LAYOUT)
        st = J(pg, "()=>({ cur: [...document.querySelectorAll('#stMap .snode.cur')].map(n=>n.dataset.id), locked: [...document.querySelectorAll('#stMap .snode.locked')].map(n=>n.dataset.id), info: document.getElementById('stInfo').innerText, go: (document.getElementById('stGo')||{}).textContent || '', hardMap: document.getElementById('stMap').classList.contains('hard'), tab: document.querySelector('.chtab[data-c=\"1\"]').innerText })")
        ok(f'map_hard_layout@{tag}', L['n'] == 6 and L['hardNodes'] == 6 and L['out'] == 0 and not L['ov'] and not L['tov'] and not L['clip'] and L['goVis'], L)
        rw2 = J(pg, "()=>G.stageSel.ST.stageReward('1-1', true) * 2")
        ok(f'map_hard_state@{tag}', st['hardMap'] and st['cur'] == ['1-1'] and st['locked'] == ['1-2', '1-3', '1-4', '1-5', '1-6'] and '하드' in st['info'] and f'영혼석 {rw2}' in st['info'] and '하드 출정' in st['go'] and '하드 ★ 0/18' in st['tab'], (st['cur'], st['locked'], st['info'][:160], st['tab']))
        shot(pg, f'{OUT}/map_hard_{tag}.png')
        pg.click('.chtab[data-c="2"]'); pg.wait_for_timeout(250)
        h2 = J(pg, "()=>({ hard: document.getElementById('stMap').classList.contains('hard'), locked: document.querySelector('.modeTog .hardB').classList.contains('locked'), title: document.querySelector('.modeTog .hardB').title })")
        ok(f'ch2_hard_locked@{tag}', not h2['hard'] and h2['locked'] and '2-6' in h2['title'], h2)
        if vw == 1024: shot(pg, f'{OUT}/map_ch2_locked_{tag}.png')
        if vw == 1440:
            # ---------- 3. 하드 출정 (지도 → 출정) ----------
            pg.click('.chtab[data-c="1"]'); pg.wait_for_timeout(200)
            if not J(pg, "()=>document.getElementById('stMap').classList.contains('hard')"): pg.click('.modeTog .hardB'); pg.wait_for_timeout(200)
            pg.click('.snode[data-id="1-1"]'); pg.wait_for_timeout(200); pg.click('#stGo'); pg.wait_for_url(re.compile(r'.*hard=1.*'), timeout=30000); go_stage_wait(pg)
            g = J(pg, "()=>({ hard: G.hard, id: G.stage.id, pill: !document.getElementById('hardPill').classList.contains('hidden'), url: location.search })")
            ok('hard_run_started', g['hard'] and g['id'] == '1-1' and g['pill'] and 'hard=1' in g['url'], g)
            # 웨이브 미리보기: 3웨이브 정예
            J(pg, "()=>{ G.wave=2; G.gold=5000; }"); pg.wait_for_timeout(1500)
            wp = J(pg, "()=>{ const W=document.getElementById('wavePrev'), p=G.wavePrev(); return { cls: W.className, el: W.querySelectorAll('.wpRow.elite, .wpI.elite').length, txt: W.innerText, p: p.elite }; }")
            ok('preview_elite', wp['p'] and wp['p']['n'] == 1 and wp['el'] >= 1 and 'hard' in wp['cls'] and '정예' in wp['txt'], wp)
            J(pg, "()=>{ G.pauseRender=true; }"); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/ingame_preview_1440x860.png'); J(pg, "()=>{ G.pauseRender=false; }")
            # 3웨이브 시작 → 정예 출현
            J(pg, "()=>{ G.startWave(); }"); q = J(pg, "()=>({ n: G.spawnE ? G.spawnE.filter(Boolean).length : -1, len: G.spawnQ.length, elen: G.spawnE ? G.spawnE.length : -1, hpMul: G.hpMul })")
            ok('wave3_elite_queue', q['n'] == 1 and q['len'] == q['elen'], q)
            hm = J(pg, "()=>Math.pow(1.16, 2) * G.stage.hp * G.stageSel.ST.HARD.hp"); ok('hard_hp_mul', abs(q['hpMul'] - hm) < 1e-6, (q['hpMul'], hm))
            J(pg, "()=>{ G.manual=true; for (let i=0;i<60 && G.spawnQ.length;i++) G.sim(.5); }")
            el = J(pg, "()=>G.enemies.filter(e=>!e.dead && e.elite).map(e=>({ t:e.type, n:e.E.n, sc:e.g.scale.x, ring: !!e.eliteRing, max:e.max, base:G.ETYPES[e.type].hp, gold:e.E.gold, bg:G.ETYPES[e.type].gold, dps:e.E.dps, bd:G.ETYPES[e.type].dps, spd:e.E.spd, bs:G.ETYPES[e.type].spd }))")
            nrm = J(pg, "()=>G.enemies.filter(e=>!e.dead && !e.elite).slice(0,1).map(e=>({ max:e.max, base:G.ETYPES[e.type].hp, dps:e.E.dps, bd:G.ETYPES[e.type].dps, spd:e.E.spd, bs:G.ETYPES[e.type].spd, hard:e.E.hard }))")
            ok('elite_spawned', len(el) == 1 and el[0]['ring'] and el[0]['sc'] > 1.2 and el[0]['n'].startswith('정예') and abs(el[0]['max'] / (el[0]['base'] * q['hpMul']) - 2.5) < .01 and el[0]['gold'] == el[0]['bg'] * 3, el)
            ok('hard_monster_stats', nrm and nrm[0]['hard'] and abs(nrm[0]['max'] / (nrm[0]['base'] * q['hpMul']) - 1) < .01 and abs(nrm[0]['dps'] / max(1e-9, nrm[0]['bd']) - 1.5) < .01 if nrm[0]['bd'] else True, nrm)
            ok('hard_monster_speed', nrm and abs(nrm[0]['spd'] / nrm[0]['bs'] - 1.1) < .01, nrm)
            # 정예를 화면 가운데로 (스크린샷)
            J(pg, "()=>{ G.manual=false; const e=G.enemies.find(x=>x.elite&&!x.dead); if (e) { G.cam.target.set(e.g.position.x, 0, e.g.position.z); G.cam.r = 22; } }"); pg.wait_for_timeout(2500)
            pg.screenshot(path=f'{OUT}/ingame_hard_elite_1440x860.png')
            # 정예 처치 → 클리어
            J(pg, "()=>{ G.manual=true; for (const e of [...G.enemies]) if (!e.dead && e.elite) G.hurt(e,1e9,'#fff',false); G.sim(.5); }"); ek = J(pg, "()=>G.eliteKills"); ok('elite_kill_counted', ek == 1, ek)
            s0 = J(pg, "()=>G.gear.Acc.load()"); finish_stage(pg, 10)
            t = pg.inner_text('#stageClear'); s1 = J(pg, "()=>G.gear.Acc.load()"); rw = J(pg, "()=>G.stageSel.ST.stageRewardH('1-1', true, true)")
            ok('hard_clear_saved', '하드' in t and '스테이지 클리어' in t and s1['hst'].get('1-1', 0) >= 1 and s1['st'] == s0['st'], (t[:120].replace('\n', ' '), s1['hst'], s1['st']))
            ok('hard_clear_reward', s1['souls'] - s0['souls'] >= rw + 2 and '정예 처치 보너스' in t and '새 하드 스테이지 해금: 1-2' in t and len(s1['chests']) > len(s0['chests']), (s1['souls'] - s0['souls'], rw, t[-160:].replace('\n', ' ')))
            shot(pg, f'{OUT}/clear_hard_1440x860.png')
            pg.click('#scTown'); pg.wait_for_function("()=>G.screen==='town'", timeout=120000); pg.wait_for_timeout(800)
            ok('back_town_url', 'hard' not in J(pg, "()=>location.search"), J(pg, "()=>location.search"))
            pop = J(pg, "()=>document.getElementById('townPop').innerText"); ok('town_popup_hard', '하드' in pop and '1-1' in pop, pop[:80])
            J(pg, "()=>{ document.getElementById('townPop').classList.add('hidden'); const o=document.getElementById('chestOv'); if (o) o.classList.add('hidden'); }")
            open_map(pg, 1)
            if not J(pg, "()=>document.getElementById('stMap').classList.contains('hard')"): pg.click('.modeTog .hardB'); pg.wait_for_timeout(200)
            st = J(pg, "()=>({ cur: [...document.querySelectorAll('#stMap .snode.cur')].map(n=>n.dataset.id), tab: document.querySelector('.chtab[data-c=\"1\"]').innerText })"); ok('hard_next_unlocked', st['cur'] == ['1-2'] and '하드 ★' in st['tab'], st)
            # ---------- 4. 주소만 바꿔 잠긴 하드 → 노말 ----------
            pg.goto(url + '?seed=12345&flow=1&stage=1-3&run=1&hard=1'); go_stage_wait(pg)
            g = J(pg, "()=>({ hard: G.hard, pill: !document.getElementById('hardPill').classList.contains('hidden') })"); ok('url_hack_locked_hard_is_normal', not g['hard'] and not g['pill'], g)
            J(pg, "()=>{ G.wave=4; G.startWave(); }"); q = J(pg, "()=>({ e: G.spawnE, hpMul: G.hpMul })"); ok('normal_no_elites', q['e'] is None and abs(q['hpMul'] - (1.16 ** 4) * 0.9) < 1e-6, q)
            # 하드 출정 중 귀환 → 마을, 저장 유지
            pg.goto(url + '?seed=12345&flow=1&stage=1-2&run=1&hard=1'); go_stage_wait(pg); ok('hard_1_2_run', J(pg, "()=>G.hard===true"))
            J(pg, "()=>{ G.manual=true; G.wave=1; }"); pg.click('#retreat'); pg.wait_for_function("()=>G.screen==='town'", timeout=120000); pg.wait_for_timeout(500)
            s2 = J(pg, "()=>G.gear.Acc.load()"); ok('retreat_keeps_progress', s2['hst'].get('1-1', 0) >= 1 and s2['st'] == s0['st'] and 'hard' not in J(pg, "()=>location.search"), (s2['hst'], J(pg, "()=>location.search")))
        c.close()
    print('console errors:', errs); ok('no_console_errors', not errs)
    n_ok = sum(res.values()); print(f'{n_ok}/{len(res)} ok', 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
