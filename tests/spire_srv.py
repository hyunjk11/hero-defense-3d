#!/usr/bin/env python3
"""🗼 무한의 탑 T-7 정식 탑 (서버 기록) — 가짜 Supabase tests/sbmock.js · ?sptest=1 · 데스크톱만
 spStart → token → 새로고침 진입 = ranked · 5층 돌파 = 체크포인트 ping(첫 돌파 영혼석 400 우편) · 전멸 = finish(인정 층 · 신기록 · 보상 표시)
 · URL 시작층 바꿈 = 연습 · noSpire(스키마 미실행) = 연습 '서버 업데이트 필요' · 하루 30회 = 출발 막음 · 오프라인 ping 재시도 · 게스트 = 연습 · 콘솔 오류 0
python3 tests/spire_srv.py"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, str(info)[:600], flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
SKIP = "()=>{ const D=G.dg, F=D.floors[D.floor]; D.q=[]; D.qe=[]; D.wave=F.waves.length-1; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e, 1e9); G.sim(2.5); return [D.floor, F.floor, !!D.blessing, D.nextT>0, !!G.dgResult]; }"
HEAL = "()=>G.heroes.forEach(h=>{ if (h.dead>0) { h.dead=0; h.hb&&h.hb.show(true); } h.hp=h.max; })"
AGE = "(ms)=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); for (const r of Object.values(d.sp_runs||{})) if (r.status==='active') { r.started-=ms; if (r.pingAt) r.pingAt-=ms; } localStorage.setItem('__mockdb', JSON.stringify(d)); }"
NEXT = "()=>{ for (let i=0;i<80;i++) { if (G.dg.blessing) G.dgTakeBless(G.dg.blessing[0]); G.sim(.1); if (!G.dg.nextT && !G.dg.blessing) break; } }"
def login(pg, q, mail):
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    pg.mouse.click(400, 300); pg.wait_for_timeout(300); pg.fill('#lgEmail', mail); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=20000)
def wait_run(pg):
    pg.wait_for_function("()=>window.G&&G.dungeon&&G.phase==='wave'&&G.heroes&&G.heroes.length>=3", timeout=300000); J(pg, "()=>{ G.manual=true; G.pauseRender=true; }")
def start(pg, n):  # 입장 화면 없이: 서버 등록(spStart) → 연습이면 표시 → 새로고침 진입 (ui 탭이 하는 것과 같은 순서)
    r = J(pg, "async(n)=>{ const S=await import('./src/account/spire.js'); const r=await S.spStart(n); if (r.mode==='practice') S.markPractice(r.why, r.from); if (!r.blocked) (await import('./src/core/nav.js')).go({spire:r.from||n}, 0); return r; }", n)
    if not r.get('blocked'): wait_run(pg)
    return r
def wipe(pg):
    J(pg, "()=>{ for (let i=0;i<5 && G.dg.blessing;i++) { G.dgTakeBless(G.dg.blessing[0]); G.sim(.2); } G.heroes.forEach(h=>{ h.hp=0; h.dead=5; }); G.sim(.5); }")
    pg.wait_for_function("()=>{ const m=document.getElementById('spRecRes'); return !m || !/저장 중/.test(m.textContent); }", timeout=20000)
    return J(pg, "()=>({r:G.dgResult, t:document.querySelector('#stageClear .scT')?.textContent, rw:document.querySelector('#stageClear .scRw')?.textContent})")
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 800}); c.add_init_script(MOCK); pg = c.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300])); pg.on('console', lambda m: m.type == 'error' and errs.append('CE ' + m.text[:300]))
    login(pg, '?seed=5161&rng=41&flow=1&dgtest=1&sptest=1', 'sps1@test.kr')
    st = J(pg, "async()=>{ const S=await import('./src/account/spire.js'); await S.spStatus(); return {...S.SPS}; }")
    ok('status_ok', st['st'] == 'ok' and st['best'] == 0 and st['checkpoints'] == [1] and st['left'] == 30, st)
    r = J(pg, "async()=>{ const S=await import('./src/account/spire.js'); return S.spStart(6); }")
    ok('bad_from_blocked', r.get('blocked') and '체크포인트' in r['msg'], r)
    r = start(pg, 1)
    s = J(pg, "()=>({mode:G.dgEntryMode, prac:G.spire.practice, tok:!!G.spire.token, f:G.dg.floors[0].floor})")
    ok('ranked_entry', r['mode'] == 'ranked' and s['mode'] == 'ranked' and not s['prac'] and s['tok'] and s['f'] == 1, (r, s))
    for i in range(4): J(pg, SKIP); J(pg, NEXT)  # 1~4층
    J(pg, AGE, 400000); J(pg, HEAL); J(pg, "()=>{ const D=G.dg; D.wave=0; D.q=[]; for (const e of [...G.enemies]) if (!e.dead) G.hurt(e,1e9); }")
    f5 = J(pg, "()=>G.dg.floors[G.dg.floor].floor"); J(pg, SKIP)
    pg.wait_for_function("()=>G.spire.pings.length>=1", timeout=20000)
    p = J(pg, "()=>G.spire.pings[0]")
    ok('ping5_reward', f5 == 5 and p['ok'] and p['best'] == 5 and p['newBest'] and p['reward']['souls'] == 400 and p['reward']['mail'], (f5, p))
    J(pg, NEXT); J(pg, SKIP); J(pg, NEXT); J(pg, SKIP); J(pg, NEXT)  # 6·7층 돌파 → 8층
    J(pg, AGE, 400000); rs = wipe(pg)
    sv = rs['r'] and rs['r'].get('server')
    ok('finish_record', sv and sv['ok'] and sv['top'] == 7 and sv['best'] == 7 and rs['r'].get('newRecord') and rs['r']['mode'] == 'ranked', rs)
    ok('result_shows_record_reward', '신기록' in rs['rw'] and '최고 기록 7층' in rs['rw'] and '영혼석 +400' in rs['rw'] and '우편함' in rs['rw'], rs['rw'])
    db = J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const r=Object.values(d.sp_runs).find(x=>x.status==='done'); return {sum:r&&r.summary, mail:Object.values(d.hd3d_mail||{}).filter(m=>/무한의 탑/.test(m.title)).length}; }")
    ok('summary_saved', db['sum'] and db['sum']['top'] == 7 and len(db['sum']['ft']) == 7 and db['mail'] == 1, db)
    ok('errors_0_ranked', not errs, errs[:4]); errs.clear()
    # 다시 오르기: 같은 체크포인트 · 서버 새 도전
    J(pg, "()=>document.getElementById('spAgain').click()"); wait_run(pg)
    s = J(pg, "()=>({mode:G.dgEntryMode, from:G.spire.from, used:JSON.parse(localStorage.getItem('__mockdb')).sp_runs && Object.keys(JSON.parse(localStorage.getItem('__mockdb')).sp_runs).length})")
    ok('again_new_run', s['mode'] == 'ranked' and s['from'] == 1 and s['used'] == 2, s)
    # 6층부터 (체크포인트) · URL 시작층을 직접 바꾸면 연습
    J(pg, "async()=>{ const S=await import('./src/account/spire.js'); await S.spStart(6); location.replace(location.pathname + location.search.replace(/spire=\\d+/, 'spire=11')); }"); wait_run(pg)
    s = J(pg, "()=>({mode:G.dgEntryMode, why:G.spire.why, from:G.spire.from})")
    ok('url_tamper_practice', s['mode'] == 'practice' and s['why'] == 'reload' and s['from'] == 11, s)
    rs = wipe(pg); ok('practice_note', '연습' in rs['rw'] and not rs['r'].get('server'), rs['rw'])
    # 오프라인 ping 재시도 (연결 오류만 다시 보냄)
    r = J(pg, """async()=>{ const S=await import('./src/account/spire.js'); S.setRetryMs(250); const s=await S.spStart(1); const n0=JSON.parse(localStorage.getItem('__mockdb')).calls.filter(c=>c==='rpc:hd3d_spire_ping').length;
        const d=JSON.parse(localStorage.getItem('__mockdb')); d.sp_runs[s.token].started-=400000; localStorage.setItem('__mockdb', JSON.stringify(d));
        localStorage.setItem('__mockflags', '{"offline":true}'); setTimeout(()=>localStorage.setItem('__mockflags','{}'), 350); const p=await S.spPing(s.token, 5);
        const n1=JSON.parse(localStorage.getItem('__mockdb')).calls.filter(c=>c==='rpc:hd3d_spire_ping').length; const f=await S.spFinish(s.token, 5, {v:1});
        localStorage.setItem('__mockflags', '{"offline":true}'); const off=await S.spPing(s.token, 10); localStorage.setItem('__mockflags','{}'); S.setRetryMs(1500); return {ok:p.ok, tries:n1-n0, fin:f.ok, off}; }""")
    ok('ping_retry_offline', r['ok'] and r['tries'] >= 2 and r['fin'] and not r['off']['ok'] and r['off']['offline'], r)
    # 하루 30회 → 출발 막음
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const me=Object.values(d.sp_runs)[0].user_id, day=Object.values(d.sp_runs)[0].day; for (let i=0;i<30;i++) d.sp_runs['x'+i]={token:'x'+i,user_id:me,day,week:'w',from:1,top:0,status:'done',started:Date.now()}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
    r = J(pg, "async()=>{ const S=await import('./src/account/spire.js'); const r=await S.spStart(1); return {r, left:S.SPS.left}; }")
    ok('daily_cap_blocked', r['r'].get('blocked') and '30회' in r['r']['msg'] and r['left'] == 0, r)
    # 스키마 미실행 (noSpire) → 연습 '서버 업데이트 필요'
    J(pg, "()=>localStorage.setItem('__mockflags', '{\"noSpire\":true}')")
    r = J(pg, "async()=>{ const S=await import('./src/account/spire.js'); await S.spStatus(); return {st:S.SPS.st, msg:S.SPS.msg}; }")
    ok('missing_status', r['st'] == 'missing' and r['msg'] == '서버 업데이트 필요', r)
    r = start(pg, 1); s = J(pg, "()=>({mode:G.dgEntryMode, why:G.spire.why})"); rs = wipe(pg)
    ok('missing_practice', r['mode'] == 'practice' and r['why'] == 'missing' and s['why'] == 'missing' and '서버 업데이트 필요' in rs['rw'], (r, s, rs['rw']))
    J(pg, "()=>localStorage.setItem('__mockflags', '{}')")
    ok('errors_0_fallback', not errs, errs[:4]); errs.clear()
    # 게스트 = 연습
    c2 = b.new_context(viewport={'width': 1280, 'height': 800}); c2.add_init_script(MOCK); p2 = c2.new_page(); p2.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    p2.goto(url + '?seed=5162&rng=42&flow=1&dgtest=1&sptest=1'); p2.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=240000)
    r = start(p2, 6); s = J(p2, "()=>({mode:G.dgEntryMode, why:G.spire.why, from:G.spire.from})")
    ok('guest_practice', r['mode'] == 'practice' and r['why'] == 'guest' and s['why'] == 'guest' and s['from'] == 1, (r, s))
    ok('errors_0_guest', not errs, errs[:4])
    b.close()
print('RESULT', 'PASS' if all(res.values()) else 'FAIL', sum(res.values()), '/', len(res))
