// 강철 사용처 (2026-10-24, docs/STEEL_2026-10-24.md) — 순수 로직 (DOM·네트워크 없음 → node 테스트 가능)
// ⚖ 교환: 강철 → 영혼석 (손해 보는 비율 · 하루 상한, 한국 시간 0시 초기화) · 🧱 바리케이드 보강: 강철만 쓰는 영구 연구
// 저장: save.xch = { d: 'YYYY-MM-DD'(KST), n: 그날 교환 횟수 } · save.barLv = 0..BAR.max — 둘 다 안 쓰면 키 없음 (옛 세이브 모양 그대로)
export const XCH = { steel: 10, souls: 30, daily: 15 }; // 1회 = 강철 10 → 영혼석 30, 하루 15회 (강철 150 → 영혼석 450)
export const BAR = { max: 10, per: .05, base: 40, step: 20 }; // Lv당 체력 +5% · 비용 강철 40 + 20×Lv
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number.isFinite(+v) ? +v : 0)));
// 한국 시간(UTC+9, 서머타임 없음) 날짜 — 기기 시간대와 무관
export const kstDay = (now = Date.now()) => new Date(+now + 9 * 36e5).toISOString().slice(0, 10);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const xchUsed = (save, now = Date.now()) => { const x = save && save.xch; return x && x.d === kstDay(now) ? int(x.n, 0, XCH.daily) : 0; };
export const xchLeft = (save, now) => XCH.daily - xchUsed(save, now);
// 지금 교환할 수 있는 최대 횟수 (상한·강철 둘 다)
export const xchMax = (save, now) => Math.max(0, Math.min(xchLeft(save, now), Math.floor(((save.mat || {}).steel || 0) / XCH.steel)));
// 교환 n회. 반환 [save, 'ok'|'cap'|'poor'|'none', { steel, souls, n }] — 저장은 호출하는 쪽에서
export function exchange(save, n = 1, now = Date.now()) {
  n = Math.floor(+n); if (!(n >= 1)) return [save, 'none', null]; const left = xchLeft(save, now); if (left <= 0 || n > left) return [save, 'cap', null];
  const steel = n * XCH.steel; if ((save.mat.steel || 0) < steel) return [save, 'poor', null];
  const souls = n * XCH.souls; save.mat.steel -= steel; save.souls = (save.souls || 0) + souls; save.xch = { d: kstDay(now), n: xchUsed(save, now) + n };
  return [save, 'ok', { steel, souls, n }];
}
// 바리케이드 보강
export const barLv = save => int(save && save.barLv, 0, BAR.max);
export const barCost = lv => BAR.base + BAR.step * lv;
export const barMul = lv => 1 + BAR.per * int(lv, 0, BAR.max); // 판 시작 시 G.barRes
export const barBlock = save => barLv(save) >= BAR.max ? '최대' : ((save.mat || {}).steel || 0) < barCost(barLv(save)) ? '강철 부족' : null;
export function buyBar(save) { if (barBlock(save)) return [save, false]; const lv = barLv(save); save.mat.steel -= barCost(lv); save.barLv = lv + 1; return [save, true]; }
// 정리 / 병합 (progress.clean·merge 에서 호출)
export function cleanSteel(d, e) {
  const x = d && d.xch; if (x && typeof x === 'object' && typeof x.d === 'string' && DAY_RE.test(x.d)) { const n = int(x.n, 0, XCH.daily); if (n) e.xch = { d: x.d, n }; }
  const b = int(d && d.barLv, 0, BAR.max); if (b) e.barLv = b; return e;
}
export function mergeSteel(a, b, m) { // 교환 기록: 같은 날이면 큰 n, 다른 날이면 늦은 날 · 바리케이드 큰 값
  const x = a.xch, y = b.xch, z = !x ? y : !y ? x : x.d === y.d ? { d: x.d, n: Math.max(x.n, y.n) } : x.d > y.d ? x : y; delete m.xch; if (z) m.xch = { ...z };
  const lv = Math.max(barLv(a), barLv(b)); delete m.barLv; if (lv) m.barLv = lv; return m;
}
