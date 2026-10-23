// ×2 배속 · 일시정지 (판 안: 건설/전투 단계). 배속 = 한 프레임에 같은 길이의 시뮬레이션 스텝을 G.speed 번 (main.js loop) → 물리·AI 간격은 그대로라 결과가 안정적
// 일시정지 = 시뮬레이션 정지 + 화면 전체를 덮는 오버레이로 게임 입력 차단 (키보드는 input.js 가 G.paused 면 무시). P 키 = 일시정지, F 키 = 배속
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { Snd } from '../audio/audio.js';
G.speed = 1; G.paused = false;
const inRun = () => G.phase === 'build' || G.phase === 'wave';
function sync() {
  const sb = $('speedBtn'), pb = $('pauseBtn'), ov = $('pauseOv'); if (!sb) return;
  sb.textContent = '×' + G.speed; sb.classList.toggle('on', G.speed > 1); sb.setAttribute('aria-pressed', G.speed > 1);
  pb.classList.toggle('on', G.paused); ov.classList.toggle('hidden', !G.paused);
}
export function setPaused(on) { on = !!on && inRun(); if (G.paused === on) return sync(); G.paused = on; Snd.play('ui'); sync(); }
// Q-5 (2026-10-23): 설정 '배속 유지' (localStorage hd3d_keepSpeed='1') 켜면 마지막으로 고른 배속(hd3d_speed)으로 다음 판 시작. 기본 off = 예전처럼 판마다 ×1
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
export const keepSpeed = () => LS('hd3d_keepSpeed') === '1';
export function setSpeed(v) { G.speed = v === 2 ? 2 : 1; Snd.play('ui'); sync(); if (keepSpeed()) LS('hd3d_speed', String(G.speed)); }
export const togglePause = () => setPaused(!G.paused), toggleSpeed = () => setSpeed(G.speed === 2 ? 1 : 2);
$('pauseBtn').onclick = e => { e.stopPropagation(); togglePause(); };
$('speedBtn').onclick = e => { e.stopPropagation(); if (!G.paused) toggleSpeed(); };
$('pauseGo').onclick = e => { e.stopPropagation(); setPaused(false); };
addEventListener('keydown', e => { if (e.repeat || e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; const k = e.key.toLowerCase();
  if (k === 'p' && inRun()) togglePause(); else if (k === 'f' && inRun() && !G.paused) toggleSpeed(); });
// 판 밖(결과 'over'·영웅 선택·마을·메뉴)이면 일시정지 해제 + 배속 ×1 로 → 다음 판(스테이지 출정은 새로고침, 마을 '도전'은 같은 페이지)은 항상 ×1 로 시작. 판 안에서는 웨이브가 바뀌어도 유지
let wasRun = false;
setInterval(() => { const r = inRun(); if (!r && (G.paused || G.speed !== 1)) { G.paused = false; G.speed = 1; sync(); }
  if (r && !wasRun && keepSpeed() && LS('hd3d_speed') === '2' && G.speed !== 2) { G.speed = 2; sync(); } wasRun = r; }, 300); // 판 시작 때 기억한 배속
// 태블릿: 앱 전환·화면 끔(탭 숨김) 때 판 중이면 자동 일시정지 (돌아오면 오버레이에서 계속하기)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && inRun() && !G.manual) setPaused(true); });
{ const kb = $('stKeepSpd'); if (kb) { kb.checked = keepSpeed(); kb.addEventListener('change', () => { LS('hd3d_keepSpeed', kb.checked ? '1' : '0'); if (kb.checked) LS('hd3d_speed', String(G.speed)); }); } }
G.setPaused = setPaused; G.setSpeed = setSpeed; sync();
