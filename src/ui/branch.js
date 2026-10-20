// ★★★ 타워 진화(분기) 선택 팝업 — 터치 친화(큰 카드 2개). 게임은 멈추지 않음, '나중에'로 닫으면 타워 정보 창에서 다시 열 수 있음
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { TOWERS } from '../data/towers.js';
import { BRANCH, towerStats } from '../data/growth.js';
import { chooseBranch } from '../world/growth.js';
import { refreshHud } from './hud.js';
let cur = null; const queue = [];
const f1 = v => Math.round(v * 10) / 10;
function statLine(tw, key) { const a = tw.S, b = towerStats(tw.type, tw.lvl, 3, key, tw.mods), B = BRANCH[tw.type][key], parts = [];
  const cmp = (n, x, y, u = '') => { if (Math.abs(x - y) > 1e-6) parts.push(`${n} ${f1(x)}${u}→<b>${f1(y)}${u}</b>`); };
  cmp('피해', a.dmg, b.dmg); cmp('초당', a.rate, b.rate, '회'); cmp('사거리', a.range, b.range); if (a.splash) cmp('폭발', a.splash, b.splash); if (a.chain) { cmp('연쇄', a.chain, b.chain); cmp('둔화', a.slow * 100, b.slow * 100, '%'); }
  if (B.targets) parts.push(`동시 대상 <b>${B.targets}</b>`); if (B.cluster) parts.push(`집속탄 <b>${B.cluster}</b>발`); if (B.pierce) parts.push('<b>관통</b>'); if (B.freezeEvery) parts.push(`${B.freezeEvery}타마다 <b>빙결</b>`);
  return parts.join(' · '); }
export function openBranch(tw) {
  if (!tw || tw.dead || tw.branch || tw.stars < 3) return false; cur = tw; const D = TOWERS[tw.type], el = $('branchPop');
  el.innerHTML = `<div class="bpBox"><h3>★★★ ${D.n} 진화</h3><div class="bpSub">두 갈래 중 하나를 고르세요 (이번 판 동안 유지)</div><div class="bpRow">${Object.entries(BRANCH[tw.type]).map(([k, B]) =>
    `<button class="bpCard" data-k="${k}" style="--c:${B.c}"><span class="bpIcon">${B.icon}</span><span class="bpN">${B.n}</span><span class="bpD">${B.d}</span><span class="bpS">${statLine(tw, k)}</span></button>`).join('')}</div>
    <button class="gbtn bpLater" id="bpLater">나중에 (타워를 눌러 선택)</button></div>`;
  el.querySelectorAll('.bpCard').forEach(b => b.onclick = e => { e.stopPropagation(); pick(b.dataset.k); });
  $('bpLater').onclick = e => { e.stopPropagation(); Snd.play('ui'); closeBranch(); }; el.classList.remove('hidden'); Snd.play('select'); return true;
}
export function pick(k) { const tw = cur; closeBranch(true); if (chooseBranch(tw, k)) { if (G.sel === tw) refreshHud(); next(); return true; } Snd.play('error'); return false; }
export function closeBranch(silent) { cur = null; $('branchPop').classList.add('hidden'); if (!silent) next(); }
function next() { while (queue.length) { const tw = queue.shift(); if (!tw.dead && !tw.branch) { setTimeout(() => openBranch(tw), 250); return; } } }
G.onBranchReady = tw => { if (G.phase === 'over') return; if (cur) { if (!queue.includes(tw)) queue.push(tw); } else setTimeout(() => { if (!cur && !tw.branch && !tw.dead && G.phase !== 'over') openBranch(tw); else if (cur && cur !== tw && !queue.includes(tw)) queue.push(tw); }, 900); };
G.openBranch = openBranch; G.pickBranch = pick;
$('tEvo').onclick = () => { if (G.sel && G.sel.kind === 'tower') openBranch(G.sel); };
