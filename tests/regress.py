#!/usr/bin/env python3
"""히어로 디펜스 3D 회귀 테스트 (headless Chromium + Playwright).
고정 맵 시드(?seed) + 고정 게임 난수(?rng) + 수동 시계(?test → G.sim(dt)로만 진행) 로 결정적 실행.
  python3 tests/regress.py --save        # 기준값(tests/baseline.json) 저장
  python3 tests/regress.py               # 기준값과 비교 (다르면 exit 1)
  python3 tests/regress.py --url https://hyunjk11.github.io/hero-defense-3d/   # 라이브 대상
"""
import json, sys, os, threading, http.server, socketserver, functools, argparse, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
Q = '?seed=12345&rng=777&test=1'

def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'

# 공통 JS 도우미 (페이지에 주입)
HELP = r"""
window.T_ = {
  r: v => Math.round(v * 1000) / 1000,
  grassNearRoute(minI, maxD, avoid) { const r = G.route, on = new Set(r.map(([c, rr]) => c + ',' + rr)), used = new Set(avoid || []);
    for (let i = minI; i < r.length - 1; i++) { const [c, rr] = r[i]; for (let d = 1; d <= maxD; d++) for (let dc = -d; dc <= d; dc++) for (let dr = -d; dr <= d; dr++) {
      const t = G.tileAt(c + dc, rr + dr); if (t && t.t === 0 && !t.tower && !t.bar && !on.has((c + dc) + ',' + (rr + dr)) && !used.has((c + dc) + ',' + (rr + dr))) return [c + dc, rr + dr]; } } return null; },
  sounds: {},
  hookSound() { const S = G.Snd, me = this; for (const k of ['play', 'horn', 'roar', 'crackle', 'whoosh']) { const f = S[k].bind(S); S[k] = (...a) => { const n = k === 'play' ? a[0] : k; me.sounds[n] = (me.sounds[n] || 0) + 1; return f(...a); }; } },
  enemyAt(type, x, z) { const e = G.spawnEnemy(type, 1); e.g.position.set(x, 0, z); const [c, r] = G.toTile(x, z); e.tile = [c, r]; e.state = 'walk'; return e; },
  barsOk() { let bad = 0, n = 0; for (const b of G.BARS) { if (!b.g.visible) continue; n++; const xs = b.g.children.slice(1).map(m => m.position.x); if (Math.max(...xs) - Math.min(...xs) > 1e-6) bad++;
      if (Math.abs(b.fg.scale.x - Math.max(1e-4, b.w * b.r)) > 1e-4) bad++; if (b.trail.scale.x + 1e-6 < b.fg.scale.x) bad++; } return { visible: n, bad }; },
};
"""

def page(pw, url, errs, resp):
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1280, 'height': 760})
    pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.type + ': ' + m.text[:200]))
    pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.on('response', lambda r: resp.append((r.status, r.url)))
    pg.goto(url + Q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP)
    return b, pg

def S(pg, js): return pg.evaluate(js)

def sc_boot(pw, url, M, errs):
    resp = []; b, pg = page(pw, url, errs, resp)
    m = {'models': S(pg, '()=>Object.keys(G.GL).sort()'), 'route_len': S(pg, '()=>G.route.length'), 'gold0': S(pg, '()=>G.gold')}
    pg.click('.card[data-cls="archer"]'); pg.wait_for_timeout(3500)
    m['audio_ctx'] = S(pg, '()=>G.Snd.ctx&&G.Snd.ctx.state'); m['sfx_buffers'] = S(pg, '()=>Object.keys(G.Snd.buf).length')
    m['bgm_playing'] = S(pg, "()=>Object.entries(G.Snd.tracks).filter(([k,t])=>!t.a.paused).map(([k])=>k)")
    aud = [(s, u) for s, u in resp if '/audio/' in u]; m['audio_sfx_requests'] = len(set(u for s, u in aud if '/sfx/' in u)); m['bgm_requested'] = 'town.mp3' in ' '.join(u for s, u in aud); m['audio_bad'] = sorted(set(u for s, u in aud if s >= 400))
    m['http_bad'] = sorted(set(u.split('/')[-1] for s, u in resp if s >= 400))
    M['boot'] = m; b.close()

def sc_hero(pw, url, M, errs, cls):
    b, pg = page(pw, url, errs, [])
    S(pg, f"()=>G.choose('{cls}')"); S(pg, '()=>T_.hookSound()')
    m = S(pg, """()=>{ const h=G.hero, p0=h.g.position.clone(); const [x,z]=G.tileXZ(G.CORE[0]-3, G.CORE[1]); G.heroGoTo(x, z); G.sim(4);
      const moved = T_.r(Math.hypot(h.g.position.x-x, h.g.position.z-z)); const hp=h.g.position;
      const e = T_.enemyAt('golem', hp.x + 2.2, hp.z + 0.3); e.E = Object.assign({}, e.E, { spd: 0.0001 }); const hp0 = e.hp; G.sim(3); const dmgAtk = T_.r(hp0 - e.hp);
      G.mouseGround.copy(e.g.position); const hp1 = e.hp; G.castSkill(); const cd = T_.r(G.hero.skillCd); G.sim(3); const dmgSkill = T_.r(hp1 - Math.max(e.hp, 0));
      return { hp: h.max, dist_to_target: moved, atk_dmg_3s: dmgAtk, skill_cd: cd, skill_dmg: dmgSkill, dummy_dead: e.dead }; }""")
    m['sounds'] = S(pg, '()=>T_.sounds'); M['hero_' + cls] = m; b.close()

def sc_towers(pw, url, M, errs):
    b, pg = page(pw, url, errs, [])
    S(pg, "()=>G.choose('archer')"); S(pg, '()=>T_.hookSound()')
    m = S(pg, """()=>{ const out = {}; G.hero.g.position.set(-40, 0, -40); G.hero.dead = 999; G.gold = 5000; const used = [];
      for (const type of ['arrow', 'cannon', 'magic']) { const spot = T_.grassNearRoute(4, 3, used); used.push(spot.join(',')); const g0 = G.gold; const ok = G.build(spot[0], spot[1], type);
        const tw = G.tileAt(spot[0], spot[1]).tower; const g1 = G.gold; G.upgradeTower(tw); const g2 = G.gold; G.upgradeTower(tw); const g3 = G.gold;
        const [x0, z0] = G.tileXZ(spot[0], spot[1]); let best = null, bd = 1e9; for (const [c, rr] of G.route) { const [x, z] = G.tileXZ(c, rr), d = Math.hypot(x - x0, z - z0); if (d < bd) { bd = d; best = [x, z]; } } const e = T_.enemyAt('golem', best[0], best[1]); e.E = Object.assign({}, e.E, { spd: 0.0001 }); const h0 = e.hp; G.sim(2.5); const dmg = T_.r(h0 - Math.max(0, e.hp));
        if (!e.dead) { e.hp = 0.001; G.hurt(e, 999); } G.sim(2);
        const g4 = G.gold; G.sellTower(tw); const refund = G.gold - g4;
        out[type] = { built: ok, cost: g0 - g1, up1: g1 - g2, up2: g2 - g3, lvl: tw.lvl, dmg_2_5s: dmg, refund, tile_free: !G.tileAt(spot[0], spot[1]).tower }; }
      // 바리케이드
      const r = G.route, [bc, br] = r[3]; const okB = G.build(bc, br, 'barricade'); const bt = G.tileAt(bc, br); const bmax = bt.bar ? bt.bar.max : 0;
      for (let k = 0; k < 6; k++) { const e = G.spawnEnemy('grunt', 1); } G.sim(25); out.barricade = { built: okB, max: bmax, hp_after: bt.bar ? T_.r(bt.bar.hp) : -1, destroyed: !bt.bar, route_changed: !G.route.some(([c, rr]) => c === bc && rr === br) || !bt.bar };
      out.bars = T_.barsOk(); out.gold_end = G.gold; return out; }""")
    m['sounds'] = S(pg, '()=>T_.sounds'); M['towers'] = m; b.close()

def sc_dig(pw, url, M, errs):
    b, pg = page(pw, url, errs, [])
    S(pg, "()=>G.choose('warrior')"); S(pg, '()=>T_.hookSound()')
    m = S(pg, """()=>{ const out = {}; G.hero.g.position.set(-40, 0, -40); G.hero.dead = 1e9; G.gold = 0;
      const routeBlocks0 = G.route.filter(([c, r]) => [2, 3, 4].includes(G.tileAt(c, r).t)).length;
      for (let w = 1; w <= 3; w++) { const c0 = G.carved || 0; G.startWave(); let t = 0; while (G.phase === 'wave' && t < 240) { G.sim(1); t++; }
        const onCarved = G.route.filter(([c, r]) => G.tileAt(c, r).t === 1).length;
        out['w' + w] = { secs: t, carved_new: (G.carved || 0) - c0, carved_total: G.carved || 0, core: G.coreHp, route_len: G.route.length, route_on_carved: onCarved, leaked: G.stats.leaked }; }
      out.route_blocks_initial = routeBlocks0; out.trench_persist = G.route.filter(([c, r]) => G.tileAt(c, r).t === 1).length; out.distCalcs = G.stats.distCalcs; return out; }""")
    m['sounds'] = S(pg, '()=>T_.sounds'); M['dig'] = m; b.close()

def sc_balance(pw, url, M, errs, shots=None):
    b, pg = page(pw, url, errs, [])
    S(pg, "()=>G.choose('mage')"); S(pg, '()=>T_.hookSound()')
    m = S(pg, """()=>{ const out = { setup: [] }; G.gold = 420; const used = [];
      for (const [type, i] of [['arrow', 6], ['cannon', 10], ['magic', 14], ['arrow', 18]]) { const s = T_.grassNearRoute(i, 3, used); if (!s) continue; used.push(s.join(',')); if (G.build(s[0], s[1], type)) out.setup.push([type, s[0], s[1]]); }
      out.gold_after_setup = G.gold; out.waves = [];
      for (let w = 1; w <= 5; w++) { const k0 = Object.values(G.stats.kills).reduce((a, b) => a + b, 0), l0 = G.stats.leaked; G.startWave(); let t = 0; let bossSeen = false;
        while (G.phase === 'wave' && t < 300) { G.sim(1); t++; if (G.enemies.some(e => e.E.boss)) bossSeen = true; }
        // 같은 규칙으로 업그레이드: 웨이브 후 가장 싼 업그레이드 1회
        const tws = G.towers.filter(x => x.lvl < 3).sort((a, b) => G.TOWERS[a.type].up[a.lvl - 1] - G.TOWERS[b.type].up[b.lvl - 1]); if (tws[0] && G.gold >= G.TOWERS[tws[0].type].up[tws[0].lvl - 1]) G.upgradeTower(tws[0]);
        out.waves.push({ w, secs: t, phase: G.phase, kills: Object.values(G.stats.kills).reduce((a, b) => a + b, 0) - k0, leaked: G.stats.leaked - l0, core: G.coreHp, gold: G.gold, carved: G.carved || 0, boss: bossSeen, hero_alive: G.hero.dead <= 0 }); if (G.phase === 'over') break; }
      out.kills_by_type = G.stats.kills; out.gold_earned = G.stats.goldEarned; out.bars = T_.barsOk(); return out; }""")
    m['sounds'] = S(pg, '()=>T_.sounds'); M['balance'] = m
    if shots: S(pg, '()=>G.sim(.05)'); pg.wait_for_timeout(500); pg.screenshot(path=shots)
    b.close()

def flat(d, p=''):
    o = {}
    if isinstance(d, dict):
        for k, v in d.items(): o.update(flat(v, p + '.' + k if p else k))
    elif isinstance(d, list) and d and isinstance(d[0], (dict, list)):
        for i, v in enumerate(d): o.update(flat(v, f'{p}[{i}]'))
    else: o[p] = d
    return o

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--save', action='store_true'); ap.add_argument('--url'); ap.add_argument('--only'); ap.add_argument('--out', default=os.path.join(ROOT, 'tests', 'last.json'))
    ap.add_argument('--baseline', default=os.path.join(ROOT, 'tests', 'baseline.json')); a = ap.parse_args()
    srv = None; url = a.url
    if not url: srv, url = serve()
    M, errs = {}, []; t0 = time.time()
    scen = [('boot', sc_boot), ('hero_archer', lambda pw, u, M, e: sc_hero(pw, u, M, e, 'archer')), ('hero_mage', lambda pw, u, M, e: sc_hero(pw, u, M, e, 'mage')),
            ('hero_warrior', lambda pw, u, M, e: sc_hero(pw, u, M, e, 'warrior')), ('towers', sc_towers), ('dig', sc_dig), ('balance', sc_balance)]
    with sync_playwright() as pw:
        for name, fn in scen:
            if a.only and name not in a.only.split(','): continue
            t1 = time.time(); fn(pw, url, M, errs); print(f'  {name} done ({time.time() - t1:.0f}s)', flush=True)
    M['console_errors'] = errs; json.dump(M, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(f'total {time.time() - t0:.0f}s, console errors: {len(errs)}', errs[:5])
    if a.save: json.dump(M, open(a.baseline, 'w'), ensure_ascii=False, indent=1); print('baseline saved'); return 0
    if not os.path.exists(a.baseline): return 0
    B = flat(json.load(open(a.baseline))); C = flat(M); diffs = []
    for k in sorted(set(B) | set(C)):
        if a.only and k.split('.')[0] not in a.only.split(','): continue
        if B.get(k) != C.get(k): diffs.append((k, B.get(k), C.get(k)))
    for k, x, y in diffs: print(f'  DIFF {k}: {x} -> {y}')
    print('MATCH' if not diffs else f'{len(diffs)} differences')
    return 1 if diffs or errs else 0

if __name__ == '__main__': sys.exit(main())
