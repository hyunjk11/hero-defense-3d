import { $ } from '../core/util.js';
import { UPS } from '../data/heroes.js';
import { TOWERS } from '../data/towers.js';
import { repairCost } from '../world/towers.js';
import { G } from '../core/state.js';
import { hero, stat, WARP_CD } from '../heroes/hero.js';
import { upCost } from './input.js';
import { legendActive, legendCd } from '../heroes/legend.js';
import { BRANCH, XP_NEED } from '../data/growth.js';
import { refreshWavePrev } from './waveprev.js';
const r2 = v => Math.round(v * 100) / 100;

function banner(text, color = '#fff', ms = 1600) { const b = $('banner'); b.textContent = text; b.style.color = color; b.classList.toggle('long', String(text).length > 22); /* 긴 문구는 작은 글씨 + 줄바꿈 */ b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms); }
function showNote(list, ms = 7000) { const n = $('note'); n.innerHTML = list.map(o => `<div class="nc${o.icon ? ' mon' : ''}" data-t="${o.type || ''}">${o.icon ? `<i>${o.icon}</i><small>신규 몬스터</small>` : ''}<b>${o.icon ? '' : '신규: '}${o.name}</b>${o.desc}</div>`).join(''); n.classList.remove('hidden'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.add('hidden'), ms); }
function setPhaseUI() { const ph = $('phase'); ph.textContent = G.phase === 'wave' ? '전투 중 (밤)' : '건설 단계 (낮)'; ph.classList.toggle('night', G.phase === 'wave'); $('startWave').disabled = G.phase !== 'build'; refreshWavePrev(); }
function setBar(f, t, r) { const w = Math.max(0, Math.min(1, r)) * 100 + '%', a = $(f), b = $(t); if (a.style.width !== w) { a.style.width = w; b.style.width = w; } }
function updBossBar() { let b = null; for (const e of G.enemies) if (e.E.boss && !e.dead && (!b || e.max > b.max)) b = e; // 여러 보스면 가장 강한(챕터) 보스
  $('bossHud').classList.toggle('hidden', !b); if (!b) return; setBar('bossFill', 'bossTr', b.hp / b.max); const nm = $('bossName'); if (nm.textContent !== b.E.n) nm.textContent = b.E.n; }
function refreshHud() {
  $('gold').textContent = G.gold; $('wave').textContent = G.wave; setBar('coreBar', 'coreTr', G.coreHp / G.coreMax); if (G.coreHb) G.coreHb.set(G.coreHp / G.coreMax); $('coreTxt').textContent = `${Math.max(0, G.coreHp)}/${G.coreMax}`;
  refreshWavePrev(); $('enemyCnt').textContent = `적 ${G.enemies.filter(e => !e.dead).length + (G.spawnQ ? G.spawnQ.length : 0)}`;
  document.querySelectorAll('.up').forEach(b => { const k = b.dataset.up, c = upCost(k); const h = `<span class="row"><span>${UPS[k].n} Lv.${G.ups[k]}</span><small>${c}G</small></span><span class="desc">${UPS[k].d}</span>`; if (b._h !== h) { b._h = h; b.innerHTML = h; } const dis = G.gold < c; if (b.disabled !== dis) b.disabled = dis; }); // 바뀔 때만 다시 그림 (매 프레임 innerHTML 교체 → 클릭 씹힘 방지)
  document.querySelectorAll('.tool').forEach(b => { const T2 = TOWERS[b.dataset.tool]; if (T2) b.disabled = G.gold < T2.cost; if (b.dataset.tool === 'barricade') b.disabled = G.gold < 30; });
  const s = G.sel;
  if (s && s.kind === 'tower') { const D = TOWERS[s.type], L = s.lvl - 1; $('tName').textContent = `${D.n} Lv.${s.lvl}`;
    const S = s.S || {}, Bn = s.branch ? BRANCH[s.type][s.branch] : null; let gr = '';
    if (G.grow) { const st = s.stars || 1, k = st >= 3 ? 1 : (s.xp - XP_NEED[st - 1]) / (XP_NEED[st] - XP_NEED[st - 1]);
      gr = `<span class="tstar">${'★'.repeat(st)}<i>${'★'.repeat(3 - st)}</i></span> ${st >= 3 ? (Bn ? `<span class="tbr" style="color:${Bn.c}">${Bn.icon} ${Bn.n}</span>` : '<span class="tbr" style="color:#ffb03a">진화 대기</span>') : `XP ${Math.floor(s.xp)}/${XP_NEED[st]}`}<div class="txp"><b style="width:${Math.max(0, Math.min(1, k)) * 100}%"></b></div>`; }
    $('tStats').innerHTML = `${gr}${Bn ? Bn.d : D.d}<br>피해 ${r2(S.dmg)} · 초당 ${r2(S.rate)}회<br>사거리 ${r2(S.range)}${S.splash ? ` · 폭발 ${r2(S.splash)}` : ''}${S.chain ? ` · 연쇄 ${S.chain}` : ''}`;
    const ev = $('tEvo'), evOn = !!(G.grow && s.stars >= 3 && !s.branch); if (ev.classList.contains('hidden') === evOn) ev.classList.toggle('hidden', !evOn); if (evOn && ev.textContent !== '★ 진화 선택') ev.textContent = '★ 진화 선택';
    const u = $('tUp'); if (s.lvl < 3) { const c = D.up[L]; u.textContent = `강화 → Lv.${s.lvl + 1} (${c}G)`; u.disabled = G.gold < c; } else { u.textContent = '최대 레벨'; u.disabled = true; }
    const k = s.hp / s.max, rc = repairCost(s), rb = $('tRep'); $('tStats').innerHTML += `<br>내구도 ${Math.ceil(s.hp)}/${s.max}`;
    rb.style.display = ''; rb.textContent = rc ? `수리 (R) −${rc}G` : '수리 (내구도 최대)'; rb.disabled = !rc || G.gold < rc; rb.classList.toggle('warn', k < .5);
    $('tSell').textContent = `판매 (+${Math.floor(s.invest * .7 * (k >= .999 ? 1 : .5 + .5 * k))}G)`; }
  else if (s && s.kind === 'bar') { $('tName').textContent = '바리케이드'; $('tStats').innerHTML = `내구도 ${Math.ceil(s.hp)}/${Math.ceil(s.max)}<br>몬스터가 돌아가거나 부숴야 합니다`; $('tUp').textContent = '-'; $('tUp').disabled = true; $('tSell').textContent = '철거 (+15G)'; $('tRep').style.display = 'none'; $('tEvo').classList.add('hidden'); }
  if (hero) { const wb = $('warpBtn'); if (wb) { const wp = hero.warpCd > 0 ? hero.warpCd / WARP_CD * 100 : 0; $('warpCd').style.setProperty('--p', wp + '%'); $('warpCd').textContent = hero.warpCd > 0 ? Math.ceil(hero.warpCd) : ''; wb.classList.toggle('channel', hero.warpT > 0); }
    setBar('heroBar', 'heroTr', hero.hp / hero.max); const cdp = hero.skillCd > 0 ? hero.skillCd / stat.skillCd() * 100 : 0; $('skillCd').style.setProperty('--p', cdp + '%'); $('skillCd').textContent = hero.skillCd > 0 ? Math.ceil(hero.skillCd) : ''; $('skillBtn').classList.toggle('ready', hero.skillCd <= 0);
    const la = legendActive(), lb = $('legBtn'); lb.classList.toggle('hidden', !la); if (la) { $('legName').textContent = la.n; const lp = hero.lcd > 0 ? hero.lcd / legendCd() * 100 : 0; $('legCd').style.setProperty('--p', lp + '%'); lb.style.setProperty('--p', lp + '%'); $('legCd').textContent = hero.lcd > 0 ? Math.ceil(hero.lcd) : ''; lb.classList.toggle('ready', !(hero.lcd > 0)); } }
}

export { banner, showNote, setPhaseUI, updBossBar, refreshHud };
