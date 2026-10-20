#!/usr/bin/env python3
"""저장 충돌 · 우편 보상 장부 · 탭 숨김 저장 테스트 (가짜 Supabase tests/sbmock.js).  python3 tests/sync.py
 S-2 기기 간 충돌: 다른 기기가 먼저 저장(서버 updated_at 변경) → 이 기기 저장은 0행 → 서버 행을 읽어 P.merge 후 재저장 (양쪽 진행 모두 보존)
     저장 응답 유실(loseSave) → 다음 저장은 기준 시각이 낡아 충돌 경로 → 같은 데이터 병합 후 성공 (중복 없음)
     시작 시 이 기기에 안 올린 진행(dirty) + 그 사이 다른 기기 저장 → 불러올 때 병합
 S-3 우편 받기 성공 후 응답 유실(loseClaim) → '받는 중' 기록 → 다음 refresh 때 자동 복구로 한 번만 지급 / '받는 중'이 아니던 이미 받은 우편은 지급 안 함
 S-4 visibilitychange(hidden) → 디바운스(3초) 기다리지 않고 바로 저장"""
import sys, os, json, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); errs, res = [], {}
def ok(n, c, info=''): res[n] = bool(c); print(('OK  ' if c else 'FAIL'), n, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
AC, SH = 'G.gear.Acc', 'G.shop.Sh'
DB = "JSON.parse(localStorage.getItem('__mockdb')||'{}')"
def boot(c):
    pg = c.new_page(); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200]))
    pg.goto(url + '?seed=12345&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen&&G.gear&&G.shop', timeout=180000); return pg
def cloud(pg): return J(pg, f"()=>{{ const d = {DB}; return Object.values(d.hd3d_progress)[0]; }}")
def other_device(pg, fn):  # 다른 기기가 저장한 것처럼 서버 행을 바꾸고 updated_at 갱신
    J(pg, f"()=>{{ const d = {DB}, r = Object.values(d.hd3d_progress)[0]; ({fn})(r.data); d.lastTs = Math.max(Date.now(), (d.lastTs||0) + 1) + 5; r.updated_at = new Date(d.lastTs).toISOString(); localStorage.setItem('__mockdb', JSON.stringify(d)); }}")
flags = lambda pg, f: J(pg, f"()=>localStorage.setItem('__mockflags', JSON.stringify({json.dumps(f)}))")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 760}); c.add_init_script(MOCK); pg = boot(c)
    J(pg, f"()=>{AC}.signUp('sync@test.kr', 'secret12')"); pg.wait_for_function(f"()=>{AC}.A.sync==='saved'", timeout=15000)
    ts0 = J(pg, f"()=>localStorage.getItem('hd3d_cloud_ts_' + {AC}.A.user.id)"); ok('ts_remembered', ts0 and ts0 == cloud(pg)['updated_at'], ts0)
    # --- S-2 충돌: 다른 기기 = 영혼석 500 · 궁수 공격 3, 이 기기 = 영혼석 +30 · 전사 체력 2
    other_device(pg, "d => { d.souls = 500; d.heroLv.archer.atk = 3; d.stats.runs = 9; }")
    J(pg, f"()=>{AC}.update(d => ({{ ...d, souls: d.souls + 30, heroLv: {{ ...d.heroLv, warrior: {{ hp: 2, atk: 0 }} }} }}))")
    r = J(pg, f"async ()=>{{ const c0 = {AC}.A.conflicts, ok = await {AC}.flush(); return [ok, {AC}.A.conflicts - c0, localStorage.getItem('hd3d_dirty')]; }}")
    s, cl = J(pg, f"()=>{AC}.load()"), cloud(pg)
    ok('conflict_detected_and_saved', r[0] is True and r[1] >= 1 and r[2] is None, r)
    ok('conflict_merged_both_devices', s['souls'] == 500 and s['heroLv']['archer']['atk'] == 3 and s['heroLv']['warrior']['hp'] == 2 and s['stats']['runs'] == 9, (s['souls'], s['heroLv']['archer'], s['heroLv']['warrior']))
    ok('cloud_equals_local', json.dumps(cl['data'], sort_keys=True) == json.dumps(s, sort_keys=True) and cl['updated_at'] == J(pg, f"()=>localStorage.getItem('hd3d_cloud_ts_' + {AC}.A.user.id)"))
    # --- 응답 유실: 서버엔 반영됐지만 클라이언트는 실패로 봄 → 다음 저장에서 충돌 경로로 복구
    flags(pg, {'loseSave': True}); J(pg, f"()=>{AC}.update(d => ({{ ...d, souls: d.souls + 7 }}))")
    r1 = J(pg, f"()=>{AC}.flush()"); flags(pg, {})
    r2 = J(pg, f"async ()=>{{ const ok = await {AC}.flush(); return [ok, localStorage.getItem('hd3d_dirty')]; }}"); s, cl = J(pg, f"()=>{AC}.load()"), cloud(pg)
    ok('lost_save_response_recovers', r1 is False and r2[0] is True and r2[1] is None and s['souls'] == 507 and cl['data']['souls'] == 507, (r1, r2, s['souls'], cl['data']['souls']))
    # --- 저장 중에 또 저장 (직렬화)
    r = J(pg, f"async ()=>{{ const c0 = {AC}.A.conflicts; {AC}.update(d => ({{ ...d, souls: d.souls + 1 }})); const p1 = {AC}.flush(); {AC}.update(d => ({{ ...d, souls: d.souls + 1 }})); const p2 = {AC}.flush(); await Promise.all([p1, p2]); await new Promise(r => setTimeout(r, 50)); return [{AC}.A.conflicts - c0, {AC}.load().souls]; }}")
    ok('concurrent_saves_serialized', r[0] == 0 and r[1] == 509 and cloud(pg)['data']['souls'] == 509, r)
    # --- S-4 탭 숨김 → 즉시 저장 (디바운스 3초 전에)
    J(pg, f"()=>{AC}.update(d => ({{ ...d, souls: d.souls + 11 }}))")
    J(pg, "()=>{ Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }")
    pg.wait_for_timeout(600); ok('visibility_hidden_flush', cloud(pg)['data']['souls'] == 520 and J(pg, "()=>localStorage.getItem('hd3d_dirty')") is None, cloud(pg)['data']['souls'])
    J(pg, "()=>{ Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); }")
    # --- 시작 시 병합: 이 기기에 안 올린 진행 + 다른 기기 저장 → 다시 불러오면 병합
    flags(pg, {'offline': True}); J(pg, f"()=>{AC}.update(d => ({{ ...d, heroLv: {{ ...d.heroLv, mage: {{ hp: 4, atk: 0 }} }} }}))"); pg.wait_for_timeout(300)
    other_device(pg, "d => { d.souls = 900; d.heroLv.archer.hp = 5; }"); flags(pg, {})
    pg.close(); pg = boot(c)
    if J(pg, '()=>G.screen') == 'intro': pg.mouse.click(600, 400)
    pg.wait_for_function(f"()=>{AC}.A.user && {AC}.A.sync==='saved'", timeout=20000); s, cl = J(pg, f"()=>{AC}.load()"), cloud(pg)
    ok('load_merges_offline_progress', s['heroLv']['mage']['hp'] == 4 and s['heroLv']['archer']['hp'] == 5 and s['souls'] == 900 and cl['data']['heroLv']['mage']['hp'] == 4, (s['heroLv']['mage'], s['heroLv']['archer'], s['souls']))
    # --- S-3 우편 보상 장부
    uid = J(pg, f"()=>{AC}.A.user.id")
    def mail(reward, claimed=False): return J(pg, f"""()=>{{ const d = {DB}; d.hd3d_mail = d.hd3d_mail || {{}}; const id = d.seq = (d.seq || 0) + 1;
      d.hd3d_mail[id] = {{ id, user_id: '{uid}', title: '선물', body: '', reward: {json.dumps(reward)}, order_id: null, claimed: {str(claimed).lower()}, claimed_at: null, created_at: new Date().toISOString() }}; localStorage.setItem('__mockdb', JSON.stringify(d)); return id; }}""")
    m1 = mail({'souls': 300, 'steel': 4}); J(pg, f"()=>{SH}.refresh()"); s0 = J(pg, f"()=>{AC}.load()")
    flags(pg, {'loseClaim': True}); r = J(pg, f"(id)=>{SH}.claim(id)", m1); flags(pg, {})
    s1 = J(pg, f"()=>{AC}.load()"); srv_claimed = J(pg, f"(id)=>{DB}.hd3d_mail[id].claimed", m1)
    ok('lost_claim_pending', r['ok'] is False and srv_claimed and s1['souls'] == s0['souls'] and J(pg, f"()=>{SH}.pendingClaims()") == [m1], (r, srv_claimed))
    J(pg, f"()=>{SH}.refresh()"); pg.wait_for_function(f"()=>{SH}.pendingClaims().length===0", timeout=10000); pg.wait_for_timeout(300); s2 = J(pg, f"()=>{AC}.load()")
    ok('lost_claim_recovered_once', s2['souls'] == s0['souls'] + 300 and s2['mat']['steel'] == s0['mat']['steel'] + 4 and m1 in s2['mailLog'], (s0['souls'], s2['souls'], s2['mailLog']))
    r = J(pg, f"(id)=>{SH}.claim(id)", m1); s3 = J(pg, f"()=>{AC}.load()")
    ok('reclaim_no_double', r['already'] and s3['souls'] == s2['souls'], r)
    J(pg, f"(id)=>localStorage.setItem('hd3d_mailpend_' + {AC}.A.user.id, JSON.stringify([id]))", m1); J(pg, f"()=>{SH}.recoverClaims()"); s3b = J(pg, f"()=>{AC}.load()")
    ok('ledger_blocks_double_after_stale_pending', s3b['souls'] == s2['souls'] and J(pg, f"()=>{SH}.pendingClaims()") == [])
    m2 = mail({'souls': 1000}, claimed=True); r = J(pg, f"(id)=>{SH}.claim(id)", m2); s4 = J(pg, f"()=>{AC}.load()")
    ok('already_not_pending_not_paid', r['already'] and s4['souls'] == s3['souls'] and m2 not in s4['mailLog'], r)
    m3 = mail({'crystal': 6}); r = J(pg, f"(id)=>{SH}.claim(id)", m3); s5 = J(pg, f"()=>{AC}.load()")
    ok('normal_claim', r['ok'] and not r['already'] and s5['mat']['crystal'] == s4['mat']['crystal'] + 6 and m3 in s5['mailLog'], r)
    pg.wait_for_function(f"()=>{AC}.A.sync==='saved'", timeout=15000); ok('ledger_synced', m3 in cloud(pg)['data']['mailLog'] and m1 in cloud(pg)['data']['mailLog'])
    b.close()
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
