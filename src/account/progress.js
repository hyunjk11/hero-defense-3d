// 저장 데이터(한 개의 순수 객체) 정리/병합/보상 계산. DOM·네트워크 없음 (node 테스트 가능).
// save = { v, hero, souls, bestWave, heroLv{cls:{hp,atk}}, stats{runs,kills,waves,souls}, settings{audio{}}, nick }
export const HEROES = ['archer', 'mage', 'warrior'];
export const PERM = { hp: { n: '체력 단련', d: '최대 체력 +6%', max: 10, base: 30 }, atk: { n: '무기 숙련', d: '공격력 +5%', max: 10, base: 40 } };
export const STATS = ['runs', 'kills', 'waves', 'souls'];
const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const int = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Math.floor(num(v))));
export function empty() { return { v: 1, hero: 'mage', souls: 0, bestWave: 0, heroLv: Object.fromEntries(HEROES.map(h => [h, { hp: 0, atk: 0 }])), stats: Object.fromEntries(STATS.map(k => [k, 0])), settings: {}, nick: '' }; }
export function clean(d) {
  d = obj(d); const e = empty();
  e.hero = HEROES.includes(d.hero) ? d.hero : e.hero; e.souls = int(d.souls); e.bestWave = int(d.bestWave, 0, 9999);
  for (const h of HEROES) { const l = obj(obj(d.heroLv)[h]); e.heroLv[h] = { hp: int(l.hp, 0, PERM.hp.max), atk: int(l.atk, 0, PERM.atk.max) }; }
  for (const k of STATS) e.stats[k] = int(obj(d.stats)[k]);
  const a = obj(obj(d.settings).audio); if (Object.keys(a).length) e.settings.audio = { bgm: Math.max(0, Math.min(1, num(a.bgm, .6))), sfx: Math.max(0, Math.min(1, num(a.sfx, .8))), bgmOn: a.bgmOn !== false, sfxOn: a.sfxOn !== false };
  e.nick = typeof d.nick === 'string' ? d.nick.trim().slice(0, 12) : ''; return e;
}
// 게스트 저장 → 계정 첫 로그인 병합: 수치는 큰 값, 영웅/설정은 기기(local) 우선, 닉네임은 계정(cloud) 우선
export function merge(local, cloud) {
  const a = clean(local), b = clean(cloud || {}), m = clean(b);
  m.souls = Math.max(a.souls, b.souls); m.bestWave = Math.max(a.bestWave, b.bestWave);
  for (const h of HEROES) for (const k of ['hp', 'atk']) m.heroLv[h][k] = Math.max(a.heroLv[h][k], b.heroLv[h][k]);
  for (const k of STATS) m.stats[k] = Math.max(a.stats[k], b.stats[k]);
  if (cloud == null || a.stats.runs >= b.stats.runs) m.hero = a.hero;
  if (a.settings.audio) m.settings.audio = a.settings.audio; m.nick = b.nick || a.nick; return m;
}
export const permCost = (k, lv) => Math.round(PERM[k].base * Math.pow(1.5, lv));
// 판 종료 보상: 도달 웨이브 × 8 + 처치 수 / 3 (반올림 내림)
export function reward(wave, kills) { return Math.max(0, Math.floor(wave * 8 + kills / 3)); }
export function applyRun(save, { wave, kills }) {
  const s = clean(save), got = reward(wave, kills); s.souls += got; s.bestWave = Math.max(s.bestWave, wave);
  s.stats.runs++; s.stats.kills += kills; s.stats.waves += wave; s.stats.souls += got; return [s, got];
}
export function buyPerm(save, hero, k) {
  const s = clean(save), lv = s.heroLv[hero][k]; if (lv >= PERM[k].max) return [s, false]; const c = permCost(k, lv); if (s.souls < c) return [s, false];
  s.souls -= c; s.heroLv[hero][k]++; return [s, true];
}
