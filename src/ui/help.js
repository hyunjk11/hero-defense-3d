// ================= 단축키 안내 (Q-3, 2026-10-23) =================
// H 또는 ? = 열기/닫기 · Esc·바깥 클릭 = 닫기 (ui/keys.js 층 46). 지금 화면(전투·마을·던전) 칸을 맨 앞에 강조
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { escLayer, typing } from './keys.js';
export const HELP = [
  { id: 'battle', t: '⚔ 전투', k: [['1~5', '도구 (화살탑·대포탑·마법탑 · 바리케이드 · 개간)'], ['Q', '영웅 스킬'], ['E', '전설 스킬'], ['T', '워프'], ['R', '수리 (선택한 타워, 없으면 전체)'], ['Space', '웨이브 시작'], ['P', '일시정지'], ['F', '×2 배속'], ['C', '전투 통계'], ['M', '소리 켜기/끄기'], ['Esc', '이동/선택 · 맨 위 창 닫기'], ['WASD', '영웅 이동'], ['우클릭 드래그 · 휠', '카메라 회전 · 확대']] },
  { id: 'town', t: '🏠 마을', k: [['WASD', '이동 (건물 앞에서 클릭 = 열기)'], ['I', '가방'], ['C', '능력치'], ['Esc', '맨 위 창 닫기']] },
  { id: 'dungeon', t: '🕳 던전', k: [['1~4', '영웅 선택'], ['Space', '합동 공격'], ['1~3', '축복 카드 고르기 (축복 화면)'], ['P · F', '일시정지 · 배속']] },
];
const where = () => G.dungeon ? 'dungeon' : G.screen === 'town' ? 'town' : 'battle';
let el = null;
export const helpOpen = () => !!el && !el.classList.contains('hidden');
export function openHelp() {
  if (!el) { el = document.createElement('div'); el.id = 'keyHelp'; el.className = 'hidden'; el.onclick = e => { if (e.target === el) closeHelp(); }; document.body.appendChild(el); }
  const w = where(), secs = [...HELP].sort((a, b) => (b.id === w) - (a.id === w));
  el.innerHTML = `<div class="khBox gpanel" role="dialog" aria-label="단축키 안내"><div class="khHead"><b>⌨ 단축키 안내</b><button class="xbtn ui-x" id="khClose" aria-label="닫기">✕</button></div><div class="khCols">${secs.map(s => `<section class="khSec ${s.id === w ? 'now' : ''}" data-s="${s.id}"><h3>${s.t}${s.id === w ? ' <small>지금 화면</small>' : ''}</h3>${s.k.map(([k, d]) => `<div class="khRow"><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</section>`).join('')}</div><div class="khFoot">H 또는 ? 로 열고 닫기</div></div>`;
  $('khClose').onclick = () => closeHelp(); el.classList.remove('hidden');
}
export function closeHelp() { if (el) el.classList.add('hidden'); }
export const toggleHelp = () => helpOpen() ? closeHelp() : openHelp();
escLayer('help', 46, helpOpen, closeHelp);
addEventListener('keydown', e => { if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'h' || e.key === 'H' || e.key === '?') { if (G.screen === 'intro' || G.screen === 'login') return; e.preventDefault(); toggleHelp(); } });
G.help = { openHelp, closeHelp, helpOpen, HELP };
