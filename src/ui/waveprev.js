// 다음 웨이브 미리보기 (건설 단계에만): 몬스터 아이콘 + 이름 + 짧은 특성 + 예상 비율. 계산은 core/roster.js previewWave (게임 난수를 쓰지 않음)
// 자리: 오른쪽 '영웅 강화' 패널 아래 ~ 카메라 버튼 위. 공간이 좁으면(태블릿 가로 1024×600 등) 줄 수를 줄이고, 더 좁으면 아이콘 한 줄(compact), 그래도 안 되면 숨김
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { STAGE } from '../core/grid.js';
import { ETYPES } from '../data/monsters.js';
import { previewWave, monIcon, monTrait } from '../core/roster.js';
// NEW 표시 = 이번 레벨에 처음 열리는 종류 또는 아직 소개(waves.js markSeen: 설명이 있는 종류만 기록)되지 않은 종류
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function seen() { try { const a = JSON.parse(localStorage.getItem('hd3d_seenMon') || '[]'); return new Set(Array.isArray(a) ? a : []); } catch (e) { return new Set(); } }
let lastKey = '';
export function refreshWavePrev() {
  const el = $('wavePrev'); if (!el) return; const n = G.wave + 1, show = G.phase === 'build' && !(STAGE && n > STAGE.waves);
  if (!show) { el.classList.add('hidden'); lastKey = ''; return; }
  const ups = $('ups').getBoundingClientRect(), camT = $('cam').getBoundingClientRect().top, key = [n, innerWidth, innerHeight, Math.round(ups.bottom), Math.round(ups.width), Math.round(camT)].join('|');
  if (key === lastKey) return; lastKey = key; el.classList.remove('hidden'); const P = previewWave(STAGE, n, G.classic), sn = seen();
  const rows = []; if (P.boss) rows.push({ t: P.boss, boss: true, share: 0, fresh: !!ETYPES[P.boss].desc && !sn.has(P.boss) });
  for (const x of P.list) rows.push({ ...x, fresh: x.fresh || (!!ETYPES[x.t].desc && !sn.has(x.t)) });
  $('wpN').textContent = STAGE ? `${n}/${STAGE.waves}` : `${n}`;
  const row = r => `<div class="wpRow${r.boss ? ' boss' : ''}" data-t="${esc(r.t)}" title="${esc((ETYPES[r.t].n || '') + ' · ' + (r.boss ? '보스' : monTrait(r.t)) + (ETYPES[r.t].desc ? ' — ' + ETYPES[r.t].desc : ''))}"><i class="wpI">${monIcon(r.t)}</i><span class="wpNm"><span>${esc(ETYPES[r.t].n)}</span>${r.fresh ? '<em>NEW</em>' : ''}</span><small class="wpT">${esc(r.boss ? '보스' : monTrait(r.t).split(' · ')[0])}</small><small class="wpP">${r.boss ? '' : Math.max(1, Math.round(r.share * 100)) + '%'}</small></div>`;
  // 공간 계산: 영웅 강화 패널 아래 8px ~ 카메라 버튼 위 8px
  const top = Math.round(ups.bottom + 8), avail = camT - 8 - top;
  el.style.top = top + 'px'; el.style.width = Math.round(ups.width) + 'px'; el.classList.remove('compact');
  const ROW = 19, HEAD = 40, fit = Math.floor((avail - HEAD) / ROW);
  if (fit >= 2) { const k = rows.length > fit ? fit - 1 : rows.length; el.querySelector('.wpList').innerHTML = rows.slice(0, k).map(row).join('') + (rows.length > k ? `<div class="wpMore">외 ${rows.length - k}종</div>` : ''); }
  else if (avail >= 58) { el.classList.add('compact'); const k = Math.max(1, Math.floor((ups.width - 20) / 26)); el.querySelector('.wpList').innerHTML = rows.slice(0, k).map(r => `<i class="wpI${r.boss ? ' boss' : ''}" title="${esc(ETYPES[r.t].n + ' · ' + (r.boss ? '보스' : monTrait(r.t)))}">${monIcon(r.t)}</i>`).join(''); }
  else el.classList.add('hidden');
  el.style.maxHeight = Math.max(0, avail) + 'px';
}
addEventListener('resize', () => { lastKey = ''; refreshWavePrev(); });
G.wavePrev = () => { const P = previewWave(STAGE, G.wave + 1, G.classic); return P; };
