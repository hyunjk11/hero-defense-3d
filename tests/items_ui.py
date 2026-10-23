#!/usr/bin/env python3
"""챕터 아이템·고유 UI 브라우저 테스트 (+ 스크린샷 shots/items/).  python3 tests/items_ui.py [--shots]
스테이지 드롭 미리보기(데스크톱·1024x600 넘침 없음·툴팁) · 고유 카드 · 도감 탭(칸 표시·보상 1회) · 대장간 각성 · 분해 목록에서 고유 제외 · 오류 0"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/items'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
FITS = """(sel)=>{ const r=document.querySelector(sel).getBoundingClientRect(); return [r.left>=-1, r.top>=-1, r.right<=innerWidth+1, r.bottom<=innerHeight+1, Math.round(r.width), Math.round(r.height)]; }"""
OVER = """(sel)=>{ const el=document.querySelector(sel); return [el.scrollHeight-el.clientHeight, el.scrollWidth-el.clientWidth]; }"""
def shot(pg, path, el=None):
    if not SHOTS: return
    J(pg, "()=>G.pauseRender=false"); pg.wait_for_timeout(500); J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(200)
    (pg.screenshot(path=path, clip=pg.locator(el).bounding_box()) if el else pg.screenshot(path=path)); J(pg, "()=>G.pauseRender=false")
SAVE = """()=>{ const {Acc,E}=G.gear; Acc.update(d=>{ d.souls=5000; d.mat={steel:200,crystal:30,essence:50}; d.hero='archer'; d.stats={runs:3,kills:9,waves:9,souls:9};
  d.st={'1-1':3,'1-2':3,'1-3':3,'1-4':3,'1-5':3,'1-6':2,'2-1':2}; d.eq.archer={};
  const b=E.makeUnique('f_bow',0,0), c=E.makeUnique('c_acc',0,2); d.inv.push(b, c); d.eq.archer.weapon=b.id;
  let q=3; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; for (let g=0; g<5; g++) d.inv.push(E.makeItem('weapon','archer',g,r,1));
  d.inv.push(E.makeItem('armor','archer',1,r,1), E.makeItem('acc','archer',2,r,2)); d.uqLog={f_bow:1,c_acc:1}; d.codex={}; return d; }); }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for vw, vh, tag in [(1440, 860, 'desktop'), (1024, 600, '1024x600')]:
        c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=(tag != 'desktop')); c.add_init_script(MOCK); pg = c.new_page()
        pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
        pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
        pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); J(pg, SAVE)
        pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(800)
        J(pg, "()=>G.stageSel.openStageSel()"); pg.wait_for_timeout(300); pg.click('.chtab[data-c="1"]'); pg.click('.snode[data-id="1-6"]'); pg.wait_for_timeout(200)
        t = pg.inner_text('#stInfo')
        ok(f'{tag}_drop_preview', pg.locator('#stInfo .drop').count() == 1 and '숲' in t and 'undefined' not in t and 'NaN' not in t, t[:160].replace('\n', ' | '))
        ok(f'{tag}_unique_rows', pg.locator('#stInfo .dru').count() >= 1, pg.locator('#stInfo .dru').count())
        ok(f'{tag}_chapter_tab_badge', '◆' in pg.inner_text('.chtab[data-c="1"]'), pg.inner_text('.chtab[data-c="1"]'))
        ok(f'{tag}_boss_node_badge_owned', pg.locator('.snode[data-id="1-6"] .uqNode').count() == 0)  # 실바누스 보유 → 💎 없음
        f = J(pg, f"()=>({FITS})('#stagePanel')"); ok(f'{tag}_panel_fits', all(f[:4]), f)
        o = J(pg, f"()=>({OVER})('#stInfo')"); fi = J(pg, f"()=>({FITS})('#stInfo')"); ok(f'{tag}_stinfo_no_overflow', o[1] <= 1 and (o[0] <= 1 or J(pg, "()=>getComputedStyle(document.getElementById('stInfo')).overflowY")=='auto') and all(fi[:4]), (o, fi))
        go = J(pg, f"()=>({FITS})('#stGo')"); ok(f'{tag}_go_visible', all(go[:4]), go)
        if tag == 'desktop':
            pg.hover('#stInfo .dru >> nth=0'); pg.wait_for_timeout(200); ok('drop_tip_unique', not hidden(pg, 'itemTip') and '고유' in pg.inner_text('#itemTip'), pg.inner_text('#itemTip')[:80])
            pg.mouse.move(5, 5); pg.wait_for_timeout(100)
            sm = pg.locator('#stInfo .drc')
            if sm.count(): sm.first.hover(); pg.wait_for_timeout(200); ok('drop_tip_sample', not hidden(pg, 'itemTip')); pg.mouse.move(5, 5); pg.wait_for_timeout(100)
        J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')")
        shot(pg, f'{OUT}/stage_preview_{tag}.png')
        # 고유 칸 아이콘: 모든 칸에 보이는 아이콘(빈 글자·잘림·진행도 겹침 없음) — 2-3 서리 협곡(미보유 보스 고유 🧙 · 별 만점 · 1.5% 천장 진행도)
        pg.click('#stClose'); pg.wait_for_timeout(200)
        J(pg, "()=>{ G.gear.Acc.update(d=>{ d.st['2-1']=3; d.st['2-2']=3; d.st['2-3']=1; d.uqPity={...(d.uqPity||{}), s_acc:6}; return d; }); G.stageSel.openStageSel(); }"); pg.wait_for_timeout(300)
        pg.click('.chtab[data-c="2"]'); pg.click('.snode[data-id="2-3"]'); pg.wait_for_timeout(300)
        UQV = r"""()=>[...document.querySelectorAll('#stInfo .dru')].map(b=>{ const r=b.getBoundingClientRect(), ic=b.querySelector('.ic'), sm=b.querySelector('small'), a=ic.getBoundingClientRect(), t=sm.getBoundingClientRect(), f=getComputedStyle(ic).filter;
          const br=/brightness\(([\d.]+)\)/.exec(f), op=/opacity\(([\d.]+)\)/.exec(f); let o=1; for (let x=ic; x; x=x.parentElement) o*=+getComputedStyle(x).opacity; if (op) o*=+op[1];
          const inside=q=>q.left>=r.left-.5&&q.right<=r.right+.5&&q.top>=r.top-.5&&q.bottom<=r.bottom+.5;
          return { k:b.dataset.k, ic:ic.textContent.trim(), tag:sm.textContent.trim(), icIn:inside(a)&&ic.scrollWidth<=ic.clientWidth+1, tagIn:inside(t)&&sm.scrollWidth<=sm.clientWidth+1, sep:a.bottom<=t.top+1, o:Math.round(o*100)/100, br:br?+br[1]:1, w:Math.round(r.width), h:Math.round(r.height) }; })"""
        uv = J(pg, UQV)
        ok(f'{tag}_unique_icons_visible', len(uv) == 3 and all(u['ic'] and u['ic'] != '?' and u['icIn'] and u['o'] >= .5 and u['br'] >= .8 for u in uv), uv)
        ok(f'{tag}_unique_progress_readable', all(u['tag'] and u['tagIn'] and u['sep'] for u in uv) and any('/' in u['tag'] for u in uv), [(u['k'], u['tag'], u['tagIn'], u['sep']) for u in uv])
        if tag == '1024x600': ok(f'{tag}_unique_touch_44', all(u['w'] >= 44 and u['h'] >= 44 for u in uv), [(u['w'], u['h']) for u in uv])
        if tag == '1024x600' and (SHOTS or '--uq-shot' in sys.argv):
            J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(200); pg.screenshot(path=f'{OUT}/stage_unique_fix.png'); J(pg, "()=>G.pauseRender=false")
        # 고유 툴팁: 아이콘 = 안전한 이모지(🪄 U+1FA84 Windows 10 두부 회귀), 45° UNIQUE 리본이 이름·부제와 겹치지 않음 (글라시아 + 가장 긴 이름 노블레스)
        RIB = r"""()=>{ const t=document.querySelector('#itemTip .icard.uq'); if(!t) return null; const rib=t.querySelector('.uqRib'), cs=getComputedStyle(t), cr=t.getBoundingClientRect();
          const x0=cr.left+parseFloat(cs.borderLeftWidth)+rib.offsetLeft, y0=cr.top+parseFloat(cs.borderTopWidth)+rib.offsetTop, w=rib.offsetWidth, h=rib.offsetHeight, cx=x0+w/2, cy=y0+h/2, m=new DOMMatrix(getComputedStyle(rib).transform);
          const P=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>[cx+m.a*x+m.c*y, cy+m.b*x+m.d*y]);
          const axes=[[1,0],[0,1],[m.a,m.b],[m.c,m.d]], proj=(pts,[ax,ay])=>{ const v=pts.map(([x,y])=>x*ax+y*ay); return [Math.min(...v), Math.max(...v)]; };
          const hit=r=>{ const R=[[r.left,r.top],[r.right,r.top],[r.right,r.bottom],[r.left,r.bottom]]; return axes.every(a=>{ const [a0,a1]=proj(P,a), [b0,b1]=proj(R,a); return a1>b0+.5 && b1>a0+.5; }); };
          const rects=el=>{ const rg=document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter(r=>r.width>0); };
          const out=[]; for (const sel of ['.uqn','.ig','.ic']) for (const r of rects(t.querySelector('.ih '+sel))) out.push({ sel, hit:hit(r), inCard:r.right<=cr.right-2&&r.left>=cr.left, r:[Math.round(r.left-cr.left),Math.round(r.top-cr.top),Math.round(r.right-cr.left),Math.round(r.bottom-cr.top)] });
          return { lines:out, name:t.querySelector('.uqn').textContent, ic:t.querySelector('.ih .ic').firstChild.textContent, w:Math.round(cr.width), fits:cr.right<=innerWidth+1&&cr.bottom<=innerHeight+1&&cr.left>=-1&&cr.top>=-1 }; }"""
        pg.hover('#stInfo .dru[data-k="s_staff"]'); pg.wait_for_timeout(250)
        rb = J(pg, RIB); ok(f'{tag}_uq_tip_staff_icon', rb and rb['ic'] == '🧙' and '글라시아' in rb['name'], rb and (rb['ic'], rb['name']))
        ok(f'{tag}_uq_tip_ribbon_clear', rb and rb['lines'] and not any(l['hit'] for l in rb['lines']) and all(l['inCard'] for l in rb['lines']), rb)
        shot(pg, f'{OUT}/tip_s_staff_{tag}.png')
        J(pg, """async()=>{ const g=await import(new URL('src/ui/gear.js', document.baseURI).href); const el=document.querySelector('#stInfo .dru[data-k="s_staff"]'); g.showTip(el, g.card({...G.gear.E.makeUnique('r_guns'), a:2, e:5})); }"""); pg.wait_for_timeout(200)
        rb = J(pg, RIB); ok(f'{tag}_uq_tip_long_name_clear', rb and '노블레스' in rb['name'] and not any(l['hit'] for l in rb['lines']) and all(l['inCard'] for l in rb['lines']) and rb['fits'], rb)
        shot(pg, f'{OUT}/tip_long_{tag}.png')
        # U-10: 화면 오른쪽 아래 구석 요소의 툴팁도 화면 안 (왼쪽·위로 뒤집기)
        tf = J(pg, """async()=>{ const g=await import(new URL('src/ui/gear.js', document.baseURI).href); const d=document.createElement('div'); d.style.cssText='position:fixed;right:4px;bottom:4px;width:40px;height:40px'; document.body.appendChild(d);
          g.showTip(d, g.card({...G.gear.E.makeUnique('r_guns'), a:2, e:5})); const r=document.getElementById('itemTip').getBoundingClientRect(); d.remove(); return {l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom),vw:innerWidth,vh:innerHeight}; }""")
        ok(f'{tag}_u10_tip_in_view', tf['l'] >= 0 and tf['t'] >= 0 and tf['r'] <= tf['vw'] and tf['b'] <= tf['vh'], tf)
        pg.mouse.move(5, 5); J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); pg.wait_for_timeout(100)
        pg.click('.chtab[data-c="0"]'); pg.wait_for_timeout(200); ok(f'{tag}_challenge_milestones', pg.locator('#stMap .chalMs .msC').count() == 3 and pg.locator('#stMap .chalMs .msC.have').count() == 1, pg.inner_text('#stMap .chalMs').replace('\n', ' '))
        if tag == 'desktop': shot(pg, f'{OUT}/stage_challenge.png')
        J(pg, "()=>{ document.getElementById('stagePanel').classList.add('hidden'); }"); pg.wait_for_timeout(100)
        # 가방: 고유 카드
        J(pg, "()=>G.gear.openInv()"); pg.wait_for_timeout(300)
        uid = 'u_f_bow'; ok(f'{tag}_unique_tile', pg.locator(f'#invGrid .itile[data-id="{uid}"].uq').count() == 1 and pg.locator(f'#invGrid .itile[data-id="{uid}"] .uqb').count() == 1)
        pg.click(f'#invGrid .itile[data-id="{uid}"]'); pg.wait_for_timeout(150); d = pg.inner_text('#invDetail')
        ok(f'{tag}_unique_card', '고유' in d and '뿌리 감옥' in d and 'undefined' not in d and '★' in d, d[:140].replace('\n', ' | '))
        pf = J(pg, f"()=>({FITS})('#invPanel')"); ok(f'{tag}_inv_fits', all(pf[:4]), pf)
        if tag == 'desktop': pg.mouse.move(5, 5); J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); shot(pg, f'{OUT}/unique_card.png', '#invPanel')
        # 도감
        pg.click('#invTabs .ftab[data-v="codex"]'); pg.wait_for_timeout(200)
        ok(f'{tag}_codex_open', not hidden(pg, 'codexBody') and hidden(pg, 'invMidW') and pg.locator('#codexBody .cxC').count() >= 25, pg.locator('#codexBody .cxC').count())
        seen = pg.locator('#codexBody .cxC.seen').count(); ok(f'{tag}_codex_seen', seen >= 5, seen)
        ok(f'{tag}_codex_claim_btn', pg.locator('#codexBody .cxGet').count() >= 1 and '!' in pg.inner_text('#invTabs') or pg.locator('#invTabs .nb, #invTabs i').count() >= 1)
        cf = J(pg, f"()=>({FITS})('#invPanel')"); co = J(pg, f"()=>({OVER})('#codexBody')"); ok(f'{tag}_codex_fits', all(cf[:4]) and co[1] <= 1, (cf, co))
        if tag == 'desktop':
            shot(pg, f'{OUT}/codex.png', '#invPanel')
            c0 = J(pg, "()=>G.gear.Acc.load().mat.crystal"); pg.click('#codexBody .cxGet >> nth=0'); pg.wait_for_timeout(200)
            c1 = J(pg, "()=>G.gear.Acc.load().mat.crystal"); ok('codex_claim_reward', c1 == c0 + 5 and pg.locator('#codexBody .cxGet').count() == 0, (c0, c1))
            J(pg, "()=>G.gear.Acc.update(d=>d)"); c2 = J(pg, "()=>{ const {Acc,P}=G.gear; let r; Acc.update(d=>{ const o=P.claimCodex(d,'1:archer'); r=o[1]; return o[0]; }); return [r, Acc.load().mat.crystal]; }")
            ok('codex_claim_once', not c2[0] and c2[1] == c1, c2)
            pg.click('#codexBody .cxTabs .ftab[data-c="0"]'); pg.wait_for_timeout(200); ok('codex_unique_tab', pg.locator('#codexBody .uqCell').count() == J(pg, "()=>import('./src/data/items.js').then(m=>m.UQ_KEYS.length)") and pg.locator('#codexBody .uqCell.have').count() == 2, pg.locator('#codexBody .uqCell.have').count())
            shot(pg, f'{OUT}/codex_unique.png', '#invPanel')
            # 3장(화산): 일반 등급은 정상 경로로 안 나옴 → 행 4칸·챕터 (보이는 영웅+2)×4칸, 일반 칸은 '—'(na). 고급~전설 4개면 행 완성 · 관리자 우편식 일반 등록은 extra 로 유지
            J(pg, "()=>{ const {Acc,E}=G.gear; Acc.update(d=>{ let q=9; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; for (let g=1; g<5; g++) d.inv.push(E.makeItem('weapon','archer',g,r,3)); d.codex[3]={...(d.codex[3]||{}), armor:1}; return d; }); }")
            pg.click('#codexBody .cxTabs .ftab[data-c="3"]'); pg.wait_for_timeout(250)
            cx3 = J(pg, "()=>({ tab: document.querySelector('#codexBody .cxTabs .ftab[data-c=\"3\"]').textContent, foot: document.querySelector('#codexBody .cxFoot').textContent, na: document.querySelectorAll('#codexBody .cxC.na').length, naSeen: document.querySelectorAll('#codexBody .cxC.na.seen').length, get: [...document.querySelectorAll('#codexBody .cxGet')].map(b=>b.dataset.k), st: (()=>{ const C=G.gear.P.codexState(G.gear.Acc.load(),3); return [C.seen,C.total,C.rows.find(x=>x.row==='archer').done]; })() })")
            # 기대 칸 수는 데이터에서: 행 = 보이는 영웅(숨긴 버들 제외) + 방어구 + 장신구, 칸 = obtainableGrades(3) (진서윤 추가로 6행 24칸 → 7행 28칸)
            ex3 = J(pg, "()=>Promise.all([import('./src/account/equip.js'), import('./src/data/heroes.js')]).then(([E, H]) => { const rows = H.VISIBLE_HEROES.length + 2, g = E.obtainableGrades(3); return { rows, ng: g.length, na: rows * (5 - g.length), total: rows * g.length }; })")
            T3 = f"4/{ex3['total']}"
            ok('codex_ch3_obtainable_only', ex3['ng'] == 4 and cx3['tab'].endswith(T3) and T3 in cx3['foot'] and cx3['na'] == ex3['na'] and cx3['naSeen'] == 1 and cx3['get'] == ['3:archer'] and cx3['st'] == [4, ex3['total'], True], (cx3, ex3))
            shot(pg, f'{OUT}/codex_ch3.png', '#invPanel')
            c3 = J(pg, "()=>G.gear.Acc.load().mat.crystal"); pg.click('#codexBody .cxGet[data-k="3:archer"]'); pg.wait_for_timeout(200); c4 = J(pg, "()=>G.gear.Acc.load().mat.crystal")
            ok('codex_ch3_claim', c4 == c3 + 5 and pg.locator('#codexBody .cxGet').count() == 0, (c3, c4))
        J(pg, "()=>G.gear.closeInv?G.gear.closeInv():document.getElementById('invPanel').classList.add('hidden')")
        # 대장간: 분해 목록에 고유 없음 · 각성
        J(pg, "()=>G.gear.openSmith()"); pg.wait_for_timeout(300)
        pg.click('#smTabs .ftab[data-t="dis"]'); pg.wait_for_timeout(150); ok(f'{tag}_dismantle_no_unique', pg.locator('#disGrid .itile.uq').count() == 0 and pg.locator('#disGrid .itile').count() >= 3)
        pg.click('#smTabs .ftab[data-t="awk"]'); pg.wait_for_timeout(150); ok(f'{tag}_awaken_list', pg.locator('#smBody .smList .itile').count() == 2)
        sf = J(pg, f"()=>({FITS})('#smithPanel')"); ok(f'{tag}_smith_fits', all(sf[:4]), sf)
        if tag == 'desktop':
            pg.click('#smBody .smList .itile[data-id="u_f_bow"]'); e0 = J(pg, "()=>G.gear.Acc.load().mat.essence"); pg.click('#awkGo'); pg.wait_for_timeout(200)
            st = J(pg, "()=>{ const s=G.gear.Acc.load(); return [s.inv.find(x=>x.id==='u_f_bow').a, s.mat.essence, s.souls]; }"); ok('awaken_ok', st[0] == 1 and st[1] == e0 - 3 and st[2] == 4800, (e0, st))
            shot(pg, f'{OUT}/awaken.png', '#smithPanel')
            pg.click('#smTabs .ftab[data-t="craft"]'); pg.wait_for_timeout(150); ok('craft_set_chips', pg.locator('#smBody .crSets .ftab').count() == 5 and pg.locator('#smBody .crSets .ftab:not([disabled])').count() == 2, pg.locator('#smBody .crSets .ftab:not([disabled])').count())
        c.close()
    ok('no_errors', not errs, errs[:5])
    n = sum(res.values()); print(f'{n}/{len(res)} ok' + ('' if n == len(res) else ' FAILED')); sys.exit(0 if n == len(res) else 1)
