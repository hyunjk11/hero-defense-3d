// ================= 파티(다중 영웅) 공용 로직 — 순수 함수 (three.js·DOM 없음 → node 단위 테스트 가능) =================
// 영웅 객체는 { dead, g: { position: { x, z } } } 형태만 있으면 됨. 일반 스테이지·하드·도전 모드는 파티 길이 1 → 기존과 같은 결과.
export const alive = h => !!h && h.dead <= 0;
export const livingHeroes = L => (L || []).filter(alive);
// (x, z) 에서 가장 가까운 살아있는 영웅 (maxD 이내만, 없으면 null). 거리가 같으면 배열 앞쪽(조작 영웅이 먼저) 우선
export function nearestHero(L, x, z, maxD = Infinity) {
  let best = null, bd = maxD * maxD;
  for (const h of L || []) { if (!alive(h)) continue; const dx = h.g.position.x - x, dz = h.g.position.z - z, d = dx * dx + dz * dz; if (d < bd || (best === null && d <= bd)) { bd = d; best = h; } }
  return best;
}
// 반경 r 안의 살아있는 영웅 전부 (광역 피해: 폭탄·운석·공포)
export function heroesWithin(L, x, z, r) { return livingHeroes(L).filter(h => Math.hypot(h.g.position.x - x, h.g.position.z - z) <= r); }
export const partyWiped = L => (L || []).length > 0 && !(L || []).some(alive);
