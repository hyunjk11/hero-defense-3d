#!/usr/bin/env python3
"""하드 모드 밸런스 확인 (헤드리스 자동 전투, 결정적).  python3 tests/hard_balance.py [1-1,1-6,...] [--perm 10] [--adv]
같은 스테이지를 노말/하드로, 같은 단순 봇(경로 근처 명당에 타워 건설 → 남는 골드로 업그레이드·추가 건설)으로 끝까지 돌려 코어 체력·별을 비교.
영웅 = 마법사, 영구 강화 --perm (기본 10 = 노말 최대), --adv 이면 전직(서리) 보정. 결과 tests/logs/hard_balance.json
※ 봇은 사람보다 훨씬 단순(개간·바리케이드·스킬 X) → 절대값보다 노말 대비 차이를 봄. 브라우저 테스트라 단독 실행."""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, HELP
from playwright.sync_api import sync_playwright
args = [a for a in sys.argv[1:] if not a.startswith('--')]
STAGES = args[0].split(',') if args else ['1-1', '1-6', '2-4', '3-4', '4-4']
PERM = int(sys.argv[sys.argv.index('--perm') + 1]) if '--perm' in sys.argv else 10
ADV = '--adv' in sys.argv
TEAM = sys.argv[sys.argv.index('--team') + 1] if '--team' in sys.argv else 'max'  # none | mid | max : 연구소·장비·타워 성장
BOT = r"""async ({ hard, perm, adv, team }) => {
  G.stage = G.STAGE_CFG; G.onStageClear = () => { G.phase = 'over'; }; G.perm = { hp: perm, atk: perm }; G.hard = hard; G.grow = team !== 'none';
  const lv = team === 'max' ? { atk: 10, rng: 5, spd: 8, start: 4 } : team === 'mid' ? { atk: 5, rng: 2, spd: 4, start: 2 } : { atk: 0, rng: 0, spd: 0, start: 0 };
  G.research = { arrow: { ...lv }, cannon: { ...lv }, magic: { ...lv } }; G.equip = team === 'max' ? { atk: 60, hp: 40, spd: 20, skill: 30 } : team === 'mid' ? { atk: 30, hp: 20, spd: 10 } : {};
  G.choose('mage');
  G.sim(.2);
  const T = G.TOWERS, cost = t => T[t].cost, used = new Set();
  const spots = () => { const rs = (G.routes && G.routes.length ? G.routes : [G.route]), on = new Set(); for (const r of rs) for (const [c, rr] of r) on.add(c + ',' + rr);
    const cand = []; for (let c = 0; c < G.GW; c++) for (let r = 0; r < G.GH; r++) { const t = G.tiles[c][r]; if (!t || t.t !== 0 || t.tower || t.bar || on.has(c + ',' + r)) continue; let k = 0;
      for (const rt of rs) for (const [a, b] of rt) { const d = Math.hypot(a - c, b - r); if (d <= 3.2) k += Math.hypot(a - G.CORE[0], b - G.CORE[1]) < 7 ? 3 : 1; } if (k) cand.push([k, c, r]); } // 코어 근처(모든 길이 모임) 가중
    cand.sort((a, b) => b[0] - a[0]); return cand; };
  const order = ['arrow', 'cannon', 'magic', 'arrow', 'magic', 'cannon', 'arrow', 'magic']; let bi = 0;
  const hup = k => { const el = document.querySelector('.up[data-up="' + k + '"]'); if (el) el.click(); };
  const spend = () => { for (let guard = 0; guard < 40; guard++) { const nTw = G.towers.length, want = order[bi % order.length];
      const ups = G.towers.filter(x => x.lvl < 3).map(x => [T[x.type].up[x.lvl - 1], x]).sort((a, b) => a[0] - b[0]), sp = spots().filter(s => !used.has(s[1] + ',' + s[2]) && s[0] >= 5);
      const canB = sp.length && G.gold >= cost(want), canU = ups[0] && G.gold >= ups[0][0];
      if (canB && (nTw < 6 || !ups[0] || ups[0][0] > cost(want) * 1.2 || nTw < 6 + G.wave)) { const s = sp[0]; used.add(s[1] + ',' + s[2]); if (G.build(s[1], s[2], want)) bi++; continue; }
      if (canU) { G.upgradeTower(ups[0][1]); continue; } break; }
    if (G.wave >= 2) { for (let i = 0; i < 3; i++) { const g0 = G.gold; if (g0 < 200) break; hup(i % 2 ? 'spd' : 'atk'); if (G.gold === g0) break; } } };
  // 영웅: 첫 번째 경로의 코어 쪽 1/3 지점 옆에 세움 (단순 수비)
  { const r = (G.routes && G.routes[0]) || G.route; if (r && r.length) { const [c, rr] = r[Math.floor(r.length * .85)]; G.heroGoTo((c - G.GW / 2 + .5) * 2, (rr - G.GH / 2 + .5) * 2); G.sim(3); } }
  const out = { waves: [] }; const t0 = performance.now();
  for (let w = 1; w <= G.stage.waves; w++) { spend(); const c0 = G.coreHp; G.startWave(); let t = 0;
    while (G.phase === 'wave' && t < 420) { G.sim(1); t++; if (t % 20 === 0) await new Promise(r => setTimeout(r, 0)); }
    out.waves.push({ w, t, core: G.coreHp, lost: c0 - G.coreHp, gold: G.gold, towers: G.towers.length, elites: G.eliteKills || 0 }); if (G.phase === 'over' && G.coreHp <= 0) break; }
  out.core = G.coreHp; out.coreMax = G.coreMax; out.cleared = G.coreHp > 0 && G.wave >= G.stage.waves; out.stars = out.cleared ? G.stageSel.ST.starsFor(G.coreHp, G.coreMax) : 0; out.wave = G.wave; out.ms = Math.round(performance.now() - t0);
  out.goldEarned = G.stats.goldEarned; out.leaked = G.stats.leaked; out.elites = G.eliteKills || 0; return out; }"""
srv, url = serve(); res = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for sid in STAGES:
        for hard in (False, True):
            pg = b.new_page(viewport={'width': 960, 'height': 600}); errs = []; pg.on('pageerror', lambda x: errs.append(str(x)[:200]))
            pg.goto(url + f'?seed=12345&rng=777&test=1&stage={sid}'); pg.wait_for_function('()=>window.G&&G.ready&&G.STAGE_CFG', timeout=180000); pg.evaluate(HELP); pg.evaluate('()=>{ G.pauseRender = true; }')
            t = time.time(); r = pg.evaluate(BOT, {'hard': hard, 'perm': PERM, 'adv': ADV, 'team': TEAM}); r['errs'] = errs; r['sec'] = round(time.time() - t)
            k = f"{sid}{' H' if hard else ' N'}"; res[k] = r
            print(f"{k}: cleared={r['cleared']} stars={r['stars']} core={r['core']}/{r['coreMax']} wave={r['wave']} leaked={r['leaked']} elites={r['elites']} gold={r['goldEarned']} ({r['sec']}s) {errs[:1]}", flush=True)
            print('   lost/wave', [x['lost'] for x in r['waves']], 'towers', r['waves'][-1]['towers'] if r['waves'] else 0, flush=True); pg.close()
os.makedirs('tests/logs', exist_ok=True); json.dump({'perm': PERM, 'team': TEAM, 'res': res}, open('tests/logs/hard_balance.json', 'w'), ensure_ascii=False, indent=1)
