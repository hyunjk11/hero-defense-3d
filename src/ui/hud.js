import { $ } from '../core/util.js';
import { UPS } from '../data/heroes.js';
import { TOWERS } from '../data/towers.js';
import { repairCost } from '../world/towers.js';
import { G } from '../core/state.js';
import { hero, stat } from '../heroes/hero.js';
import { upCost } from './input.js';

function banner(text, color = '#fff', ms = 1600) { const b = $('banner'); b.textContent = text; b.style.color = color; b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), ms); }
function showNote(list, ms = 7000) { const n = $('note'); n.innerHTML = list.map(o => `<div class="nc"><b>신규: ${o.name}</b>${o.desc}</div>`).join(''); n.classList.remove('hidden'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.add('hidden'), ms); }
function setPhaseUI() { const ph = $('phase'); ph.textContent = G.phase === 'wave' ? '전투 중 (밤)' : '건설 단계 (낮)'; ph.classList.toggle('night', G.phase === 'wave'); $('startWave').disabled = G.phase !== 'build'; }
function setBar(f, t, r) { const w = Math.max(0, Math.min(1, r)) * 100 + '%', a = $(f), b = $(t); if (a.style.width !== w) { a.style.width = w; b.style.width = w; } }
function updBossBar() { const b = G.enemies.find(e => e.E.boss && !e.dead); $('bossHud').classList.toggle('hidden', !b); if (b) setBar('bossFill', 'bossTr', b.hp / b.max); }
function refreshHud() {
  $('gold').textContent = G.gold; $('wave').textContent = G.wave; setBar('coreBar', 'coreTr', G.coreHp / G.coreMax); if (G.coreHb) G.coreHb.set(G.coreHp / G.coreMax); $('coreTxt').textContent = `${Math.max(0, G.coreHp)}/${G.coreMax}`;
  $('enemyCnt').textContent = `적 ${G.enemies.filter(e => !e.dead).length + (G.spawnQ ? G.spawnQ.length : 0)}`;
  document.querySelectorAll('.up').forEach(b => { const k = b.dataset.up, c = upCost(k); b.innerHTML = `<span class="row"><span>${UPS[k].n} Lv.${G.ups[k]}</span><small>${c}G</small></span><span class="desc">${UPS[k].d}</span>`; b.disabled = G.gold < c; });
  document.querySelectorAll('.tool').forEach(b => { const T2 = TOWERS[b.dataset.tool]; if (T2) b.disabled = G.gold < T2.cost; if (b.dataset.tool === 'barricade') b.disabled = G.gold < 30; });
  const s = G.sel;
  if (s && s.kind === 'tower') { const D = TOWERS[s.type], L = s.lvl - 1; $('tName').textContent = `${D.n} Lv.${s.lvl}`;
    $('tStats').innerHTML = `${D.d}<br>피해 ${D.dmg[L]} · 초당 ${D.rate[L]}회<br>사거리 ${D.range[L]}${D.splash ? ` · 폭발 ${D.splash[L]}` : ''}${D.chain ? ` · 연쇄 ${D.chain[L]}` : ''}`;
    const u = $('tUp'); if (s.lvl < 3) { const c = D.up[L]; u.textContent = `강화 → Lv.${s.lvl + 1} (${c}G)`; u.disabled = G.gold < c; } else { u.textContent = '최대 레벨'; u.disabled = true; }
    const k = s.hp / s.max, rc = repairCost(s), rb = $('tRep'); $('tStats').innerHTML += `<br>내구도 ${Math.ceil(s.hp)}/${s.max}`;
    rb.style.display = ''; rb.textContent = rc ? `수리 (R) −${rc}G` : '수리 (내구도 최대)'; rb.disabled = !rc || G.gold < rc; rb.classList.toggle('warn', k < .5);
    $('tSell').textContent = `판매 (+${Math.floor(s.invest * .7 * (k >= .999 ? 1 : .5 + .5 * k))}G)`; }
  else if (s && s.kind === 'bar') { $('tName').textContent = '바리케이드'; $('tStats').innerHTML = `내구도 ${Math.ceil(s.hp)}/${Math.ceil(s.max)}<br>몬스터가 돌아가거나 부숴야 합니다`; $('tUp').textContent = '-'; $('tUp').disabled = true; $('tSell').textContent = '철거 (+15G)'; $('tRep').style.display = 'none'; }
  if (hero) { setBar('heroBar', 'heroTr', hero.hp / hero.max); const cdp = hero.skillCd > 0 ? hero.skillCd / stat.skillCd() * 100 : 0; $('skillCd').style.setProperty('--p', cdp + '%'); $('skillCd').textContent = hero.skillCd > 0 ? Math.ceil(hero.skillCd) : ''; $('skillBtn').classList.toggle('ready', hero.skillCd <= 0); }
}

export { banner, showNote, setPhaseUI, updBossBar, refreshHud };
