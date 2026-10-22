#!/usr/bin/env python3
"""챕터별 몬스터 구성 · 능력 테스트 (결정적, headless).
  python3 tests/roster.py [이름,...]     # 결과 출력 + tests/roster_last.json, 실패 시 exit 1
구성: 스테이지마다 그 챕터 구성 몬스터만 나오는지(10개 스테이지 모든 웨이브), 도전 모드 섞임, 무리 출현
능력: 분열 · 겁먹음 · 회복 · 뿌리 속박 · 무리 강화 · 한기 오라 · 눈덩이 빙결 · 보호막/호위 · 갑옷 깨짐/재생 · 숲의 군주 다중 속박 · 신규 몬스터 알림
안정성: NaN 없음, 콘솔 오류 없음, 120마리 혼합 성능, 화면 밝기(검은 화면 아님)
"""
import json, sys, os, time, io
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP, Q
from playwright.sync_api import sync_playwright

PRE = r"""()=>{ window.R_ = {
  freeHero() { G.hero.g.position.set(-40, 0, -40); G.hero.dead = 1e9; },
  runUntil(fn, max, h = .05) { let t = 0; while (t < max && !fn()) { G.sim(h, h); t += h; } return Math.round(t * 100) / 100; },
  clear() { for (const e of [...G.enemies]) { e.ab = null; G.hurt(e, 1e12); } G.sim(.1); for (const e of [...G.enemies]) G.hurt(e, 1e12); G.sim(2.2); for (const tw of [...G.towers]) G.sellTower(tw); G.stats = { kills: {}, leaked: 0, goldEarned: 0, carvedTiles: 0, distCalcs: 0 }; },
  grass(minD = 3) { for (let c = 4; c < G.GW - 4; c++) for (let r = 3; r < G.GH - 3; r++) { const t = G.tileAt(c, r); if (t.t === 0 && !t.tower && !t.bar && Math.hypot(c - G.CORE[0], r - G.CORE[1]) > minD) return [c, r]; } },
  tower(type = 'arrow', at) { const s = at || R_.grass(); G.gold = 99999; const ok = G.build(s[0], s[1], type); return G.tileAt(s[0], s[1]).tower; },
  at(type, x, z, freeze = true) { const e = G.spawnEnemy(type, 1); e.g.position.set(x, 0, z); e.tile = G.toTile(x, z); e.state = 'walk'; e.spawnT = 0; if (freeze) e.E = Object.assign({}, e.E, { spd: 1e-4, sprint: 1e-4 }); return e; },
  xz(tw, dx = 0, dz = 0) { const [x, z] = G.tileXZ(tw.c, tw.r); return [x + dx, z + dz]; },
  r: v => Math.round(v * 1000) / 1000,
  nan() { let bad = 0; G.scene.traverse(o => { const p = o.position; if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) bad++; }); for (const e of G.enemies) if (!isFinite(e.hp)) bad++; return bad; },
}; return 1; }"""

def page(pw, url, errs, stage=None):
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1280, 'height': 760})
    pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.type + ': ' + m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + Q + (f'&stage={stage}' if stage else '')); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000); pg.evaluate(HELP)
    pg.evaluate("()=>G.choose('warrior')"); pg.evaluate(PRE); pg.evaluate('()=>R_.freeHero()'); return b, pg

TESTS = {}
def test(f): TESTS[f.__name__] = f; return f

# ---------------- 구성 ----------------
COMP = r"""()=>{ const out = { waves: [] }, seen = {}; G.coreHp = G.coreMax = 1e6; const waves = G.STAGE_CFG ? G.STAGE_CFG.waves : 20;
  for (let n = 1; n <= waves; n++) { G.phase = 'build'; G.wave = n - 1; G.startWave(); const q = G.spawnQ.slice(); G.spawnQ = []; G.phase = 'build';
    const cnt = {}; for (const t of q) cnt[t] = (cnt[t] || 0) + 1; out.waves.push(cnt); }
  return out; }"""
def comp_check(waves, ch, last_boss):
    import itertools
    R = {1: {'goblin', 'grunt', 'imp', 'wolf', 'digger', 'slime', 'mushroom', 'bat', 'treant', 'golem'}, 2: {'icewolf', 'grunt', 'charger', 'yeti', 'shield', 'wisp', 'frostgolem', 'bat', 'bomber'},
         3: {'ember_slime', 'imp', 'grunt', 'firebomber', 'lavahound', 'siege', 'magmagolem', 'bat'}, 4: {'grunt', 'shield', 'gargoyle', 'digger', 'wraith', 'ruinroot', 'siege'}}
    BOSS = {1: 'boss_forest', 2: 'boss_snow', 3: 'boss_fire', 4: 'boss_ruins'}
    allowed = R[ch] | {'boss', BOSS[ch]}
    used = set(itertools.chain(*[w.keys() for w in waves]))
    SIG = {1: {'goblin', 'wolf', 'slime', 'mushroom', 'treant'}, 2: {'icewolf', 'yeti', 'wisp', 'frostgolem'}, 3: {'ember_slime', 'firebomber', 'lavahound', 'magmagolem'}, 4: {'gargoyle', 'wraith', 'ruinroot'}}; sig = SIG[ch]
    other = set().union(*[SIG[k] for k in SIG if k != ch]) - R[ch]
    return {'used': sorted(used), 'only_roster': used <= allowed, 'signature_all': sig <= used, 'no_other_chapter': not (used & other),
            'final_boss': ((BOSS[ch] in waves[-1]) if last_boss else True), 'counts': [sum(w.values()) for w in waves]}

def stage_comp(stage):
    def f(pw, url, errs):
        b, pg = page(pw, url, errs, stage); r = pg.evaluate(COMP); b.close(); ch = int(stage[0]); last = stage in ('1-6', '2-4', '3-4', '4-4')
        c = comp_check(r['waves'], ch, last); c['ok'] = c['only_roster'] and c['signature_all'] and c['no_other_chapter'] and c['final_boss']; c['first_waves'] = r['waves'][:2]; return c
    f.__name__ = 'comp_' + stage.replace('-', '_'); return f
for st in ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '2-1', '2-2', '2-3', '2-4', '3-1', '3-2', '3-3', '3-4', '4-1', '4-2', '4-3', '4-4']: test(stage_comp(st))

@test
def comp_endless(pw, url, errs):
    b, pg = page(pw, url, errs); r = pg.evaluate(COMP); b.close(); W = r['waves']
    snow = {'icewolf', 'yeti', 'wisp', 'frostgolem'}; forest = {'goblin', 'wolf', 'slime', 'mushroom', 'treant'}; volc = {'ember_slime', 'firebomber', 'lavahound', 'magmagolem'}
    pre12 = set().union(*[set(w) for w in W[:11]]); post12 = set().union(*[set(w) for w in W[11:]])
    early = set().union(*[set(w) for w in W[:5]]); late = set().union(*[set(w) for w in W[5:]])
    out = {'early_types': sorted(early), 'late_types': sorted(late), 'w5_boss': 'boss' in W[4], 'w10_boss_forest': 'boss_forest' in W[9], 'w20_boss_snow': 'boss_snow' in W[19],
           'early_no_snow': not (early & snow), 'early_has_forest': len(early & forest) >= 3, 'late_has_snow': len(late & snow) >= 3, 'late_still_skeletons': bool(late & {'grunt', 'imp', 'golem', 'shield', 'digger'}),
           'no_volcano_before_12': not (pre12 & volc), 'volcano_from_12': len(post12 & volc) >= 3, 'no_ruins_before_20': not (set().union(*[set(w) for w in W[:19]]) & {'gargoyle', 'wraith', 'ruinroot'})}
    out['ok'] = all(v for k, v in out.items() if k not in ('early_types', 'late_types')); return out

@test
def pack_spawn(pw, url, errs):
    b, pg = page(pw, url, errs, '2-1')
    r = pg.evaluate(r"""()=>{ G.coreHp = G.coreMax = 1e6; G.phase = 'build'; G.wave = 0; G.startWave(); const q = G.spawnQ.slice(); let runs = [], k = 0;
      for (let i = 0; i < q.length; i++) { if (q[i] === 'icewolf') k++; else { if (k) runs.push(k); k = 0; } } if (k) runs.push(k);
      // 실제 출현 간격: 무리는 0.22초 간격
      const times = []; let t = 0; while ((G.spawnQ.length || G.enemies.length < q.length) && t < 40) { const n0 = G.enemies.length; G.sim(.05, .05); t += .05; if (G.enemies.length > n0) times.push([G.enemies[G.enemies.length - 1].type, Math.round(t * 100) / 100]); }
      const gaps = []; for (let i = 1; i < times.length; i++) if (times[i][0] === 'icewolf' && times[i - 1][0] === 'icewolf') gaps.push(Math.round((times[i][1] - times[i - 1][1]) * 100) / 100);
      return { q, runs, wolf_gaps: gaps.slice(0, 6) }; }""")
    b.close(); r['ok'] = len(r['runs']) > 0 and all(x % 3 == 0 for x in r['runs']) and r['wolf_gaps'] and max(r['wolf_gaps'][:2]) < .35; return r

# ---------------- 능력 (숲) ----------------
@test
def forest_abilities(pw, url, errs):
    b, pg = page(pw, url, errs, '1-1'); out = {}
    out['split'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const s = R_.at('slime', x, z, false); const id = s; G.hurt(s, 1e9); const n0 = G.enemies.filter(e => e.type === 'slime_s').length; G.sim(.1);
      const kids = G.enemies.filter(e => e.type === 'slime_s' && !e.dead); const o = { before_frame: n0, kids: kids.length, kid_hp: kids.map(k => k.hp), near: kids.every(k => Math.hypot(k.g.position.x - x, k.g.position.z - z) < 1.5), hopping: kids.every(k => k.kup) };
      for (const k of kids) G.hurt(k, 1e9); G.sim(.2); o.grandkids = G.enemies.filter(e => e.type === 'slime_s' && !e.dead).length; o.splits = G.stats.splits;
      // 웨이브 흐름: 슬라임 1마리 웨이브 → 분열한 아이들까지 잡아야 웨이브 종료
      R_.clear(); G.phase = 'build'; G.startWave(); G.spawnQ = ['slime']; R_.runUntil(() => G.enemies.length, 5); const e = G.enemies[0]; R_.runUntil(() => e.state !== 'spawn', 3); G.hurt(e, 1e9); G.sim(.3);
      o.phase_with_kids = G.phase; o.kids_alive = G.enemies.filter(k => k.type === 'slime_s' && !k.dead).length; for (const k of G.enemies.filter(k => !k.dead)) G.hurt(k, 1e9); R_.runUntil(() => G.phase === 'build', 6); o.phase_end = G.phase; R_.clear();
      o.ok = o.before_frame === 0 && o.kids === 2 && o.kid_hp.every(h => Math.abs(h - G.ETYPES.slime_s.hp) < 1e-6) && o.near && o.grandkids === 0 && o.phase_with_kids === 'wave' && o.kids_alive === 2 && o.phase_end === 'build'; return o; }""")
    out['panic'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const g = R_.at('goblin', x, z, false); G.sim(.1); const o = { k0: g.spdK }; G.hurt(g, g.max * .55); G.sim(.1); o.k1 = g.spdK; o.panicked = !!g.panicked;
      G.sim(2.4); o.k2 = g.spdK; G.hurt(g, 1); G.sim(.1); o.k3 = g.spdK; o.panics = G.stats.panics; R_.clear(); o.ok = o.k0 === 1 && Math.abs(o.k1 - 1.8) < 1e-9 && o.k2 === 1 && o.k3 === 1 && o.panics === 1; return o; }""")
    out['heal'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const m = R_.at('mushroom', x, z); const a = R_.at('grunt', x + 1.5, z), far = R_.at('grunt', x + 8, z); a.hp = far.hp = a.max * .5; m.hp = m.max * .9; const o = {};
      let tele = false, glowG = 0, stood = true; const p0 = m.g.position.clone();
      o.secs = R_.runUntil(() => { if (m.cast && m.cast.k === 'heal') { tele = true; glowG = Math.max(glowG, m.m.capMat.emissive.g); } return (G.stats.heals || 0) >= 1; }, 8);
      o.telegraph = tele; o.cap_glow_g = R_.r(glowG); o.near_hp = R_.r(a.hp / a.max); o.far_hp = R_.r(far.hp / far.max); o.self_hp = R_.r(m.hp / m.max); o.healed = Math.round(G.stats.healed);
      R_.clear(); o.ok = o.telegraph && o.cap_glow_g > .2 && Math.abs(o.near_hp - .62) < .002 && o.far_hp === .5 && o.self_hp > .9 && o.secs < 6; return o; }""")
    out['root'] = pg.evaluate(r"""()=>{ const tw = R_.tower('arrow'); const [x, z] = R_.xz(tw, 4, 0); const t = R_.at('treant', x, z); t.hp = t.max = 1e9; const o = {};
      let warn = false, warnVis = false; o.t_warn = R_.runUntil(() => { if (tw.warnT > 0) { warn = true; warnVis = tw.dfx && tw.dfx.warn.visible; } return tw.rootT > 0; }, 8);
      o.telegraph = warn; o.warn_ring = warnVis; o.casting = !t.cast; o.rate_k = G.towerRateK(tw); const s0 = tw.shots; G.sim(2.2); o.shots_rooted = tw.shots - s0; o.roots_visible = tw.dfx.roots.visible;
      G.sim(.6); const s1 = tw.shots; G.sim(2); o.shots_after = tw.shots - s1; o.rate_after = G.towerRateK(tw); o.roots = G.stats.roots; o.roots_hidden_after = !tw.dfx.roots.visible;
      R_.clear(); o.ok = o.telegraph && o.warn_ring && o.rate_k === 0 && o.shots_rooted === 0 && o.roots_visible && o.shots_after >= 2 && o.rate_after === 1 && o.roots_hidden_after && Math.abs(o.t_warn - 4.2) < .2; return o; }""")
    out['popup'] = pg.evaluate(r"""()=>{ localStorage.removeItem('hd3d_seenMon'); G.seenMon = null; const n = document.getElementById('note'); const o = {};
      G.phase = 'build'; G.wave = 0; G.startWave(); o.w1 = n.classList.contains('hidden') ? '' : n.innerText.replace(/\s+/g, ' ').slice(0, 160); o.w1_cards = n.querySelectorAll('.nc.mon').length; G.spawnQ = [];
      G.phase = 'build'; G.wave = 2; n.classList.add('hidden'); G.startWave(); o.w3 = n.classList.contains('hidden') ? '' : n.innerText.replace(/\s+/g, ' ').slice(0, 200); o.w3_types = [...n.querySelectorAll('.nc')].map(c => c.dataset.t); G.spawnQ = [];
      G.phase = 'build'; G.wave = 2; n.classList.add('hidden'); G.startWave(); o.repeat_hidden = n.classList.contains('hidden'); G.spawnQ = [];
      o.saved = JSON.parse(localStorage.getItem('hd3d_seenMon') || '[]'); G.phase = 'build';
      o.ok = o.w1.includes('신규 몬스터') && o.w1.includes('고블린') && o.w3_types.includes('slime') && o.repeat_hidden && o.saved.includes('slime') && o.saved.includes('goblin'); return o; }""")
    out['nan'] = pg.evaluate('()=>R_.nan()'); b.close()
    out['ok'] = all(v.get('ok') for k, v in out.items() if isinstance(v, dict)) and out['nan'] == 0; return out

# ---------------- 능력 (설원) ----------------
@test
def snow_abilities(pw, url, errs):
    b, pg = page(pw, url, errs, '2-1'); out = {}
    out['pack'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const W = [0, 1, 2].map(i => R_.at('icewolf', x + i * .8, z)); const lone = R_.at('icewolf', x, z + 14); G.sim(.4); const o = {};
      o.pack_on = W.map(w => !!w.packOn); o.lone_on = !!lone.packOn; o.spdK = W[0].spdK; o.ring = W[0].m.ring.visible; const h0 = W[0].hp; G.hurt(W[0], 50); o.pack_dmg = R_.r(h0 - W[0].hp); const h1 = lone.hp; G.hurt(lone, 50); o.lone_dmg = R_.r(h1 - lone.hp);
      G.hurt(W[1], 1e9); G.hurt(W[2], 1e9); G.sim(.4); o.after_pack_on = !!W[0].packOn; o.after_spdK = W[0].spdK; R_.clear();
      o.ok = o.pack_on.every(Boolean) && !o.lone_on && Math.abs(o.spdK - 1.3) < 1e-9 && o.ring && o.pack_dmg === 40 && o.lone_dmg === 50 && !o.after_pack_on && o.after_spdK === 1; return o; }""")
    out['chill'] = pg.evaluate(r"""()=>{ const tw = R_.tower('arrow'); const [x, z] = R_.xz(tw, 2.4, 0); const y = R_.at('yeti', x, z); y.abT.snowball = 1e9; y.hp = y.max = 1e9; const d = R_.at('golem', ...R_.xz(tw, -3, 0)); d.hp = d.max = 1e9; const o = {};
      G.sim(.3); o.rate_k = R_.r(G.towerRateK(tw)); o.flake = tw.dfx && tw.dfx.flake.visible; o.ring = !!y.m.chillRing; const s0 = tw.shots; G.sim(8); o.shots_chilled = tw.shots - s0;
      y.g.position.x += 30; G.sim(.3); o.rate_far = G.towerRateK(tw); const s1 = tw.shots; G.sim(8); o.shots_normal = tw.shots - s1; R_.clear();
      o.ok = o.rate_k === .7 && o.flake && o.ring && o.rate_far === 1 && o.shots_chilled <= o.shots_normal * .82 && o.shots_chilled >= o.shots_normal * .58; return o; }""")
    out['snowball'] = pg.evaluate(r"""()=>{ const tw = R_.tower('arrow'); const [x, z] = R_.xz(tw, 6, 0); const y = R_.at('yeti', x, z); y.hp = y.max = 1e9; const o = {}; const hp0 = tw.hp;
      let warn = false, ballVis = false, cast = false; o.secs = R_.runUntil(() => { if (tw.warnT > 0) warn = true; if (y.m.snowball.visible) ballVis = true; if (y.cast && y.cast.k === 'snowball') cast = true; return (G.stats.frosts || 0) >= 1; }, 8);
      o.telegraph = warn && ballVis && cast; o.frost = R_.r(tw.frostT); o.rate_k = G.towerRateK(tw); o.ice_vis = tw.dfx.ice.visible; o.tower_dmg = R_.r(hp0 - tw.hp); G.sim(3.6); o.rate_after = G.towerRateK(tw); o.ice_after = tw.dfx.ice.visible; R_.clear();
      o.ok = o.telegraph && o.frost > 3 && o.rate_k === .5 && o.ice_vis && o.tower_dmg === 12 && o.rate_after === 1 && !o.ice_after && o.secs < 4.5; return o; }""")
    out['shield'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const g = R_.at('grunt', x, z); const w = R_.at('wisp', x + 6, z + 2, false); const o = {};
      o.secs = R_.runUntil(() => g.shield > 0, 6); o.amount = R_.r(g.shield); o.expected = R_.r(Math.min(g.max * .3, 160 * (G.hpMul || 1))); o.bubble = g.shBub && g.shBub.visible; o.escort_target = w.esc === g;
      const h0 = g.hp; G.hurt(g, 10); o.hp_after_small = R_.r(h0 - g.hp); o.shield_left = R_.r(g.shield); G.hurt(g, 30); o.hp_after_big = R_.r(h0 - g.hp); o.shield_end = g.shield; o.bubble_after = g.shBub.visible; o.absorbed = R_.r(G.stats.absorbed);
      G.sim(2); o.wisp_dist = R_.r(Math.hypot(w.g.position.x - g.g.position.x, w.g.position.z - g.g.position.z)); o.wisp_alive = !w.dead; R_.clear();
      o.ok = o.secs < 3 && o.amount === o.expected && o.bubble && o.escort_target && o.hp_after_small === 0 && o.shield_left === R_.r(o.amount - 10) && Math.abs(o.hp_after_big - (40 - o.amount)) < 1e-6 && o.shield_end === 0 && !o.bubble_after && o.wisp_dist < 1.5 && o.wisp_alive; return o; }""")
    out['crack'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const f = R_.at('frostgolem', x, z); const o = {}; let h = f.hp; const hit = () => { const a = f.hp; G.hurt(f, 100); return R_.r(a - f.hp); };
      o.hit1 = hit(); o.armor1 = f.armor; o.cracked1 = f.cracked; o.hit2 = hit(); o.cracked2 = f.cracked; o.hit3 = hit(); o.ice_hidden = f.m.iceParts.every(p => !p.visible); G.sim(.1); o.spdK = f.spdK; o.cracks = G.stats.cracks; R_.clear();
      // 빙결의 군주: 갑옷 재생
      const bs = R_.at('boss_snow', x, z); bs.abT.snowball = 1e9; const b0 = bs.hp; G.hurt(bs, 100); o.boss_hit = R_.r(b0 - bs.hp); for (let i = 0; i < 8 && !bs.cracked; i++) G.hurt(bs, 100); o.boss_cracked = bs.cracked; o.boss_armor = bs.armor; G.sim(14.3); o.boss_regen = !bs.cracked && bs.armor === .5; R_.clear();
      o.ok = o.hit1 === 40 && o.armor1 === .6 && !o.cracked1 && o.cracked2 && o.hit2 === 100 && o.hit3 === 100 && o.ice_hidden && Math.abs(o.spdK - 1.25) < 1e-9 && o.cracks === 1 && o.boss_hit === 50 && o.boss_cracked && R_.r(o.boss_armor) === .1 && o.boss_regen; return o; }""")
    out['nan'] = pg.evaluate('()=>R_.nan()'); b.close()
    out['ok'] = all(v.get('ok') for k, v in out.items() if isinstance(v, dict)) and out['nan'] == 0; return out

@test
def boss_forest_roots(pw, url, errs):
    b, pg = page(pw, url, errs, '1-6')
    r = pg.evaluate(r"""()=>{ const s = R_.grass(); const tws = [R_.tower('arrow', s)]; for (const [dc, dr] of [[2, 0], [0, 2], [-2, 0], [0, -2], [2, 2]]) { const t = G.tileAt(s[0] + dc, s[1] + dr); if (t && t.t === 0 && !t.tower && tws.length < 4) tws.push(R_.tower('cannon', [s[0] + dc, s[1] + dr])); }
      const [x, z] = R_.xz(tws[0], 1, 1); const bs = R_.at('boss_forest', x, z); bs.hp = bs.max = 1e9; const o = { towers: tws.length };
      o.secs = R_.runUntil(() => (G.stats.roots || 0) >= 1, 8); G.sim(.05); o.rooted = tws.filter(t => t.rootT > 0).length; o.banner = document.getElementById('banner').textContent; R_.clear(); o.ok = o.rooted === Math.min(3, o.towers) && o.secs < 6; return o; }""")
    b.close(); return r

@test
def comp_endless_ruins(pw, url, errs):  # 도전 모드 20~26웨이브: 폐허 구성 섞임, 40웨이브 = 망국의 왕
    b, pg = page(pw, url, errs); r = pg.evaluate(r"""()=>{ G.coreHp = G.coreMax = 1e6; const seen = {}, bosses = {}; for (const n of [20, 21, 22, 23, 24, 25, 26, 30, 40]) { G.phase = 'build'; G.wave = n - 1; G.startWave(); for (const t of G.spawnQ) seen[t] = (seen[t] || 0) + 1; bosses[n] = G.spawnQ.filter(t => /^boss/.test(t)); G.spawnQ = []; G.phase = 'build'; } return { seen, bosses }; }"""); b.close()
    ruin = {k: v for k, v in r['seen'].items() if k in ('gargoyle', 'wraith')}; out = {'ruins': ruin, 'bosses': r['bosses']}
    out['ok'] = sum(ruin.values()) >= 6 and len(ruin) == 2 and r['bosses']['40'] == ['boss_ruins'] and r['bosses']['30'] == ['boss_fire']; return out

# ---------------- 능력 (폐허) ----------------
@test
def ruins_abilities(pw, url, errs):
    b, pg = page(pw, url, errs, '4-1'); out = {}
    # 석상 가고일: 돌 껍질 60% → 9초 주기 석상화(0.6초 예고) 2.2초 무적·정지·조준 불가, 껍질 누적 피해 35% 회복(타워 화살이 조금 더할 수 있어 < 80%로 검사) → 깨지면 방어 0·속도 1.45·더는 석상화 안 함
    out['gargoyle'] = pg.evaluate(r"""()=>{ const tw = R_.tower('arrow'); const [x, z] = R_.xz(tw, 2.5, 0); const g = R_.at('gargoyle', x, z); g.hp = g.max = 2000; const o = {}; const hit = () => { const a = g.hp; G.hurt(g, 100); return R_.r(a - g.hp); };
      o.hit1 = hit(); o.acc1 = R_.r(g.crackAcc); g.abT.perch = .05; o.secs = R_.runUntil(() => g.statueT > 0, 2); o.dome = !!(g.m.dome && g.m.dome.visible); o.acc2 = R_.r(g.crackAcc); o.imm_hit = hit(); G.sim(.1); o.spdK = g.spdK;
      const s0 = tw.shots; G.sim(1.5); o.shots_on_statue = tw.shots - s0; G.sim(1); o.statue_after = g.statueT > 0; o.dome_after = g.m.dome.visible; o.perches = G.stats.perches;
      for (let i = 0; i < 12 && !g.cracked; i++) hit(); o.cracked = g.cracked; o.armor = g.armor; g.abT.perch = .05; G.sim(1.5); o.perch_after_crack = g.statueT > 0 || !!g.cast; o.spdK2 = g.spdK; R_.clear();
      o.ok = o.hit1 === 40 && o.secs < 1 && o.dome && o.acc2 < o.acc1 * .8 && o.imm_hit === 0 && o.spdK === 0 && o.shots_on_statue === 0 && !o.statue_after && !o.dome_after && o.perches === 1 && o.cracked && o.armor === 0 && !o.perch_after_crack && Math.abs(o.spdK2 - 1.45) < 1e-9; return o; }""")
    # 폐허의 망령: 지상 동료에게 보라 어둠 보호막, 6.5초 주기 0.5초 깜박임 → 1.6초 실체 소멸(무적, 반투명, 조준 불가)
    out['wraith'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const g = R_.at('grunt', x, z); g.hp = g.max = 1e6; const w = R_.at('wraith', x + 1, z, false); w.hp = w.max = 500; w.abT.phase = 1e9; const o = {};
      o.secs = R_.runUntil(() => g.shield > 0, 6); o.dark = !!g.shDark && g.shBub && g.shBub.material.color.getHex() === 0x8a3aff;
      w.abT.phase = .05; o.phase_secs = R_.runUntil(() => w.phaseT > 0, 2); const a = w.hp; G.hurt(w, 50); o.imm_hit = R_.r(a - w.hp); let tr = 0; w.m.inner.traverse(m => { if (m.isMesh && !m.userData.ol && m.material.opacity < .5) tr++; }); o.translucent = tr > 0;
      G.sim(1.8); o.after = w.phaseT > 0; const b2 = w.hp; G.hurt(w, 50); o.hit_after = R_.r(b2 - w.hp); let op = 1; w.m.inner.traverse(m => { if (m.isMesh && !m.userData.ol) op = Math.min(op, m.material.opacity); }); o.opaque_after = op === 1; R_.clear();
      o.ok = o.secs < 3 && o.dark && o.phase_secs < 1 && o.imm_hit === 0 && o.translucent && !o.after && o.hit_after === 50 && o.opaque_after; return o; }""")
    out['ruinroot'] = pg.evaluate(r"""()=>{ const s = R_.grass(); const tws = [R_.tower('arrow', s)]; for (let c = s[0] - 2; c <= s[0] + 2 && tws.length < 3; c++) for (let r = s[1] - 2; r <= s[1] + 2 && tws.length < 3; r++) { if (c < 0 || r < 0 || c >= G.GW || r >= G.GH) continue; const t = G.tileAt(c, r); if (t.t === 0 && !t.tower && G.buildReason(c, r, 'arrow') === null) { G.build(c, r, 'arrow'); if (t.tower) tws.push(t.tower); } }
      const [x, z] = R_.xz(tws[0], 1, 1); const v = R_.at('ruinroot', x, z); v.hp = v.max = 1e9; const o = { towers: tws.length }; o.secs = R_.runUntil(() => (G.stats.roots || 0) >= 1, 6); G.sim(.05); o.rooted = tws.filter(t => t.rootT > 0).length; R_.clear();
      o.ok = o.rooted === Math.min(2, o.towers) && o.towers >= 2 && o.secs < 5; return o; }""")
    # 고대 성벽: 바위 칸(4) · 체력 1.6배 · 이름 · 개간 60G · 파괴 가능(무너지면 길) · 성벽 없이도 모든 포털 → 코어 도달
    out['walls'] = pg.evaluate(r"""()=>{ const W = []; for (let c = 0; c < G.GW; c++) for (let r = 0; r < G.GH; r++) { const t = G.tileAt(c, r); if (t.wall) W.push(t); } const t = W[0], o = { n: W.length, type: t.t, hp: t.hp };
      const [hx, hy] = G.hoverTile(t.c, t.r); o.tip = document.getElementById('tip').innerText.slice(0, 40); const reach = G.SPAWNS.every(s => Number.isFinite(G.field('default')[s[0] * G.GH + s[1]]));
      G.damageTile(t, 1e6); G.sim(.1); o.after = [t.t, !!t.wall]; o.broken = G.wallsBroken; o.reach = reach; o.ok = o.n >= 12 && o.type === 4 && o.hp === 768 && /고대 성벽/.test(o.tip) && /60G/.test(o.tip) && o.after[0] === 1 && !o.after[1] && o.broken === 1 && reach; return o; }""")
    out['nan'] = pg.evaluate('()=>R_.nan()'); b.close()
    out['ok'] = all(v.get('ok') for k, v in out.items() if isinstance(v, dict)) and out['nan'] == 0; return out

@test
def boss_ruins(pw, url, errs):
    b, pg = page(pw, url, errs, '4-4'); out = {}
    # 저주: 가장 가까운 타워 + 반경 3.4 안 타워 (최대 4) 보라 고리 1.8초 예고 → 4.5초 봉인 (공격 0), 끝나면 회복
    out['curse'] = pg.evaluate(r"""()=>{ const s = R_.grass(); const tws = [R_.tower('arrow', s)]; for (let c = s[0] - 2; c <= s[0] + 2 && tws.length < 3; c++) for (let r = s[1] - 2; r <= s[1] + 2 && tws.length < 3; r++) { if (c < 0 || r < 0 || c >= G.GW || r >= G.GH) continue; const t = G.tileAt(c, r); if (t.t === 0 && !t.tower && G.buildReason(c, r, 'arrow') === null) { G.build(c, r, 'arrow'); if (t.tower) tws.push(t.tower); } }
      const [x, z] = R_.xz(tws[0], 3, 0); const bs = R_.at('boss_ruins', x, z); bs.hp = bs.max = 1e9; bs.abT.summon = 1e9; bs.abT.curse = .05; const o = { towers: tws.length }; let warn = 0;
      o.secs = R_.runUntil(() => { warn = Math.max(warn, tws.filter(t => t.warnT > 0 && t.warnC === 0xa050ff).length); return (G.stats.curses || 0) >= 1; }, 4); G.sim(.05);
      const cu = tws.filter(t => t.curseT > 0); o.warned = warn; o.cursed = cu.length; o.rate0 = cu.length ? G.towerRateK(cu[0]) : -1; o.skull = !!(cu.length && cu[0].dfx.curse.visible); const sh0 = cu.reduce((a, t) => a + t.shots, 0), inR = cu.length ? Math.hypot(...R_.xz(cu[0]).map((v, i) => v - [bs.g.position.x, bs.g.position.z][i])) : -1; o.in_range = cu.length ? inR <= cu[0].S.range : false; G.sim(4.0); o.shots_cursed = cu.reduce((a, t) => a + t.shots, 0) - sh0; o.cd_cursed = cu.length ? R_.r(cu[0].cd) : -1; G.sim(.6); const sh1 = cu.reduce((a, t) => a + t.shots, 0); G.sim(1.5); o.shots_after = cu.reduce((a, t) => a + t.shots, 0) - sh1; o.rate_after = cu.length ? G.towerRateK(cu[0]) : -1; o.skull_after = cu.length ? cu[0].dfx.curse.visible : true; R_.clear();
      o.ok = o.towers >= 2 && o.cursed === o.towers && o.warned === o.towers && o.rate0 === 0 && o.skull && o.in_range && o.shots_cursed === 0 && o.shots_after >= 1 && o.rate_after === 1 && !o.skull_after && o.secs > 1.6 && o.secs < 2.2; return o; }""")
    out['summon'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(10, 8); const bs = R_.at('boss_ruins', x, z); bs.hp = bs.max = 1e9; bs.abT.curse = 1e9; bs.abT.summon = .05; const o = {}; const marks = () => G.scene.children.filter(m => m.userData && m.userData.dread).length;
      G.sim(.3); o.marks = marks(); o.guards_before = G.enemies.filter(e => e.type === 'ruin_guard').length; G.sim(1.4); o.guards = G.enemies.filter(e => e.type === 'ruin_guard' && !e.dead).length; o.marks_after = marks(); R_.clear();
      o.ok = o.marks === 3 && o.guards_before === 0 && o.guards === 3 && o.marks_after === 0; return o; }""")
    # (보호막 검사는 .11~.12: 옆 화살탑이 생성 직후 한 발 맞힐 수 있음 — 타워 공속 ×0.8 로 사격 타이밍 이동)
    # 어둠의 파동 (체력 50%): 2.2초 예고(넓어지는 보라 원, 제자리) → 반경 8 타워 90 피해 + 2초 봉인, 어둠 보호막 12%, 2페이즈(소환 +2, 주기 ×0.7), 1회만
    out['dread'] = pg.evaluate(r"""()=>{ const s = R_.grass(); const tw = R_.tower('arrow', s); const [x, z] = R_.xz(tw, 4, 0); const bs = R_.at('boss_ruins', x, z, false); bs.abT.curse = bs.abT.summon = 1e9; G.sim(.2); const o = {}; const hp0 = tw.hp;
      bs.hp = bs.max * .45; G.sim(.1); o.casting = bs.cast && bs.cast.k; o.banner = document.getElementById('banner').textContent; o.hit_before = R_.r(hp0 - tw.hp); o.mark = G.scene.children.some(m => m.userData && m.userData.dread);
      G.sim(2.3); o.p2 = !!bs.phase2; o.tower_dmg = R_.r(hp0 - tw.hp); o.cursed = tw.curseT > 0; o.shield = R_.r(bs.shield / bs.max); o.dark = !!bs.shDark; o.dreads = G.stats.dreads; bs.hp = bs.max * .3; G.sim(.5); o.dreads2 = G.stats.dreads;
      bs.abT.summon = .05; G.sim(.3); o.marks = G.scene.children.filter(m => m.userData && m.userData.dread).length; R_.clear();
      o.ok = o.casting === 'dread' && o.banner.includes('어둠의 파동') && o.hit_before === 0 && o.mark && o.p2 && o.tower_dmg === 90 && o.cursed && o.shield >= .11 && o.shield <= .12 && o.dark && o.dreads === 1 && o.dreads2 === 1 && o.marks === 5; return o; }""")
    out['nan'] = pg.evaluate('()=>R_.nan()'); b.close()
    out['ok'] = all(v.get('ok') for k, v in out.items() if isinstance(v, dict)) and out['nan'] == 0; return out

# ---------------- 능력 (화산) ----------------
@test
def volcano_abilities(pw, url, errs):
    b, pg = page(pw, url, errs, '3-1'); out = {}
    out['ember_split'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const s = R_.at('ember_slime', x, z, false); G.hurt(s, 1e9); G.sim(.1); const n = G.enemies.filter(e => e.type === 'ember_s' && !e.dead).length; R_.clear(); return { n, ok: n === 3 }; }""")
    out['magma_shell'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const f = R_.at('magmagolem', x, z); const o = {}; const hit = () => { const a = f.hp; G.hurt(f, 100); return R_.r(a - f.hp); };
      o.hit1 = hit(); o.armor = f.armor; for (let i = 0; i < 4 && !f.cracked; i++) hit(); o.cracked = f.cracked; o.hit_after = hit(); G.sim(.1); o.spdK = f.spdK; R_.clear();
      o.ok = o.hit1 === 40 && o.armor === .6 && o.cracked && o.hit_after === 100 && Math.abs(o.spdK - 1.25) < 1e-9; return o; }""")
    out['hound_pack'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const W = [0, 1, 2].map(i => R_.at('lavahound', x + i * .8, z)); G.sim(.4); const o = { on: W.map(w => !!w.packOn), ring: W[0].m.ring.visible, spdK: W[0].spdK }; R_.clear();
      o.ok = o.on.every(Boolean) && o.ring && Math.abs(o.spdK - 1.3) < 1e-9; return o; }""")
    out['lava_tiles'] = pg.evaluate(r"""()=>{ let n = 0, bad = 0; for (let c = 0; c < G.GW; c++) for (let r = 0; r < G.GH; r++) { const t = G.tileAt(c, r); if (t.lava) { n++; if (t.t !== 5 || G.buildReason(c, r, 'arrow') === null) bad++; } }
      const reach = G.SPAWNS.every(s => Number.isFinite(G.field('default')[s[0] * G.GH + s[1]])); return { n, bad, reach, ok: n >= 10 && bad === 0 && reach }; }""")
    out['nan'] = pg.evaluate('()=>R_.nan()'); b.close()
    out['ok'] = all(v.get('ok') for k, v in out.items() if isinstance(v, dict)) and out['nan'] == 0; return out

@test
def boss_fire(pw, url, errs):
    b, pg = page(pw, url, errs, '3-4'); out = {}
    out['lavapool'] = pg.evaluate(r"""()=>{ const s = R_.grass(); const tws = [R_.tower('arrow', s)]; for (let c = s[0] - 4; c <= s[0] + 4 && tws.length < 3; c++) for (let r = s[1] - 4; r <= s[1] + 4 && tws.length < 3; r++) { const t = c >= 0 && r >= 0 && c < G.GW && r < G.GH && G.tileAt(c, r); if (t && t.t === 0 && !t.tower && Math.abs(c - s[0]) + Math.abs(r - s[1]) >= 2 && G.buildReason(c, r, 'cannon') === null) { const tw = R_.tower('cannon', [c, r]); if (tw) tws.push(tw); } }
      const [x, z] = R_.xz(tws[0], 1, 1); const bs = R_.at('boss_fire', x, z); bs.hp = bs.max = 1e9; bs.abT.meteor = 1e9; const o = { towers: tws.length }; let warn = 0;
      o.secs = R_.runUntil(() => { warn = Math.max(warn, tws.filter(t => t.warnT > 0 && t.warnC === 0xff6a1a).length); return (G.stats.pools || 0) >= 1; }, 9); G.sim(.05);
      const melt = tws.filter(t => t.meltT > 0); o.warned = warn; o.melted = melt.length; o.rate0 = melt.length ? G.towerRateK(melt[0]) : -1; o.pool_vis = !!(melt.length && melt[0].dfx.pool.visible); const hp0 = melt.length ? melt[0].hp : 0; const sh0 = melt.reduce((a, t) => a + t.shots, 0);
      o.in_range = melt.length ? Math.hypot(...R_.xz(melt[0]).map((v, i) => v - [bs.g.position.x, bs.g.position.z][i])) <= melt[0].S.range : false;
      G.sim(2); o.dmg2s = melt.length ? R_.r(hp0 - melt[0].hp) : 0; G.sim(2.5); o.shots_melted = melt.reduce((a, t) => a + t.shots, 0) - sh0; G.sim(1); const sh1 = melt.reduce((a, t) => a + t.shots, 0); G.sim(2); o.shots_after = melt.reduce((a, t) => a + t.shots, 0) - sh1; o.rate_after = melt.length ? G.towerRateK(melt[0]) : -1; o.pool_after = melt.length ? melt[0].dfx.pool.visible : true; R_.clear();
      o.ok = o.melted === 2 && o.warned === 2 && o.rate0 === 0 && o.pool_vis && o.in_range && o.shots_melted === 0 && o.shots_after >= 1 && o.dmg2s >= 28 && o.dmg2s <= 40 && o.rate_after === 1 && !o.pool_after && o.secs <= 7; return o; }""")
    out['meteor'] = pg.evaluate(r"""()=>{ const s = R_.grass(); const tw = R_.tower('arrow', s); const [x, z] = R_.xz(tw, 5, 0); const bs = R_.at('boss_fire', x, z); bs.hp = bs.max = 1e9; bs.abT.lavapool = 1e9; bs.abT.meteor = .1;
      G.hero.dead = 0; G.hero.hp = G.hero.max; G.hero.g.position.set(x - 2, 0, z + 3); const hp0 = tw.hp, h0 = G.hero.hp, o = {}; const marks = () => G.scene.children.filter(m => m.userData && m.userData.ring).length;
      G.sim(.3); o.marks = marks(); o.hit_before = R_.r(hp0 - tw.hp);
      o.secs = R_.runUntil(() => (G.stats.meteors || 0) >= o.marks, 4); o.tower_dmg = R_.r(hp0 - tw.hp); o.hero_dmg = R_.r(h0 - G.hero.hp); G.sim(.2); o.marks_after = marks(); R_.freeHero(); R_.clear();
      o.ok = o.marks === 2 && o.hit_before === 0 && o.tower_dmg === 55 && o.hero_dmg > 0 && o.marks_after === 0 && o.secs > 1.5 && o.secs < 2.8; return o; }""")
    out['enrage'] = pg.evaluate(r"""()=>{ const [x, z] = G.tileXZ(8, 8); const bs = R_.at('boss_fire', x, z, false); bs.abT.lavapool = bs.abT.meteor = 1e9; G.sim(.2); const o = { spd0: bs.spdK };
      bs.hp = bs.max * .45; G.sim(.1); o.enraged = !!bs.enraged; o.spd1 = bs.spdK; o.timers = [R_.r(bs.abT.lavapool), R_.r(bs.abT.meteor)]; o.banner = document.getElementById('banner').textContent; o.ring = !!bs.m.enrRing; o.count = G.stats.enrages; G.sim(.5); o.count2 = G.stats.enrages; R_.clear();
      o.ok = o.spd0 === 1 && o.enraged && Math.abs(o.spd1 - 1.25) < 1e-9 && o.timers.every(t => t <= 2.5) && o.banner.includes('분노') && o.ring && o.count === 1 && o.count2 === 1; return o; }""")
    out['nan'] = pg.evaluate('()=>R_.nan()'); b.close()
    out['ok'] = all(v.get('ok') for k, v in out.items() if isinstance(v, dict)) and out['nan'] == 0; return out

# ---------------- 전체 웨이브 · 성능 · 화면 ----------------
@test
def full_waves(pw, url, errs):
    out = {}
    for st in ['1-6', '2-4', '3-4', '4-4']:
        b, pg = page(pw, url, errs, st)
        r = pg.evaluate(r"""()=>{ G.coreHp = G.coreMax = 1e6; G.gold = 2000; const used = []; for (const [type, i] of [['arrow', 4], ['cannon', 8], ['magic', 12], ['arrow', 16], ['cannon', 20]]) { const s = T_.grassNearRoute(i, 2, used); if (!s) continue; used.push(s.join(',')); G.build(s[0], s[1], type); }
          const o = { waves: [] }; for (const w of [3, 9, G.STAGE_CFG.waves]) { G.phase = 'build'; G.wave = w - 1; G.startWave(); const q = G.spawnQ.length; let t = 0, kinds = new Set();
            while (G.phase === 'wave' && t < 240) { G.sim(1); t++; for (const e of G.enemies) kinds.add(e.type); if (t > 60) for (const e of G.enemies) G.hurt(e, 1e9); }
            o.waves.push({ w, q, secs: t, phase: G.phase, kinds: [...kinds].sort(), nan: R_.nan() }); } o.splits = G.stats.splits || 0; o.roots = G.stats.roots || 0; o.frosts = G.stats.frosts || 0; o.shields = G.stats.shields || 0; o.heals = G.stats.heals || 0; o.cracks = G.stats.cracks || 0; return o; }""")
        r['ok'] = all(w['phase'] != 'wave' and w['nan'] == 0 for w in r['waves']); out[st] = r; b.close()
    out['ok'] = all(v['ok'] for v in out.values() if isinstance(v, dict)); return out

@test
def perf_and_screen(pw, url, errs):
    b, pg = page(pw, url, errs, '2-4')
    r = pg.evaluate(r"""()=>{ G.coreHp = G.coreMax = 1e6; G.gold = 3000; const used = []; for (const [type, i] of [['arrow', 4], ['cannon', 8], ['magic', 12], ['arrow', 16]]) { const s = T_.grassNearRoute(i, 2, used); if (!s) continue; used.push(s.join(',')); G.build(s[0], s[1], type); }
      const types = ['icewolf', 'icewolf', 'icewolf', 'yeti', 'wisp', 'frostgolem', 'charger', 'shield', 'grunt', 'goblin', 'wolf', 'slime', 'mushroom', 'treant', 'bat'];
      G.phase = 'wave'; for (let i = 0; i < 120; i++) G.spawnEnemy(types[i % types.length], 1); G.sim(2); const t0 = performance.now(); let n = 0; for (let k = 0; k < 100; k++) { G.sim(.05, .05); n++; } const ms = (performance.now() - t0) / n;
      return { enemies: G.enemies.length, step_ms: Math.round(ms * 100) / 100, nan: R_.nan() }; }""")
    pg.evaluate('()=>{ G.cam.r = 46; }'); pg.wait_for_timeout(1500)
    png = pg.screenshot(); from PIL import Image; im = Image.open(io.BytesIO(png)).convert('L'); px = list(im.getdata()); r['mean_luma'] = round(sum(px) / len(px), 1); r['dark_frac'] = round(sum(1 for p in px if p < 8) / len(px), 3)
    b.close(); r['ok'] = r['nan'] == 0 and r['step_ms'] < 25 and r['mean_luma'] > 40 and r['dark_frac'] < .3; return r

def main():
    srv, url = serve(); out, errs = {}, []; t0 = time.time()
    only = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    with sync_playwright() as pw:
        for n, f in TESTS.items():
            if only and n not in only: continue
            t1 = time.time(); e0 = len(errs); out[n] = f(pw, url, errs); ok = out[n].get('ok') and len(errs) == e0
            print(f"{'OK  ' if ok else 'FAIL'} {n} ({time.time() - t1:.0f}s)", json.dumps(out[n], ensure_ascii=False)[:900], flush=True)
    out['console_errors'] = errs; json.dump(out, open(os.path.join(os.path.dirname(__file__), 'roster_last.json'), 'w'), ensure_ascii=False, indent=1)
    bad = [n for n, r in out.items() if isinstance(r, dict) and not r.get('ok')] + (['console'] if errs else [])
    print(f'total {time.time() - t0:.0f}s · errors', errs[:5]); print('FAIL ' + ','.join(bad) if bad else f'ALL OK ({len(TESTS)})'); return 1 if bad else 0

if __name__ == '__main__': sys.exit(main())
