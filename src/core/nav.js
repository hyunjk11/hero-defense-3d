// ================= 페이지 전환 (URL 쿼리 바꾼 뒤 location.replace 새로고침) =================
// 모드 키 목록은 여기 한 곳에서 관리 → 새 모드 파라미터를 추가할 때 이 목록만 고치면 됨. 그 밖의 키(rng·seed·sb 등)는 유지
// go({town:1}) 마을 · go({stage:id, hard}) 스테이지 출정 · go({dungeon:1}) 던전 원정
export const MODE_KEYS = ['town', 'stage', 'run', 'hard', 'dungeon'];
export function navQuery(search, to = {}) {
  const q = new URLSearchParams(search); MODE_KEYS.forEach(k => q.delete(k));
  if (to.town) q.set('town', '1');
  else if (to.dungeon) { q.set('dungeon', '1'); q.set('run', '1'); }
  else if (to.stage != null) { q.set('stage', to.stage); q.set('run', '1'); if (to.hard) q.set('hard', '1'); }
  return q.toString();
}
export function go(to, delay = 500) { const s = navQuery(location.search, to); setTimeout(() => location.replace(location.pathname + '?' + s), delay); }
