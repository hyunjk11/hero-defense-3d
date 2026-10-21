#!/usr/bin/env python3
"""2026-10-21 새 스테이지(2~4장 x-5·x-6, 보스 앞) 브라우저 테스트.  python3 tests/stages6.py
 - 저장 호환: 4스테이지 시절 저장(2·3·4장 보스 id x-4 클리어) → 보스·다음 장 열림 유지, 새 스테이지 x-5 = 현재(cur), x-6 잠김
 - 원정 지도: 장마다 6개 노드, 1440×860 / 1024×600 에서 지도 안·서로 겹치지 않음, 화면 번호(no) 표시. 스크린샷 shots/stages/ch<N>_<W>x<H>.png
 - 새 스테이지 2-5·3-5·4-6 출정: 지형(용암/성벽)·포털마다 경로·웨이브 미리보기·실제 전투 몇 초·최종 웨이브 클리어 → 별 저장(id), 클리어 화면 표시 번호, 콘솔 오류 없음"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
OUT = 'shots/stages'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
OLD = "{'1-1':3,'1-2':3,'1-3':3,'1-4':3,'1-5':3,'1-6':3,'2-1':3,'2-2':3,'2-3':3,'2-4':3,'3-1':2,'3-2':1,'3-3':1,'3-4':1,'4-1':1,'4-2':1,'4-3':1,'4-4':1}"
LAYOUT = r"""()=>{ const m = document.getElementById('stMap').getBoundingClientRect(), N = [...document.querySelectorAll('#stMap .snode')], R = N.map(n => n.getBoundingClientRect());
  const out = R.filter(r => r.left < m.left - 1 || r.top < m.top - 1 || r.right > m.right + 1 || r.bottom > m.bottom + 1).length; let ov = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) ov.push(N[i].dataset.id + '/' + N[j].dataset.id); }
  // 이름표(.nm)끼리도 겹치지 않음
  const L = N.map(n => n.querySelector('.nm').getBoundingClientRect()); let ovn = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) ovn.push(N[i].dataset.id + '/' + N[j].dataset.id); }
  const nmOut = L.filter(r => r.left < m.left - 1 || r.right > m.right + 1 || r.bottom > m.bottom + 1).length;
  return { n: N.length, ids: N.map(n => n.dataset.id), nums: N.map(n => n.querySelector('.num').textContent), out, ov, ovn, nmOut }; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for vw, vh in [(1440, 860), (1024, 600)]:
        c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=vw < 1100); c.add_init_script(MOCK); pg = c.new_page()
        pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
        pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
        pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); pg.click('#mnNew'); pg.wait_for_function("()=>G.screen==='town'", timeout=60000); pg.wait_for_timeout(500)
        J(pg, f"()=>{{ G.gear.Acc.update(d=>{{ d.st={OLD}; return d; }}); G.stageSel.openStageSel(); }}"); pg.wait_for_timeout(300)
        for ch in [1, 2, 3, 4]:
            pg.click(f'.chtab[data-c="{ch}"]'); pg.wait_for_timeout(200); L = J(pg, LAYOUT); tag = f'{vw}x{vh}'
            ok(f'ch{ch}_layout@{tag}', L['n'] == 6 and L['out'] == 0 and not L['ov'] and not L['ovn'] and L['nmOut'] == 0, L)
            if ch > 1:
                ok(f'ch{ch}_order_compat@{tag}', L['ids'] == [f'{ch}-{i}' for i in (1, 2, 3, 5, 6, 4)] and L['nums'][:5] == [f'{ch}-{i}' for i in (1, 2, 3, 4)] + ['🔒'] and L['nums'][5] == '👑'
                   and pg.locator('.lockVeil').count() == 0 and pg.locator(f'.snode.cur[data-id="{ch}-5"]').count() == 1 and pg.locator(f'.snode.locked[data-id="{ch}-6"]').count() == 1
                   and pg.locator(f'.snode.boss[data-id="{ch}-4"]:not(.locked)').count() == 1, L['nums'])
                pg.click(f'.snode[data-id="{ch}-5"]'); t = pg.inner_text('#stInfo'); ok(f'ch{ch}_info_new@{tag}', f'{ch}-4 · ' in t and '출정' in t and '☆' in t, t[:80])
            J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(700); pg.screenshot(path=f'{OUT}/ch{ch}_{tag}.png'); J(pg, "()=>G.pauseRender=false")
        if vw == 1440:
            pg.click('.chtab[data-c="2"]'); pg.click('.snode[data-id="2-4"]'); t = pg.inner_text('#stInfo'); ok('boss_info_label', '2-6 · 빙결의 군주' in t and '챕터 보스' in t, t[:60])
            # 새 스테이지 출정: 2-5 (설원) · 3-5 (용암) · 4-6 (성벽)
            for sid, kind in [('2-5', 'ice'), ('3-5', 'lava'), ('4-6', 'wall')]:
                if sid == '4-6': J(pg, "()=>G.gear.Acc.update(d=>{ d.st['4-5']=1; return d; })")
                pg.goto(url + f'?seed=12345&flow=1&stage={sid}&run=1'); pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=120000); pg.wait_for_timeout(500); pg.evaluate(HELP)
                st = J(pg, "()=>{ let lava=0, wall=0; for (let c=0;c<G.GW;c++) for (let r=0;r<G.GH;r++) { const t=G.tileAt(c,r); if (t.lava) lava++; if (t.wall) wall++; } const W=document.getElementById('wavePrev');"
                          " return { id:G.stage.id, no:G.stage.no, lava, wall, sp:G.SPAWNS.length, routes:(G.routes||[]).map(r=>r.length), prev: !!W && !W.closest('.hidden') && W.getClientRects().length>0 && W.querySelectorAll('.wpRow,.wpI').length>0, core:G.CORE.join(',') }; }")
                S = J(pg, f"()=>{{ const S=G.stage; return {{ sp:S.spawns.length, core:S.core.join(','), waves:S.waves }}; }}")
                ok(f'{sid}_loaded', st['id'] == sid and st['sp'] == S['sp'] and st['core'] == S['core'] and len(st['routes']) == st['sp'] and all(n >= 2 for n in st['routes'])
                   and (st['lava'] >= 10 if kind == 'lava' else st['lava'] == 0) and (st['wall'] >= 12 if kind == 'wall' else st['wall'] == 0) and st['prev'], st)
                # 실제 전투 몇 초 (실시간 렌더) → 몬스터가 포털에서 나와 움직임
                J(pg, "()=>{ G.startWave(); }"); pg.wait_for_timeout(4000)
                mv = J(pg, "()=>{ G.manual=true; G.sim(6); return [G.phase, G.enemies.filter(e=>!e.dead).length + G.spawnQ.length, G.core ? G.coreHp : 0]; }"); ok(f'{sid}_wave_runs', mv[0] == 'wave' and mv[1] > 0, mv)
                J(pg, f"()=>{{ G.manual=true; G.wave={S['waves']}-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9,'#fff',false); G.spawnQ=[]; G.sim(1); }}")
                for _ in range(40):
                    ph = J(pg, "()=>{ if (G.phase==='build') G.startWave(); G.spawnQ.length=0; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9,'#fff',false); G.sim(1); return G.phase; }")
                    if ph not in ('wave', 'build'): break
                pg.wait_for_function("()=>!document.getElementById('stageClear').classList.contains('hidden')", timeout=60000)
                t = pg.inner_text('#stageClear'); sv = J(pg, "()=>G.gear.Acc.load().st")
                ok(f'{sid}_clear', '스테이지 클리어' in t and f"{st['no']} · " in t and sv.get(sid, 0) >= 1 and sv.get(sid[0] + '-4', 0) >= 1, (t[:80].replace('\n', ' '), sv.get(sid)))
                if sid == '2-5': ok('2-5_unlock_label', '새 스테이지 해금: 2-5' in t, t[-80:].replace('\n', ' '))
        c.close()
    print('console errors:', errs); ok('no_console_errors', not errs)
    n_ok = sum(res.values()); print(f'{n_ok}/{len(res)} ok', 'ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
