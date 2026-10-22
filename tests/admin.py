#!/usr/bin/env python3
"""관리자 권한 확장 테스트 (가짜 Supabase tests/sbmock.js, 네트워크 없음).  python3 tests/admin.py [--shots]
owner 관리자: 주문 필터·검색·환불(확인 창+사유), 유저 검색·페이지·상세·영웅 지급/회수·우편·정지, 전체 우편(인원 확인·취소·쿨다운·불일치), 공지 작성/수정/내리기, 활동 기록·필터, 하위 관리자 추가.
일반 사용자: 관리자 UI 숨김·RPC 거부, 공지 배너(닫으면 다시 안 뜸), 전체 우편 한 번만 받기. 정지 사용자: 저장·구매·우편 받기 거부 + 안내.
하위 관리자: 관리자 탭 없음·owner RPC 거부. 서버 구버전(noAdmin2): '서버 업데이트 필요' + 주문 승인은 그대로. 스크린샷 shots/admin/ (1440x860 · 1024x600)."""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/admin'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, '' if cond else info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name, force=False):
    if SHOTS or force: pg.wait_for_timeout(500); J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb')||'{}')")
def boot(c, q='?seed=12345&flow=1'):
    pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000); return pg
def login(pg, email):
    if J(pg, '()=>G.screen') == 'intro': pg.mouse.click(640, 400); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'town': J(pg, "()=>G.shop.closeAdmin(true)"); pg.click('#twMenu'); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'menu': pg.click('#mnAuth'); pg.wait_for_timeout(500)
    pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgIn'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000)
    pg.wait_for_function(f"()=>G.shop.Sh.S.status!=='loading' && G.shop.Sh.S.me.st!=='idle'", timeout=15000); pg.wait_for_timeout(300)
def town(pg): J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(900)
ADM = "import('./src/account/admin.js')"
def api(pg, expr): return J(pg, f"async()=>{{ const A=await {ADM}; return await {expr}; }}")
def admin_tab(pg, t, cond):
    pg.click(f'#admTabs .ftab[data-t="{t}"]'); pg.wait_for_function(cond, timeout=15000); pg.wait_for_timeout(250)
def msg(pg): return pg.inner_text('#admMsg')
def wait_msg(pg, s): pg.wait_for_function(f"()=>document.getElementById('admMsg').innerText.includes({json.dumps(s)})", timeout=15000)
def confirm_open(pg): pg.wait_for_function("()=>!document.getElementById('admConfirm').classList.contains('hidden')", timeout=10000); pg.wait_for_timeout(200)
def confirm_yes(pg, reason=None):
    confirm_open(pg)
    if reason is not None: pg.fill('#acfReason', reason)
    pg.click('#acfYes')
uid = lambda pg, email: next(u['id'] for u in db(pg)['users'].values() if u['email'] == email)

# ---- 시드: 이 게임 사용자 27명(+다른 게임 계정 1명), 주문 4건
SEED = r"""()=>{ const t=i=>new Date(Date.UTC(2026,9,1+Math.floor(i/24),i%24)).toISOString(); const d={users:{},hd3d_profiles:{},hd3d_progress:{},hd3d_records:{},calls:[],hd3d_orders:{},hd3d_mail:{},hd3d_owned:{},hd3d_admins:{},seq:100,lastTs:0};
  const U=(id,email,nick,i,prog)=>{ d.users[id]={id,email,password:'secret12',created_at:t(i),last_sign_in_at:t(i+30)}; if(nick!=null) d.hd3d_profiles[id]={id,nickname:nick}; if(prog) d.hd3d_progress[id]={user_id:id,data:prog,merged:true,updated_at:t(i+40)}; };
  U('uadm','hyunjk11@daum.net','운영자',1); d.hd3d_admins.uadm={owner:true,created_at:t(1)};
  U('usub','sub@test.kr','부관리자',2);
  U('up1','p1@test.kr','장미기사',3,{v:1,hero:'mage',souls:4321,bestWave:25,mat:{steel:10,crystal:55,essence:3},st:{'1-1':3,'1-2':2},hst:{'1-1':1},adv:{mage:{b:'frost',n:1}},stats:{runs:12,kills:300,waves:40,souls:900}});
  U('up2','p2@test.kr','버들팬',4,{v:1,hero:'mage',souls:50,stats:{runs:1}});
  for(let i=1;i<=23;i++) U('uf'+i,'f'+String(i).padStart(2,'0')+'@test.kr','모험가'+i,5+i);
  U('uother','other@game.kr',null,60); // 같은 프로젝트의 다른 게임 계정 (hd3d 행 없음)
  const O=(id,user_id,email,nickname,item,status,i)=>{ d.hd3d_orders[id]={id,user_id,email,nickname,item,status,note:null,created_at:t(i),decided_at:status==='pending'?null:t(i+1)}; };
  O(1,'up1','p1@test.kr','장미기사','hero_gunner','pending',50); O(2,'uf1','f01@test.kr','모험가1','hero_gunner','approved',40); O(3,'uf2','f02@test.kr','모험가2','hero_mechanic','rejected',41); O(4,'up2','p2@test.kr','버들팬','hero_mechanic','approved',45);
  d.hd3d_mail[5]={id:5,user_id:'uf1',title:'🎁 구매하신 상품이 도착했습니다',body:'',reward:{hero:'gunner'},order_id:2,claimed:true,claimed_at:t(42),created_at:t(41)}; d.hd3d_owned['uf1:hero_gunner']={user_id:'uf1',item:'hero_gunner',source_mail:5,created_at:t(42)};
  d.hd3d_mail[6]={id:6,user_id:'up2',title:'🎁 구매하신 상품이 도착했습니다',body:'',reward:{hero:'mechanic'},order_id:4,claimed:false,claimed_at:null,created_at:t(46)};
  localStorage.setItem('__mockdb', JSON.stringify(d)); localStorage.removeItem('__mockflags'); }"""
TABS = [('orders', "()=>document.querySelectorAll('#admBody .admRow').length>0"), ('users', "()=>document.querySelectorAll('#admBody .auRow').length>0"), ('mail', "()=>!!document.getElementById('amEmail')"),
        ('broadcast', "()=>!!document.getElementById('bcTitle')"), ('notice', "()=>document.querySelectorAll('#admBody .ntRow').length>0"), ('log', "()=>document.querySelectorAll('#admBody .logRow').length>0"), ('admins', "()=>document.querySelectorAll('#admBody .admAdm').length>0")]
def overflow(pg):  # 관리자 패널이 화면 밖으로 넘치는지 + 가로 스크롤
    return J(pg, "()=>{ const p=document.getElementById('adminPanel').getBoundingClientRect(); return p.left>=-1 && p.top>=-1 && p.right<=innerWidth+1 && p.bottom<=innerHeight+1 && document.getElementById('adminPanel').scrollWidth<=document.getElementById('adminPanel').clientWidth+2; }")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = boot(c)
    J(pg, SEED)
    # ================= owner 관리자 =================
    login(pg, 'hyunjk11@daum.net'); ok('owner_status', J(pg, "()=>G.shop.Sh.S.me.admin && G.shop.Sh.S.me.owner") and not hidden(pg, 'mnAdmin'))
    town(pg); ok('owner_town_btn', not hidden(pg, 'twAdmin'))
    pg.click('#twAdmin'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===4", timeout=15000)
    ok('admins_tab_visible_owner', J(pg, "()=>!document.querySelector('#admTabs .ftab[data-t=admins]').classList.contains('hidden')"))
    t = pg.inner_text('#admBody'); ok('orders_list', '승인 대기' in t and '환불' in t and 'p1@test.kr' in t and '대기' in t, t[:300])
    pg.click('#admBody .admChips .ftab[data-s="pending"]'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===1", timeout=10000); ok('orders_filter_pending', 'p1@test.kr' in pg.inner_text('#admBody .admTable'))
    pg.click('#admBody .admChips .ftab[data-s=""]'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===4", timeout=10000)
    pg.fill('#aoQ', '모험가2'); pg.press('#aoQ', 'Enter'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===1", timeout=10000); ok('orders_search_user', '거절됨' in pg.inner_text('#admBody .admTable'))
    pg.fill('#aoQ', ''); pg.click('#admBody [data-act="osearch"]'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===4", timeout=10000)
    # 환불: 확인 창 + 사유 필수
    pg.click('#admBody .admRow:has-text("f01@test.kr") .admRefund'); confirm_open(pg)
    ok('refund_confirm', '영웅 소유권이 회수' in pg.inner_text('#admConfirm') and not J(pg, "()=>document.querySelector('#admConfirm .acfR').classList.contains('hidden')"))
    shot(pg, 'confirm_refund_1440')
    pg.click('#acfYes'); pg.wait_for_timeout(200); ok('refund_reason_required', '사유' in pg.inner_text('#admConfirm .acfE') and not hidden(pg, 'admConfirm'))
    pg.fill('#acfReason', '결제 취소 요청'); pg.click('#acfYes'); wait_msg(pg, '환불 처리 완료')
    d = db(pg); ok('refund_done', d['hd3d_orders']['2']['status'] == 'refunded' and 'uf1:hero_gunner' not in d['hd3d_owned'] and any(m['title'] == '환불 처리 안내' and m['user_id'] == 'uf1' for m in d['hd3d_mail'].values()))
    # 승인 (기존 흐름 그대로)
    pg.click('#admBody .admOk'); wait_msg(pg, '승인 완료'); ok('approve_still_works', db(pg)['hd3d_orders']['1']['status'] == 'approved')
    # ---- 유저 관리
    admin_tab(pg, 'users', "()=>document.querySelectorAll('#admBody .auRow').length===20")
    t = pg.inner_text('#admBody'); ok('users_list_paged', '27명' in t and 'other@game.kr' not in t and '1 / 2' in t, t[-200:])
    pg.click('#admBody .admPager [data-act="upage"]:not([disabled])'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .auRow').length===7", timeout=10000); ok('users_page2', '2 / 2' in pg.inner_text('#admBody'))
    pg.fill('#auQ', '장미'); pg.press('#auQ', 'Enter'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .auRow').length===1", timeout=10000)
    t = pg.inner_text('#admBody .auRow'); ok('users_search_summary', 'p1@test.kr' in t and '★ 5' in t and '하드 ★ 1' in t and '4,321' in t and '55' in t, t)
    shot(pg, 'users_search_1440')
    pg.click('#admBody .auRow'); pg.wait_for_function("()=>!!document.querySelector('#admBody .udGrid')", timeout=10000)
    t = pg.inner_text('#admBody'); ok('user_detail', '진행 요약' in t and '전직:' in t and '최고 웨이브 25' in t and '정수 3' in t and '정상 계정' in t, t[:400])
    # 영웅 지급 → 회수 (사유)
    pg.click('#admBody [data-act="ugrant"][data-k="hero_gunner"]'); confirm_yes(pg, '이벤트 당첨'); wait_msg(pg, '지급 완료')
    ok('grant_hero', 'up1:hero_gunner' in db(pg)['hd3d_owned'] and '보유 ✓' in pg.inner_text('#admBody'))
    shot(pg, 'user_detail_1440')
    pg.click('#admBody [data-act="urevoke"][data-k="hero_gunner"]'); confirm_yes(pg, '오지급 회수'); wait_msg(pg, '회수 완료'); ok('revoke_hero', 'up1:hero_gunner' not in db(pg)['hd3d_owned'])
    pg.fill('#udTitle', '개별 선물'); pg.fill('#udSouls', '77'); pg.click('#admBody [data-act="umail"]'); wait_msg(pg, '우편을 보냈어요')
    ok('user_mail', any(m['title'] == '개별 선물' and m['user_id'] == 'up1' and m['reward'] == {'souls': 77} for m in db(pg)['hd3d_mail'].values()))
    ok('user_detail_log', '영웅 지급' in pg.inner_text('#admBody') and '영웅 회수' in pg.inner_text('#admBody'))
    # ---- 아이템 · 조각(고유 정수) 지급: 검색 → 줄 추가 → 등급 변경 → 미리보기 → 보내기
    pg.fill('#udQ', '세계수 심장'); pg.wait_for_function("()=>document.querySelectorAll('#udRes .rwHit').length>=1", timeout=5000)
    ok('item_search', '세계수 심장활' in pg.inner_text('#udRes'), pg.inner_text('#udRes'))
    pg.click('#udRes .rwHit >> nth=0')
    pg.select_option('#udSlot', 'weapon'); pg.select_option('#udH', 'gunner'); pg.select_option('#udG', '3'); pg.select_option('#udC', '4'); pg.click('#admBody [data-act="rwgear"][data-px="ud"]')
    pg.select_option('#udSlot', 'armor'); ok('picker_hero_disabled_for_armor', J(pg, "()=>document.getElementById('udH').disabled")); pg.select_option('#udG', '1'); pg.click('#admBody [data-act="rwgear"][data-px="ud"]')
    pg.select_option('#admBody .rwLine >> nth=1 >> select.rwG', '4')  # 줄에서 등급 변경 (영웅 → 전설)
    pg.click('#admBody .rwLine >> nth=2 >> [data-act="rwdel"]')  # 방어구 줄 빼기
    pg.select_option('#udU', 'c_ring'); pg.click('#admBody [data-act="rwuq"][data-px="ud"]')
    pg.fill('#udEss', '25'); pg.fill('#udSouls', '0'); pg.wait_for_timeout(200)
    t = pg.inner_text('#udPrev'); ok('reward_preview', '고유 정수(조각) +25' in t and '세계수 심장활' in t and '전설 총사 무기' in t and '변환' in t and t.count('🎁') == 3, t)
    shot(pg, 'reward_picker_1440')
    pg.fill('#udTitle', '아이템 선물'); pg.click('#admBody [data-act="umail"]'); wait_msg(pg, '우편을 보냈어요')
    im = [m for m in db(pg)['hd3d_mail'].values() if m['title'] == '아이템 선물']
    ok('item_mail_sent', len(im) == 1 and im[0]['reward'] == {'essence': 25, 'items': [{'k': 'uq', 'u': 'f_bow'}, {'k': 'gear', 's': 'weapon', 'g': 4, 'h': 'gunner', 'c': 4}, {'k': 'uq', 'u': 'c_ring'}]}, im)
    ok('item_picker_reset', J(pg, "()=>document.querySelectorAll('#admBody .rwLine').length") == 0)
    r = J(pg, "()=>G.shop.Sh.sendMail('p1@test.kr', '중복 고유', '', {items:[{k:'uq',u:'f_bow'}]})"); ok('dup_mail_sent', r['ok'], r)
    bad = [J(pg, "(rw)=>G.shop.Sh.sendMail('p1@test.kr', 'x', '', rw)", rw) for rw in ({'items': [{'k': 'uq', 'u': 'zzz'}]}, {'essence': 10001}, {'items': [{'k': 'gear', 's': 'weapon', 'g': 1}]}, {'items': [{'k': 'uq', 'u': 'f_bow'}] * 11}, {'gems': 5})]
    ok('invalid_reward_rejected', all(not r['ok'] and '보상 값' in r['msg'] for r in bad), bad)
    ok('item_grant_logged', any(l['action'] == 'mail_send' and (l.get('detail') or {}).get('reward', {}) and 'items' in (l['detail']['reward'] or {}) for l in db(pg)['hd3d_admin_log'].values()))
    # 정지: p2 (확인 창 취소 → 그대로, 사유 → 정지)
    pg.click('#admBody [data-act="uback"]'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .auRow').length>=1", timeout=10000)
    pg.fill('#auQ', 'p2@'); pg.press('#auQ', 'Enter'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .auRow').length===1 && document.querySelector('#admBody .auRow').innerText.includes('p2@')", timeout=10000)
    pg.click('#admBody .auRow'); pg.wait_for_function("()=>!!document.querySelector('#admBody [data-act=uban]')", timeout=10000)
    pg.click('#admBody [data-act="uban"]'); confirm_open(pg); pg.click('#acfNo'); pg.wait_for_timeout(300); ok('ban_cancel', not db(pg).get('hd3d_bans', {}).get('up2'))
    pg.click('#admBody [data-act="uban"]'); confirm_yes(pg, '부정 결제 시도'); wait_msg(pg, '정지했어요')
    ok('ban_done', db(pg)['hd3d_bans']['up2']['reason'] == '부정 결제 시도' and '정지됨' in pg.inner_text('#admBody'))
    shot(pg, 'user_banned_1440')
    r = api(pg, f"A.ban('uadm', '테스트')"); ok('ban_self_denied', not r['ok'] and r['reason'] == 'self', r)
    r = api(pg, f"A.ban('usub', '테스트')"); ok('ban_unknown_ok_nonadmin', r['ok'], r); api(pg, "A.unban('usub', '테스트 해제')")
    # ---- 전체 우편
    admin_tab(pg, 'broadcast', "()=>!!document.getElementById('bcTitle')")
    r = api(pg, "A.broadcast('x', '', {souls:1}, 3)"); ok('broadcast_mismatch', not r['ok'] and r['reason'] == 'count_mismatch' and r['count'] == 27, r)
    n0 = len(db(pg)['hd3d_mail'])
    pg.fill('#bcTitle', '점검 보상'); pg.fill('#bcBody', '불편을 드려 죄송합니다.'); pg.fill('#bcSouls', '100'); pg.fill('#bcEss', '10'); pg.select_option('#bcSlot', 'acc'); pg.select_option('#bcG', '2'); pg.click('#admBody [data-act="rwgear"][data-px="bc"]'); pg.click('#bcSend'); confirm_open(pg)
    ok('broadcast_confirm_count', '27명' in pg.inner_text('#admConfirm') and '영혼석 100' in pg.inner_text('#admConfirm'), pg.inner_text('#admConfirm'))
    pg.click('#acfNo'); wait_msg(pg, '취소'); ok('broadcast_cancel', len(db(pg)['hd3d_mail']) == n0)
    ok('broadcast_confirm_items', '고유 정수 10' in pg.inner_text('#admConfirm') and '희귀 장신구' in pg.inner_text('#admConfirm'), pg.inner_text('#admConfirm'))
    pg.click('#bcSend'); confirm_open(pg); shot(pg, 'confirm_broadcast_1440'); pg.click('#acfYes'); wait_msg(pg, '27명에게')
    d = db(pg); bm = [m for m in d['hd3d_mail'].values() if m['title'] == '점검 보상']
    ok('broadcast_sent', len(bm) == 27 and len({m['user_id'] for m in bm}) == 27 and all(m.get('broadcast_id') for m in bm) and 'uother' not in {m['user_id'] for m in bm})
    r = api(pg, "A.broadcast('또', '', null, 27)"); ok('broadcast_cooldown', not r['ok'] and r['reason'] == 'too_soon', r)
    r = api(pg, "A.broadcast('x', '', {souls: 5000000}, 27)"); ok('broadcast_bad_reward', not r['ok'] and r['reason'] in ('bad_reward', 'too_soon'), r)
    # ---- 공지
    admin_tab(pg, 'notice', "()=>!!document.getElementById('ntTitle')")
    pg.fill('#ntTitle', '서버 점검 안내'); pg.fill('#ntBody', '오늘 밤 11시부터 30분간 점검합니다.'); pg.click('#ntSave'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .ntRow').length===1", timeout=10000)
    pg.fill('#ntTitle', '이벤트 공지'); pg.fill('#ntBody', '주말 영혼석 2배!'); pg.click('#ntSave'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .ntRow').length===2", timeout=10000)
    pg.fill('#ntTitle', '예약 공지'); pg.fill('#ntStart', '2030-01-01T09:00'); pg.click('#ntSave'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .ntRow').length===3", timeout=10000)
    ok('notice_states', '예약' in pg.inner_text('#admBody .admTable') and pg.inner_text('#admBody .admTable').count('게시 중') == 2)
    pg.click('#admBody .ntRow:has-text("서버 점검 안내") [data-act="ntedit"]'); pg.wait_for_timeout(300)
    ok('notice_edit_form', J(pg, "()=>document.getElementById('ntTitle').value") == '서버 점검 안내' and '수정' in pg.inner_text('#ntSave'))
    pg.fill('#ntTitle', '서버 점검 안내 (변경)'); pg.click('#ntSave'); wait_msg(pg, '수정했어요')
    pg.click('#admBody .ntRow:has-text("이벤트 공지") [data-act="ntoff"]'); wait_msg(pg, '내렸어요')
    d = db(pg); ns = sorted(d['hd3d_notices'].values(), key=lambda n: n['id']); ok('notice_saved', ns[0]['title'] == '서버 점검 안내 (변경)' and ns[0]['active'] and not ns[1]['active'] and ns[2]['starts_at'], ns)
    shot(pg, 'notice_1440')
    # ---- 활동 기록
    admin_tab(pg, 'log', "()=>document.querySelectorAll('#admBody .logRow').length>0")
    t = pg.inner_text('#admBody'); need = ['환불 처리', '주문 승인', '영웅 지급', '영웅 회수', '우편 보내기', '계정 정지', '전체 우편', '공지 작성', '공지 수정', '공지 내림']
    ok('log_actions', all(x in t for x in need), [x for x in need if x not in t])
    pg.select_option('#alAct', 'ban'); pg.wait_for_function("()=>[...document.querySelectorAll('#admBody .logRow')].every(r=>r.innerText.includes('계정 정지')) && document.querySelectorAll('#admBody .logRow').length===2", timeout=10000); ok('log_filter', True)
    ok('log_detail', '부정 결제 시도' in pg.inner_text('#admBody') and 'p2@test.kr' in pg.inner_text('#admBody'))
    pg.select_option('#alAct', ''); pg.wait_for_function("()=>document.querySelectorAll('#admBody .logRow').length>2", timeout=10000)
    # ---- 하위 관리자 추가 (owner)
    admin_tab(pg, 'admins', "()=>document.querySelectorAll('#admBody .admAdm').length===1")
    pg.fill('#aaEmail', 'sub@test.kr'); pg.click('#admBody [data-act="aadd"]'); confirm_yes(pg); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admAdm').length===2", timeout=10000)
    ok('admin_added', db(pg)['hd3d_admins']['usub']['owner'] is False and '관리자 추가' in J(pg, "()=>JSON.stringify(Object.values(JSON.parse(localStorage.getItem('__mockdb')).hd3d_admin_log).map(l=>l.action))").replace('admin_add', '관리자 추가'))
    r = api(pg, "A.removeAdmin('hyunjk11@daum.net')"); ok('owner_not_removable', not r['ok'] and r['reason'] == 'owner', r)
    r = api(pg, "A.ban('usub', 'x')"); ok('ban_admin_denied', not r['ok'] and r['reason'] == 'target_admin', r)
    # ---- 스크린샷: 모든 탭 × 2 크기
    for vw, vh in ((1440, 860), (1024, 600)):
        pg.set_viewport_size({'width': vw, 'height': vh}); pg.wait_for_timeout(400); fits = True
        for tname, cond in TABS:
            pg.click(f'#admTabs .ftab[data-t="{tname}"]'); pg.wait_for_function(cond, timeout=15000); pg.wait_for_timeout(300); fits = fits and overflow(pg)
            shot(pg, f'tab_{tname}_{vw}x{vh}')
        pg.click('#admTabs .ftab[data-t="users"]'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .auRow').length>0", timeout=10000); pg.click('#admBody .auRow'); pg.wait_for_function("()=>!!document.querySelector('#admBody .udGrid')", timeout=10000); pg.wait_for_timeout(300)
        fits = fits and overflow(pg); shot(pg, f'tab_user_detail_{vw}x{vh}')
        if vw == 1024:
            pg.fill('#udQ', '전설 방어구'); pg.wait_for_function("()=>document.querySelectorAll('#udRes .rwHit').length>=1", timeout=5000); pg.click('#udRes .rwHit >> nth=0'); pg.select_option('#udU', 'r_guns'); pg.click('#admBody [data-act="rwuq"][data-px="ud"]'); pg.fill('#udEss', '50')
            pg.locator('#udRw').scroll_into_view_if_needed(); fits = fits and overflow(pg); shot(pg, 'reward_picker_1024x600')
            ok('picker_fits_1024', J(pg, "()=>{ const r=document.getElementById('udRw').getBoundingClientRect(), p=document.getElementById('adminPanel').getBoundingClientRect(); return r.width<=p.width && document.getElementById('udRw').scrollWidth<=document.getElementById('udRw').clientWidth+2; }"))
            J(pg, "()=>{ for (const b of [...document.querySelectorAll('#admBody [data-act=rwdel]')].reverse()) b.click(); }")
        ok(f'panel_fits_{vw}x{vh}', fits)
        ok(f'tabs_one_row_{vw}x{vh}', J(pg, "()=>{ const t=[...document.querySelectorAll('#admTabs .ftab:not(.hidden)')].map(b=>b.getBoundingClientRect().top); return Math.max(...t)-Math.min(...t)<4; }"))
    pg.click('#admBody [data-act="ugrant"]'); confirm_open(pg); shot(pg, 'confirm_grant_1024x600'); pg.click('#acfNo')
    pg.set_viewport_size({'width': 1440, 'height': 860}); J(pg, "()=>G.shop.closeAdmin(true)")
    # ================= 일반 사용자 p1: UI 숨김 · RPC 거부 · 공지 배너 · 전체 우편 한 번만 =================
    J(pg, "()=>localStorage.removeItem('hd3d_notice_seen')")
    login(pg, 'p1@test.kr'); ok('user_no_admin_menu', hidden(pg, 'mnAdmin') and not J(pg, "()=>G.shop.Sh.S.me.admin"))
    town(pg); ok('user_no_admin_town', hidden(pg, 'twAdmin'))
    J(pg, "()=>G.shop.openAdmin()"); ok('user_panel_blocked', hidden(pg, 'adminPanel'))
    calls = {'users': "A.users('',0,20)", 'user': "A.user('up2')", 'grant': "A.grantHero('up1','hero_gunner','x')", 'revoke': "A.revokeHero('up2','hero_mechanic','x')", 'bcount': 'A.broadcastCount()', 'broadcast': "A.broadcast('x','',{souls:1},27)",
             'notice': "A.noticeSave(null,'x','',true)", 'nactive': 'A.noticeActive(1,false)', 'ban': "A.ban('up2','x')", 'unban': "A.unban('up2','x')", 'orders': 'A.orders()', 'refund': "A.refund(4,'x')", 'logs': 'A.logs()', 'admins': 'A.admins()', 'addAdmin': "A.addAdmin('p1@test.kr')", 'rmAdmin': "A.removeAdmin('sub@test.kr')"}
    bad = {k: r for k, e in calls.items() if (r := api(pg, e))['ok'] or '권한' not in r['msg']}; ok('user_all_rpcs_denied', not bad, bad)
    ok('user_status_flags', not J(pg, "()=>G.shop.Sh.S.me.admin || G.shop.Sh.S.me.owner"))
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); const a=await c.from('hd3d_notices').insert({title:'x'}); const b2=await c.from('hd3d_bans').insert({user_id:'up2'}); const l=await c.from('hd3d_admin_log').select('*'); return [a.error&&a.error.code, b2.error&&b2.error.code, (l.data||[]).length]; }")
    ok('user_table_writes_denied', r == ['42501', '42501', 0], r)
    pg.wait_for_function("()=>!document.getElementById('noticeBar').classList.contains('hidden')", timeout=15000)
    t = pg.inner_text('#noticeBar'); ok('notice_banner', '서버 점검 안내 (변경)' in t and '이벤트 공지' not in t and '예약 공지' not in t, t)
    shot(pg, 'notice_banner_1440', force=True)
    pg.click('#nbOk'); pg.wait_for_timeout(300); ok('notice_dismiss', hidden(pg, 'noticeBar') and '1' in J(pg, "()=>localStorage.getItem('hd3d_notice_seen')||''"))
    town(pg); pg.wait_for_timeout(1200); ok('notice_stays_dismissed', hidden(pg, 'noticeBar'))
    J(pg, "()=>G.shop.Sh.refresh()"); pg.wait_for_timeout(500)
    bmid = J(pg, "()=>G.shop.Sh.S.mail.find(m=>m.title==='점검 보상').id"); s0 = J(pg, "()=>G.gear.Acc.load().souls")
    r1 = J(pg, f"()=>G.shop.Sh.claim({bmid})"); r2 = J(pg, f"()=>G.shop.Sh.claim({bmid})"); s1 = J(pg, "()=>G.gear.Acc.load().souls")
    ok('broadcast_claim_once', r1['ok'] and not r1['already'] and r2['already'] and s1 == s0 + 100, (r1, r2, s0, s1))
    ok('broadcast_items_claimed', J(pg, f"()=>G.gear.Acc.load().chests.some(c=>c.id==='cm{bmid}_0' && c.it.s==='acc' && c.it.g===2)"))
    # 아이템·조각 받기 → 보관함/고유 정수, 중복 고유 → 변환, 다시 받기 → 변화 없음
    imid = J(pg, "()=>G.shop.Sh.S.mail.find(m=>m.title==='아이템 선물').id"); dmid = J(pg, "()=>G.shop.Sh.S.mail.find(m=>m.title==='중복 고유').id")
    e0 = J(pg, "()=>G.gear.Acc.load().mat.essence||0"); c0 = J(pg, "()=>G.gear.Acc.load().chests.length")
    J(pg, "()=>G.shop.openMail()"); pg.wait_for_timeout(600); ok('mail_item_text', '고유 정수 25' in pg.inner_text('#mailList') and '장비·고유 3개' in pg.inner_text('#mailList'), pg.inner_text('#mailList')[:300]); shot(pg, 'mail_items_1440'); J(pg, "()=>G.shop.closeMail(true)")
    r = J(pg, f"()=>G.shop.Sh.claim({imid})"); sv = J(pg, "()=>G.gear.Acc.load()")
    ok('claim_items', r['ok'] and '보상 상자' in r['msg'] and (sv['mat'].get('essence') or 0) == e0 + 25 and len(sv['chests']) == c0 + 3 and any(c['it'].get('uq') == 'f_bow' for c in sv['chests'])
       and any(c['id'] == f'cm{imid}_1' and c['it']['g'] == 4 and c['it']['h'] == 'gunner' and c['it'].get('c') == 4 for c in sv['chests']) and sv['uqLog'].get('c_ring'), (r, sv['mat'], len(sv['chests']), c0))
    r = J(pg, f"()=>G.shop.Sh.claim({dmid})"); sv2 = J(pg, "()=>G.gear.Acc.load()")
    ok('claim_unique_dup', r['ok'] and '바뀌었어요' in r['msg'] and len(sv2['chests']) == len(sv['chests']) and sv2['mat']['essence'] == sv['mat']['essence'] + 5 and sum(1 for c in sv2['chests'] if c['it'].get('uq') == 'f_bow') == 1, (r, sv2['mat']))
    r = J(pg, f"()=>G.shop.Sh.claim({imid})"); sv3 = J(pg, "()=>G.gear.Acc.load()"); ok('claim_items_once', r['already'] and sv3['mat']['essence'] == sv2['mat']['essence'] and len(sv3['chests']) == len(sv2['chests']), r)
    r = J(pg, "()=>G.shop.Sh.sendMail('p1@test.kr', 'x', '', {essence: 5, items:[{k:'uq',u:'f_bow'}]})"); ok('user_item_grant_denied', not r['ok'] and '권한' in r['msg'], r)
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); return (await c.rpc('hd3d_claim_mail', {p_mail_id: %d})).error; }" % next(m['id'] for m in db(pg)['hd3d_mail'].values() if m['title'] == '점검 보상' and m['user_id'] == 'up2'))
    ok('broadcast_other_user_mail_denied', r and r['code'] == 'P0002', r)
    # ================= 정지 사용자 p2 =================
    login(pg, 'p2@test.kr'); town(pg); pg.wait_for_function("()=>!document.getElementById('banNote').classList.contains('hidden')", timeout=15000)
    ok('ban_note', '정지' in pg.inner_text('#banNote') and '부정 결제 시도' in pg.inner_text('#banNote'))
    ok('ban_sync_text', '계정 정지' in pg.inner_text('#twAcct'), pg.inner_text('#twAcct'))
    shot(pg, 'banned_town_1440', force=True)
    before = db(pg)['hd3d_progress']['up2']['data'].get('souls')
    J(pg, "async()=>{ G.gear.Acc.update(d=>({...d, souls: d.souls + 999})); await G.gear.Acc.flush(); }"); pg.wait_for_timeout(500)
    ok('ban_no_progress_write', db(pg)['hd3d_progress']['up2']['data'].get('souls') == before)
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); const a=await c.from('hd3d_progress').update({data:{souls:1}}).eq('user_id','up2').select('updated_at'); const b=await c.from('hd3d_profiles').upsert({id:'up2',nickname:'hack'}); return [a.error&&a.error.code, b.error&&b.error.code]; }")
    ok('ban_rls_direct', r == ['42501', '42501'], r)
    r = J(pg, "()=>G.shop.Sh.order('hero_gunner')"); ok('ban_order_blocked', not r['ok'] and '정지' in r['msg'], r)
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); return (await c.from('hd3d_orders').insert({item:'hero_gunner'})).error; }"); ok('ban_order_server', r and r['code'] == '42501', r)
    bm2 = J(pg, "()=>G.shop.Sh.S.mail.find(m=>m.title==='점검 보상').id"); r = J(pg, f"()=>G.shop.Sh.claim({bm2})"); ok('ban_claim_blocked', not r['ok'] and '정지' in r['msg'], r)
    J(pg, "()=>G.shop.openShop('hero_gunner')"); pg.wait_for_timeout(600); ok('ban_shop_button', '계정 정지' in pg.inner_text('#shopBuyBtn')); J(pg, "()=>G.shop.closeShop(true)")
    J(pg, "()=>G.shop.openMail()"); pg.wait_for_timeout(600); ok('ban_mail_note', '정지' in pg.inner_text('#mailMsg')); shot(pg, 'banned_mail_1440'); J(pg, "()=>G.shop.closeMail(true)")
    # 환불로 회수된 미수령 우편은 못 받음 (p2 주문 4 의 버들 우편) → owner 가 환불 후 확인
    # ================= 하위 관리자 =================
    login(pg, 'sub@test.kr'); town(pg); ok('sub_admin_btn', not hidden(pg, 'twAdmin') and J(pg, "()=>G.shop.Sh.S.me.admin && !G.shop.Sh.S.me.owner"))
    pg.click('#twAdmin'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length>0", timeout=15000)
    ok('sub_no_admins_tab', J(pg, "()=>document.querySelector('#admTabs .ftab[data-t=admins]').classList.contains('hidden')"))
    r = api(pg, 'A.admins()'); r2 = api(pg, "A.addAdmin('p1@test.kr')"); ok('sub_owner_rpcs_denied', not r['ok'] and not r2['ok'] and '권한' in r['msg'], (r, r2))
    r = api(pg, "A.unban('up2', '소명 확인')"); ok('sub_can_unban', r['ok'], r)
    r = api(pg, "A.refund(4, '중복 결제')"); ok('sub_can_refund', r['ok'] and r['data']['mail_revoked'] == 1, r)
    r = api(pg, "A.ban('uadm', 'x')"); ok('sub_cannot_ban_owner', not r['ok'] and r['reason'] == 'target_admin', r)
    J(pg, "()=>G.shop.closeAdmin(true)")
    # p2: 해제 후 → 받기 가능, 환불로 회수된 우편은 받기 불가
    login(pg, 'p2@test.kr'); town(pg); pg.wait_for_timeout(500); ok('unbanned_note_hidden', hidden(pg, 'banNote') and '정지' not in pg.inner_text('#twAcct'))
    r = J(pg, f"()=>G.shop.Sh.claim({bm2})"); ok('unbanned_claim', r['ok'] and not r['already'], r)
    r = J(pg, "()=>G.shop.Sh.claim(6)"); ok('revoked_mail_unclaimable', not r['ok'] and '회수' in r['msg'] and 'up2:hero_mechanic' not in db(pg)['hd3d_owned'], r)
    J(pg, "()=>G.shop.openMail()"); pg.wait_for_timeout(600); ok('revoked_mail_label', '회수됨' in pg.inner_text('#mailList')); J(pg, "()=>G.shop.closeMail(true)")
    pg.wait_for_function(f"()=>JSON.parse(localStorage.getItem('__mockdb')).hd3d_progress.up2.data.souls!=={before}", timeout=20000); ok('unbanned_save_resumes', True)
    c.close()
    # ================= 서버 구버전 (관리자 확장 SQL 미실행) =================
    c = b.new_context(viewport={'width': 1440, 'height': 860}); c.add_init_script(MOCK); pg = boot(c); J(pg, SEED); J(pg, "()=>localStorage.setItem('__mockflags', JSON.stringify({noAdmin2:true}))")
    login(pg, 'hyunjk11@daum.net'); town(pg); ok('old_owner_btn_fallback', not hidden(pg, 'twAdmin') and J(pg, "()=>G.shop.Sh.S.me.st") == 'missing')
    pg.click('#twAdmin'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length===4", timeout=15000)
    ok('old_update_msg', 'schema.sql 을 다시 실행' in msg(pg), msg(pg))
    pg.click('#admBody .admOk'); wait_msg(pg, '승인 완료'); ok('old_approve_works', db(pg)['hd3d_orders']['1']['status'] == 'approved')
    admin_tab(pg, 'users', "()=>document.getElementById('admMsg').innerText.includes('서버 업데이트 필요')"); ok('old_users_msg', True)
    admin_tab(pg, 'notice', "()=>document.getElementById('admMsg').innerText.includes('서버 업데이트 필요')"); ok('old_notice_msg', True)
    shot(pg, 'old_server_1440')
    login(pg, 'p1@test.kr'); town(pg); pg.wait_for_timeout(800); ok('old_user_no_banner', hidden(pg, 'noticeBar') and hidden(pg, 'banNote') and hidden(pg, 'twAdmin'))
    c.close(); b.close()
fail = [k for k, v in res.items() if not v]; print('errors', errs[:5]); print(f'{len(res) - len(fail)}/{len(res)}', 'FAIL ' + ','.join(fail) if fail or errs else 'ALL OK'); sys.exit(1 if fail or errs else 0)
