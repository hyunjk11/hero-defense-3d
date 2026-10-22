// 파티 로직 단위 테스트: 가장 가까운 살아있는 영웅 타겟팅 · 반경 · 전멸 판정
import assert from 'node:assert/strict';
import { nearestHero, heroesWithin, livingHeroes, partyWiped } from '../src/core/party.js';
const H = (n, x, z, dead = 0) => ({ n, dead, g: { position: { x, z } } });
let ok = 0; const t = (name, fn) => { fn(); ok++; console.log('OK', name); };
t('단일 영웅 = 그 영웅', () => { const a = H('a', 5, 5); assert.equal(nearestHero([a], 0, 0), a); });
t('단일 영웅 사망 = null', () => assert.equal(nearestHero([H('a', 1, 1, 3)], 0, 0), null));
t('가장 가까운 영웅', () => { const a = H('a', 10, 0), b = H('b', 2, 1), c = H('c', -5, 0); assert.equal(nearestHero([a, b, c], 0, 0), b); assert.equal(nearestHero([a, b, c], 9, 0), a); assert.equal(nearestHero([a, b, c], -4, 0), c); });
t('죽은 영웅은 건너뜀', () => { const a = H('a', 10, 0), b = H('b', 1, 0, 2); assert.equal(nearestHero([a, b], 0, 0), a); });
t('maxD 밖이면 null', () => { const a = H('a', 10, 0); assert.equal(nearestHero([a], 0, 0, 5), null); assert.equal(nearestHero([a], 0, 0, 10), a); });
t('동거리면 앞쪽(조작 영웅) 우선', () => { const a = H('a', 3, 0), b = H('b', -3, 0); assert.equal(nearestHero([a, b], 0, 0), a); assert.equal(nearestHero([b, a], 0, 0), b); });
t('빈/없는 목록', () => { assert.equal(nearestHero([], 0, 0), null); assert.equal(nearestHero(undefined, 0, 0), null); assert.equal(nearestHero([null], 0, 0), null); });
t('반경 안 영웅들', () => { const a = H('a', 1, 0), b = H('b', 3, 0), c = H('c', 2, 0, 1); assert.deepEqual(heroesWithin([a, b, c], 0, 0, 2.5).map(h => h.n), ['a']); assert.deepEqual(heroesWithin([a, b, c], 0, 0, 3).map(h => h.n), ['a', 'b']); });
t('전멸 판정', () => { assert.equal(partyWiped([H('a', 0, 0, 1), H('b', 0, 0, 2)]), true); assert.equal(partyWiped([H('a', 0, 0, 1), H('b', 0, 0)]), false); assert.equal(partyWiped([]), false); assert.equal(livingHeroes([H('a', 0, 0, 1), H('b', 0, 0)]).length, 1); });
console.log(`party: ${ok} ok`);
