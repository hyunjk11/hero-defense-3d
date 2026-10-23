#!/usr/bin/env python3
"""Q-3 단축키 안내 (2026-10-23): H/? 로 열고 닫기 · Esc 맨 위 하나 · 바깥 클릭 · 입력칸 무시 · 전투/마을 강조 · 1024x600 화면 안·글자 12px·닫기 48px(터치)
  python3 tests/keyhelp.py   → shots/improve/q3_help_battle.png, q3_help_1024x600.png"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
OUT = 'shots/improve'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); res, errs = {}, []
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
OPEN = "()=>{ const e=document.getElementById('keyHelp'); return !!e && !e.classList.contains('hidden') }"
def page(pw, q, vp, touch=False):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, has_touch=touch, is_mobile=touch); pg = c.new_page()
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&rng=777&test=1' + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.evaluate(HELP); return b, pg
with sync_playwright() as pw:
    b, pg = page(pw, '&stage=1-2', (1280, 760)); J(pg, "()=>G.choose('mage')"); J(pg, '()=>G.sim(.3)')
    pg.keyboard.press('h'); ok('h_opens', J(pg, OPEN)); ok('battle_first', J(pg, "()=>document.querySelector('.khSec').dataset.s") == 'battle' and J(pg, "()=>document.querySelector('.khSec.now').dataset.s") == 'battle')
    ok('lists_keys', all(k in pg.inner_text('#keyHelp') for k in ('Space', 'Q', '1~5', 'WASD', '합동')))
    J(pg, "()=>G.pauseRender=true"); pg.screenshot(path=f'{OUT}/q3_help_battle.png'); J(pg, "()=>G.pauseRender=false")
    pg.keyboard.press('h'); ok('h_closes', not J(pg, OPEN))
    pg.keyboard.press('Shift+Slash'); ok('question_opens', J(pg, OPEN))
    tool0 = J(pg, '()=>G.tool'); pg.keyboard.press('Escape'); ok('esc_closes_only_help', not J(pg, OPEN) and J(pg, '()=>G.tool') == tool0, (tool0, J(pg, '()=>G.tool')))
    pg.keyboard.press('h'); pg.mouse.click(5, 5); ok('backdrop_closes', not J(pg, OPEN))
    J(pg, "()=>{ const i=document.createElement('input'); i.id='tmpIn'; document.body.appendChild(i); i.focus(); }"); pg.keyboard.press('h'); ok('typing_ignored', not J(pg, OPEN)); J(pg, "()=>document.getElementById('tmpIn').remove()")
    b.close()
    # 태블릿 1024x600 (터치): 화면 안 · 글자 ≥12px · 닫기 48px
    b, pg = page(pw, '&stage=1-2', (1024, 600), True); J(pg, "()=>G.choose('mage')"); J(pg, '()=>G.sim(.3)'); J(pg, '()=>G.help.openHelp()'); pg.wait_for_timeout(300)
    m = J(pg, """()=>{ const bx=document.querySelector('.khBox').getBoundingClientRect(), x=document.getElementById('khClose').getBoundingClientRect();
      const fs=Math.min(...[...document.querySelectorAll('#keyHelp *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize)));
      return { inView: bx.left>=0&&bx.top>=0&&bx.right<=innerWidth&&bx.bottom<=innerHeight, x:[x.width,x.height], fs } }""")
    ok('tablet_in_view', m['inView'], m); ok('tablet_font_12', m['fs'] >= 11.9, m['fs']); ok('tablet_close_48', m['x'][0] >= 47.5 and m['x'][1] >= 47.5, m['x'])
    J(pg, "()=>G.pauseRender=true"); pg.screenshot(path=f'{OUT}/q3_help_1024x600.png'); J(pg, "()=>G.pauseRender=false")
    pg.tap('#khClose'); ok('tap_close', not J(pg, OPEN)); b.close()
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
