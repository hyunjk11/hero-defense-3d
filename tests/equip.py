#!/usr/bin/env python3
"""장비/대장간/보상 상자 브라우저 테스트 (+ 스크린샷).  python3 tests/equip.py [--shots]"""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js: pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=120000)
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300)
    # 구버전 저장(장비 필드 없음)도 그대로 로드
    J(pg, "()=>{ const {Acc}=G.gear; Acc.update(d=>{ const o={...d}; delete o.inv; delete o.eq; delete o.mat; return {...o, souls: 5000, stats:{runs:1,kills:1,waves:1,souls:1}}; }); }")
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=20000); pg.wait_for_timeout(1500)
    ok('old_save_loads', J(pg, "()=>{ const s=G.gear.Acc.load(); return Array.isArray(s.inv) && s.inv.length===0 && s.mat.steel===0 && s.souls===5000 }"))
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=1; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.mat={steel:400,crystal:40}; d.hero='mage';
        d.inv.push({...E.makeItem('weapon','mage',4,r), id:'wpn1'}, {...E.makeItem('armor','mage',3,r), id:'arm1'}, {...E.makeItem('acc','mage',2,r), id:'acc1'}, {...E.makeItem('weapon','archer',1,r), id:'arw1'});
        for (let i=0;i<8;i++) d.inv.push(E.makeItem(['weapon','armor','acc'][i%3], ['mage','archer','warrior'][i%3], i%3, r)); return d; }); }""")
    pg.click('#twBag'); pg.wait_for_timeout(300); ok('inv_opens', not hidden(pg, 'invPanel') and pg.locator('#invGrid .itile').count() == 12)
    for id in ['wpn1', 'arm1', 'acc1']:
        pg.click(f'#invGrid .itile[data-id="{id}"]'); pg.click('#invEq'); pg.wait_for_timeout(100)
    # Q-8 장착 버튼 옆 전투력 변화: 장착 중 무기(wpn1, 전설) 대비 다른 마법사 무기 → 음수
    alt = J(pg, "()=>{ const s=G.gear.Acc.load(); const x=s.inv.find(i=>i.s==='weapon'&&i.h==='mage'&&i.id!=='wpn1'); return x ? x.id : null }")
    if alt:
        pg.click(f'#invGrid .itile[data-id="{alt}"]'); pl = J(pg, f"()=>{{ const s=G.gear.Acc.load(), E=G.gear.E, a=s.inv.find(i=>i.id==='wpn1'), b=s.inv.find(i=>i.id==='{alt}'), l=document.querySelector('#invDetail .acts .pwrLine'); return [l?l.innerText:'', E.power(a), E.power(b)] }}")
        ok('q8_equip_power_delta', f'{pl[1]} → {pl[2]}' in pl[0] and f'({pl[2] - pl[1]})' in pl[0].replace('(+', '('), pl)
    pg.click('#invGrid .itile[data-id="arw1"]'); ok('other_hero_weapon_blocked', '전용' in pg.inner_text('#invDetail'))
    b0 = J(pg, "()=>G.gear.E.bonus(G.gear.Acc.load(),'mage')"); ok('equip_bonus', b0.get('atk', 0) >= 25 and b0.get('hp', 0) >= 24, b0)
    ok('bonus_shown', '공격력' in pg.inner_text('#invBonus') and '공격력' in pg.inner_text('#twBonus'))
    pg.hover('#invGrid .itile[data-id="arm1"]'); pg.wait_for_timeout(150); ok('tooltip', not hidden(pg, 'itemTip'))
    if SHOTS: pg.click('#invGrid .itile[data-id="arw1"]'); pg.mouse.move(5, 5); pg.wait_for_timeout(300); pg.screenshot(path='inventory.png')
    # 총사(로즈) 전설 쌍권총: SQL로 직접 넣은 모양 그대로 → 가방 어디에도 'undefined' 없음 (아이콘 누락 회귀)
    J(pg, """()=>{ const {Acc}=G.gear; Acc.update(d=>{ d.hero='gunner';
        d.inv.push({id:'gun4', s:'weapon', h:'gunner', g:4, n:'심홍의 쌍권총 블러디로즈', m:['atk',25], sub:[['crit',8],['spd',9]], e:0, u:'rosebarrage'},
                   {id:'gun1', s:'weapon', h:'gun', g:1, n:'은탄 쌍권총', m:['atk',9], sub:[['crit',4]], e:0},
                   {id:'zzz1', s:'weapon', h:'gunner', g:2, n:'황혼의 쌍권총', m:['atk',13], sub:[], e:0});
        d.eq.gunner={weapon:'gun4'}; return d; }); }""")
    pg.click('#invClose'); pg.wait_for_timeout(150); pg.click('#twBag'); pg.wait_for_timeout(200)
    gl = J(pg, "()=>G.gear.Acc.load().inv.filter(x=>x.s==='weapon'&&x.h==='gunner').map(x=>x.id).sort()")
    ok('gun_items_kept_and_alias', gl == ['gun1', 'gun4', 'zzz1'], gl)
    pg.click('#invGrid .itile[data-id="gun4"]'); pg.wait_for_timeout(150)
    txt = J(pg, "()=>document.getElementById('invPanel').innerText")
    ok('gun_no_undefined', 'undefined' not in txt and '🔫' in J(pg, "()=>document.querySelector('#invSlots .slot[data-sl=\"weapon\"] .ic').textContent"), txt.count('undefined'))
    ok('gun_detail', '🔫' in pg.inner_text('#invDetail .ic') and '총사 전용' in pg.inner_text('#invDetail') and '장미 탄막' in pg.inner_text('#invDetail'))
    ok('gun_legend_bonus', J(pg, "()=>G.gear.E.legendOf(G.gear.Acc.load(),'gunner')") == 'rosebarrage')
    ok('unknown_icon_fallback', J(pg, "async()=>{ const m=await import('./src/ui/gear.js'); return [m.icon({s:'weapon',h:'nope'}), m.icon({s:'weird'}), m.icon(null)].join('') }") == '⚔️📦📦')
    if SHOTS: os.makedirs('shots/shop', exist_ok=True); pg.mouse.move(5, 5); J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); pg.wait_for_timeout(300); pg.locator('#invPanel').screenshot(path='shots/shop/gun_gear.png')
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.hero='mage'; d.inv=d.inv.filter(x=>!['gun4','gun1','zzz1'].includes(x.id)); delete d.eq.gunner.weapon; return d; }); }")
    # 메카닉(버들) 전설 건틀릿: SQL 모양 + 별칭 h('버들', 'robot') → 아이콘 🛠️ · '메카닉 전용' · 고유 스킬 이름, undefined 없음
    J(pg, """()=>{ const {Acc}=G.gear; Acc.update(d=>{ d.hero='mechanic';
        d.inv.push({id:'mec4', s:'weapon', h:'mechanic', g:4, n:'버들의 개조암 그린기어', m:['atk',25], sub:[['hp',10],['spd',9]], e:0, u:'gigahammer'},
                   {id:'mec1', s:'weapon', h:'버들', g:1, n:'증기 해머 건틀릿', m:['atk',9], sub:[['crit',4]], e:0},
                   {id:'mec2', s:'weapon', h:'robot', g:2, n:'덩굴 드릴암', m:['atk',13], sub:[], e:0});
        d.eq.mechanic={weapon:'mec4'}; return d; }); }""")
    pg.wait_for_timeout(300)
    ml = J(pg, "()=>G.gear.Acc.load().inv.filter(x=>x.s==='weapon'&&x.h==='mechanic').map(x=>x.id).sort()")
    ok('mech_items_kept_and_alias', ml == ['mec1', 'mec2', 'mec4'], ml)
    pg.click('#invGrid .itile[data-id="mec4"]'); pg.wait_for_timeout(150)
    txt = pg.inner_text('#invPanel'); ok('mech_no_undefined', 'undefined' not in txt and '🛠️' in J(pg, "()=>document.querySelector('#invGrid .itile[data-id=\"mec4\"] .ic').textContent"), txt.count('undefined'))
    ok('mech_detail', '🛠️' in pg.inner_text('#invDetail .ic') and '기가 해머 낙하' in pg.inner_text('#invDetail'), pg.inner_text('#invDetail')[:200])
    ok('mech_legend', J(pg, "()=>G.gear.E.legendOf(G.gear.Acc.load(),'mechanic')") == 'gigahammer')
    # 장비 id 는 세이브(사용자 쓰기 가능)에서 오므로 data-id 속성에 이스케이프해서 넣어야 함 (HTML 주입 방지)
    J(pg, """()=>{ G.gear.Acc.update(d=>{ d.inv.push({id:'\"><i id=pwn></i>', s:'armor', g:1, n:'<b id=pwn2>x</b>', m:['hp',5], sub:[], e:0}); return d; }); G.gear.refreshGear && G.gear.refreshGear(); }""")
    pg.click('#invClose'); pg.wait_for_timeout(100); J(pg, "()=>G.gear.openInv()"); pg.wait_for_timeout(300)
    ok('item_id_name_escaped', J(pg, "()=>!document.getElementById('pwn') && !document.getElementById('pwn2') && [...document.querySelectorAll('#invGrid .itile')].some(b=>b.dataset.id==='\"><i id=pwn></i>')"))
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.inv=d.inv.filter(x=>x.id!=='\"><i id=pwn></i>'); return d; }); }")
    if SHOTS: os.makedirs('shots/budeul', exist_ok=True); pg.mouse.move(5, 5); J(pg, "()=>document.getElementById('itemTip').classList.add('hidden')"); pg.wait_for_timeout(300); pg.locator('#invPanel').screenshot(path='shots/budeul/mech_gear.png')
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.hero='mage'; d.inv=d.inv.filter(x=>!['mec4','mec1','mec2'].includes(x.id)); delete d.eq.mechanic.weapon; return d; }); }")
    pg.click('#invClose')
    # 대장간: 걸어가면 열림
    J(pg, "()=>{ const [x,z]=G.townSmith(); G.townTeleport(x+5*.6+1.5, z+5*.8+1.5); G.townGoal(x+.6*3.3, z+.8*3.3); }")
    pg.wait_for_function("()=>!document.getElementById('smithPanel').classList.contains('hidden')", timeout=15000); ok('smith_opens_on_walk', True)
    pg.click('#smTabs .ftab[data-t="enh"]'); pg.click('.smList .itile[data-id="wpn1"]')
    s0 = J(pg, "()=>G.gear.Acc.load()")
    if SHOTS: J(pg, "()=>G.pauseRender=true")
    pg.click('#enhGo')
    if SHOTS: pg.wait_for_timeout(560); pg.screenshot(path='blacksmith.png'); J(pg, "()=>G.pauseRender=false")
    # 강화는 1초 연출 뒤 저장 → 고정 대기 대신 결과(lastEnh)가 나올 때까지 기다림 (느린 swiftshader에서 1.4초로는 부족했음)
    pg.wait_for_function("()=>G.gear.lastEnh()!==null", timeout=15000); pg.wait_for_timeout(100); s1 = J(pg, "()=>G.gear.Acc.load()"); w1 = [x for x in s1['inv'] if x['id'] == 'wpn1'][0]
    w0 = [x for x in s0['inv'] if x['id'] == 'wpn1'][0]
    ok('enhance_paid_and_leveled', w1['e'] == w0['e'] + 1 and s1['souls'] == s0['souls'] - 20 * (w0['e'] + 1) * 3 and s1['mat']['steel'] == s0['mat']['steel'] - 2 - 2 * w0['e'], (w0['e'], w1['e'], s0['souls'], s1['souls']))
    ok('enhance_result_msg', '성공' in pg.inner_text('#enhRes'))
    pw = J(pg, "()=>{ const s=G.gear.Acc.load(), it=s.inv.find(x=>x.id==='wpn1'), E=G.gear.E, l=document.querySelector('.enhInfo .pwrLine'); return [l ? l.innerText : '', E.power(it), E.power({...it, e: it.e+1})] }")
    ok('q8_enh_power_preview', '강화 후 전투력' in pw[0] and f'{pw[1]} → {pw[2]}' in pw[0] and f'+{pw[2] - pw[1]}' in pw[0], pw)
    for _ in range(4): J(pg, "()=>G.gear.doEnhance('wpn1', true)"); pg.wait_for_timeout(80)
    pg.wait_for_timeout(400); pg.click('#smTabs .ftab[data-t="dis"]'); n0 = J(pg, "()=>G.gear.Acc.load().inv.length"); st0 = J(pg, "()=>G.gear.Acc.load().mat.steel")
    pg.click('.disBulk .ftab[data-g="0"]'); cnt = pg.locator('#disGrid .itile.pick').count(); ys = J(pg, "()=>{ const s=G.gear.Acc.load(); return [...document.querySelectorAll('#disGrid .itile.pick')].reduce((a,b)=>a+G.gear.E.dismantleYield(s.inv.find(x=>x.id===b.dataset.id)).steel,0) }"); pg.click('#disGo'); pg.wait_for_function(f"()=>G.gear.Acc.load().inv.length==={n0}-{cnt}", timeout=10000); pg.wait_for_timeout(200)
    s2 = J(pg, "()=>G.gear.Acc.load()"); ok('bulk_dismantle', cnt >= 1 and len(s2['inv']) == n0 - cnt and s2['mat']['steel'] == st0 + ys, (cnt, ys, st0, s2['mat']))
    ok('equipped_not_dismantled', all(any(x['id'] == i for x in s2['inv']) for i in ['wpn1', 'arm1', 'acc1']))
    # Q-9 '고급 이하 모두' = 등급 ≤1 전부 선택 (장착·고유 제외) · Q-10 가방 가득 → [분해하러 가기] = 대장간 분해 탭
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=11; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; Acc.update(d=>{ [0,1,2].forEach((g,i)=>d.inv.push({...E.makeItem('armor','archer',g,r), id:'q9g'+g})); return d; }); }""")
    pg.click('#smTabs .ftab[data-t="enh"]'); pg.click('#smTabs .ftab[data-t="dis"]'); pg.wait_for_timeout(200); pg.click('.disBulk .ftab[data-le="1"]')
    pk = J(pg, "()=>{ const s=G.gear.Acc.load(), pick=[...document.querySelectorAll('#disGrid .itile.pick')].map(b=>b.dataset.id), all=[...document.querySelectorAll('#disGrid .itile')].map(b=>s.inv.find(x=>x.id===b.dataset.id)); return [pick.sort().join(), all.filter(x=>x.g<=1).map(x=>x.id).sort().join(), pick.includes('q9g2')] }")
    ok('q9_le_select', pk[0] == pk[1] and 'q9g0' in pk[0] and 'q9g1' in pk[0] and not pk[2], pk)
    pg.click('.disBulk .ftab[data-g="x"]'); ok('q9_clear', pg.locator('#disGrid .itile.pick').count() == 0)
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=13; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; Acc.update(d=>{ let k=0; while (d.inv.length < E.CAP) d.inv.push({...E.makeItem('armor','archer',0,r), id:'q10f'+(k++)}); return d; }); G.gear.closeSmith(true); G.gear.openInv(); }"""); pg.wait_for_timeout(300)
    ok('q10_full_button', pg.locator('#invToDis').count() == 1 and pg.is_visible('#invToDis'))
    pg.click('#invToDis'); pg.wait_for_timeout(300)
    ok('q10_goes_dis_tab', not hidden(pg, 'smithPanel') and J(pg, "()=>document.querySelector('#smTabs .ftab.on').dataset.t") == 'dis' and pg.locator('#disGrid').count() == 1)
    J(pg, "()=>G.gear.Acc.update(d=>{ d.inv=d.inv.filter(x=>!/^q(9g|10f)/.test(x.id)); return d; })"); pg.click('#smTabs .ftab[data-t="enh"]'); pg.click('#smTabs .ftab[data-t="dis"]'); pg.wait_for_timeout(200)
    # Q-1 공용 확인창: 영웅 등급 분해 → #gConfirm (네이티브 confirm 아님) · Esc = 취소(대장간은 그대로) · Enter = 분해
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=7; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; Acc.update(d=>{ d.inv.push({...E.makeItem('armor','archer',3,r), id:'hi1'}); return d; }); }""")
    pg.click('#smTabs .ftab[data-t="enh"]'); pg.click('#smTabs .ftab[data-t="dis"]'); pg.wait_for_timeout(200); pg.click('#disGrid .itile[data-id="hi1"]'); pg.click('#disGo'); pg.wait_for_timeout(300)
    ok('q1_confirm_shown', not hidden(pg, 'gConfirm') and '1개' in pg.inner_text('#gConfirm') and J(pg, "()=>document.getElementById('gcOk').classList.contains('danger')"), pg.inner_text('#gConfirm') if J(pg, "()=>!!document.getElementById('gConfirm')") else 'no #gConfirm')
    os.makedirs('shots/improve', exist_ok=True); pg.screenshot(path='shots/improve/confirm_desktop.png')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('q1_esc_cancels_only_confirm', hidden(pg, 'gConfirm') and not hidden(pg, 'smithPanel') and J(pg, "()=>G.gear.Acc.load().inv.some(x=>x.id==='hi1')"))
    if not J(pg, "()=>!!document.querySelector('#disGrid .itile.pick[data-id=\"hi1\"]')"): pg.click('#disGrid .itile[data-id="hi1"]')
    pg.click('#disGo'); pg.wait_for_timeout(300); pg.keyboard.press('Enter'); pg.wait_for_function("()=>!G.gear.Acc.load().inv.some(x=>x.id==='hi1')", timeout=10000)
    ok('q1_enter_confirms', hidden(pg, 'gConfirm') and not hidden(pg, 'smithPanel'))
    pg.wait_for_timeout(600); s2 = J(pg, "()=>G.gear.Acc.load()")  # 제작 비교 기준 = 확인창 분해(hi1 → 강철·마력석 증가) 뒤 저장
    pg.click('#smTabs .ftab[data-t="craft"]'); pg.click('.crSlots .ftab[data-s="armor"]'); pg.click('.crGo[data-r="fine"]'); pg.wait_for_timeout(1500)
    s3 = J(pg, "()=>G.gear.Acc.load()"); ok('craft', len(s3['inv']) == len(s2['inv']) + 1 and s3['inv'][-1]['s'] == 'armor' and s3['inv'][-1]['g'] >= 1 and s3['mat']['crystal'] == s2['mat']['crystal'] - 2, (len(s2['inv']), len(s3['inv']), s3['inv'][-1], s2['mat'], s3['mat']))
    ok('craft_reveal', not hidden(pg, 'chestOv')); pg.click('.cvStage'); pg.wait_for_timeout(200); ok('reveal_closes', hidden(pg, 'chestOv'))
    J(pg, "()=>G.gear.closeSmith(true)")
    # 출정: 장비 보너스 적용
    eqb = J(pg, "()=>G.gear.E.bonus(G.gear.Acc.load(),'mage')")
    pg.click('#twGo'); pg.click('.chtab[data-c="0"]'); pg.click('#stChalGo'); pg.wait_for_function("()=>G.phase==='build'", timeout=15000)
    hp, dmg, rng = J(pg, "()=>[G.hero.max, G.hero.C.dmg, G.hero.C.range]")
    ok('hero_stats_with_equip', hp == round(330 * (1 + eqb.get('hp', 0) / 100)) and abs(dmg - 34 * (1 + eqb.get('atk', 0) / 100)) < 1e-6, (hp, dmg, eqb))
    # 보스 드롭 (강제) → 런 보상
    J(pg, "()=>{ G.forceDrop=true; const e=G.spawnEnemy('boss',1); G.hurt(e, 1e9, '#fff', false); }"); pg.wait_for_timeout(1500)
    ok('boss_drop', J(pg, "()=>G.runDrops.length") == 1)
    if SHOTS: pg.wait_for_timeout(500)
    print('phase', J(pg, "()=>[G.phase, getComputedStyle(document.getElementById('retreat')).display, document.getElementById('retreat').parentElement.id]")); J(pg, "()=>{ G.wave=10; G.phase='build'; document.getElementById('retreat').click(); document.getElementById('gcOk').click(); }"); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=60000)
    pg.wait_for_function("()=>!document.getElementById('chestOv').classList.contains('hidden')", timeout=40000) # 마을 로딩 + 0.6초 뒤 열림 (느린 swiftshader 에서 10초는 빠듯)
    s4 = J(pg, "()=>G.gear.Acc.load()"); ok('chests_and_drop_saved', len(s4['inv']) + len(s4['chests']) == len(s3['inv']) + 3 and len(s4['chests']) >= 1, (len(s4['inv']), len(s4['chests'])))
    if SHOTS: J(pg, "()=>G.pauseRender=true"); pg.wait_for_timeout(2400); pg.screenshot(path='chest.png'); J(pg, "()=>G.pauseRender=false")
    for _ in range(12):
        pg.wait_for_timeout(1000)
        if hidden(pg, 'chestOv'): break
        pg.click('.cvStage')
    ok('chests_opened_one_by_one', len(J(pg, "()=>G.gear.Acc.load().inv")) == len(s3['inv']) + 3 and J(pg, "()=>G.gear.Acc.load().chests.length") == 0)
    # 상자 보관함 변경 후: 결과 팝업은 '획득 장비' 대신 '획득 보상 상자 N개'를 보여 주고, 상자 화면을 닫은 뒤에 뜸
    pg.wait_for_function("()=>!document.getElementById('townPop').classList.contains('hidden')", timeout=10000)
    ok('results_popup_after_reveal', hidden(pg, 'chestOv') and not hidden(pg, 'townPop') and '무사히 귀환' in pg.inner_text('#townPop') and '보상 상자 3개' in pg.inner_text('#townPop'), pg.inner_text('#townPop')[:120])
    # 저장 왕복 (새로고침 후 동일)
    before = J(pg, "()=>JSON.stringify(G.gear.P.clean(G.gear.Acc.load()))"); pg.reload(); pg.wait_for_function("()=>window.G&&G.ready&&G.screen==='town'", timeout=60000)
    ok('save_roundtrip', J(pg, "()=>JSON.stringify(G.gear.P.clean(G.gear.Acc.load()))") == before)
    print('errors', errs); ok('no_console_errors', not errs)
    print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
