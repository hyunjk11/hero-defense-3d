#!/usr/bin/env python3
"""다음 웨이브 미리보기(4) 테스트.  python3 tests/waveprev.py
 - 건설 단계에만 미리보기 표시, 내용 = previewWave(난수 미사용), 스테이지 최종 웨이브 보스 줄, 여러 화면 크기(태블릿 가로 1024×600 포함)에서 HUD 와 겹치지 않음·화면 안
 스크린샷 shots/improve/p4_preview_1024x600.png, p4_preview_boss.png, p4_preview_chboss.png"""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
def page(pw, q, vp, touch=False, dpr=1):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=dpr, has_touch=touch, is_mobile=touch); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1' + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP); return b, pg
OVL = r"""()=>{ const W = document.getElementById('wavePrev'), r = W.getBoundingClientRect(), hit = [];
  const vis = el => el && el.getClientRects().length && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && !el.closest('.hidden');
  const others = ['#top .pill', '#build', '#ups', '#bottom > *', '#cam button', '#help', '#bossHud', '#tinfo', '#banner'].flatMap(s => [...document.querySelectorAll(s)]).filter(vis);
  for (const o of others) { const q = o.getBoundingClientRect(); if (q.width < 1) continue; if (r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top) hit.push((o.id || o.className) + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round)); }
  const rows = [...W.querySelectorAll('.wpRow, .wpI')].length, inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  const clipped = [...W.querySelectorAll('.wpRow')].filter(x => x.getBoundingClientRect().bottom > r.bottom + 1).length;
  return { vis: vis(W), rect: [r.left, r.top, r.right, r.bottom].map(Math.round), hit, rows, inside, clipped, compact: W.classList.contains('compact') }; }"""
SIZES = [((1024, 600), True, 2), ((1280, 800), True, 2), ((1366, 768), False, 1), ((960, 600), True, 2), ((1180, 820), True, 2), ((1280, 760), False, 1), ((1920, 1080), False, 1)]
with sync_playwright() as pw:
    for vp, touch, dpr in SIZES:
        b, pg = page(pw, '&stage=1-2', vp, touch, dpr); J(pg, "()=>G.choose('mage')"); J(pg, '()=>G.sim(.3)'); pg.wait_for_timeout(300)
        m = J(pg, OVL); name = f'{vp[0]}x{vp[1]}'
        ok(f'preview_fits@{name}', m['vis'] and not m['hit'] and m['inside'] and m['rows'] >= 1 and m['clipped'] == 0, m)
        if vp == (1024, 600):
            pg.screenshot(path=f'{OUT}/p4_preview_{name}.png')
            exp = J(pg, "()=>{ const P = G.wavePrev(); return [P.n, P.boss, P.list.map(x => x.t)]; }")
            shown = J(pg, "()=>[...document.querySelectorAll('#wavePrev .wpRow')].map(r => r.dataset.t)")
            ok('preview_content', exp[0] == 1 and shown and all(t in exp[2] for t in shown) and shown[0] == exp[2][0], (exp, shown))
            # 미리보기는 게임 난수를 쓰지 않음: 같은 시드 두 페이지에서 미리보기 여러 번 호출 후 다음 웨이브 대기열이 같아야 함
            q1 = J(pg, "()=>{ for (let i = 0; i < 20; i++) G.wavePrev(); G.startWave(); return G.spawnQ.slice(); }")
            ok('preview_hidden_in_wave', J(pg, "()=>document.getElementById('wavePrev').classList.contains('hidden')"))
            b.close(); b, pg = page(pw, '&stage=1-2', vp, touch, dpr); J(pg, "()=>G.choose('mage')"); J(pg, '()=>G.sim(.3)'); q2 = J(pg, "()=>{ G.startWave(); return G.spawnQ.slice(); }")
            ok('preview_no_rng_use', q1 == q2, (len(q1), len(q2)))
            # 최종 웨이브 보스 줄
            J(pg, "()=>{ G.enemies.slice().forEach(e => { e.hp = 0; }); G.spawnQ = []; G.wave = G.STAGE_CFG.waves - 1; G.phase = 'build'; G.endWaveUI && G.endWaveUI(); }")
            J(pg, "()=>import('./src/ui/hud.js').then(m => { m.setPhaseUI(); m.refreshHud(); document.getElementById('note').classList.add('hidden'); document.getElementById('banner').classList.remove('show'); })"); pg.wait_for_timeout(200)
            bossRow = J(pg, "()=>{ const r = document.querySelector('#wavePrev .wpRow.boss'); return r && r.dataset.t; }")
            ok('preview_final_boss_row', bossRow == J(pg, "()=>G.wavePrev().boss") and bossRow, bossRow); m = J(pg, OVL); ok('preview_boss_fits@1024x600', not m['hit'] and m['inside'], m)
            pg.screenshot(path=f'{OUT}/p4_preview_boss.png')
            # 챕터 보스 스테이지(4-4 폐허) 최종 웨이브: 챕터 보스 줄
            b.close(); b, pg = page(pw, '&stage=4-4', vp, touch, dpr); J(pg, "()=>G.choose('mage')"); J(pg, '()=>G.sim(.3)')
            J(pg, "()=>{ G.wave = G.STAGE_CFG.waves - 1; return import('./src/ui/hud.js').then(m => { m.setPhaseUI(); m.refreshHud(); document.getElementById('banner').classList.remove('show'); }); }"); pg.wait_for_timeout(200)
            cb = J(pg, "()=>{ const r = document.querySelector('#wavePrev .wpRow.boss'); return r && r.dataset.t; }"); m = J(pg, OVL)
            ok('preview_chapter_boss@1024x600', cb == 'boss_ruins' and not m['hit'] and m['inside'] and m['clipped'] == 0, (cb, m))
            pg.screenshot(path=f'{OUT}/p4_preview_chboss.png')
        b.close()
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
