#!/usr/bin/env python3
"""가로 태블릿 레이아웃 테스트 (headless Chromium, 터치 에뮬레이션, DPR 2).
모든 화면을 여러 태블릿 크기로 열어 (1) 화면 밖으로 넘치는 요소 (2) 줄바꿈된 핵심 버튼 (3) 44px 미만 터치 대상
(4) 콘솔 오류 를 검사한다.
  python3 tests/tablet.py                 # 검사 (실패 시 exit 1)
  python3 tests/tablet.py --audit         # 문제 목록만 출력 (실패 처리 안 함)
  python3 tests/tablet.py --shots DIR     # 화면별·크기별 스크린샷 저장
  python3 tests/tablet.py --sizes 1024x768,960x600
"""
import sys, os, pathlib, json, argparse
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
ap = argparse.ArgumentParser(); ap.add_argument('--audit', action='store_true'); ap.add_argument('--shots'); ap.add_argument('--sizes'); ap.add_argument('--url'); ap.add_argument('--only'); ap.add_argument('--shotsizes'); ap.add_argument('--short', action='store_true')
A = ap.parse_args()
SIZES = [tuple(map(int, s.split('x'))) for s in (A.sizes or '1024x768,1180x820,1366x1024,1280x800,1138x712,960x600').split(',')]
if A.shots: os.makedirs(A.shots, exist_ok=True)

# 검사 스크립트: roots 안의 보이는 요소가 뷰포트 밖으로 넘치는지 / 지정 요소가 한 줄인지 / 터치 대상 크기
CHECK = r"""([roots, oneLine, touchSel]) => {
  const vw = innerWidth, vh = innerHeight, out = [], wrap = [], small = [], clipped = [];
  const SKIP = '#townLabels,#fx,.rays,.cglow,.floaties,.sparks,.stPath,#app,#tip,#itemTip,.chest,.cvStage:after';
  const vis = el => { if (!el.getClientRects().length) return false; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const name = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + (el.dataset.id ? `[${el.dataset.id}]` : el.dataset.tool ? `[${el.dataset.tool}]` : el.dataset.up ? `[${el.dataset.up}]` : el.dataset.t ? `[${el.dataset.t}]` : '');
  const clipAnc = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) return e; } return null; };
  const els = []; for (const r of roots) document.querySelectorAll(r).forEach(x => { els.push(x); x.querySelectorAll('*').forEach(y => els.push(y)); });
  for (const el of els) {
    if (el.closest(SKIP) || !vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const c = clipAnc(el);
    if (!c && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1)) out.push(`${name(el)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    if (el.matches('button:not(.snode),.pill,.tlabel,.ftab,.chtab') && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') clipped.push(`${name(el)} sw${el.scrollWidth}>cw${el.clientWidth}`);
  }
  for (const s of oneLine) document.querySelectorAll(s).forEach(el => {
    if (!roots.some(r => el.closest(r)) || !vis(el)) return; const tops = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) { if (!n.textContent.trim() || n.parentElement.closest('small,.desc,.stars,.nm,.dots,#skillCd,#warpCd')) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 0 && !tops.some(t => Math.abs(t - q.top) < 6)) tops.push(q.top); }
    if (tops.length > 1) wrap.push(`${name(el)} "${el.innerText.replace(/\s+/g, ' ').slice(0, 30)}" lines=${tops.length}`);
  });
  for (const el of document.querySelectorAll(touchSel)) { if (!roots.some(r => el.closest(r)) || !vis(el) || el.disabled && 0) continue; const lb = el.matches('input[type=checkbox]') && el.closest('label'); const r = (lb || el).getBoundingClientRect(); if (r.width < 1) continue; if (el.closest('.smGrid,.smList,#disGrid,.stMap') && clipAnc(el)) { const c = clipAnc(el).getBoundingClientRect(); if (r.bottom < c.top || r.top > c.bottom) continue; }
    if (r.height < 43.5 || r.width < 43.5) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`); }
  return { out, wrap, small, clipped, coarse: matchMedia('(pointer: coarse)').matches };
}"""
ONE = ['#twGo', '#twMenu', '#twBag', '.twTop .pill', '#top .pill', '#startWave', '#retreat', '.tool > span', '.up .row', '.gbtn.main', '#mnNew', '#mnSet', '.ftab', '.chtab b', '#stGo', '#stChalGo', '#scTown', '#overTown', '#over button', '#lgIn', '#lgUp', '#blessClose', '.xbtn', '#warpBtn > span', '#skillBtn > span', '#popOk', '.gtitle']
TOUCH = 'button, input, .itile:not(.emptyT), .snode, .hcard, .perm, .card'
RES, ERRS = {}, []
def rec(screen, size, m):
    k = f'{screen}@{size[0]}x{size[1]}'; RES[k] = m
    bad = [x for x in ('out', 'wrap', 'small', 'clipped') if m[x]]
    print(('OK  ' if not bad else 'FAIL'), k, '' if not bad else json.dumps({x: m[x][:8] for x in bad}, ensure_ascii=False), flush=True)
def J(pg, js, a=None): return pg.evaluate(js, a) if a is not None else pg.evaluate(js)
def hidden(pg, id): return J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")

RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def sweep(pg, screen, roots, prep=None, settle=250, shot=True):
    if A.only and screen not in A.only.split(','): return
    J(pg, "()=>{ G.pauseRender=true }")  # 소프트웨어 GL이 느려서 레이아웃 검사 중엔 렌더 정지 (촬영 직전에만 한 프레임)
    for w, h in SIZES:
        pg.set_viewport_size({'width': w, 'height': h}); pg.wait_for_timeout(settle)
        if prep: prep(); pg.wait_for_timeout(150)
        try: pg.wait_for_function("()=>document.getAnimations().every(a=>a.playState!=='running'||a.effect.getComputedTiming().iterations===Infinity)", timeout=8000)  # 등장 애니메이션(scale) 끝난 뒤 측정
        except Exception: pass
        rec(screen, (w, h), J(pg, CHECK, [roots, ONE, TOUCH]))
        if A.shots and shot and (not A.shotsizes or f'{w}x{h}' in A.shotsizes.split(',')):
            J(pg, RAF); pg.screenshot(path=f'{A.shots}/{screen}_{w}.png' if A.short else f'{A.shots}/{screen}_{w}x{h}.png', timeout=180000)
    J(pg, "()=>{ G.pauseRender=false }")

srv, url = serve(); url = A.url or url
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': SIZES[0][0], 'height': SIZES[0][1]}, device_scale_factor=2, has_touch=True, is_mobile=True); c.add_init_script(MOCK)
    pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: m.type == 'error' and ERRS.append(m.text[:200])); pg.on('pageerror', lambda x: ERRS.append('PE ' + str(x)[:300]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000); pg.wait_for_timeout(800)
    sweep(pg, 'intro', ['#scr_intro'])
    pg.tap('#scr_intro'); pg.wait_for_timeout(500); sweep(pg, 'login', ['#scr_login'])
    pg.tap('#lgGuest'); pg.wait_for_timeout(400); sweep(pg, 'menu', ['#scr_menu'])
    pg.tap('#mnSet'); pg.wait_for_timeout(200); sweep(pg, 'settings', ['#scr_menu']); pg.tap('#mnSet')
    J(pg, """()=>{ const {Acc,E}=G.gear; let q=1; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; };
      Acc.update(d=>{ d.souls=2600; d.mat={steel:400,crystal:40}; d.hero='mage'; d.stats={runs:12,kills:1234,waves:99,souls:9999}; d.bestWave=27; d.st={'1-1':3,'1-2':2,'1-3':1};
        for (let i=0;i<30;i++) d.inv.push({...E.makeItem(['weapon','armor','acc'][i%3], ['mage','archer','warrior'][i%3], i%5, r), id:'it'+i}); return d; }); }""")
    pg.tap('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(2000)
    sweep(pg, 'town', ['#scr_town'])
    # 탭으로 이동 (터치 pointerdown)
    p0 = J(pg, "()=>{ const p=G.townHero(); return [p.x,p.z] }"); pg.touchscreen.tap(SIZES[-1][0] * .62, SIZES[-1][1] * .55); pg.wait_for_timeout(3000)
    p1 = J(pg, "()=>{ const p=G.townHero(); return [p.x,p.z] }"); RES['tap_move_town'] = abs(p1[0] - p0[0]) + abs(p1[1] - p0[1]) > .3; print('tap_move_town', RES['tap_move_town'], p0, p1)
    J(pg, "()=>{ const [x,z]=G.townTower(); G.townTeleport(x-7.8, z); G.townGoal(x-2.45, z); }"); pg.wait_for_function("()=>!document.getElementById('twBless').classList.contains('hidden')", timeout=120000); pg.wait_for_timeout(700)
    sweep(pg, 'bless', ['#scr_town'])
    pg.tap('#blessClose'); pg.wait_for_timeout(200)
    pg.tap('#twBag'); pg.wait_for_timeout(300); pg.tap('#invGrid .itile[data-id="it3"]'); pg.wait_for_timeout(200)
    sweep(pg, 'inventory', ['#scr_town'])
    pg.tap('#invClose'); pg.wait_for_timeout(200)
    for t in ['enh', 'dis', 'craft']:
        def prep(t=t):
            J(pg, "()=>G.gear.openSmith()"); pg.tap(f'#smTabs .ftab[data-t="{t}"]'); pg.wait_for_timeout(150)
            if t == 'enh': pg.tap('.smList .itile[data-id="it4"]')
            if t == 'dis': pg.tap('#disGrid .itile[data-id="it5"]')
        sweep(pg, 'smith_' + t, ['#scr_town'], prep=prep)
    J(pg, "()=>G.gear.closeSmith(true)")
    for t in ['arrow', 'magic']:  # 타워 연구소
        def prep(t=t):
            J(pg, "()=>{ G.gear.Acc.update(d=>{ d.research={arrow:{atk:4,rng:2,spd:3,start:0},cannon:{},magic:{atk:10,rng:5,spd:8,start:2}}; return d; }); G.openLab(); }"); pg.tap(f'#labTabs .ftab[data-t="{t}"]'); pg.wait_for_timeout(150)
        sweep(pg, 'lab_' + t, ['#scr_town'], prep=prep)
    J(pg, "()=>G.closeLab(true)")
    def chest():
        J(pg, "()=>{ const {E}=G.gear; let q=7; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; G.gear.reveal([{it:{...E.makeItem('weapon','mage',4,r),id:'cx'},src:'boss'},{it:{...E.makeItem('armor','mage',2,r),id:'cy'},src:'chest'}]); }"); pg.wait_for_timeout(2000)
    sweep(pg, 'chest', ['#chestOv'], prep=chest)
    for _ in range(6):
        if hidden(pg, 'chestOv'): break
        pg.tap('.cvStage', force=True); pg.wait_for_timeout(700)
    CSEED = "()=>{ const {Acc,E}=G.gear; let q=11; const r=()=>{ q=(q*16807)%2147483647; return q/2147483647; }; const keep=Acc.load().inv.slice(0,10); window.__keepInv=window.__keepInv||keep; Acc.update(d=>{ d.inv=window.__keepInv.slice(); for (let i=0;i<20;i++) d.inv.push(E.makeItem('armor','mage',0,r)); d.chests=[]; const g=[4,0,1,3,2,0,1,0,4,2,1,0,3,0]; E.addChests(d, g.map((x,i)=>({it:E.makeItem(E.SLOT_KEYS[i%3],'mage',x,r), src:i%5?'chest':'boss'}))); return d; }); }"
    J(pg, CSEED); sweep(pg, 'town_chestbtn', ['#scr_town']); RES['chest_btn_visible'] = not hidden(pg, 'twChest'); print('chest_btn_visible', RES['chest_btn_visible'])
    def chestbar(): J(pg, CSEED); J(pg, "()=>G.gear.openChestUI()"); pg.wait_for_timeout(900)
    sweep(pg, 'chest_bar', ['#chestOv'], prep=chestbar)
    def chestsum(): J(pg, CSEED); J(pg, "()=>G.gear.openChestUI()"); pg.wait_for_timeout(500); pg.tap('#cbAll'); pg.wait_for_selector('#cbSum', timeout=8000); pg.wait_for_timeout(400)
    sweep(pg, 'chest_summary', ['#chestOv'], prep=chestsum)
    pg.tap('#cbOk'); pg.wait_for_timeout(300); J(pg, "()=>G.gear.Acc.update(d=>{ d.inv=(window.__keepInv||[]).slice(); d.chests=[]; return d; })")
    J(pg, "()=>{ const p=document.getElementById('townPop'); }")
    pg.tap('#twGo'); pg.wait_for_timeout(500); pg.tap('.snode[data-id="1-4"]', force=True); pg.wait_for_timeout(300)
    sweep(pg, 'stagesel', ['#scr_town'])
    pg.tap('.chtab[data-c="0"]'); pg.wait_for_timeout(200); sweep(pg, 'stagesel_chal', ['#scr_town'])
    pg.tap('#stClose'); pg.wait_for_timeout(200)
    J(pg, "()=>{ const p=document.getElementById('townPop'); p.innerHTML='<h3>스테이지 1-3 클리어!</h3>획득 영혼석 <span class=soul>+120</span><br>장비 3개<br><button id=popOk>확인</button>'; p.classList.remove('hidden'); document.getElementById('popOk').onclick=()=>p.classList.add('hidden'); }")
    sweep(pg, 'townpop', ['#scr_town']); pg.tap('#popOk')
    # 상점 · 우편함 · 관리자 (관리자 계정으로 로그인, 가짜 서버에 구매 신청·우편 준비)
    pg.tap('#twMenu'); pg.wait_for_timeout(300); pg.tap('#mnAuth'); pg.wait_for_timeout(400); pg.fill('#lgEmail', 'hyunjk11@daum.net'); pg.fill('#lgPw', 'secret12'); pg.tap('#lgUp')
    pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(600); sweep(pg, 'menu_admin', ['#scr_menu'])
    J(pg, """()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const me=Object.values(d.users)[0].id, t=i=>new Date(Date.UTC(2026,9,19,5,i)).toISOString(); d.seq=10;
      d.hd3d_orders={1:{id:1,user_id:me,email:'hyunjk11@daum.net',nickname:'관리자',item:'hero_gunner',status:'pending',created_at:t(1)},2:{id:2,user_id:'ux',email:'player.with.long.address@example.com',nickname:'장미기사단장',item:'hero_gunner',status:'approved',created_at:t(0),decided_at:t(2)},3:{id:3,user_id:'uy',email:'b@test.kr',nickname:'',item:'hero_gunner',status:'rejected',created_at:t(0),decided_at:t(3)}};
      d.hd3d_mail={4:{id:4,user_id:me,title:'🎁 구매하신 상품이 도착했습니다',body:'유료 영웅 · 총사 로즈 구매가 승인되었습니다. 감사합니다! \\'받기\\'를 눌러 수령하세요.',reward:{hero:'gunner'},claimed:false,created_at:t(4)},5:{id:5,user_id:me,title:'운영자의 선물',body:'모험에 도움이 되길 바랍니다!',reward:{souls:500,steel:20,crystal:5},claimed:true,created_at:t(3)},6:{id:6,user_id:me,title:'공지',body:'점검 안내입니다.',reward:null,claimed:false,created_at:t(2)}};
      localStorage.setItem('__mockdb', JSON.stringify(d)); }""")
    pg.tap('#mnCont'); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(1500)
    sweep(pg, 'shop', ['#scr_town'], prep=lambda: (J(pg, "()=>G.shop.openShop()"), pg.wait_for_function("()=>!document.getElementById('shopBuyBtn').textContent.includes('불러오는')", timeout=15000), pg.wait_for_timeout(400)))
    J(pg, "()=>G.shop.closeShop(true)")
    sweep(pg, 'mailbox', ['#scr_town'], prep=lambda: (J(pg, "()=>G.shop.openMail()"), pg.wait_for_function("()=>document.querySelectorAll('#mailList .mailItem').length===3", timeout=15000), pg.wait_for_timeout(400)))
    J(pg, "()=>G.shop.closeMail(true)")
    sweep(pg, 'admin_orders', ['#adminPanel'], prep=lambda: (pg.tap('#twAdmin'), pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===3", timeout=15000), pg.wait_for_timeout(400)))
    def amail(): pg.tap('#admTabs .ftab[data-t="mail"]'); pg.wait_for_timeout(150)
    sweep(pg, 'admin_mail', ['#adminPanel'], prep=amail)
    # 관리자 확장 탭 (2026-10-22)
    def atab(t, cond): return lambda: (pg.tap(f'#admTabs .ftab[data-t="{t}"]'), pg.wait_for_function(cond, timeout=15000), pg.wait_for_timeout(250))
    sweep(pg, 'admin_users', ['#adminPanel'], prep=atab('users', "()=>document.querySelectorAll('#admBody .auRow').length>0"))
    def adetail(): atab('users', "()=>document.querySelectorAll('#admBody .auRow').length>0")(); pg.tap('#admBody .auRow'); pg.wait_for_function("()=>!!document.querySelector('#admBody .udGrid')", timeout=15000); pg.wait_for_timeout(250)
    sweep(pg, 'admin_user_detail', ['#adminPanel'], prep=adetail)
    sweep(pg, 'admin_broadcast', ['#adminPanel'], prep=atab('broadcast', "()=>!!document.getElementById('bcTitle')"))
    sweep(pg, 'admin_notice', ['#adminPanel'], prep=atab('notice', "()=>!!document.getElementById('ntTitle') && !document.getElementById('admBody').innerText.includes('불러오는')"))
    sweep(pg, 'admin_log', ['#adminPanel'], prep=atab('log', "()=>!document.getElementById('admBody').innerText.includes('불러오는')"))
    sweep(pg, 'admin_admins', ['#adminPanel'], prep=atab('admins', "()=>document.querySelectorAll('#admBody .admAdm').length>0"))
    def aconfirm(): J(pg, "()=>{ if (!document.getElementById('admConfirm').classList.contains('hidden')) document.getElementById('acfNo').click(); }"); atab('broadcast', "()=>!!document.getElementById('bcTitle')")(); pg.fill('#bcTitle', '점검 보상'); pg.tap('#bcSend'); pg.wait_for_function("()=>!document.getElementById('admConfirm').classList.contains('hidden')", timeout=15000); pg.wait_for_timeout(300)
    sweep(pg, 'admin_confirm', ['#admConfirm'], prep=aconfirm); pg.tap('#acfNo'); pg.wait_for_timeout(200)
    pg.tap('#admClose'); pg.wait_for_timeout(200)
    # 인게임
    pg.tap('#twGo'); pg.wait_for_timeout(300); pg.tap('.chtab[data-c="1"]'); pg.tap('.snode[data-id="1-1"]'); pg.tap('#stGo')
    pg.wait_for_function("()=>window.G&&G.ready&&G.stage&&G.phase==='build'", timeout=180000); pg.wait_for_timeout(1500)
    J(pg, "()=>{ G.gold=5000; }")
    sweep(pg, 'hud', ['#hud', '#bossHud'])
    # 탭으로 건설 → 탭으로 선택 (터치 pointerdown 경로)
    ok_tap = J(pg, """()=>{ const n0=G.towers.length, W=innerWidth, H=innerHeight;
      for (let r=2;r<G.GH-2;r++) for (let c=2;c<G.GW-2;c++){ const t=G.tileAt(c,r); if(!t||G.buildReason(c,r,'arrow')) continue; const [x,y]=G.hoverTile(c,r);
        if (x>W*.25&&x<W*.7&&y>H*.3&&y<H*.7){ const el=document.elementFromPoint(x,y); if (el&&el.tagName==='CANVAS') { G.setTool('arrow'); return [x,y,n0]; } } } return null; }""")
    if ok_tap:
        x, y, n0 = ok_tap; pg.touchscreen.tap(x, y); pg.wait_for_timeout(300)
        RES['tap_build'] = J(pg, "()=>G.towers.length") == n0 + 1; print('tap_build', RES['tap_build'])
        J(pg, "()=>G.setTool('move')"); pg.touchscreen.tap(x, y); pg.wait_for_timeout(300)
        RES['tap_select'] = not hidden(pg, 'tinfo'); print('tap_select', RES['tap_select'])
    sweep(pg, 'hud_tinfo', ['#hud'])
    # 타워 성장: ★★★ 진화 팝업 (터치 선택)
    J(pg, "()=>{ const t=G.towers[G.towers.length-1]; G.select(t); G.towerXp(t, 99999); }"); pg.wait_for_function("()=>!document.getElementById('branchPop').classList.contains('hidden')", timeout=20000)
    pg.wait_for_timeout(600); sweep(pg, 'branch', ['#branchPop', '#hud'])
    pg.tap('#branchPop .bpCard[data-k="multi"]'); pg.wait_for_timeout(300); RES['tap_branch'] = J(pg, "()=>G.towers[G.towers.length-1].branch") == 'multi'; print('tap_branch', RES['tap_branch'])
    sweep(pg, 'hud_tinfo_star', ['#hud'])
    pg.tap('#sndBtn'); pg.wait_for_timeout(200); sweep(pg, 'hud_sound', ['#hud']); pg.tap('#sndBtn')
    J(pg, "()=>{ G.select(null); G.startWave(); }"); pg.wait_for_timeout(2500); sweep(pg, 'hud_wave', ['#hud', '#bossHud'])
    J(pg, "()=>{ G.manual=true; G.wave=9; G.spawnQ=[]; G.phase='build'; G.startWave(); G.spawnQ=[]; }")
    for _ in range(40):
        d = J(pg, "()=>{ for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9, '#fff', false); G.sim(1); return G.phase; }")
        if d != 'wave': break
    J(pg, "()=>{ G.manual=false }"); pg.wait_for_timeout(1500)
    sweep(pg, 'stageclear', ['#stageClear'])
    J(pg, "()=>document.getElementById('stageClear').classList.add('hidden')")
    J(pg, "async ()=>{ const m=await import('./src/core/waves.js'); G.phase='build'; m.gameOver(); }"); pg.wait_for_timeout(1500)
    sweep(pg, 'gameover', ['#over'])
    # 비-flow 영웅 선택 화면
    pg.goto(url + '?seed=12345'); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); pg.wait_for_timeout(800)
    sweep(pg, 'heroselect', ['#select'])
    b.close()
fails = [k for k, m in RES.items() if isinstance(m, dict) and any(m[x] for x in ('out', 'wrap', 'small', 'clipped'))] + [k for k, v in RES.items() if v is False]
print('coarse pointer:', next((m['coarse'] for m in RES.values() if isinstance(m, dict)), None))
print('console errors:', ERRS)
print(f'{len(RES) - len(fails)}/{len(RES)} ok', 'FAILED: ' + ', '.join(fails) if fails else '')
if not A.audit and (fails or ERRS): sys.exit(1)
