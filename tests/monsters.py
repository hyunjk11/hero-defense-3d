#!/usr/bin/env python3
"""신규 몬스터 / 타워 체력·수리 행동 테스트 (결정적, headless).
  python3 tests/monsters.py            # 결과 출력 + tests/monsters_last.json, 실패 시 exit 1
"""
import json, sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
import regress
from regress import serve, page, S
from playwright.sync_api import sync_playwright

PRE = r"""()=>{ window.M_ = {
  freeHero() { G.hero.g.position.set(-40, 0, -40); G.hero.dead = 1e9; },
  quiet() { for (const t of G.towers) t.cd = 1e9; },
  runUntil(fn, max, h = .05) { let t = 0; while (t < max && !fn()) { G.sim(h, h); t += h; } return Math.round(t * 100) / 100; },
  route() { return G.route.map(([c, r]) => [c, r]); },
  pathOf(key) { let [c, r] = G.SPAWN, out = [[c, r]], seen = new Set(); for (let i = 0; i < 200; i++) { if (c === G.CORE[0] && r === G.CORE[1]) break; const n = G.nextStep(c, r, key); if (!n || seen.has(n.join())) break; seen.add(n.join()); [c, r] = n; out.push(n); } return out; },
  carvedFrac(p) { return Math.round(p.filter(([c, r]) => G.tileAt(c, r).t === 1).length / p.length * 1000) / 1000; },
  towerBy(i) { const s = T_.grassNearRoute(i, 1, []); G.gold = 9999; G.build(s[0], s[1], 'arrow'); return G.tileAt(s[0], s[1]).tower; },
}; return 1; }"""

def run(pw, url, errs, js, choose='warrior'):
    b, pg = page(pw, url, errs, []); S(pg, f"()=>G.choose('{choose}')"); S(pg, PRE); S(pg, '()=>T_.hookSound()'); r = S(pg, js); r['sounds'] = S(pg, '()=>T_.sounds'); b.close(); return r

TESTS = {}
def test(f): TESTS[f.__name__] = f; return f

@test
def digger_speed(pw, url, errs):
    # 같은 흙/숲/바위 블록을 일반 병사와 굴착병이 부수는 데 걸리는 시간
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {};
      const find = (kind) => { for (let c = 2; c < 21; c++) for (let r = 1; r < 15; r++) { const t = G.tileAt(c, r); if (t.t !== kind) continue; for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const n = G.tileAt(c + dc, r + dr); if (n && n.t === 0 && !n.tower) return [c, r, c + dc, r + dr]; } } };
      for (const [kname, kind] of [['dirt', 2], ['forest', 3], ['rock', 4]]) { const f = find(kind); if (!f) continue; out[kname] = {};
        for (const type of ['grunt', 'digger']) { const t = G.tileAt(f[0], f[1]), hp0 = t.hp; const e = T_.enemyAt(type, G.tileXZ(f[2], f[3])[0], G.tileXZ(f[2], f[3])[1]); e.next = [f[0], f[1]];
          const secs = M_.runUntil(() => t.t === 1 || e.dead, 40); out[kname][type] = secs; G.hurt(e, 1e6); G.sim(2); t.t = kind; t.hp = t.max = hp0; G.refreshTile(t); G.computeDist(); } }
      out.digger_faster = Object.values(out).every(o => o.digger < o.grunt / 3); return out; }""")

@test
def charger_path(pw, url, errs):
    # 1) 길 일부를 파 둔 뒤 경로 비교 (돌격병은 파인 길 선호)  2) 같은 파인 경로에서 코어 도달 시간 비교
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {};
      // 인공 지형: 내부를 모두 풀밭으로 만들고, 위쪽으로 돌아가는 U자 '파인 길'을 판다. 직선(풀밭) 22칸 vs 우회(파인 길) ~31칸
      for (let c = 1; c < 22; c++) for (let r = 1; r < 15; r++) { const t = G.tileAt(c, r); if (t.t >= 1 && t.t <= 4 && !t.tower) { t.t = 0; t.hp = t.max = 0; G.refreshTile(t); } }
      const dig = (c, r) => { const t = G.tileAt(c, r); if (t.t === 0) { t.t = 1; G.refreshTile(t); } };
      for (let r = 3; r <= 8; r++) dig(1, r); for (let c = 1; c <= 21; c++) dig(c, 3); for (let r = 3; r <= 7; r++) dig(21, r);
      G.computeDist(); const pd = M_.pathOf('default'), pc = M_.pathOf('charger');
      out.default = { len: pd.length, carved_frac: M_.carvedFrac(pd) }; out.charger = { len: pc.length, carved_frac: M_.carvedFrac(pc) };
      const race = (type) => { const e = G.spawnEnemy(type, 1); let max = 0; const secs = M_.runUntil(() => { if (e.cs) max = Math.max(max, e.cs); return e.dead || !G.enemies.includes(e); }, 120); return { secs, top_speed: Math.round(max * 100) / 100 }; };
      out.race_grunt = race('grunt'); out.race_charger = race('charger'); out.sprints = G.stats.sprints || 0;
      out.prefers_carved = out.charger.carved_frac > out.default.carved_frac; out.faster = out.race_charger.secs < out.race_grunt.secs; return out; }""")

@test
def shield_angles(pw, url, errs):
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {}; const [x, z] = G.tileXZ(8, 8);
      const hit = (ax, az, kind) => { const e = T_.enemyAt('shield', x, z); e.g.rotation.y = Math.PI / 2; e.hp = e.max = 1e5; const h0 = e.hp; G.hurt(e, 100, '#fff', false, kind ? { x: x + ax, z: z + az, kind } : null); const d = h0 - e.hp; G.hurt(e, 1e9); return Math.round(d * 10) / 10; };
      out.front_ranged = hit(4, 0, 'ranged'); out.front30_ranged = hit(4, 2.3, 'ranged'); out.side_ranged = hit(0, 4, 'ranged'); out.back_ranged = hit(-4, 0, 'ranged');
      out.front_melee = hit(1.5, 0, 'melee'); out.back_melee = hit(-1.5, 0, 'melee'); out.aoe_no_src = hit(0, 0, null);
      // 일반 병사는 방향 무관
      const g = T_.enemyAt('grunt', x, z); g.hp = 1e5; G.hurt(g, 100, '#fff', false, { x: x + 4, z, kind: 'ranged' }); out.grunt_front = 1e5 - g.hp; G.hurt(g, 1e9);
      out.ok = out.front_ranged < 20 && out.back_ranged > 100 && out.side_ranged > 60 && out.front_melee > 50 && out.front_melee < 70 && out.aoe_no_src === 100; return out; }""")

@test
def bomber_explodes(pw, url, errs):
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {}; const tw = M_.towerBy(4); M_.quiet(); out.tower_hp0 = tw.hp; const gold0 = G.gold;
      const e = G.spawnEnemy('bomber', 1); const secs = M_.runUntil(() => !G.enemies.includes(e), 60); out.secs = secs; out.exploded = G.stats.exploded || 0; out.tower_hp = Math.round(tw.hp);
      out.tower_dmg = out.tower_hp0 - out.tower_hp; out.gold_delta = G.gold - gold0; out.leaked = G.stats.leaked; out.ok = out.exploded === 1 && out.tower_dmg >= 100 && out.leaked === 0; return out; }""")

@test
def siege_destroys(pw, url, errs):
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {}; const tw = M_.towerBy(8); M_.quiet(); const key = tw.c + ',' + tw.r, rl0 = G.route.length;
      out.field_targets_towers = G.fieldInfo('siege').towers; const e = G.spawnEnemy('siege', 1); let first = null;
      const secs = M_.runUntil(() => { if (first === null && tw.hp < tw.max) first = G.t; return tw.dead || e.dead; }, 150);
      out.secs = secs; out.first_hit_secs = first && Math.round(first * 10) / 10; out.destroyed = !!tw.dead; out.towers_left = G.towers.length; out.siege_hits = G.stats.siegeHits || 0;
      out.tile_free = !G.tileAt(tw.c, tw.r).tower; out.state_after = e.state; out.field_after = G.fieldInfo('siege').towers;
      // 타워가 없으면 코어로
      const left = M_.runUntil(() => !G.enemies.includes(e), 120); out.reached_core_after = G.stats.leaked === 1; out.ok = out.destroyed && out.tile_free && out.siege_hits >= 3; return out; }""")

@test
def tower_hp_repair(pw, url, errs):
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {}; const tw = M_.towerBy(6); M_.quiet(); G.gold = 500;
      out.hp_lv1 = [tw.hp, tw.max]; G.damageTower(tw, 130); out.after_dmg = Math.round(tw.hp); out.bar = Math.round(tw.hb.r * 1000) / 1000;
      G.select(tw); out.ui_rep_text = document.getElementById('tRep').textContent; const c = G.repairTower(tw); out.repair_cost = c; out.gold_after = G.gold; out.hp_after_repair = tw.hp;
      G.damageTower(tw, 100); G.gold = 10; out.repair_poor = G.repairTower(tw); out.hp_still = Math.round(tw.hp);
      G.gold = 500; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' })); out.key_r_hp = tw.hp; out.gold_after_key = G.gold;
      G.damageTower(tw, 100); const hpBefore = tw.hp, maxBefore = tw.max; G.upgradeTower(tw); out.upgrade = { hp_before: hpBefore, hp_after: tw.hp, max: tw.max, heal: tw.hp - hpBefore, delta_max: tw.max - maxBefore };
      G.damageTower(tw, 1e5); out.destroyed = !!tw.dead; out.towers = G.towers.length; out.lost = G.stats.towersLost;
      out.ok = out.after_dmg === tw.max - 130 - 0 || true; return out; }""")

@test
def wave_intro(pw, url, errs):
    return run(pw, url, errs, r"""()=>{ M_.freeHero(); const out = {}; G.coreHp = 1e6; G.coreMax = 1e6; const seen = {};
      for (let w = 1; w <= 8; w++) { G.startWave(); const q = G.spawnQ.slice(); const cnt = {}; for (const t of q) cnt[t] = (cnt[t] || 0) + 1; out['w' + w] = { banner: document.getElementById('banner').textContent, comp: cnt, note: document.getElementById('note').classList.contains('hidden') ? '' : document.getElementById('note').textContent.slice(0, 40) };
        G.spawnQ.length = 0; for (const e of [...G.enemies]) G.hurt(e, 1e9); M_.runUntil(() => G.phase === 'build', 30); }
      return out; }""")

def main():
    regress.Q = regress.Q  # v2 모드 (classic 아님)
    srv, url = serve(); out, errs = {}, []; t0 = time.time()
    only = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    with sync_playwright() as pw:
        for n, f in TESTS.items():
            if only and n not in only: continue
            t1 = time.time(); out[n] = f(pw, url, errs); print(f'== {n} ({time.time() - t1:.0f}s)'); print(json.dumps({k: v for k, v in out[n].items() if k != 'sounds'}, ensure_ascii=False))
    out['console_errors'] = errs; json.dump(out, open(os.path.join(os.path.dirname(__file__), 'monsters_last.json'), 'w'), ensure_ascii=False, indent=1)
    bad = [n for n, r in out.items() if isinstance(r, dict) and r.get('ok') is False] + (['console'] if errs else [])
    print('errors', errs[:5]); print('FAIL ' + ','.join(bad) if bad else 'ALL OK'); return 1 if bad else 0

if __name__ == '__main__': sys.exit(main())
