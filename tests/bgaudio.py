#!/usr/bin/env python3
"""창 전환·탭 이동 시 소리 끄기 테스트 (가짜 Supabase tests/sbmock.js, 네트워크 없음).  python3 tests/bgaudio.py
 - window.blur / visibilitychange(hidden) → 0.2초 페이드 후 focusG=0 + AudioContext suspend, 효과음 노드 안 만듦
 - focus / visible → 복원 (사용자 음소거·볼륨 유지, 첫 입력 전이면 아무것도 시작 안 함), 빠른 blur/focus 반복 후에도 안 꺼진 채로 남음
 - 설정 '백그라운드에서 음소거' (기본 켬, localStorage hd3d_audio.bgMute) · 일시정지(P)·×2 배속과 같이 동작 · 핸들러 1번씩만"""
import sys, os, pathlib, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, *a: pg.evaluate(js, *a)
BLUR = "()=>dispatchEvent(new Event('blur'))"; FOCUS = "()=>dispatchEvent(new Event('focus'))"
HIDE = "()=>{ Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }"
SHOW = "()=>{ delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }"
ST = "()=>{ const S = G.Snd; return S.ctx ? { state: S.ctx.state, focus: +S.focusG.gain.value.toFixed(3), bgm: +S.bgmG.gain.value.toFixed(3), muted: S.bg.muted, playing: Object.entries(S.tracks).filter(([k, t]) => !t.a.paused).map(([k]) => k) } : { state: null, muted: S.bg.muted }; }"
def st(pg, wait=450): pg.wait_for_timeout(wait); return J(pg, ST)
muted = lambda s: s['state'] == 'suspended' and s['focus'] == 0 and s['muted']
live = lambda s: s['state'] == 'running' and s['focus'] > .99 and not s['muted']
def page(pw, q, ls=None):
    b = pw.chromium.launch(args=ARGS); c = b.new_context(viewport={'width': 1280, 'height': 760}); c.add_init_script(MOCK)
    if ls: c.add_init_script(f"if (!sessionStorage.__init) {{ sessionStorage.__init = 1; localStorage.setItem('hd3d_audio', {json.dumps(json.dumps(ls))}); }}")
    pg = c.new_page(); pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + q); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000); return b, pg
with sync_playwright() as pw:
    # ---- 메뉴 흐름 (flow=1) ----
    b, pg = page(pw, '?seed=12345&flow=1'); pg.wait_for_function('()=>G.screen', timeout=60000)
    ok('single_registration', J(pg, '()=>window.__hd3dBgAudio === true'))
    # 첫 입력 전: blur/focus 해도 AudioContext 를 만들거나 음악을 시작하지 않음
    J(pg, BLUR); J(pg, HIDE); J(pg, SHOW); J(pg, FOCUS); s = st(pg, 300); ok('no_autostart_before_gesture', s['state'] is None and not s['muted'], s)
    pg.mouse.click(700, 400); pg.wait_for_timeout(300); pg.click('#lgGuest'); pg.wait_for_timeout(400)
    pg.wait_for_function("()=>G.Snd.ctx && G.Snd.ctx.state === 'running'", timeout=20000); s = st(pg, 600); ok('live_after_gesture', live(s) and s['playing'], s)
    # 핸들러 한 번씩만: 이벤트 1번 → bgSync 1번
    n = J(pg, "()=>{ const S = G.Snd, f = S.bgSync; let n = 0; S.bgSync = function () { n++; return f.call(this); }; dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); S.bgSync = f; return n; }")
    ok('one_handler_each', n == 3, n); st(pg, 500)
    J(pg, BLUR); s = st(pg); ok('blur_mutes_suspends', muted(s), s)
    v0 = J(pg, '()=>G.Snd.voices'); J(pg, "()=>{ G.Snd.play('coin', { force: true }); G.Snd.horn(); }"); ok('sfx_not_queued_while_muted', J(pg, '()=>G.Snd.voices') == v0)
    J(pg, FOCUS); s = st(pg); ok('focus_restores', live(s), s)
    J(pg, HIDE); s = st(pg); ok('hidden_mutes_suspends', muted(s), s)
    J(pg, SHOW); J(pg, FOCUS); s = st(pg); ok('visible_focus_restores', live(s), s)
    # 탭 숨김 + 포커스 잃음 → 보이기만 하고 focus 아직 → 아직 음소거 (헤드리스는 hasFocus false) → focus 오면 복원
    J(pg, "()=>{ document.__hf = document.hasFocus; document.hasFocus = () => false; }")
    J(pg, BLUR); J(pg, HIDE); J(pg, SHOW); s = st(pg); J(pg, "()=>{ document.hasFocus = document.__hf; }"); J(pg, FOCUS); s2 = st(pg); ok('needs_visible_and_focus', s['muted'] and live(s2), (s, s2))
    # 빠른 전환: 페이드 중간에 복귀, 수십 번 토글, suspend 직후 복귀
    J(pg, BLUR); pg.wait_for_timeout(100); J(pg, FOCUS); s = st(pg, 600); ok('quick_toggle_mid_fade', live(s), s)
    J(pg, "()=>{ for (let i = 0; i < 25; i++) { dispatchEvent(new Event('blur')); dispatchEvent(new Event('focus')); } }"); s = st(pg, 600); ok('rapid_toggles_not_stuck', live(s), s)
    J(pg, BLUR); pg.wait_for_timeout(265); J(pg, FOCUS); J(pg, BLUR); J(pg, FOCUS); s = st(pg, 700); ok('toggle_around_suspend', live(s), s)
    J(pg, BLUR); J(pg, HIDE); J(pg, FOCUS); J(pg, SHOW); s = st(pg, 600); ok('hide_blur_any_order', live(s), s)
    # focus 이벤트가 빠져도 페이지 안 입력이 오면 복원
    J(pg, BLUR); st(pg); pg.mouse.click(5, 5); s = st(pg, 600); ok('input_unsticks_mute', live(s), s)
    # 사용자 음소거는 그대로: 메뉴 설정에서 배경음악 끔 → blur/focus 후에도 bgmG 0
    pg.click('#mnSet'); pg.wait_for_timeout(200)
    ok('menu_settings_toggle', J(pg, "()=>!!document.getElementById('stBgMute') && document.getElementById('stBgMute').checked"))
    J(pg, "()=>{ const e = document.getElementById('stBgmOn'); e.checked = false; e.dispatchEvent(new Event('input')); }"); st(pg, 800)
    J(pg, BLUR); st(pg); J(pg, FOCUS); s = st(pg, 800); ok('user_bgm_mute_kept', live(s) and s['bgm'] < .01 and not J(pg, '()=>G.Snd.cfg.bgmOn'), s)
    J(pg, "()=>{ const e = document.getElementById('stBgmOn'); e.checked = true; e.dispatchEvent(new Event('input')); }"); s = st(pg, 1200); ok('user_bgm_back', s['bgm'] > .3, s)
    # 설정 끄면 백그라운드에서도 계속 소리 + 저장
    J(pg, "()=>{ const e = document.getElementById('stBgMute'); e.checked = false; e.dispatchEvent(new Event('input')); }")
    J(pg, BLUR); s = st(pg); ok('setting_off_keeps_sound', live(s), s)
    J(pg, "()=>{ const e = document.getElementById('stBgMute'); e.checked = true; e.dispatchEvent(new Event('input')); }"); s = st(pg); ok('setting_on_while_blurred_mutes', muted(s), s)
    J(pg, FOCUS); st(pg); J(pg, "()=>{ const e = document.getElementById('stBgMute'); e.checked = false; e.dispatchEvent(new Event('input')); }")
    ok('setting_persisted', J(pg, "()=>JSON.parse(localStorage.getItem('hd3d_audio')).bgMute") is False)
    pg.reload(); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000)
    ok('setting_loaded', J(pg, "()=>G.Snd.cfg.bgMute === false && document.getElementById('bgMute').checked === false"))
    b.close()
    # ---- 판 안: 일시정지(P) · ×2 배속, 사용자 전체 음소거(M) ----
    b, pg = page(pw, '?seed=12345&rng=777&test=1&stage=1-2'); J(pg, "()=>G.choose('warrior')")
    ok('ingame_toggle_default_on', J(pg, "()=>G.Snd.cfg.bgMute === true && document.getElementById('bgMute').checked"))
    pg.mouse.click(640, 380); pg.wait_for_function("()=>G.Snd.ctx && G.Snd.ctx.state === 'running'", timeout=20000); st(pg, 500)
    J(pg, "()=>{ G.manual = false; G.startWave(); G.setSpeed(2); }"); J(pg, BLUR); pg.wait_for_function("()=>G.Snd.ctx.state === 'suspended'", timeout=5000); s = st(pg, 0); t0 = J(pg, '()=>G.t'); pg.wait_for_timeout(500)
    ok('speed_x2_blur_mutes_game_runs', muted(s) and J(pg, '()=>G.speed') == 2 and not J(pg, '()=>G.paused') and J(pg, '()=>G.t') > t0, s)
    J(pg, FOCUS); s = st(pg); ok('speed_x2_restore', live(s) and J(pg, '()=>G.speed') == 2, s)
    pg.keyboard.press('p'); J(pg, BLUR); s = st(pg); J(pg, FOCUS); s2 = st(pg)
    ok('pause_kept_through_blur', J(pg, '()=>G.paused') and muted(s) and live(s2), (s, s2))
    J(pg, HIDE); s = st(pg); J(pg, SHOW); s2 = st(pg); ok('hidden_autopause_still_works', J(pg, '()=>G.paused') and muted(s) and live(s2), (s, s2))
    pg.click('#pauseGo'); pg.wait_for_timeout(200)
    pg.keyboard.press('m'); pg.wait_for_timeout(300); J(pg, BLUR); st(pg); J(pg, FOCUS); s = st(pg, 800)
    ok('m_mute_not_overridden', not J(pg, '()=>G.Snd.cfg.bgmOn || G.Snd.cfg.sfxOn') and s['bgm'] < .01 and J(pg, "()=>G.Snd.sfxG.gain.value") < .01, s)
    pg.keyboard.press('m'); J(pg, '()=>{ G.manual = true; }'); b.close()
print('errors', errs[:5]); ok('no_console_errors', not errs)
print('ALL OK' if all(res.values()) else 'FAILED'); sys.exit(0 if all(res.values()) else 1)
