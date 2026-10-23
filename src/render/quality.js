// ================= 그래픽 품질 (자동 / 고품질 / 성능) =================
import { ls as Store } from '../core/store.js';
// 설정은 이 기기에만 저장(localStorage 'hd3d_gfx') — 기기마다 성능이 다르므로 클라우드 세이브에 넣지 않음.
// 성능 모드: ① 작은/먼 일반 몬스터 외곽선 끔 ② 그림자는 영웅·보스·타워만 (일반 몬스터 그림자 끔) ③ 픽셀 비율 상한 1.25 ④ 그림자 맵 1024
// 자동: 터치 기기(pointer: coarse)나 약한 기기(메모리·코어 ≤ 4)면 처음부터 성능, 아니면 고품질로 시작해 판 안에서 FPS가 계속 낮으면(4초 평균 < 36 이 두 번) 성능으로 전환하고 기억
// URL ?gfx=perf|high 로 강제 (테스트용). 자동화 브라우저(navigator.webdriver)에서는 FPS 자동 전환을 하지 않음 (swiftshader 는 항상 느려서 결과가 흔들림)
const LS = 'hd3d_gfx', LS_AUTO = 'hd3d_gfx_auto';
const ls = (k, v) => v === undefined ? Store.get(k) : v === null ? Store.del(k) : Store.set(k, v); // C-6 core/store.js
const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
// 약한 기기: 메모리 ≤ 4GB 또는 CPU 코어 ≤ 4 (자동화 브라우저는 제외 — 테스트 기기 사양에 따라 결과가 바뀌지 않게)
const NAV = typeof navigator !== 'undefined' ? navigator : {}, WEAK = !NAV.webdriver && ((NAV.deviceMemory && NAV.deviceMemory <= 4) || (NAV.hardwareConcurrency && NAV.hardwareConcurrency <= 4));
const MODES = ['auto', 'high', 'perf'], NAMES = { auto: '자동', high: '고품질', perf: '성능' };
const Q = { mode: 'auto', perf: false, why: '', listeners: [], fps: 0,
  OUTLINE_MIN_H: 2.4, // 성능 모드: 이보다 작은 일반 몬스터는 외곽선 없음
  OUTLINE_FAR: 1.0,   // 성능 모드: 카메라~몬스터 거리가 (카메라~주시점 거리 × 이 값)보다 멀면 외곽선 없음
};
function resolve() {
  const f = QS.get('gfx'); if (f === 'perf' || f === 'high') { Q.perf = f === 'perf'; Q.why = 'url'; return; }
  if (Q.mode !== 'auto') { Q.perf = Q.mode === 'perf'; Q.why = 'setting'; return; }
  if (COARSE) { Q.perf = true; Q.why = 'touch'; return; }
  if (WEAK) { Q.perf = true; Q.why = 'weak'; return; }
  if (ls(LS_AUTO) === 'perf') { Q.perf = true; Q.why = 'fps-saved'; return; }
  Q.perf = false; Q.why = 'auto';
}
{ const m = ls(LS); Q.mode = MODES.includes(m) ? m : 'auto'; resolve(); }
const emit = () => { for (const f of Q.listeners) try { f(Q.perf); } catch (e) { console.warn(e); } };
Q.onChange = f => Q.listeners.push(f);
Q.set = mode => { if (!MODES.includes(mode)) return; const was = Q.perf; Q.mode = mode; ls(LS, mode); if (mode !== 'auto') ls(LS_AUTO, null); resolve(); if (was !== Q.perf) emit(); };
Q.label = () => NAMES[Q.mode] + (Q.mode === 'auto' ? ` (${Q.perf ? '성능' : '고품질'})` : '');
Q.MODES = MODES; Q.NAMES = NAMES; Q.COARSE = COARSE;
Q.pixelRatio = (dpr = devicePixelRatio) => Math.min(dpr, Q.perf ? 1.25 : COARSE ? 1.5 : 1.75);
Q.shadowSize = () => Q.perf ? 1024 : 2048;
// FPS 감시: 판 안(active=true)에서만, 탭이 보일 때만. raw = 실제 프레임 간격(초)
let acc = 0, frames = 0, low = 0;
const AUTO_FPS = QS.has('gfxauto') || (!(typeof navigator !== 'undefined' && navigator.webdriver) && !QS.get('gfx')); // ?gfxauto: 테스트에서 자동 전환 검사
Q.tick = (raw, active) => {
  if (!active || raw > .5 || (typeof document !== 'undefined' && document.hidden)) { acc = 0; frames = 0; return; } // 탭 전환·로딩 멈춤은 측정에서 제외
  acc += raw; frames++; if (acc < 4) return; Q.fps = frames / acc; acc = 0; frames = 0;
  if (!AUTO_FPS || Q.mode !== 'auto' || Q.perf) return;
  low = Q.fps < 36 ? low + 1 : 0;
  if (low >= 2) { Q.perf = true; Q.why = 'fps'; ls(LS_AUTO, 'perf'); emit(); }
};
export { Q };
