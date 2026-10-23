// ================= Esc · 단축키 중앙 처리 (Q-2) =================
// Esc = 열린 층 중 **맨 위 하나만** 닫음. 층: 확인창(100) > 연출(90) > 결과 통계(70) > 전직 확인(60) > 관리자(50) > 큰 패널(40~45) > 전투 오버레이(15)
// 열린 층이 없으면 Esc 는 그대로 아래 리스너로 감 (전투 도구 → 이동 · ui/input.js). 캡처 단계라 다른 keydown 리스너보다 먼저 실행
// 입력칸에 포커스가 있으면 첫 Esc 는 입력칸에서 빠져나오기만 함 (패널은 그대로)
const layers = [];
export const typing = e => { const t = (e && e.target && e.target.tagName) ? e.target : document.activeElement; return !!t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName); };
// escLayer('이름', z, isOpen(), close()) — 같은 이름은 덮어씀
export function escLayer(name, z, isOpen, close) { const i = layers.findIndex(l => l.name === name); const L = { name, z, isOpen, close }; if (i >= 0) layers[i] = L; else layers.push(L); }
export const openLayers = () => layers.filter(l => { try { return l.isOpen(); } catch { return false; } }).sort((a, b) => b.z - a.z).map(l => l.name);
export function escTop() { const top = layers.filter(l => { try { return l.isOpen(); } catch { return false; } }).sort((a, b) => b.z - a.z)[0]; if (!top) return null; top.close(); return top.name; }
if (typeof addEventListener !== 'undefined') addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !openLayers().length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (typing(e) && document.activeElement && document.activeElement.blur) { document.activeElement.blur(); return; }
  escTop();
}, { capture: true });
