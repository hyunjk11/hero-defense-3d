// 저장 데이터(한 개의 순수 객체) 정리/병합/보상 계산. DOM·네트워크 없음 (node 테스트 가능).
import * as E from './equip.js';
import * as ST from '../data/stages.js';
import * as GR from '../data/growth.js';
// save = { inv[], eq{cls:{weapon,armor,acc}}, mat{steel,crystal}, v, hero, souls, bestWave, heroLv{cls:{hp,atk}}, stats{runs,kills,waves,souls}, settings{audio{}}, nick }
export const HEROES = ['archer', 'mage', 'warrior', 'gunner', 'mechanic']; // gunner·mechanic = 유료 영웅 (소유 여부는 서버 hd3d_owned, account/shop.js)
export const PERM = { hp: { n: '체력 단련', d: '최대 체력 +6%', max: 10, base: 30 }, atk: { n: '무기 숙련', d: '공격력 +5%', max: 10, base: 40 } };
export const STATS = ['runs', 'kills', 'waves', 'souls'];
const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const int = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Math.floor(num(v))));
export function empty() { return { v: 1, hero: 'mage', souls: 0, bestWave: 0, heroLv: Object.fromEntries(HEROES.map(h => [h, { hp: 0, atk: 0 }])), stats: Object.fromEntries(STATS.map(k => [k, 0])), settings: {}, nick: '', inv: [], eq: Object.fromEntries(HEROES.map(h => [h, {}])), mat: { steel: 0, crystal: 0 }, st: {}, starRw: 0, research: GR.emptyResearch() }; }
export function clean(d) {
  d = obj(d); const e = empty();
  e.hero = HEROES.includes(d.hero) ? d.hero : e.hero; e.souls = int(d.souls); e.bestWave = int(d.bestWave, 0, 9999);
  for (const h of HEROES) { const l = obj(obj(d.heroLv)[h]); e.heroLv[h] = { hp: int(l.hp, 0, PERM.hp.max), atk: int(l.atk, 0, PERM.atk.max) }; }
  for (const k of STATS) e.stats[k] = int(obj(d.stats)[k]);
  const a = obj(obj(d.settings).audio); if (Object.keys(a).length) e.settings.audio = { bgm: Math.max(0, Math.min(1, num(a.bgm, .6))), sfx: Math.max(0, Math.min(1, num(a.sfx, .8))), bgmOn: a.bgmOn !== false, sfxOn: a.sfxOn !== false };
  e.nick = typeof d.nick === 'string' ? d.nick.trim().slice(0, 12) : ''; E.cleanEquip(d, e, HEROES); cleanStages(d, e); e.research = GR.cleanResearch(d.research); return e;
}
// 게스트 저장 → 계정 첫 로그인 병합: 수치는 큰 값, 영웅/설정은 기기(local) 우선, 닉네임은 계정(cloud) 우선
export function merge(local, cloud) {
  const a = clean(local), b = clean(cloud || {}), m = clean(b);
  m.souls = Math.max(a.souls, b.souls); m.bestWave = Math.max(a.bestWave, b.bestWave);
  for (const h of HEROES) for (const k of ['hp', 'atk']) m.heroLv[h][k] = Math.max(a.heroLv[h][k], b.heroLv[h][k]);
  for (const k of STATS) m.stats[k] = Math.max(a.stats[k], b.stats[k]);
  if (cloud == null || a.stats.runs >= b.stats.runs) m.hero = a.hero;
  if (a.settings.audio) m.settings.audio = a.settings.audio; m.nick = b.nick || a.nick; E.mergeEquip(a, b, m, HEROES); for (const id in { ...a.st, ...b.st }) m.st[id] = Math.max(a.st[id] || 0, b.st[id] || 0); m.starRw = Math.max(a.starRw, b.starRw); m.research = GR.mergeResearch(a.research, b.research); return m;
}
export const permCost = (k, lv) => Math.round(PERM[k].base * Math.pow(1.5, lv));
// 판 종료 보상: 도달 웨이브 × 8 + 처치 수 / 3 (반올림 내림)
export function reward(wave, kills) { return Math.max(0, Math.floor(wave * 8 + kills / 3)); }
// 장비: 5웨이브마다 보상 상자(E.chestsFor) + 판 중 보스 드롭(drops) → 가방 (가득 차면 자동 분해). 반환 [save, 영혼석, 획득 목록]
export function applyRun(save, { wave, kills, drops = [], hero, stage }, r = Math.random) {
  const s = clean(save), got = reward(wave, kills); s.souls += got; if (!stage) s.bestWave = Math.max(s.bestWave, wave); // 최고 웨이브 = 도전 모드 기록만
  s.stats.runs++; s.stats.kills += kills; s.stats.waves += wave; s.stats.souls += got;
  const chests = E.chestsFor(wave, hero || s.hero, r).map(it => ({ it, src: 'chest' })), boss = drops.map(x => E.cleanItem(x, HEROES)).filter(Boolean).map(it => ({ it, src: 'boss' }));
  const all = [...chests, ...boss], res = E.addItems(s, all.map(x => x.it)); res.forEach((x, i) => x.src = all[i].src); return [s, got, res];
}
// 타워 연구소: 연구 1레벨 구매. 반환 [save, 성공]
export function buyResearch(save, type, k) { const s = clean(save); return [s, GR.buyResearch(s, type, k)]; }
export function buyPerm(save, hero, k) {
  const s = clean(save), lv = s.heroLv[hero][k]; if (lv >= PERM[k].max) return [s, false]; const c = permCost(k, lv); if (s.souls < c) return [s, false];
  s.souls -= c; s.heroLv[hero][k]++; return [s, true];
}

// ---------- 챕터/스테이지 ----------  st = { '1-1': 별(1~3) }, starRw = 받은 별 보상 상자 수
function cleanStages(d, e) { const st = obj(d.st); e.st = {}; for (const id in st) if (ST.STAGES[id]) { const v = int(st[id], 0, 3); if (v) e.st[id] = v; } e.starRw = int(d.starRw, 0, 999); }
// 챕터 장비: 이름 앞에 챕터 이름, 챕터가 깊을수록 좋은 등급
export function chapterItem(ch, hero, tier, r = Math.random) { const it = E.randomItem(hero, E.chestOdds(tier), r); it.n = (ST.PREFIX[ch] || '') + it.n; it.c = ch; return it; }
// 스테이지 클리어: 별 기록(최고값), 영혼석(첫 클리어 전액/재도전 절반), 첫 클리어 챕터 장비 1개, 누적 별 5개마다 별 보상 상자
export function applyStage(save, id, stars, hero, r = Math.random) {
  const s = clean(save), S = ST.STAGES[id]; if (!S) return [s, null]; const prev = s.st[id] || 0, first = prev === 0; stars = Math.max(1, Math.min(3, stars | 0));
  s.st[id] = Math.max(prev, stars); const souls = ST.stageReward(id, first); s.souls += souls; s.stats.souls += souls; hero = hero || s.hero;
  const items = []; if (first) items.push({ it: chapterItem(S.ch, hero, 1 + S.ch + Math.floor(S.idx / 2) + (S.boss ? 2 : 0), r), src: 'stage' });
  const tot = ST.totalStars(s); while (s.starRw < Math.floor(tot / ST.STAR_STEP)) { s.starRw++; items.push({ it: E.randomItem(hero, E.chestOdds(2 + s.starRw), r), src: 'star' }); }
  const res = E.addItems(s, items.map(x => x.it)); res.forEach((x, i) => x.src = items[i].src);
  return [s, { id, stars, prev, first, souls, loot: res, unlocked: Object.keys(ST.STAGES).filter(k => !ST.stageUnlocked(save, k) && ST.stageUnlocked(s, k)) }];
}
