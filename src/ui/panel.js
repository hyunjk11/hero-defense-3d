// ================= 공용 패널 열기/닫기 (C-8, 2026-10-23) =================
// definePanel('이름', { el|id, z, isOpen, close }) — 큰 패널 하나를 등록:
//  · Esc 층(ui/keys.js escLayer) 자동 등록 — 맨 위 하나만 닫힘
//  · show()/hide() 는 .hidden 클래스만 바꿈 (id·클래스 이름 그대로 — 테스트 호환)
//  · hide() 때 포커스가 패널 안에 있으면 풀어 줌 (숨은 버튼이 Space/Enter 를 받지 않게)
//  · openPanels() / closePanels(except) — 다른 큰 패널 닫기(closeOthers)를 한 곳에서
// 각 모듈의 열기/닫기 함수(소리·상태·렌더)는 그대로 두고, 표시/층 관리만 맡음 → 동작 불변
import { escLayer } from './keys.js';
const reg = new Map();
const elOf = p => p.el || (typeof document !== 'undefined' ? document.getElementById(p.id) : null);
export function definePanel(name, opt = {}) {
  const p = { name, z: 40, ...opt };
  const shown = () => { const e = elOf(p); return !!e && !e.classList.contains('hidden'); };
  const api = {
    name,
    el: () => elOf(p),
    isOpen: () => { try { return p.isOpen ? !!p.isOpen() : shown(); } catch { return false; } },
    show() { const e = elOf(p); if (e) e.classList.remove('hidden'); },
    hide() {
      const e = elOf(p); if (!e) return; e.classList.add('hidden');
      const a = typeof document !== 'undefined' ? document.activeElement : null;
      if (a && a !== document.body && e.contains(a) && a.blur) a.blur();
    },
    close: (...a) => (p.close ? p.close(...a) : api.hide()),
  };
  reg.set(name, api);
  escLayer(name, p.z, api.isOpen, () => api.close());
  return api;
}
export const panel = name => reg.get(name) || null;
export const openPanels = () => [...reg.values()].filter(p => p.isOpen()).map(p => p.name);
// except 를 뺀 열린 패널을 조용히 닫음 (close(true) = silent 관례)
export function closePanels(except, silent = true) { const done = []; for (const p of reg.values()) if (p.name !== except && p.isOpen()) { p.close(silent); done.push(p.name); } return done; }
