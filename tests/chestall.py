#!/usr/bin/env python3
"""보상 상자 '모두 열기' 브라우저 테스트 (+ 스크린샷 shots/chest/).  python3 tests/chestall.py [--shots]
마을 🎁 보상 상자 버튼 → 보관함: 한 개씩 탭 열기 / 10개 열기 / 모두 열기 → 요약(등급순 격자, 영혼석 합계, 전설 반짝임),
가방 용량 초과 시 들어갈 만큼만 열고 '가방이 가득 찼어요' 알림, 더블 클릭해도 중복 보상 없음, 일괄 개봉은 저장 1회, 콘솔 오류 0."""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; srv, url = serve(); errs, res = [], {}
OUT = pathlib.Path(__file__).parent.parent / 'shots' / 'chest'
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
SEED = """([n, inv]) => { const {Acc,E}=G.gear; let q=11; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
  Acc.update(d=>{ d.inv=[]; d.chests=[]; d.eq={}; for (let i=0;i<inv;i++) d.inv.push(E.makeItem('armor','mage',0,r));
    const G5=[4,0,1,3,2,0,1,0,4,2,1,0,3,0,1,2,0,1,0,0]; E.addChests(d, Array.from({length:n}, (_,i)=>({ it:E.makeItem(E.SLOT_KEYS[i%3],'mage',G5[i%G5.length],r), src: i%5===0?'boss':i%7===0?'star':'chest' }))); return d; }); }"""
SAVES = "()=>{ if (!window.__sv) { window.__sv=0; const o=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='hd3d_save') window.__sv++; return o.call(this,k,v); }; } window.__sv=0; }"
def shot(pg, name):
    if not SHOTS: return
    OUT.mkdir(parents=True, exist_ok=True); J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(300); pg.screenshot(path=str(OUT / name)); J(pg, "()=>G.pauseRender=false")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for vp, touch in [({'width': 1440, 'height': 860}, False), ({'width': 1024, 'height': 600}, True)]:
        tag = f"{vp['width']}x{vp['height']}"
        c = b.new_context(viewport=vp, has_touch=touch, is_mobile=False, device_scale_factor=1); c.add_init_script(MOCK); pg = c.new_page()
        pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
        pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
        pg.mouse.click(500, 300); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
        J(pg, "()=>G.gear.Acc.update(d=>({...d, souls:1000, stats:{runs:1,kills:1,waves:1,souls:1}}))")
        pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(1200)
        ok(f'{tag}_no_chest_btn_when_empty', hidden(pg, 'twChest'))
        # 1) 상자 14개 + 가방 30칸 사용 → 모두 열기는 10개만 (용량 40)
        pg.evaluate(SEED, [14, 30]); pg.wait_for_timeout(200)
        ok(f'{tag}_chest_btn', not hidden(pg, 'twChest') and pg.inner_text('#twChestN') == '14')
        pg.click('#twChest'); pg.wait_for_timeout(900)
        ok(f'{tag}_overlay_bar', not hidden(pg, 'chestOv') and pg.locator('#cbAll').count() == 1 and pg.locator('#cbTen').count() == 1 and '14' in pg.inner_text('#cbBar'))
        bb = [pg.locator(s).bounding_box() for s in ['#cbAll', '#cbTen', '#cbLater']]
        ok(f'{tag}_buttons_44px', all(x and x['height'] >= 44 and x['width'] >= 44 and x['x'] + x['width'] <= vp['width'] and x['y'] + x['height'] <= vp['height'] for x in bb), bb)
        st = J(pg, "()=>{ const a=document.querySelector('.cvStage').getBoundingClientRect(), b=document.getElementById('cbBar').getBoundingClientRect(); return a.right<=b.left || a.bottom<=b.top; }"); ok(f'{tag}_bar_not_over_chest', st)
        ok(f'{tag}_not_auto_opened', J(pg, "()=>G.gear.Acc.load().chests.length") == 14)
        if tag == '1440x860': shot(pg, 'open_all_button.png')
        if tag == '1024x600': shot(pg, 'open_all_button_tablet.png')
        s0 = J(pg, "()=>G.gear.Acc.load()"); exp = sum(c['souls'] for c in s0['chests'][:10]); J(pg, SAVES)
        if touch:
            pg.tap('#cbAll')
            try: pg.tap('#cbAll', force=True, no_wait_after=True, timeout=1500)  # 연타 — 첫 탭에 버튼이 사라졌으면(정상) 무시
            except Exception: pass
        else: pg.dblclick('#cbAll')
        J(pg, "()=>{ const b=document.getElementById('cbAll'); if (b) { b.disabled=false; b.click(); b.click(); } }")  # 비활성화를 우회한 연타도 무시돼야 함
        pg.wait_for_selector('#cbSum', timeout=20000); pg.wait_for_timeout(2600)
        s1 = J(pg, "()=>G.gear.Acc.load()"); ids = [x['id'] for x in s1['inv']]
        ok(f'{tag}_capacity_respected', len(s1['inv']) == 40 and len(s1['chests']) == 4, (len(s1['inv']), len(s1['chests'])))
        ok(f'{tag}_no_duplicates', len(set(ids)) == len(ids) and not set(ids) & {c['it']['id'] for c in s1['chests']})
        ok(f'{tag}_souls_once', s1['souls'] == s0['souls'] + exp, (s0['souls'], exp, s1['souls']))
        ok(f'{tag}_single_save', J(pg, "()=>window.__sv") == 1, J(pg, "()=>window.__sv"))
        txt = pg.inner_text('#cbSum'); tiles = J(pg, "()=>[...document.querySelectorAll('#cbGrid .sumT')].map(e=>+[...e.classList].find(c=>/^g\\d$/.test(c)).slice(1))")
        ok(f'{tag}_summary_count', len(tiles) == 10 and '상자 10개' in txt, (len(tiles), txt[:60]))
        ok(f'{tag}_summary_sorted', tiles == sorted(tiles, reverse=True), tiles)
        ok(f'{tag}_summary_no_undefined', 'undefined' not in txt and 'NaN' not in txt and 'null' not in txt and 'undefined' not in pg.inner_html('#cbSum'))
        ok(f'{tag}_summary_souls', f'+{exp}' in txt and '영혼석' in txt)
        ok(f'{tag}_full_notice', '가방이 가득 찼어요' in txt and pg.locator('#cbSmith').count() == 1)
        ok(f'{tag}_legend_sparkle', tiles[0] == 4 and pg.locator('#cbGrid .sumT.g4 .spk').count() >= 3 and J(pg, "()=>getComputedStyle(document.querySelector('#cbGrid .sumT.g4')).animationName.includes('legendGlow')"))
        ok(f'{tag}_epic_flash', J(pg, "()=>{ const e=document.querySelector('#cbGrid .sumT.g3'); return !e || getComputedStyle(e).animationName.includes('epicPop'); }"))
        pg.wait_for_function("()=>{ const e=document.getElementById('cbSum'); return e && !e.getAnimations().some(a=>a.playState==='running' && a.animationName==='sumIn'); }", timeout=10000)  # 등장 애니메이션(scale) 중엔 크기가 작게 잡힘
        fi = J(pg, "()=>{ const r=document.getElementById('cbSum').getBoundingClientRect(); const k=document.getElementById('cbOk').getBoundingClientRect(); return [r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&k.bottom<=innerHeight&&k.height>=44, [r.left,r.top,r.right,r.bottom,k.bottom,k.height,innerWidth,innerHeight].map(Math.round)]; }"); ok(f'{tag}_summary_fits', fi[0], fi[1])
        (pg.tap if touch else pg.click)('#cbGrid .sumT >> nth=0'); pg.wait_for_timeout(200)
        if tag == '1440x860': ok(f'{tag}_tile_detail', '전설' in pg.inner_text('#cbDetail')); shot(pg, 'open_all_summary.png')
        else: shot(pg, 'open_all_summary_tablet.png')
        (pg.tap if touch else pg.click)('#cbOk'); pg.wait_for_timeout(300)
        ok(f'{tag}_closed', hidden(pg, 'chestOv') and pg.inner_text('#twChestN') == '4')
        # 2) 가득 찬 가방: 상자 버튼 → 탭해도 열리지 않음 + 알림
        pg.click('#twChest'); pg.wait_for_timeout(700); (pg.tap if touch else pg.click)('.cvStage', force=True); pg.wait_for_timeout(900)
        ok(f'{tag}_full_tap_blocked', J(pg, "()=>G.gear.Acc.load().chests.length") == 4 and '가방이 가득 찼어요' in pg.inner_text('#chestOv'))
        pg.click('#cbLater'); pg.wait_for_timeout(200); ok(f'{tag}_later_closes', hidden(pg, 'chestOv'))
        # 3) 공간 확보 → 한 개씩 탭 열기 (기존 흐름) → 남은 3개 모두 열기
        J(pg, "()=>G.gear.Acc.update(d=>{ d.inv=d.inv.slice(0,20); return d; })"); pg.click('#twChest'); pg.wait_for_timeout(700)
        ok(f'{tag}_no_ten_when_few', pg.locator('#cbTen').count() == 0 and pg.locator('#cbAll').count() == 1)
        (pg.tap if touch else pg.click)('.cvStage', force=True)
        try: pg.wait_for_function("()=>document.querySelector('.cvStage.open') && G.gear.Acc.load().chests.length===3", timeout=10000)
        except Exception: pass
        s2 = J(pg, "()=>G.gear.Acc.load()"); ok(f'{tag}_single_open', len(s2['chests']) == 3 and len(s2['inv']) == 21 and 'undefined' not in pg.inner_text('#chestOv'), (len(s2['chests']), len(s2['inv']), pg.inner_text('#chestOv')[:80]))
        (pg.tap if touch else pg.click)('#cbAll'); pg.wait_for_selector('#cbSum', timeout=20000); pg.wait_for_timeout(600)
        ok(f'{tag}_open_rest', pg.locator('#cbGrid .sumT').count() == 3 and J(pg, "()=>G.gear.Acc.load().chests.length") == 0 and '가득' not in pg.inner_text('#cbSum'))
        pg.click('#cbOk'); pg.wait_for_timeout(300); ok(f'{tag}_btn_hidden_after', hidden(pg, 'chestOv') and hidden(pg, 'twChest'))
        # 4) 10개 열기
        pg.evaluate(SEED, [23, 0]); pg.click('#twChest'); pg.wait_for_timeout(600); (pg.tap if touch else pg.click)('#cbTen'); pg.wait_for_selector('#cbSum', timeout=20000); pg.wait_for_timeout(400)
        ok(f'{tag}_open_ten', pg.locator('#cbGrid .sumT').count() == 10 and J(pg, "()=>G.gear.Acc.load().chests.length") == 13 and pg.locator('#cbMore').count() == 1)
        pg.click('#cbMore'); pg.wait_for_timeout(400); ok(f'{tag}_more_back_to_chests', pg.locator('#cbAll').count() == 1 and '13' in pg.inner_text('#cbBar'))
        pg.click('#cbAll'); pg.wait_for_selector('#cbSum', timeout=20000); pg.wait_for_timeout(300); ok(f'{tag}_open_all_13', pg.locator('#cbGrid .sumT').count() == 13); pg.click('#cbOk')
        # 6) 고유 아이템이 섞인 모두 열기: 고유 타일이 보이고(opacity 1·청록 테두리·아이콘) '고유 N' 칩이 따로 나와야 함 (.itile.uq 의 animation 이 tileIn 을 덮어써 투명하던 회귀)
        J(pg, """()=>{ const {Acc,E}=G.gear; let q=7; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
          Acc.update(d=>{ d.inv=[]; d.chests=[]; d.eq={}; if (d.uqLog) delete d.uqLog.s_staff; E.addChests(d, [1,1,1,2,3,3,4].map(g=>({ it:E.makeItem('weapon','archer',g,r), src:'chest' }))); E.grantUnique(d, 's_staff'); return d; }); }""")
        pg.click('#twChest'); pg.wait_for_timeout(600); (pg.tap if touch else pg.click)('#cbAll'); pg.wait_for_selector('#cbSum', timeout=20000)
        pg.wait_for_function("()=>{ const g=document.getElementById('cbGrid'); return g && g.querySelector('.sumT') && !g.getAnimations({subtree:true}).some(a=>a.animationName==='tileIn' && a.playState!=='finished'); }", timeout=20000); pg.wait_for_timeout(200)  # 등장(tileIn) 끝까지
        uq = J(pg, """()=>{ const e=document.querySelector('#cbGrid .sumT.uq'); if (!e) return null; const cs=getComputedStyle(e), ic=e.querySelector('.ic'), r=e.getBoundingClientRect();
          return { op:+cs.opacity, anim:cs.animationName, ic:(ic&&ic.textContent||'').trim(), icOp:ic?+getComputedStyle(ic).opacity:0, w:r.width, h:r.height, bg:cs.backgroundImage.includes('linear-gradient'), n:document.querySelectorAll('#cbGrid .sumT').length,
            vis:[...document.querySelectorAll('#cbGrid .sumT')].filter(t=>+getComputedStyle(t).opacity>.9).length, chips:[...document.querySelectorAll('#cbSum .gcn')].map(c=>c.textContent.trim()) }; }""")
        ok(f'{tag}_unique_tile_visible', uq and uq['op'] > .9 and uq['icOp'] > .9 and uq['ic'] and uq['ic'] != '?' and uq['w'] >= 30 and uq['h'] >= 30 and uq['bg'] and 'tileIn' in uq['anim'] and 'uqGlow' in uq['anim'], uq)
        ok(f'{tag}_unique_all_tiles_visible', uq and uq['n'] == 8 and uq['vis'] == 8, uq and (uq['n'], uq['vis']))
        ok(f'{tag}_unique_chip', uq and '고유 1' in uq['chips'] and '전설 1' in uq['chips'] and sum(int(c.split()[-1]) for c in uq['chips']) == 8, uq and uq['chips'])
        ok(f'{tag}_unique_tile_icon_safe', uq and uq['ic'] == '🧙', uq and uq['ic'])  # 글라시아: 🪄(U+1FA84) 는 Windows 10 에서 두부 → 🧙
        pg.click('#cbGrid .sumT.uq'); pg.wait_for_timeout(250); ok(f'{tag}_unique_detail_card', '글라시아' in pg.inner_text('#cbDetail') and pg.locator('#cbDetail .icard.uq .uqRib').count() == 1, pg.inner_text('#cbDetail')[:60])
        pg.mouse.move(5, 5); J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); pg.wait_for_timeout(150)  # 요약 + 아래 상세 카드가 보이게 (마우스 툴팁 숨김)
        if tag == '1024x600' and (SHOTS or '--uq-shot' in sys.argv):
            d = OUT.parent / 'items'; d.mkdir(parents=True, exist_ok=True); J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(300); pg.screenshot(path=str(d / 'chest_unique_fix.png')); J(pg, "()=>G.pauseRender=false")
        pg.click('#cbOk'); pg.wait_for_timeout(300)
        # 5) 새로고침 후 저장 유지
        before = J(pg, "()=>JSON.stringify(G.gear.P.clean(G.gear.Acc.load()))"); pg.reload(); pg.wait_for_function("()=>window.G&&G.ready&&G.screen", timeout=60000)
        ok(f'{tag}_save_roundtrip', J(pg, "()=>JSON.stringify(G.gear.P.clean(G.gear.Acc.load()))") == before)
        c.close()
    b.close()
print('errors', errs); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
