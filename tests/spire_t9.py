#!/usr/bin/env python3
"""🗼 무한의 탑 T-9 (가짜 Supabase tests/sbmock.js · 데스크톱 1440x860 만 — 태블릿 테스트 없음)
 주간 보상 받기(지난주 = 칭호 교체 · 더 오래된 주 = 보상만) · 탑 칭호 표시 · 서버 T-9 미실행(noSpire9) 이면 카드 없음 ·
 관리자 🗼 탑 기록 탭(이상 기록 깃발 · 유저 보기 · 탑 요약 · 기록 초기화 + 사유) · ?sptest 없으면 탭 숨김 · 콘솔 오류 0
python3 tests/spire_t9.py [--shots]   (스크린샷 /workspace/report_shots/spire_week.png · spire_admin.png)"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = os.environ.get('SP_SHOTS', '/workspace/report_shots')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:500], flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name):
    if SHOTS: os.makedirs(OUT, exist_ok=True); J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=240000); print('shot', f'{OUT}/{name}.png')
txt = lambda pg, sel: J(pg, f"()=>(document.querySelector('{sel}')||{{}}).innerText||''")
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb'))")
def boot(c, q):
    pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append('CE ' + m.text[:300]))
    pg.goto(url + q, timeout=180000); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000); return pg
def login(pg, email):
    if J(pg, '()=>G.screen') == 'intro': pg.mouse.click(640, 400); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'menu': pg.click('#mnAuth'); pg.wait_for_timeout(500)
    pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgIn'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000)
    pg.wait_for_function("()=>G.shop.Sh.S.status!=='loading' && G.shop.Sh.S.me.st!=='idle'", timeout=15000); pg.wait_for_timeout(300)
def town(pg): J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(700)
def openp(pg):
    J(pg, "()=>{ const c=document.getElementById('dgClose'); if (c) c.click(); G.openDungeon(); }"); pg.wait_for_function("()=>!document.getElementById('dgPanel').classList.contains('hidden') && document.querySelectorAll('.dgCard').length>=3", timeout=20000); pg.wait_for_timeout(300)
def spire_tab(pg):
    pg.click('#dgTabs [data-view=spire]'); pg.wait_for_function("()=>!!document.getElementById('spGo') && !/확인 중/.test((document.getElementById('spHead')||{}).innerText||'')", timeout=20000); pg.wait_for_timeout(300)
# 시드: 나(ume) 지난주 22층(주간 2위 — o1 30층 다음) · 2주 전 7층 · 최고 22층 · 이상 기록 판 2개(하한 근처 · 층 깎임) + 관리자(uadm)
SEED = r"""()=>{ const k=new Date(Date.now()+9*3600e3), dow=(k.getUTCDay()+6)%7, wk=n=>new Date(Date.UTC(k.getUTCFullYear(),k.getUTCMonth(),k.getUTCDate()-dow-n)).toISOString().slice(0,10), day=k.toISOString().slice(0,10), T=Date.now();
  const d={users:{},hd3d_profiles:{},hd3d_progress:{},hd3d_records:{},calls:[],hd3d_orders:{},hd3d_mail:{},hd3d_owned:{},hd3d_admins:{},seq:100,lastTs:0,sp_runs:{},sp_best:{},sp_weeks:{},dg_wallet:{}};
  const U=(id,email,nick)=>{ d.users[id]={id,email,password:'secret12',created_at:new Date(T-9e8).toISOString(),last_sign_in_at:new Date(T-9e7).toISOString()}; d.hd3d_profiles[id]={id,nickname:nick}; };
  U('uadm','hyunjk11@daum.net','운영자'); d.hd3d_admins.uadm={owner:true,created_at:new Date(T-9e8).toISOString()}; U('ume','spt@test.kr','탑돌이'); U('o1','o1@test.kr','별빛기사'); U('o2','o2@test.kr','눈꽃마녀');
  d.sp_best.ume={best:22,at:T-8e8,cleared:20}; d.sp_best.o1={best:30,at:T-9e8,cleared:30};
  const W=(u,w,b,at)=>{ d.sp_weeks[u+'|'+w]={user_id:u,week:w,best:b,at}; }; W('ume',wk(7),22,T-7e8); W('o1',wk(7),30,T-7.5e8); W('o2',wk(7),10,T-7.2e8); W('ume',wk(14),7,T-13e8);
  const R=(t,from,top,ago,dur,capped)=>{ d.sp_runs[t]={token:t,user_id:'ume',day,week:wk(0),from,top,status:'done',started:T-ago*1e3,finished:T-ago*1e3+dur*1e3,pingAt:null,pingFloor:null,capped:!!capped,summary:{v:1,party:['warrior','archer','mage']}}; };
  R('00000000-0000-4000-8000-000000000001',1,10,900,300,false); R('00000000-0000-4000-8000-000000000002',1,12,8000,600,true);
  localStorage.setItem('__mockdb', JSON.stringify(d)); localStorage.removeItem('__mockflags'); return [wk(7), wk(14)]; }"""
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = boot(c, '?seed=5191&rng=51&flow=1&dgtest=1&sptest=1')
    W1, W2 = J(pg, SEED); pg.reload(); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    login(pg, 'spt@test.kr'); town(pg); openp(pg); spire_tab(pg)
    v = J(pg, "()=>({rows:[...document.querySelectorAll('#spWkRw .spWk')].map(e=>e.innerText.replace(/\\s+/g,' ')), weeks:[...document.querySelectorAll('.spWkBtn')].map(b=>b.dataset.week), head:document.getElementById('spHead').innerText})")
    ok('week_rows', len(v['rows']) == 2 and v['weeks'] == [W1, W2] and '22층' in v['rows'][0] and '주간 2위' in v['rows'][0] and '영혼석 660' in v['rows'][0] and '🏅 8' in v['rows'][0] and '탑의 정예' in v['rows'][0]
       and '7층' in v['rows'][1] and '영혼석 210' in v['rows'][1] and '칭호' not in v['rows'][1], v)
    ok('week_fits_860', J(pg, "()=>{ const g=document.getElementById('spGo').getBoundingClientRect(), p=document.getElementById('dgPanel').getBoundingClientRect(); return g.bottom<=innerHeight && g.bottom<=p.bottom+1; }"), J(pg, "()=>[document.getElementById('spGo').getBoundingClientRect().bottom, innerHeight]"))
    shot(pg, 'spire_week')
    pg.click(f'.spWkBtn[data-week="{W1}"]'); pg.wait_for_function("()=>G.spClaim && document.querySelectorAll('#spWkRw .spWk').length===1", timeout=20000); pg.wait_for_timeout(300)
    cl = J(pg, '()=>G.spClaim'); d = db(pg); m = [x for x in d['hd3d_mail'].values() if x['user_id'] == 'ume' and '주간 보상' in x['title']]
    ok('claim_last_week', cl['ok'] and cl['week'] == W1 and cl['rank'] == 2 and cl['souls'] == 660 and cl['medals'] == 8 and cl['title'] == 'spire_w10' and len(m) == 1 and m[0]['reward'] == {'souls': 660, 'medals': 8} and '22층' in m[0]['body'], (cl, m))
    ok('title_shown', '탑의 정예' in txt(pg, '#spTitles') and d['dg_wallet']['ume']['titles'] == ['spire_w10'], (txt(pg, '#spHead'), d['dg_wallet'].get('ume')))
    pg.click(f'.spWkBtn[data-week="{W2}"]'); pg.wait_for_function("w=>G.spClaim && G.spClaim.week===w && !document.getElementById('spWkRw')", arg=W2, timeout=20000); pg.wait_for_timeout(300)
    cl = J(pg, '()=>G.spClaim'); d = db(pg)
    ok('claim_old_week_no_title', cl['ok'] and cl['week'] == W2 and cl['title'] is None and cl['souls'] == 210 and not J(pg, "()=>!!document.getElementById('spWkRw')") and d['dg_wallet']['ume']['titles'] == ['spire_w10'], cl)
    r = J(pg, f"()=>import('./src/account/spire.js').then(S=>S.spClaimWeek('{W1}'))"); ok('claim_twice', r['ok'] is False and '이미 받은' in r['msg'], r)
    r = J(pg, "()=>import('./src/account/spire.js').then(S=>S.spClaimWeek(G.spClaim && null))"); ok('claim_default_last_week_claimed', r['ok'] is False and r['reason'] == 'claimed', r)
    J(pg, "()=>localStorage.setItem('__mockflags', '{\"noSpire9\":true}')"); openp(pg); spire_tab(pg)
    ok('t6_server_no_card', not J(pg, "()=>!!document.getElementById('spWkRw')") and '최고 22층' in txt(pg, '#spHead') and not J(pg, "()=>!!document.getElementById('spTitles')"), txt(pg, '#spHead'))
    r = J(pg, "()=>import('./src/account/spire.js').then(S=>S.spClaimWeek(null))"); ok('t6_server_claim_missing', r['ok'] is False and '서버 업데이트 필요' in r['msg'], r)
    J(pg, "()=>localStorage.removeItem('__mockflags')"); ok('errors_0_player', not errs, errs[:4])
    dump = J(pg, "()=>localStorage.getItem('__mockdb')"); c.close()
    # ---- 관리자 ----
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = boot(c, '?seed=5192&flow=1&sptest=1')
    J(pg, "d=>{ localStorage.setItem('__mockdb', d); localStorage.removeItem('__mockflags'); }", dump); pg.reload(); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    login(pg, 'hyunjk11@daum.net'); town(pg); pg.click('#twAdmin'); pg.wait_for_timeout(600)
    ok('admin_tab_visible', J(pg, "()=>!document.querySelector('#admTabs .ftab[data-t=spire]').classList.contains('hidden')"))
    pg.click('#admTabs .ftab[data-t="spire"]'); pg.wait_for_function("()=>document.querySelectorAll('#spAdmList .spAdmRow').length>=2", timeout=15000); pg.wait_for_timeout(300)
    rows = J(pg, "()=>[...document.querySelectorAll('#spAdmList .spAdmRow')].map(e=>e.innerText.replace(/\\s+/g,' '))")
    ok('admin_rows', len(rows) == 2 and '탑돌이' in rows[0] and '하한 근처' in rows[0] and '300초 / 최소 280초' in rows[0] and '층 깎임' in rows[1] and '전사' in ' '.join(rows), rows)
    ok('admin_fits', J(pg, "()=>{ const p=document.getElementById('adminPanel').getBoundingClientRect(); return p.bottom<=innerHeight+1 && p.right<=innerWidth+1; }"))
    shot(pg, 'spire_admin')
    pg.click('#spAdmList .spAdmRow [data-act=spopen]'); pg.wait_for_function("()=>!!document.getElementById('udSpire')", timeout=15000); pg.wait_for_timeout(300)
    ok('admin_user_card', '22층' in txt(pg, '#udSpire') and '20층까지' in txt(pg, '#udSpire') and J(pg, "()=>document.querySelector('#admTabs .ftab.on').dataset.t") == 'users' and len(J(pg, "()=>[...document.querySelectorAll('.spAdmRec li')]")) == 2, txt(pg, '#udSpire'))
    pg.click('[data-act=spreset]'); pg.wait_for_function("()=>!document.getElementById('admConfirm').classList.contains('hidden')", timeout=10000); pg.click('#acfYes'); pg.wait_for_timeout(300)
    ok('reset_needs_reason', '사유' in txt(pg, '#admConfirm .acfE'))
    pg.fill('#acfReason', '이상 기록 확인'); pg.click('#acfYes'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.includes('초기화했어요')", timeout=15000); pg.wait_for_timeout(400)
    d = db(pg); lg = [x for x in d['hd3d_admin_log'].values() if x['action'] == 'spire_reset']
    ok('reset_done', d['sp_best']['ume']['best'] == 0 and d['sp_best']['ume']['cleared'] == 20 and len(lg) == 1 and lg[0]['detail']['best'] == 22 and '0층' in txt(pg, '#udSpire') and '탑 기록 초기화' in txt(pg, '#admBody'), (d['sp_best']['ume'], lg))
    ok('errors_0_admin', not errs, errs[:4])
    pg.close()  # 첫 페이지 렌더 루프가 CPU 를 잡아 두 번째 goto 'load' 30초 초과 → 닫고 진행
    pg2 = boot(c, '?seed=5193&flow=1')
    if J(pg2, '()=>G.screen') == 'intro': pg2.mouse.click(640, 400); pg2.wait_for_timeout(300)
    pg2.wait_for_function("()=>G.shop.Sh.S.me.st!=='idle'", timeout=15000); town(pg2); pg2.click('#twAdmin'); pg2.wait_for_timeout(500)
    ok('no_sptest_tab_hidden', J(pg2, "()=>document.querySelector('#admTabs .ftab[data-t=spire]').classList.contains('hidden')"))
    ok('errors_0', not errs, errs[:4])
    b.close()
print('RESULT', 'PASS' if all(res.values()) else 'FAIL', sum(res.values()), '/', len(res))
