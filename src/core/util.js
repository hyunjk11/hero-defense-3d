
const $ = id => document.getElementById(id);
const QS = new URLSearchParams(location.search);
// 게임 로직 전용 난수 (?rng= 로 고정 가능 → 회귀 테스트 결정성). three.js/오디오의 Math.random과 분리
let rngState = (+QS.get('rng') || (Math.random() * 1e9 | 0)) >>> 0;
const rand = () => { rngState = rngState + 0x6D2B79F5 | 0; let t = Math.imul(rngState ^ rngState >>> 15, 1 | rngState); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = (a, b) => a + rand() * (b - a);
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// HTML 이스케이프 (null/undefined → '') · innerHTML 이 바뀔 때만 다시 씀 (깜빡임·포커스 유지)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setH = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };

export { $, QS, rand, rnd, mulberry32, esc, setH };
