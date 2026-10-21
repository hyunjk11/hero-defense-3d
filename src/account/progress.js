// 저장 데이터(한 개의 순수 객체) 정리/병합/보상 계산. DOM·네트워크 없음 (node 테스트 가능).
import * as E from './equip.js';
import * as ST from '../data/stages.js';
import * as GR from '../data/growth.js';
import { HERO_KEYS, DEFAULT_HERO, VISIBLE_HEROES, isHidden } from '../data/heroes.js';
import * as AD from '../data/advance.js';
import { CHSET, CH_KEYS, chOdds, UQ, uqOfChapter, CHAL_UQ, UQ_DROP, UQ_PITY, CHAL_ESS, CODEX_RW } from '../data/items.js';
// save = { inv[], chests[], eq{cls:{weapon,armor,acc}}, mat{steel,crystal}, v, hero, souls, bestWave, heroLv{cls:{hp,atk}}, stats{runs,kills,waves,souls}, settings{audio{}}, nick }
export const HEROES = HERO_KEYS; // gunner·mechanic = 유료 영웅 (소유 여부는 서버 hd3d_owned, account/shop.js)
export const PERM = { hp: { n: '체력 단련', d: '최대 체력 +6%', max: 10, base: 30 }, atk: { n: '무기 숙련', d: '공격력 +5%', max: 10, base: 40 } };
export const STATS = ['runs', 'kills', 'waves', 'souls'];
const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const int = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Math.floor(num(v))));
export function empty() { return { v: 1, hero: 'mage', souls: 0, bestWave: 0, heroLv: Object.fromEntries(HEROES.map(h => [h, { hp: 0, atk: 0 }])), stats: Object.fromEntries(STATS.map(k => [k, 0])), settings: {}, nick: '', inv: [], eq: Object.fromEntries(HEROES.map(h => [h, {}])), mat: { steel: 0, crystal: 0 }, chests: [], st: {}, hst: {}, starRw: 0, research: GR.emptyResearch(), mailLog: [], uqLog: {}, uqPity: {}, codex: {}, codexRw: [], adv: {}, hq: {} }; }
export function clean(d) {
  d = obj(d); const e = empty();
  e.hero = HEROES.includes(d.hero) ? (isHidden(d.hero) ? DEFAULT_HERO : d.hero) : e.hero; /* 숨긴 영웅이 선택돼 있으면 기본 영웅으로 (heroLv·장비·소유권은 유지) */ e.souls = int(d.souls); e.bestWave = int(d.bestWave, 0, 9999);
  e.adv = cleanAdv(d.adv); e.hq = cleanHq(d.hq); // 전직 (상한 계산에 먼저 필요)
  for (const h of HEROES) { const l = obj(obj(d.heroLv)[h]), mx = AD.permMax(e, h); e.heroLv[h] = { hp: int(l.hp, 0, mx), atk: int(l.atk, 0, mx) }; }
  for (const k of STATS) e.stats[k] = int(obj(d.stats)[k]);
  const a = obj(obj(d.settings).audio); if (Object.keys(a).length) e.settings.audio = { bgm: Math.max(0, Math.min(1, num(a.bgm, .6))), sfx: Math.max(0, Math.min(1, num(a.sfx, .8))), bgmOn: a.bgmOn !== false, sfxOn: a.sfxOn !== false };
  e.nick = typeof d.nick === 'string' ? d.nick.trim().slice(0, 12) : ''; E.cleanEquip(d, e, HEROES); cleanStages(d, e); e.research = GR.cleanResearch(d.research); e.mailLog = cleanMailLog(d.mailLog); return e;
}
// 게스트 저장 → 계정 첫 로그인 병합: 수치는 큰 값, 영웅/설정은 기기(local) 우선, 닉네임은 계정(cloud) 우선
export function merge(local, cloud) {
  const a = clean(local), b = clean(cloud || {}), m = clean(b);
  m.souls = Math.max(a.souls, b.souls); m.bestWave = Math.max(a.bestWave, b.bestWave);
  m.adv = mergeAdv(a.adv, b.adv); m.hq = mergeHq(a.hq, b.hq);
  for (const h of HEROES) for (const k of ['hp', 'atk']) m.heroLv[h][k] = Math.min(AD.permMax(m, h), Math.max(a.heroLv[h][k], b.heroLv[h][k]));
  for (const k of STATS) m.stats[k] = Math.max(a.stats[k], b.stats[k]);
  if (cloud == null || a.stats.runs >= b.stats.runs) m.hero = a.hero;
  if (a.settings.audio) m.settings.audio = a.settings.audio; m.nick = b.nick || a.nick; E.mergeEquip(a, b, m, HEROES); for (const id in { ...a.st, ...b.st }) m.st[id] = Math.max(a.st[id] || 0, b.st[id] || 0); for (const id in { ...a.hst, ...b.hst }) m.hst[id] = Math.max(a.hst[id] || 0, b.hst[id] || 0); m.starRw = Math.max(a.starRw, b.starRw); m.research = GR.mergeResearch(a.research, b.research); m.mailLog = cleanMailLog([...a.mailLog, ...b.mailLog]); return m;
}
// 우편 보상 장부(S-3): 영혼석·재료를 세이브에 더한 우편 id (양의 정수, 중복 없음, 최근 MAIL_LOG_MAX개). 응답 유실 후 재시도 때 두 번 더하지 않게
export const MAIL_LOG_MAX = 300;
export function cleanMailLog(v) { const ids = [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))]; ids.sort((x, y) => x - y); return ids.slice(-MAIL_LOG_MAX); }
// 우편 보상을 세이브에 반영 + 장부 기록 (이미 장부에 있으면 그대로). 반환 [save, 적용 여부]
export function applyMail(save, id, rw) { const s = clean(save); id = Number(id); if (!Number.isSafeInteger(id) || id <= 0 || s.mailLog.includes(id)) return [s, false];
  const n = k => Math.max(0, Math.min(1e6, Math.floor(+(rw && rw[k]) || 0)));
  s.souls += n('souls'); s.mat.steel += n('steel'); s.mat.crystal += n('crystal'); s.mailLog = cleanMailLog([...s.mailLog, id]); return [s, true]; }
export const permCost = (k, lv) => Math.round(PERM[k].base * Math.pow(1.5, lv));
// 판 종료 보상: 도달 웨이브 × 8 + 처치 수 / 3 (반올림 내림)
export function reward(wave, kills) { return Math.max(0, Math.floor(wave * 8 + kills / 3)); }
// 장비: 5웨이브마다 보상 상자(E.chestsFor) + 판 중 보스 드롭(drops) → 미개봉 상자 보관함 save.chests (마을에서 열면 가방으로). 반환 [save, 영혼석, 획득 목록]
// ch: 상자 장비의 챕터 세트 (스테이지 = 그 챕터 번호, 도전 모드 = 'open' → 상자마다 열린 챕터 중 무작위). 없으면 예전 그대로(무챕터, 같은 난수 소비)
// bossKills: 판 중 보스를 처치한 웨이브 목록 → 스테이지: ③ 숨은 보물 고유(보스마다 1.5%, 천장 60회) · 도전 모드: 20웨이브 이후 보스마다 15% 고유 정수 1. 도전 모드 25/40/60웨이브 첫 도달 → 고유
export const openChapters = s => CH_KEYS.filter(c => ST.chapterUnlocked(s, c));
export function applyRun(save, { wave, kills, drops = [], hero, stage, ch, bossKills = [], hard = false }, r = Math.random) {
  const s = clean(save), got = reward(wave, kills); s.souls += got; if (!stage) s.bestWave = Math.max(s.bestWave, wave); // 최고 웨이브 = 도전 모드 기록만
  s.stats.runs++; s.stats.kills += kills; s.stats.waves += wave; s.stats.souls += got;
  const cc = ch === 'open' ? openChapters(s) : CHSET[ch] ? +ch : undefined; hard = !!(hard && stage);
  const chests = (hard ? hardChests(wave, hero || s.hero, r, cc) : E.chestsFor(wave, hero || s.hero, r, cc)).map(it => ({ it, src: 'chest' })), boss = drops.map(x => E.cleanItem(x, HEROES)).filter(Boolean).map(it => ({ it, src: 'boss' }));
  const res = E.addChests(s, [...chests, ...boss]); // 보상 상자로 보관 → 마을에서 개봉
  const bk = (Array.isArray(bossKills) ? bossKills : []).map(Number).filter(Number.isFinite).slice(0, 999), add = x => x && res.push(x);
  if (stage && typeof cc === 'number') { const k = uqOfChapter(cc, 'drop'); if (k) for (const w of bk) { void w; let hit = r() < UQ_DROP * (hard ? ST.HARD.uqDrop : 1); if (!E.ownsUnique(s, k)) { s.uqPity[k] = (s.uqPity[k] || 0) + (hard ? ST.HARD.pityStep : 1); if (s.uqPity[k] >= UQ_PITY) hit = true; } if (hit) add(E.grantUnique(s, k)); } }
  if (!stage) { for (const k of CHAL_UQ) if (wave >= UQ[k].src.wave && !E.ownsUnique(s, k)) add(E.grantUnique(s, k));
    let ess = 0; for (const w of bk) if (w >= CHAL_ESS.wave && r() < CHAL_ESS.chance) ess++; if (ess) { s.mat.essence = (s.mat.essence || 0) + ess; res.push({ essence: ess, src: 'essence' }); } }
  return [s, got, res];
}
// 하드: 5웨이브마다 상자 등급이 HARD.tierUp 단계 높음 (같은 난수 소비)
export function hardChests(wave, hero, r = Math.random, ch) { const out = []; for (let w = 5; w <= wave; w += 5) out.push(E.randomItem(hero, E.chestOdds(w / 5 + ST.HARD.tierUp), r, undefined, ch)); return out; }
// 타워 연구소: 연구 1레벨 구매. 반환 [save, 성공]
export function buyResearch(save, type, k) { const s = clean(save); return [s, GR.buyResearch(s, type, k)]; }
export const permMax = (s, hero) => AD.permMax(s, hero); // 전직하면 10 → 15 (그 영웅만)
export function buyPerm(save, hero, k) {
  const s = clean(save); if (!PERM[k] || !s.heroLv[hero]) return [s, false]; const lv = s.heroLv[hero][k]; if (lv >= AD.permMax(s, hero)) return [s, false]; const c = permCost(k, lv); if (s.souls < c) return [s, false];
  s.souls -= c; s.heroLv[hero][k]++; return [s, true];
}

// ---------- 챕터/스테이지 ----------  st = { '1-1': 별(1~3) }, starRw = 받은 별 보상 상자 수
function cleanStages(d, e) { const st = obj(d.st); e.st = {}; for (const id in st) if (ST.STAGES[id]) { const v = int(st[id], 0, 3); if (v) e.st[id] = v; } e.starRw = int(d.starRw, 0, 999);
  const hs = obj(d.hst); e.hst = {}; for (const id in hs) if (ST.STAGES[id]) { const v = int(hs[id], 0, 3); if (v) e.hst[id] = v; } } // 하드 별 (옛 저장엔 없음 → {})
// 챕터 장비: 이름 앞에 챕터 이름, 챕터가 깊을수록 좋은 등급
// (예전: 이름 앞 접두어 + c → 지금: 챕터 세트 이름·가중치. 옛 접두어 아이템은 c 가 있어 배지·도감은 그대로 동작)
export const stageTier = S => 1 + S.ch + Math.floor(S.idx / 2) + (S.boss ? 2 : 0);
export function chapterItem(ch, hero, tier, r = Math.random) { return E.randomItem(hero, E.chestOdds(tier), r, undefined, ch); }
// 스테이지 클리어: 별 기록(최고값), 영혼석(첫 클리어 전액/재도전 절반), 첫 클리어 챕터 장비 1개, 누적 별 5개마다 별 보상 상자
export function applyStage(save, id, stars, hero, r = Math.random, hard = false, elites = 0) {
  if (hard) return applyHardStage(save, id, stars, hero, r, elites);
  const s = clean(save), S = ST.STAGES[id]; if (!S) return [s, null]; const prev = s.st[id] || 0, first = prev === 0; stars = Math.max(1, Math.min(3, stars | 0));
  s.st[id] = Math.max(prev, stars); const souls = ST.stageReward(id, first); s.souls += souls; s.stats.souls += souls; hero = hero || s.hero;
  if (HEROES.includes(hero)) { const q = s.hq[hero] || (s.hq[hero] = { boss: 0, clr: 0 }); q.clr++; if (S.boss) q.boss++; } // 전직 시련: 그 영웅으로 클리어한 횟수 (보스 스테이지 따로)
  const items = []; if (first) items.push({ it: chapterItem(S.ch, hero, stageTier(S), r), src: 'stage' });
  const tot = ST.totalStars(s); while (s.starRw < Math.floor(tot / ST.STAR_STEP)) { s.starRw++; items.push({ it: E.randomItem(hero, E.chestOdds(2 + s.starRw), r, undefined, S.ch), src: 'star' }); }
  const res = E.addChests(s, items);
  // 고유: ① 챕터 보스 첫 클리어 ② 챕터 별 만점 (이미 기록돼 있으면 다시 주지 않음 — 중복 변환은 ③·도전 모드 드롭에서만)
  const kb = uqOfChapter(S.ch, 'boss'), ks = uqOfChapter(S.ch, 'stars');
  if (first && S.boss && kb && !E.ownsUnique(s, kb)) { const x = E.grantUnique(s, kb); if (x) res.push(x); }
  if (ks && ST.chapterStars(s, S.ch) >= chapterMax(S.ch) && !E.ownsUnique(s, ks)) { const x = E.grantUnique(s, ks); if (x) res.push(x); }
  return [s, { id, stars, prev, first, souls, loot: res, hardOpen: first && S.boss ? S.ch : 0, unlocked: Object.keys(ST.STAGES).filter(k => !ST.stageUnlocked(save, k) && ST.stageUnlocked(s, k)) }];
}

// 하드 스테이지 클리어: 하드 별(hst) 기록, 영혼석 = 노말 × HARD.souls (+ 정예 처치 보너스), 첫 클리어 장비 1개 (등급 +HARD.tierUp 단계), 재도전도 장비 1개(같은 등급표, 절반 확률)
// 노말 별(st)·별 보상 상자·별 만점 고유는 건드리지 않음 (하드 별은 따로). 전직 시련 카운터(hq)는 노말과 똑같이 셈
export function applyHardStage(save, id, stars, hero, r = Math.random, elites = 0) {
  const s = clean(save), S = ST.STAGES[id]; if (!S || !ST.hardUnlocked(s, id)) return [s, null]; const prev = s.hst[id] || 0, first = prev === 0; stars = Math.max(1, Math.min(3, stars | 0));
  s.hst[id] = Math.max(prev, stars); const bonus = Math.min(ST.HARD.eliteSoulsMax, Math.max(0, elites | 0) * ST.HARD.eliteSouls), souls = ST.stageRewardH(id, first, true) + bonus; s.souls += souls; s.stats.souls += souls; hero = hero || s.hero;
  if (HEROES.includes(hero)) { const q = s.hq[hero] || (s.hq[hero] = { boss: 0, clr: 0 }); q.clr++; if (S.boss) q.boss++; }
  const items = []; if (first || r() < .5) items.push({ it: chapterItem(S.ch, hero, stageTier(S) + ST.HARD.tierUp, r), src: 'stage' });
  const res = E.addChests(s, items);
  return [s, { id, stars, prev, first, souls, eliteSouls: bonus, hard: true, loot: res, unlocked: Object.keys(ST.STAGES).filter(k => !ST.hardUnlocked(save, k) && ST.hardUnlocked(s, k)) }];
}
// ---------- 고유 아이템: 소급 지급 · 드롭 미리보기 · 도감 ----------
export const chapterMax = ch => ST.CHAPTERS.find(c => c.id === ch).stages.length * 3; // 장마다 6스테이지 = 18 (2026-10-21 전 2~4장 12)
// 이미 조건을 채웠는데 아직 기록이 없는 고유 (기존 유저 소급, 여러 번·여러 기기에서 실행해도 id 가 고정이라 1개)
export function backfillList(s) { const out = [];
  for (const C of ST.CHAPTERS) { const b = C.stages.find(x => x.boss), kb = uqOfChapter(C.id, 'boss'), ks = uqOfChapter(C.id, 'stars');
    if (kb && b && ST.stars(s, b.id) > 0) out.push(kb); if (ks && ST.chapterStars(s, C.id) >= chapterMax(C.id)) out.push(ks); }
  for (const k of CHAL_UQ) if ((s.bestWave || 0) >= UQ[k].src.wave) out.push(k);
  return out.filter(k => !E.ownsUnique(s, k) && !(UQ[k].h && isHidden(UQ[k].h))); }
export function backfill(save) { const s = clean(save), L = backfillList(s); return [s, L.map(k => E.grantUnique(s, k)).filter(Boolean)]; }
// 스테이지 정보 패널 '드롭 미리보기' (순수): 세트·첫 클리어 등급 범위(2% 이상만 점 표시)·고유 3칸(① 보스 ② 별 만점 ③ 확률 + 천장 진행)
export const PREVIEW_MIN = .02;
export function dropPreview(id, hero, save, hard = false) {
  const S = ST.STAGES[id]; if (!S) return null; save = save || empty(); hero = isHidden(hero) || !HEROES.includes(hero) ? DEFAULT_HERO : hero;
  const o = chOdds(E.chestOdds(stageTier(S) + (hard ? ST.HARD.tierUp : 0)), S.ch), t = o.reduce((a, b) => a + b, 0), odds = o.map(v => v / t);
  const uq = ['boss', 'stars', 'drop'].map(kind => { const k = uqOfChapter(S.ch, kind); return k && { k, kind, have: E.ownsUnique(save, k), pity: (save.uqPity || {})[k] || 0, here: kind !== 'boss' || UQ[k].src.boss === S.id }; }).filter(Boolean);
  return { id, ch: S.ch, set: CHSET[S.ch], hero, odds, grades: odds.map(v => v >= PREVIEW_MIN), uq, stars: ST.chapterStars(save, S.ch), starsMax: chapterMax(S.ch), pityMax: UQ_PITY, hard: !!hard, uqDrop: UQ_DROP * (hard ? ST.HARD.uqDrop : 1) };
}
export const uniqueCount = (save, ch) => Object.keys(UQ).filter(k => UQ[k].ch === ch && E.ownsUnique(save, k)).length;
// 도감: 행 = 보이는 영웅 무기 + 방어구 + 장신구, 열 = 등급 5개
export const codexRows = () => [...VISIBLE_HEROES, 'armor', 'acc'];
export const codexBits = (save, ch, row) => ((save.codex || {})[ch] || {})[row] || 0;
export function codexState(save, ch) { const rows = codexRows().map(row => { const b = codexBits(save, ch, row), key = ch + ':' + row; return { row, bits: b, n: [0, 1, 2, 3, 4].filter(g => b & (1 << g)).length, done: b === 31, key, got: (save.codexRw || []).includes(key) }; });
  const all = { key: ch + ':all', done: rows.every(r => r.done), got: (save.codexRw || []).includes(ch + ':all') }; return { rows, all, seen: rows.reduce((a, r) => a + r.n, 0), total: rows.length * 5 }; }
// 도감 보상 받기 (한 번만 — codexRw 는 병합 시 합집합이라 두 기기에서도 한 번). 반환 [save, 보상|null]
export function claimCodex(save, key) { const s = clean(save), [ch, row] = String(key).split(':'), C = CHSET[ch] ? codexState(s, +ch) : null; if (!C || s.codexRw.includes(key)) return [s, null];
  const it = row === 'all' ? C.all : C.rows.find(x => x.row === row); if (!it || !it.done) return [s, null]; const rw = row === 'all' ? CODEX_RW.all : CODEX_RW.row;
  s.mat.crystal += rw.crystal || 0; if (rw.essence) s.mat.essence = (s.mat.essence || 0) + rw.essence; s.souls += rw.souls || 0; s.codexRw.push(key); return [s, rw]; }
export function awaken(save, id) { const s = clean(save); const [, r] = E.awaken(s, id); return [s, r]; }

// ---------- 전직 (design 7절) ----------  adv = { 영웅: { b: 분기 키, n: 전직·재전직 횟수(1~) } }, hq = { 영웅: { boss: 보스 스테이지 클리어, clr: 스테이지 클리어 } }
export function cleanAdv(v) { v = obj(v); const o = {}; for (const h of HEROES) { const r = obj(v[h]); if (AD.ADV[h] && AD.ADV[h][r.b]) o[h] = { b: r.b, n: int(r.n || 1, 1, 1e6) }; } return o; }
export function cleanHq(v) { v = obj(v); const o = {}; for (const h of HEROES) { const r = obj(v[h]), q = { boss: int(r.boss, 0, 1e6), clr: int(r.clr, 0, 1e6) }; if (q.boss || q.clr) o[h] = q; } return o; }
// 병합: 전직 기록은 n(전직·재전직 횟수)이 큰 쪽 (같으면 계정 쪽), 시련 카운터는 최댓값
export function mergeAdv(a, b) { a = cleanAdv(a); b = cleanAdv(b); const o = {}; for (const h of HEROES) { const x = a[h], y = b[h]; if (x || y) o[h] = !x ? y : !y ? x : x.n > y.n ? x : y; } return o; }
export function mergeHq(a, b) { a = cleanHq(a); b = cleanHq(b); const o = {}; for (const h of HEROES) { const x = a[h] || {}, y = b[h] || {}; if (a[h] || b[h]) o[h] = { boss: Math.max(x.boss || 0, y.boss || 0), clr: Math.max(x.clr || 0, y.clr || 0) }; } return o; }
// 전직 / 재전직: owned = 서버 소유권 확인(Sh.heroOwned) — 세이브 값은 믿지 않음. 반환 [save, 성공]
export function buyAdv(save, hero, b, owned = true) { const s = clean(save); if (AD.advBlock(s, hero, b, owned)) return [s, false];
  const cur = s.adv[hero]; if (cur) { s.souls -= AD.ADV_SWITCH.souls; s.adv[hero] = { b, n: cur.n + 1 }; return [s, true]; }
  s.souls -= AD.ADV_COST.souls; s.mat.crystal -= AD.ADV_COST.crystal; s.mat.essence -= AD.ADV_COST.essence; if (!s.mat.essence) delete s.mat.essence; s.adv[hero] = { b, n: 1 }; return [s, true]; }
export const changeAdv = buyAdv; // 재전직도 같은 함수 (이미 전직했으면 영혼석 500)
