// ================= 판 종료 통계 (📊 통계): 스테이지 클리어·하드(#stageClear) · 패배·도전(#over) · 던전 결과(파티원별) =================
// 결과 화면의 보상 UI 는 그대로 두고 '📊 통계' 버튼(+ C 키)으로 따로 여는 패널 #endStats. 수치 = data/endstats.js aggregate (combat/meter.js 기록 그대로)
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import { TOWERS } from '../data/towers.js';
import { BRANCH } from '../data/growth.js';
import { aggregate, TOWER_IC, fmtBig, fmtDps, fmtPct, fmtTime, fmtClock, waveLabel } from '../data/endstats.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const st = { open: false, kind: null };
// 지금 판의 미터 → aggregate 입력
export function collect() { const L = G.heroes && G.heroes.length ? G.heroes : G.hero ? [G.hero] : [];
  const heroes = L.map(h => ({ cls: h.cls, nm: (h.C && h.C.title) || heroLabel(h.cls), icon: (CLASSES[h.cls] || {}).icon || '', dm: h.dm, dead: h.dead > 0 }));
  const towers = (G.dmTowers || []).map(tw => { const B = tw.branch && BRANCH[tw.type] && BRANCH[tw.type][tw.branch], D = TOWERS[tw.type] || {};
    return { type: tw.type, stars: tw.stars || 1, branch: tw.branch || null, n: B ? `${D.n || tw.type} · ${B.n}` : (D.n || tw.type), icon: B ? B.icon : TOWER_IC[tw.type], dmT: tw.dmT, dmK: tw.dmK, gone: !!tw.dead || !(G.towers || []).includes(tw) }; });
  return { heroes, other: G.dmOther, towers, waves: G.waveLog || [], t: G.t, dungeon: !!G.dungeon }; }
export function snapEnd() { G.endStats = aggregate(collect()); return G.endStats; }

const bar = (k, cls = '') => `<i class="esB ${cls}"><b style="width:${Math.max(0, Math.min(1, k)) * 100}%"></b></i>`;
const cell = (n, v, x = '') => `<div class="esC"><span>${n}</span><b>${v}</b>${x}</div>`;
function heroCard(h, A) { return `<div class="esHero${h.dead ? ' down' : ''}" data-cls="${h.cls}"><div class="esHn">${h.icon} ${esc(h.nm)}${h.dead ? ' <em>💀</em>' : ''}<small>팀 피해 ${fmtPct(h.share)}</small></div>${bar(h.bar, 'tot')}
  <div class="esG">${cell('총 피해', fmtBig(h.tot))}${cell('평균 DPS', fmtDps(h.dps))}${cell('최고 한 방', fmtBig(h.max))}${cell('처치', fmtBig(h.kills))}${cell('받은 피해', fmtBig(h.taken))}${cell('스킬 비중', fmtPct(h.skPct), bar(h.skPct, 'sk'))}</div></div>`; }
export function renderEnd(A = G.endStats || snapEnd()) {
  const tw = A.towers.length ? A.towers.map(x => `<div class="esRow${x.gone ? ' gone' : ''}"><span class="esRn">${x.icon} ${esc(x.n)} <small>${'★'.repeat(Math.min(3, x.stars))}${x.gone ? ' · 철거' : ''}</small></span>${bar(x.bar, 'tw')}<b>${fmtBig(x.dmT)}</b><small class="esK">처치 ${x.dmK || 0}</small></div>`).join('') + (A.towersMore ? `<div class="esMore">외 ${A.towersMore}개 타워</div>` : '')
    : '<div class="esNone">피해를 준 타워 없음</div>';
  // 던전 (타워 없음): 타워 칸 대신 피해 비중 (파티원 + 합동 공격)
  const shares = [...A.heroes.map(h => [`${h.icon} ${esc(h.nm)}`, h.share, h.tot, h.dead]), ...(A.other.tot > 0 ? [[`⚡ ${A.other.label}`, A.team > 0 ? A.other.tot / A.team : 0, A.other.tot, false]] : [])];
  const shareHtml = shares.map(([n, k, v, d]) => `<div class="esRow share${d ? ' gone' : ''}"><span class="esRn">${n}</span>${bar(k, 'sh')}<b>${fmtPct(k)}</b><small class="esK">${fmtBig(v)}</small></div>`).join('');
  const wv = A.waves.length ? A.waves.map(w => `<div class="esW${A.fastest === w ? ' fast' : ''}${A.slowest === w && A.waves.length > 1 ? ' slow' : ''}${w.done ? '' : ' live'}" title="${esc(waveLabel(w.n))} ${fmtTime(w.sec)}"><span>${esc(waveLabel(w.n))}</span>${bar(w.bar, 'wv')}<b>${fmtClock(w.sec)}${w.done ? '' : '…'}</b></div>`).join('') : '<div class="esNone">웨이브 기록 없음</div>';
  return `<div class="esHd"><div class="gtitle">📊 전투 통계</div><div class="esSum">전투 시간 <b>${fmtTime(A.span)}</b> · 팀 총 피해 <b>${fmtBig(A.team)}</b>${A.other.tot > 0 ? ` · ${A.other.label} ${fmtBig(A.other.tot)} (${fmtPct(A.team > 0 ? A.other.tot / A.team : 0)})` : ''}</div></div>
    <div class="esSub">영웅별${A.heroes.length > 1 ? ` · 파티 ${A.heroes.length}명` : ''}</div><div class="esHeroes n${A.heroes.length}">${A.heroes.map(h => heroCard(h, A)).join('')}</div>
    <div class="esCols"><div>${A.dungeon && !A.towerCount ? `<div class="esSub">피해 비중</div><div class="esTw">${shareHtml}</div>` : `<div class="esSub">타워별 피해${A.towerCount ? ` · ${A.towerCount}개` : ''}</div><div class="esTw">${tw}</div>`}</div>
    <div><div class="esSub">웨이브별 클리어 시간${A.fastest ? ` <small>최단 ${esc(waveLabel(A.fastest.n))} ${fmtClock(A.fastest.sec)}${A.slowest && A.slowest !== A.fastest ? ` · 최장 ${esc(waveLabel(A.slowest.n))} ${fmtClock(A.slowest.sec)}` : ''}</small>` : ''}</div><div class="esWv">${wv}</div></div></div>`; }
function panel() { let p = $('endStats'); if (!p) { p = document.createElement('div'); p.id = 'endStats'; p.className = 'gpanel esPanel hidden'; p.setAttribute('role', 'dialog');
  p.innerHTML = '<button id="esClose" class="gbtn sm xbtn" title="닫기 (Esc)">✕</button><div id="esBody"></div><button id="esBack" class="gbtn">← 결과로</button>'; document.body.appendChild(p);
  $('esClose').onclick = $('esBack').onclick = () => { Snd.play('ui'); closeEnd(); }; } return p; }
export function openEnd() { if (!st.kind) return; const p = panel(); $('esBody').innerHTML = renderEnd(); p.classList.remove('hidden'); p.scrollTop = 0; st.open = true; }
export function closeEnd() { st.open = false; const p = $('endStats'); if (p) p.classList.add('hidden'); }
export function toggleEnd() { if (st.open) closeEnd(); else openEnd(); Snd.play('ui'); }
const btnHtml = id => `<button class="gbtn esBtn" id="${id}" title="전투 통계 (C)">📊 통계</button>`;
// 결과 화면이 뜰 때 (kind: 'clear' 스테이지·하드 · 'over' 패배·도전 · 'dungeon') — 미터 고정 + 버튼 달기
export function endShown(kind) { st.kind = kind; snapEnd(); if (G.statsUI && G.statsUI.isOpen()) G.statsUI.toggleOv();
  if (kind === 'over') { const b = $('overStats'); if (b) { b.classList.remove('hidden'); b.onclick = () => toggleEnd(); } return; }
  const box = $('stageClear') && $('stageClear').querySelector('.scBox'), town = box && box.querySelector('#scTown,#dgTown'); if (!box || $('scStats')) return;
  if (town) town.insertAdjacentHTML('beforebegin', btnHtml('scStats')); else box.insertAdjacentHTML('beforeend', btnHtml('scStats')); $('scStats').onclick = () => toggleEnd(); }
G.endStatsShow = endShown;
G.endStatsUI = { collect, snapEnd, renderEnd, open: openEnd, close: closeEnd, toggle: toggleEnd, isOpen: () => st.open, kind: () => st.kind };
