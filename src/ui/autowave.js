// Q-13 (2026-10-24): 설정 '다음 웨이브 자동 시작' (localStorage hd3d_autoWave='1', 기본 off) — 웨이브가 끝나 건설 단계가 되면 AUTO_WAVE_S 초 뒤 자동으로 다음 웨이브.
// 첫 웨이브는 늘 직접 시작 (처음 건설 시간 보장) · 던전 원정·일시정지 중에는 안 셈 (시뮬레이션 시간 G.t 기준 → 일시정지·×2 배속 그대로 따름)
// #startWave 에 남은 초 표시 (data-auto → CSS ::after). 메뉴 설정 #stAutoWave ↔ 전투 설정 #sndAutoWave 같은 값
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { startWave } from '../core/waves.js';
export const AUTO_WAVE_S = 15;
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
export const autoWaveOn = () => LS('hd3d_autoWave') === '1';
let shown = '';
function show(v) { if (v === shown) return; shown = v; const b = $('startWave'); if (!b) return; if (v) b.dataset.auto = v; else delete b.dataset.auto; }
export function updAutoWave() {
  if (G.phase !== 'build' || G.dungeon || !(G.wave > 0) || !autoWaveOn()) { G.autoWaveAt = 0; show(''); return; }
  if (!G.autoWaveAt) G.autoWaveAt = G.t + AUTO_WAVE_S;
  const left = G.autoWaveAt - G.t; if (left <= 0) { G.autoWaveAt = 0; show(''); startWave(); return; }
  show(String(Math.ceil(left)));
}
{ const cbs = ['stAutoWave', 'sndAutoWave'].map(id => $(id)).filter(Boolean); cbs.forEach(cb => { cb.checked = autoWaveOn(); cb.addEventListener('change', () => { LS('hd3d_autoWave', cb.checked ? '1' : '0'); G.autoWaveAt = 0; cbs.forEach(o => { o.checked = cb.checked; }); }); }); }
