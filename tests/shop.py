#!/usr/bin/env python3
"""상점 · 우편함 · 관리자 흐름 테스트 (가짜 Supabase tests/sbmock.js, 네트워크 없음).  python3 tests/shop.py [--shots]
게스트 구매 불가 → 회원 구매 신청(pending) → 중복 차단 → 관리자 승인 → 우편 → 받기(멱등) → 로즈 해금·출정.
비관리자 관리자 버튼 없음 + 서버 RPC 거부, 소유권 위조(세이브/테이블 쓰기) 무효, 서버 테이블 없음 → '서버 준비 중'. 스크린샷 shots/shop/."""
import sys, os, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
SHOTS = '--shots' in sys.argv; OUT = 'shots/shop'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
hidden = lambda pg, id: J(pg, f"()=>document.getElementById('{id}').classList.contains('hidden')")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, name):
    if SHOTS: pg.wait_for_timeout(700); J(pg, RAF); pg.screenshot(path=f'{OUT}/{name}.png', timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
def eshot(pg, sel, path):  # 요소 영역만 촬영 (영웅 선택 패널 잠김/해금 비교용)
    if SHOTS: pg.wait_for_timeout(700); J(pg, RAF); pg.locator(sel).screenshot(path=path, timeout=180000); J(pg, "()=>{ G.pauseRender=false }")
def compose(name, parts):  # [(경로, 제목)] → 가로로 이어 붙인 한 장
    if not SHOTS: return
    from PIL import Image, ImageDraw, ImageFont
    ims = [Image.open(p).convert('RGB') for p, _ in parts]; H = max(i.height for i in ims) + 44; W = sum(i.width for i in ims) + 24 * (len(ims) + 1)
    out = Image.new('RGB', (W, H + 12), (14, 11, 24)); d = ImageDraw.Draw(out)
    try: f = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 22)
    except Exception: f = ImageFont.load_default()
    x = 24
    for im, (p, t) in zip(ims, parts): d.text((x, 8), t, font=f, fill=(255, 176, 212)); out.paste(im, (x, 44)); x += im.width + 24; os.remove(p)
    out.save(f'{OUT}/{name}.png')
db = lambda pg: J(pg, "()=>JSON.parse(localStorage.getItem('__mockdb')||'{}')")
def boot(c, q='?seed=12345&flow=1'):
    pg = c.new_page(); pg.on('dialog', lambda d: d.accept()); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000); return pg
def login(pg, email, up=True):  # 로그인 화면 또는 메뉴에서 → 메뉴
    if J(pg, '()=>G.screen') == 'intro': pg.mouse.click(640, 400); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'town': pg.click('#twMenu'); pg.wait_for_timeout(300)
    if J(pg, '()=>G.screen') == 'menu': pg.click('#mnAuth'); pg.wait_for_timeout(500)
    pg.fill('#lgEmail', email); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp' if up else '#lgIn'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(600)
def town(pg): J(pg, "()=>import('./src/ui/flow.js').then(m=>m.enterTown())"); pg.wait_for_function("()=>G.screen==='town'", timeout=30000); pg.wait_for_timeout(900)
SH = "G.shop.Sh"
def sstat(pg): pg.wait_for_function(f"()=>{SH}.S.status!=='loading'", timeout=15000); return J(pg, f"()=>{SH}.S.status")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = boot(c)
    # ---- 1) 게스트: 구매 불가, 로즈 잠김, 관리자/우편 배지 없음
    pg.mouse.click(640, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(300); town(pg)
    ok('guest_rose_locked', J(pg, "()=>{const b=document.querySelector('.hcard[data-h=gunner]'); return !!b && b.classList.contains('locked') && b.innerText.includes('상점에서 구매')}"))
    ok('guest_no_admin', hidden(pg, 'twAdmin') and hidden(pg, 'twMailN'))
    eshot(pg, '.twLeft', f'{OUT}/_sel_locked.png')
    pg.click('.hcard[data-h="gunner"]'); pg.wait_for_timeout(400)
    ok('locked_card_opens_shop', not hidden(pg, 'shopPanel') and J(pg, "()=>G.gear.Acc.load().hero") != 'gunner')
    ok('guest_buy_disabled', J(pg, "()=>document.getElementById('shopBuyBtn').disabled") and '로그인' in pg.inner_text('#shopBuyBtn'), pg.inner_text('#shopBuyBtn'))
    r = J(pg, f"()=>{SH}.order('hero_gunner')"); ok('guest_order_blocked', not r['ok'] and '게스트' in r['msg'], r)
    ok('shop_price', '₩9,900' in pg.inner_text('#shopPrice') and J(pg, "()=>{const l=document.querySelector('#townLabels .tlabel.shop'); return !!l && !l.innerText.includes('준비 중')}"))
    pg.click('#shopClose'); pg.wait_for_timeout(200)
    # 마을에서 상점 건물로 걸어가면 열림
    J(pg, "()=>{ const [x,z,fx,fz]=G.townShop(); G.townTeleport(fx*1.6-x*.6, fz*1.6-z*.6); G.townGoal(fx, fz); }")
    pg.wait_for_function("()=>!document.getElementById('shopPanel').classList.contains('hidden')", timeout=60000); ok('walk_to_shop_opens', True); J(pg, "()=>G.shop.closeShop(true)")
    # ---- 2) 회원 p: 구매 신청 → 대기 → 중복 차단, 위조 무효
    login(pg, 'p@test.kr'); ok('user_no_admin_menu', hidden(pg, 'mnAdmin')); town(pg); ok('user_no_admin_town', hidden(pg, 'twAdmin'))
    J(pg, "()=>G.shop.openShop()"); pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('구매 신청')", timeout=15000)
    ok('buy_enabled', not J(pg, "()=>document.getElementById('shopBuyBtn').disabled") and '입금' not in pg.inner_text('#shopBuyBtn'))
    shot(pg, 'shop')
    pg.click('#shopBuyBtn'); pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('승인 대기')", timeout=15000)
    ok('order_pending', '접수' in pg.inner_text('#shopMsg') and [o['status'] for o in db(pg)['hd3d_orders'].values()] == ['pending'])
    r = J(pg, f"()=>{SH}.order('hero_gunner')"); ok('dup_blocked_client', not r['ok'] and '이미' in r['msg'], r)
    r = J(pg, "async()=>{ const c=await (await import('./src/account/account.js')).ensureClient(); const a=await c.from('hd3d_orders').insert({item:'hero_gunner'}); const b2=await c.from('hd3d_owned').insert({item:'hero_gunner'}); return [a.error&&a.error.code, b2.error&&b2.error.code]; }")
    ok('dup_blocked_server_and_owned_unwritable', r == ['23505', '42501'], r)
    J(pg, "()=>G.gear.Acc.update(d=>({...d, hero:'gunner'}))"); pg.wait_for_timeout(300)
    ok('save_tamper_no_unlock', J(pg, f"()=>!{SH}.heroOwned('gunner') && G.townHero && document.querySelector('.hcard.sel').dataset.h!=='gunner'"))
    r = J(pg, f"()=>{SH}.approve(1)"); ok('non_admin_rpc_forbidden', not r['ok'] and '권한' in r['msg'], r)
    J(pg, "()=>G.shop.openAdmin()"); ok('non_admin_panel_blocked', hidden(pg, 'adminPanel'))
    # ---- 3) 관리자: 목록 → 승인 → 우편 보내기
    login(pg, 'hyunjk11@daum.net'); ok('admin_menu_btn', not hidden(pg, 'mnAdmin')); town(pg); ok('admin_town_btn', not hidden(pg, 'twAdmin'))
    pg.click('#twAdmin'); pg.wait_for_function("()=>document.querySelectorAll('#admBody .admRow').length>0", timeout=15000)
    ok('admin_sees_order', 'p@test.kr' in pg.inner_text('#admBody') and '승인 대기' in pg.inner_text('#admBody'))
    shot(pg, 'admin')
    pg.click('#admBody .admOk'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.includes('승인 완료')", timeout=15000)
    d = db(pg); ok('approved_mail_sent', list(d['hd3d_orders'].values())[0]['status'] == 'approved' and any((m.get('reward') or {}).get('hero') == 'gunner' for m in d['hd3d_mail'].values()))
    pg.click('#admTabs .ftab[data-t="mail"]'); pg.fill('#amEmail', 'nobody@test.kr'); pg.fill('#amSouls', '50'); pg.click('#amSend'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.length>0", timeout=10000)
    ok('admin_mail_no_user', '없습니다' in pg.inner_text('#admMsg'), pg.inner_text('#admMsg'))
    pg.fill('#amEmail', 'p@test.kr'); pg.fill('#amTitle', '환영 선물'); pg.click('#amSend'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.includes('보냈어요')", timeout=10000)
    ok('admin_mail_sent', len(db(pg)['hd3d_mail']) == 2)
    pg.click('#admClose')
    # ---- 4) p: 우편함 배지 → 받기 → 로즈 해금 (멱등) → 출정
    login(pg, 'p@test.kr', up=False); town(pg); sstat(pg)
    pg.wait_for_function("()=>!document.getElementById('twMailN').classList.contains('hidden')", timeout=15000); ok('mail_badge', pg.inner_text('#twMailN') == '2', pg.inner_text('#twMailN'))
    ok('still_locked_before_claim', J(pg, "()=>document.querySelector('.hcard[data-h=gunner]').classList.contains('locked')"))
    pg.click('#twMail'); pg.wait_for_function("()=>document.querySelectorAll('#mailList .mClaim').length===2", timeout=15000)
    shot(pg, 'mailbox')
    s0 = J(pg, "()=>G.gear.Acc.load().souls")
    rose_id = J(pg, f"()=>{SH}.S.mail.find(m=>m.reward&&m.reward.hero).id"); gift_id = J(pg, f"()=>{SH}.S.mail.find(m=>m.reward&&m.reward.souls).id")
    pg.click(f'#mailList .mClaim[data-id="{rose_id}"]'); pg.wait_for_function("()=>document.getElementById('mailMsg').innerText.includes('해금')", timeout=15000)
    ok('rose_unlocked', J(pg, f"()=>{SH}.heroOwned('gunner') && !document.querySelector('.hcard[data-h=gunner]').classList.contains('locked')") and any(k.endswith(':hero_gunner') for k in db(pg)['hd3d_owned']))
    r = J(pg, f"()=>{SH}.claim({rose_id})"); ok('claim_idempotent', r['ok'] and r['already'] and len(db(pg)['hd3d_owned']) == 1, r)
    J(pg, f"()=>Promise.all([{SH}.claim({gift_id}), {SH}.claim({gift_id})])"); pg.wait_for_timeout(500); J(pg, f"()=>{SH}.claim({gift_id})"); pg.wait_for_timeout(300)
    ok('gift_once', J(pg, "()=>G.gear.Acc.load().souls") == s0 + 50, (s0, J(pg, "()=>G.gear.Acc.load().souls")))
    ok('badge_cleared', hidden(pg, 'twMailN'))
    r = J(pg, f"()=>{SH}.order('hero_gunner')"); ok('owned_cannot_buy', not r['ok'] and '보유' in r['msg'], r)
    pg.click('#mailClose'); J(pg, "()=>G.shop.openShop()"); pg.wait_for_timeout(500); ok('shop_shows_owned', '보유 중' in pg.inner_text('#shopBuyBtn')); J(pg, "()=>G.shop.closeShop(true)")
    pg.click('.hcard[data-h="gunner"]'); pg.wait_for_timeout(500)
    ok('rose_selectable', J(pg, "()=>G.gear.Acc.load().hero") == 'gunner' and '로즈' in pg.inner_text('.hcard.sel'))
    eshot(pg, '.twLeft', f'{OUT}/_sel_unlocked.png'); compose('rose_select', [(f'{OUT}/_sel_locked.png', '구매 전 (잠김)'), (f'{OUT}/_sel_unlocked.png', '우편 수령 후 (해금 · 선택)')])
    # 새로고침(?stage&run) 출정: 서버 소유권 확인 후 로즈로 시작
    J(pg, "()=>G.stageSel.departStage('1-1')"); pg.wait_for_function("()=>window.G&&G.ready&&G.phase==='build'&&G.hero", timeout=180000)
    ok('stage_run_as_rose', J(pg, '()=>G.hero.cls') == 'gunner', J(pg, '()=>G.hero.cls'))
    c.close()
    # ---- 5) 다른 계정은 로즈 없음 (계정별 소유)
    c = b.new_context(); c.add_init_script(MOCK); pg = boot(c); login(pg, 'q@test.kr'); town(pg); sstat(pg)
    ok('other_user_locked', J(pg, f"()=>!{SH}.heroOwned('gunner')")); c.close()
    # ---- 6) 상점 테이블 없음 → '서버 준비 중' (진행 저장은 정상)
    c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); c.add_init_script("localStorage.setItem('__mockflags', JSON.stringify({noShop:true}))"); pg = boot(c)
    login(pg, 'm@test.kr'); town(pg); J(pg, "()=>G.shop.openShop()"); pg.wait_for_function("()=>document.getElementById('shopBuyBtn').textContent.includes('서버 준비 중')", timeout=15000)
    ok('missing_shop', J(pg, "()=>document.getElementById('shopBuyBtn').disabled"))
    r = J(pg, f"()=>{SH}.order('hero_gunner')"); ok('missing_order_msg', not r['ok'] and '서버 준비 중' in r['msg'], r)
    pg.click('#twMail'); pg.wait_for_timeout(600); ok('missing_mail', '서버 준비 중' in pg.inner_text('#mailList'))
    ok('missing_progress_ok', '서버 준비 중' not in pg.inner_text('#twAcct'), pg.inner_text('#twAcct'))
    login(pg, 'hyunjk11@daum.net'); town(pg); pg.click('#twAdmin'); pg.wait_for_function("()=>document.getElementById('admMsg').innerText.length>0", timeout=10000)
    ok('missing_admin', '서버 준비 중' in pg.inner_text('#admMsg'), pg.inner_text('#admMsg')); c.close()
    b.close()
fail = [k for k, v in res.items() if not v]; print('errors', errs[:5]); print(f'{len(res) - len(fail)}/{len(res)}', 'FAIL ' + ','.join(fail) if fail or errs else 'ALL OK'); sys.exit(1 if fail or errs else 0)
