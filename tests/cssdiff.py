#!/usr/bin/env python3
"""CSS 리팩터 검증 (U-1/U-3, 2026-10-23): 스크립트 없이 index.html 마크업 + style.css 만 띄워 모든 요소의 계산된 스타일을 덤프.
  python3 tests/cssdiff.py dump OUT.json [STYLE.css]   # 기본 style.css · 크기 1280x800 / 1024x600(터치) / 900x560
  python3 tests/cssdiff.py diff A.json B.json          # 다른 속성 목록 (0 이면 시각 변화 0)
WebGL·게임 코드 없이 빠름(수십 초). JS 가 만드는 요소(#gConfirm 등)는 아래 EXTRA 로 일부 흉내."""
import sys, json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
EXTRA = ('<div id="gConfirm" class="danger"><div class="acBox"><div class="acIco">!</div><h3 class="gcT">t</h3><div class="gcB">b</div>'
         '<div class="acBtns"><button class="gbtn main danger" id="gcOk">ok</button><button class="gbtn" id="gcNo">no</button></div></div></div>'
         '<div class="bigPanel gpanel"><div class="ftabs"><button class="ftab on">a</button><button class="ftab">b</button></div><button class="gbtn sm xbtn">x</button><button class="gbtn ghost">g</button></div>')
SIZES = [(1280, 800, False), (1024, 600, True), (900, 560, False)]
def dump(out, css):
    from playwright.sync_api import sync_playwright
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = re.sub(r'<script[\s\S]*?</script>', '', html); html = re.sub(r'<link[^>]*stylesheet[^>]*>', '', html)
    html = html.replace('</head>', '<style>' + pathlib.Path(css).read_text(encoding='utf-8') + '</style></head>').replace('</body>', EXTRA + '</body>')
    R = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=['--disable-gpu'])
        for w, h, t in SIZES:
            c = b.new_context(viewport={'width': w, 'height': h}, has_touch=t); pg = c.new_page(); pg.set_content(html)
            if t:  # pointer:coarse 흉내 (has_touch 만으로는 안 바뀌는 경우)
                s = c.new_cdp_session(pg); s.send('Emulation.setEmitTouchEventsForMouse', {'enabled': True, 'configuration': 'mobile'})
            R[f'{w}x{h}'] = pg.evaluate("""()=>{ const out={}, all=[...document.querySelectorAll('body *')]; let i=0;
              for (const e of all) { const k=(e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):''))+'@'+(i++);
                const cs=getComputedStyle(e), o={}; for (const p of cs) o[p]=cs.getPropertyValue(p);
                for (const ps of ['::before','::after']) { const c2=getComputedStyle(e,ps); if (c2.content && c2.content!=='none') for (const p of c2) o[ps+p]=c2.getPropertyValue(p); }
                out[k]=o; } return {coarse: matchMedia('(pointer:coarse)').matches, els: out}; }""")
            c.close()
        b.close()
    json.dump(R, open(out, 'w')); print('dumped', out, {k: (len(v['els']), v['coarse']) for k, v in R.items()})
def diff(a, b):
    A, B = json.load(open(a)), json.load(open(b)); n = 0
    for sz in A:
        for k, o in A[sz]['els'].items():
            p = B[sz]['els'].get(k)
            if p is None: print('MISSING', sz, k); n += 1; continue
            for prop, v in o.items():
                if prop.startswith('--'): continue  # 사용자 정의 속성(토큰 자체)은 비교 제외
                if p.get(prop) != v: n += 1; n <= 60 and print('DIFF', sz, k, prop, repr(v)[:60], '->', repr(p.get(prop))[:60])
    print('DIFFS', n); sys.exit(1 if n else 0)
if __name__ == '__main__':
    if sys.argv[1] == 'dump': dump(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ROOT / 'style.css')
    else: diff(sys.argv[2], sys.argv[3])
