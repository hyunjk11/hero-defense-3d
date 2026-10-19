#!/usr/bin/env python3
"""챕터 몬스터 스크린샷 → shots/monsters/
  ch1_forest.png · ch2_snow.png · endless_mix.png (전투 장면, 챕터별 다양성)
  ab_root.png · ab_heal.png · ab_split.png · ab_pack.png · ab_frost.png · ab_shield.png · ab_crack.png (능력 근접) · popup.png (신규 몬스터 알림)
  python3 tests/roster_shots.py [이름,...]"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP, Q
from roster import PRE
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'monsters'); os.makedirs(OUT, exist_ok=True)
HIDE = "()=>{ document.querySelectorAll('#note').forEach(e=>e.classList.add('hidden')); document.getElementById('banner').classList.remove('show'); }"
BATTLE = r"""([wave, extra])=>{ R_.freeHero(); G.coreHp = G.coreMax = 1e6; G.gold = 3000; const used = [];
  for (const [type, i] of [['arrow', 5], ['cannon', 9], ['magic', 13], ['arrow', 17]]) { const s = T_.grassNearRoute(i, 2, used); if (!s) continue; used.push(s.join(',')); G.build(s[0], s[1], type); }
  G.phase = 'build'; G.wave = wave - 1; G.startWave(); G.spawnQ.unshift(...extra); for (let k = 0; k < 26; k++) G.sim(1); for (const tw of G.towers) tw.cd = Math.max(tw.cd, 0); G.cam.r = 44; G.cam.phi = .86; return [...new Set(G.enemies.map(e => e.type))]; }"""
def close(pg, x, z, r=13, phi=1.0, theta=.35): pg.evaluate(f"()=>{{ G.cam.target.set({x}, 1, {z}); G.cam.r = {r}; G.cam.phi = {phi}; G.cam.theta = {theta}; G.sim(.02, .02); }}")
SHOTS = {}
def shot(f): SHOTS[f.__name__] = f; return f

@shot
def ch1_forest(pg): return pg.evaluate(BATTLE, [9, ['treant', 'mushroom', 'slime', 'wolf', 'goblin']])
@shot
def ch2_snow(pg): return pg.evaluate(BATTLE, [9, ['frostgolem', 'yeti', 'wisp', 'icewolf', 'icewolf', 'icewolf']])
@shot
def endless_mix(pg): return pg.evaluate(BATTLE, [12, ['yeti', 'treant', 'wisp', 'slime']])
@shot
def ab_root(pg):
    r = pg.evaluate(r"""()=>{ const s = R_.grass(); const tw = R_.tower('arrow', s); const t2 = G.tileAt(s[0] + 1, s[1]).t === 0 ? R_.tower('magic', [s[0] + 1, s[1]]) : null; const [x, z] = R_.xz(tw, -1.2, -3.4); const t = R_.at('treant', x, z); t.hp = t.max = 1e9; t.slowT = 0;
      R_.runUntil(() => tw.rootT > 0, 8); G.sim(.35); t.slowT = 0; t.g.rotation.y = Math.atan2(1.2, 3.4); return R_.xz(tw, -.4, -1.2); }""")
    close(pg, *r, r=15, phi=.95, theta=.2); return r
@shot
def ab_heal(pg):
    r = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(9, 8); const m = R_.at('mushroom', x, z); const L = [R_.at('goblin', x + 1.6, z + .6), R_.at('grunt', x - 1.4, z + 1), R_.at('wolf', x + .4, z + 1.8)]; L.forEach(e => e.hp = e.max * .4); m.hp = m.max * .7;
      R_.runUntil(() => m.cast && m.cast.t < .15, 8); G.sim(.18); return [x, z + .6]; }""")
    close(pg, *r, r=11); return r
@shot
def ab_split(pg):
    r = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(9, 8); const s = R_.at('slime', x, z, false); R_.at('slime', x + 2.2, z + 1.2); G.hurt(s, 1e9); G.sim(.22); return [x + .8, z + .6]; }""")
    close(pg, *r, r=10); return r
@shot
def ab_pack(pg):
    r = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(9, 8); [0, 1, 2].forEach(i => { const w = R_.at('icewolf', x + i * 1.1, z + (i % 2) * .7, false); w.g.rotation.y = 1.4; }); const lone = R_.at('icewolf', x + 1, z + 4.5); lone.g.rotation.y = 1.4; G.sim(.5); return [x + 1, z + 1.6]; }""")
    close(pg, *r, r=16, phi=.9); return r
@shot
def ab_frost(pg):
    r = pg.evaluate(r"""()=>{ const s = R_.grass(); const tw = R_.tower('cannon', s); const tw2 = R_.tower('arrow', [s[0] + 2, s[1]]) ; const [x, z] = R_.xz(tw, 2.2, 2.6); const y = R_.at('yeti', x, z); y.hp = y.max = 1e9; y.abT.snowball = .3;
      R_.runUntil(() => (G.stats.frosts || 0) >= 1, 6); y.abT.snowball = 0; R_.runUntil(() => y.cast && y.cast.t < .05, 4); G.sim(.3); y.g.rotation.y = Math.atan2(-2.2, -2.6); return R_.xz(tw, 1.4, 1.4); }""")
    close(pg, *r, r=13); return r
@shot
def ab_shield(pg):
    r = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(9, 8); const L = [R_.at('grunt', x, z), R_.at('shield', x + 1.6, z + .5), R_.at('icewolf', x - 1.2, z + 1.2)]; const w = R_.at('wisp', x + 3, z + 2, false);
      R_.runUntil(() => L.filter(e => e.shield > 0).length >= 3, 6); G.sim(.15); return [x + .5, z + .8]; }""")
    close(pg, *r, r=12, phi=1.08); return r
@shot
def ab_crack(pg):
    r = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(9, 8); const a = R_.at('frostgolem', x - 1.6, z), b = R_.at('frostgolem', x + 1.6, z + .4); a.g.rotation.y = b.g.rotation.y = .4; G.hurt(b, b.max * .32); G.sim(.12); return [x, z + .3]; }""")
    close(pg, *r, r=11); return r
@shot
def popup(pg):
    pg.evaluate("()=>{ localStorage.removeItem('hd3d_seenMon'); G.seenMon = null; }")
    r = pg.evaluate(BATTLE, [3, ['slime']]); pg.evaluate("()=>{ G.phase = 'build'; G.wave = 3; G.startWave(); G.sim(3); }"); return r

STAGE_OF = {'ch1_forest': '1-4', 'ch2_snow': '2-3', 'endless_mix': None, 'ab_root': '1-1', 'ab_heal': '1-1', 'ab_split': '1-1', 'ab_pack': '2-1', 'ab_frost': '2-1', 'ab_shield': '2-1', 'ab_crack': '2-1', 'popup': '1-2'}
srv, url = serve(); errs = []
only = sys.argv[1].split(',') if len(sys.argv) > 1 else None
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for n, f in SHOTS.items():
        if only and n not in only: continue
        pg = b.new_page(viewport={'width': 1440, 'height': 860}); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
        st = STAGE_OF[n]; pg.goto(url + Q + (f'&stage={st}' if st else '')); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP); pg.evaluate("()=>G.choose('warrior')"); pg.evaluate(PRE); pg.evaluate('()=>R_.freeHero()')
        r = f(pg)
        if n != 'popup': pg.evaluate(HIDE)
        pg.wait_for_timeout(900); pg.screenshot(path=os.path.join(OUT, n + '.png')); print(n, r, flush=True); pg.close()
    b.close()
print('errors', errs); sys.exit(1 if errs else 0)
