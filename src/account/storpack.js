// 📦 창고 장비 압축 (2026-10-24) — import 없음 (equip.js·storage.js 공용, 순환 방지)
// 서버 저장 hd3d_progress.data 의 check (pg_column_size(data) < 65536) 는 압축 전 jsonb 크기로 검사됨 → 장비 객체 1개 ≈ 290바이트.
// 서버로 보낼 때만 창고 장비를 짧은 JSON 문자열로: 일반 [id, s, g, e, m0, m1, sub, n, h, c, u] (≈ 90바이트) · 고유 [uq, e, a] (나머지는 표에서 재구성).
// 읽을 때(unpackItem)는 문자열·객체 둘 다 받음 → 정리는 equip.cleanItem 이 그대로 검증 (모양이 틀리면 버림).
export function packItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.uq) return JSON.stringify([it.uq, it.e || 0, it.a || 0]);
  return JSON.stringify([it.id, it.s, it.g, it.e || 0, it.m && it.m[0], it.m && it.m[1], it.sub || [], it.n, it.h || 0, it.c || 0, it.u || 0]);
}
export function unpackItem(x) {
  if (x && typeof x === 'object') return x; if (typeof x !== 'string' || x.length > 400) return null;
  let a; try { a = JSON.parse(x); } catch (e) { return null; } if (!Array.isArray(a)) return null;
  if (a.length === 3 && typeof a[0] === 'string') return { id: 'u_' + a[0], uq: a[0], e: a[1], a: a[2] };
  if (a.length !== 11) return null; const it = { id: a[0], s: a[1], g: a[2], e: a[3], m: [a[4], a[5]], sub: a[6], n: a[7] };
  if (a[8]) it.h = a[8]; if (a[9]) it.c = a[9]; if (a[10]) it.u = a[10]; return it;
}
