// 장비 시스템 (순수 로직, DOM·네트워크 없음 → node 테스트 가능)
import { DEFAULT_HERO, isHidden } from '../data/heroes.js';
import { CHSET, chOdds, UQ, UQ_DUP, AWAKE_MAX, AWAKE_COST, AWAKE_SOULS, CH_KEYS } from '../data/items.js';
import { unpackItem } from './storpack.js';
export { CHSET, UQ };
// item = { id, s: 'weapon'|'armor'|'acc', h?: 영웅(무기만), g: 등급 0..4, n: 이름, m: [스탯, 값], sub: [[스탯, 값]...], e: 강화 0..10, u?: 전설 스킬, c?: 챕터 세트 1..4, uq?: 고유 키(id = 'u_'+uq, g=4), a?: 각성 0..5 }
export const GRADES = [
  { k: 'common', n: '일반', c: '#b8b8c4' }, { k: 'uncommon', n: '고급', c: '#5ad85a' }, { k: 'rare', n: '희귀', c: '#4aa8ff' },
  { k: 'epic', n: '영웅', c: '#c06aff' }, { k: 'legend', n: '전설', c: '#ff9a2a' }];
export const SLOTS = { weapon: '무기', armor: '방어구', acc: '장신구' };
export const SLOT_KEYS = ['weapon', 'armor', 'acc'];
// 실제로 영웅 코드에 적용되는 스탯만 (단위 %)
export const STAT = { atk: '공격력', hp: '최대 체력', spd: '공격 속도', rng: '사거리', crit: '치명타 확률', critD: '치명타 피해', skill: '스킬 위력', cdr: '스킬 쿨타임 감소' };
export const MAIN = { atk: [6, 9, 13, 18, 25], hp: [8, 12, 17, 24, 32], crit: [3, 4, 6, 8, 11], spd: [4, 6, 9, 12, 16], skill: [8, 12, 17, 24, 32], cdr: [3, 5, 7, 9, 12] };
const SUBV = { atk: 4, hp: 5, spd: 4, rng: 3, crit: 3, critD: 10, skill: 6, cdr: 3 }; // 서브 스탯 기준값(등급마다 +40%)
export const SUBN = [0, 1, 1, 2, 2];
export const CAP = 40, MAXE = 10;
const ACC_MAIN = ['crit', 'spd', 'skill', 'cdr'];
export const GEAR_NAMES = {
  archer: [['낡은 사냥 활', '참나무 활'], ['숲지기의 장궁', '바람결 활'], ['은월의 활', '매의 눈 장궁'], ['폭풍추적자', '별빛 사수의 활'], ['세계수의 활 이그드라', '태양궁 아폴리아']],
  mage: [['견습생 지팡이', '참나무 지팡이'], ['수정 지팡이', '불씨 지팡이'], ['비전의 홀', '서리꽃 지팡이'], ['심연의 지팡이', '성운의 홀'], ['대현자의 지팡이 아르카나', '별을 삼킨 홀']],
  warrior: [['녹슨 장검', '병사의 검'], ['기사의 장검', '강철 대검'], ['푸른 서약의 검', '사자심장 대검'], ['용살자의 대검', '폭군의 검'], ['성검 엑스칼리온', '파멸의 대검 라그나']],
  gunner: [['낡은 부싯돌 쌍권총', '견습 총사의 쌍권총'], ['은탄 쌍권총', '장미 문양 쌍권총'], ['황혼의 쌍권총', '가시덤불 쌍권총'], ['붉은 달 쌍권총', '폭풍의 쌍권총'], ['장미여왕의 쌍권총 로제아', '심홍의 쌍권총 블러디로즈']],
  mechanic: [['낡은 렌치 건틀릿', '견습 정비공의 건틀릿'], ['강철 드릴 건틀릿', '증기 해머 건틀릿'], ['초록불 파일벙커', '덩굴 드릴암'], ['광산왕의 굴착기', '천둥 해머 암'], ['버들의 개조암 그린기어', '대지분쇄 드릴 타이탄']],
  fighter: [['낡은 손붕대', '견습 격투가의 손붕대'], ['강철 너클 붕대', '고양이 발 손붕대'], ['맹호 손붕대', '바람가르기 너클'], ['천둥 고양이 너클', '진각의 손붕대'], ['서윤의 냥냥 너클 캣츠포', '맹묘권 타이거팡']],
  armor: [['천 갑옷', '가죽 조끼'], ['사슬 갑옷', '수호자의 가죽갑옷'], ['미스릴 흉갑', '은빛 판금'], ['용비늘 갑옷', '성기사의 판금'], ['여신의 가호 갑주', '불사조 깃털 망토']],
  acc: [['구리 반지', '나무 부적'], ['은 반지', '행운의 부적'], ['사파이어 목걸이', '마력의 귀걸이'], ['용의 눈 펜던트', '시간의 모래시계'], ['여신의 눈물', '영원의 성배 목걸이']],
};
// ---------- 전설 무기 고유 스킬 ----------
// 전설(g4) 무기는 영웅별 풀에서 고유 스킬 1개(it.u)를 가진다. proc: 공격 시 확률 발동(내부 쿨타임) · active: [E] 키/버튼
export const LSK = {
  multishot: { h: 'archer', type: 'proc', n: '멀티샷', chance: .25, icd: 1.2, mul: .6, d: '공격 시 25% 확률로 화살 5발을 부채꼴로 발사 (각 60% 피해)' },
  pierce: { h: 'archer', type: 'active', n: '관통샷', cd: 8, mul: 3, d: '[E] 황금 화살을 충전해 일직선 위의 모든 적을 꿰뚫음 (300% 피해) · 재사용 8초' },
  frostorb: { h: 'mage', type: 'proc', n: '프로즌 오브', chance: .15, icd: 3, mul: .35, d: '공격 시 15% 확률로 느리게 나아가는 얼음 구체 소환 — 주변 적 피해·50% 둔화, 끝에서 폭발해 빙결' },
  meteorstorm: { h: 'mage', type: 'active', n: '메테오 스톰', cd: 12, mul: 4, d: '[E] 목표 지역에 거대한 운석 6개를 쏟아부음 (각 400% 피해) · 재사용 12초' },
  boomerang: { h: 'warrior', type: 'proc', n: '회선대검', chance: .2, icd: 2, mul: .9, d: '공격 시 20% 확률로 대검을 회전시켜 던짐 — 갈 때와 돌아올 때 모두 타격 (각 90% 피해)' },
  quake: { h: 'warrior', type: 'active', n: '천지파열무', cd: 14, mul: 4, d: '[E] 도약해 땅을 내리쳐 충격파 — 주변 적 400% 피해 + 0.8초 공중에 띄움(기절) · 재사용 14초' },
  ricochet: { h: 'gunner', type: 'proc', n: '도탄 난사', chance: .22, icd: .8, mul: .7, d: '공격 시 22% 확률로 탄환이 주변 적 최대 4명에게 차례로 튕김 (각 70% 피해)' },
  rosebarrage: { h: 'gunner', type: 'active', n: '장미 탄막', cd: 11, mul: 1.5, d: '[E] 목표 방향 부채꼴로 장미 탄환 3연속 일제 사격(각 150% 피해·3명 관통) → 끝에서 장미 폭발 (300% 피해) · 재사용 11초' },
  overdrill: { h: 'mechanic', type: 'proc', n: '과부하 드릴', chance: .2, icd: 1.6, mul: .45, d: '공격 시 20% 확률로 드릴이 과열 — 앞쪽 부채꼴을 6번 연속 갈아버림 (각 45% 피해) + 40% 둔화' },
  gigahammer: { h: 'mechanic', type: 'active', n: '기가 해머 낙하', cd: 13, mul: 4, d: '[E] 목표 지점에 거대한 해머를 떨어뜨림 — 주변 적 400% 피해 · 밀쳐내기 · 1초 기절 · 재사용 13초' },
  pawstorm: { h: 'fighter', type: 'proc', n: '냥냥 난타', chance: .2, icd: 1.5, mul: .45, hits: 6, d: '공격 시 20% 확률로 고양이 발 잔상 6연타 — 앞쪽 부채꼴 적에게 각 45% 피해' },
  tigerdash: { h: 'fighter', type: 'active', n: '맹호 돌진', cd: 10, mul: 3, d: '[E] 목표 방향으로 질풍처럼 돌진하며 지나가는 모든 적에게 300% 피해 + 밀쳐내기 · 재사용 10초' },
  // 고유 무기 전용 [E] (uq: true — LPOOL 에 없으므로 일반 전설 무기에는 나오지 않음, data/items.js UQ[k].sk)
  rootshot: { h: 'archer', type: 'active', uq: true, n: '뿌리 감옥 화살', cd: 10, mul: 2.6, root: 1.2, rootBoss: .4, d: '[E] 일직선 관통 260% 피해 + 맞은 지상 적 1.2초 속박(보스 0.4초) · 재사용 10초' },
  zeroabs: { h: 'mage', type: 'active', uq: true, n: '절대영도', cd: 14, mul: 3, r: 4.5, frz: 1.5, frzBoss: .5, d: '[E] 목표 지점 반경 4.5 — 300% 피해 + 1.5초 빙결(보스 0.5초) + 이후 3초 50% 둔화 · 재사용 14초' },
  eruption: { h: 'warrior', type: 'active', uq: true, n: '분화 일격', cd: 14, mul: 4, pool: 4, poolR: 3, poolMul: .3, d: '[E] 도약해 내려찍기(400% + 띄우기) + 착지점 반경 3에 4초 용암 장판(0.5초마다 공격력 30%) · 재사용 14초' },
  catpaw: { h: 'fighter', type: 'active', uq: true, n: '묘신 냥발 장풍', cd: 11, mul: 3.6, len: 14, w: 2.4, vuln: .2, vulnT: 3, boomR: 3.5, boomMul: 2, d: '[E] 거대한 고양이 발 장풍 — 직선 14 · 폭 2.4 관통(비행 포함) 360% 피해 + 밀쳐내기 + 3초간 받는 피해 +20% · 재사용 11초' },
  execution: { h: 'gunner', type: 'active', uq: true, n: '왕가의 처형', cd: 12, mul: 2, shots: 6, d: '[E] 체력이 가장 높은 적(보스 우선)에게 6연사(각 200%) · 처치 시 재사용 50% 반환 · 재사용 12초' },
};
export const LPOOL = { archer: ['multishot', 'pierce'], mage: ['frostorb', 'meteorstorm'], warrior: ['boomerang', 'quake'], gunner: ['ricochet', 'rosebarrage'], mechanic: ['overdrill', 'gigahammer'], fighter: ['pawstorm', 'tigerdash'] };
const hashId = id => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
// 무기의 고유 스킬 키 (전설 무기가 아니면 null). 저장값이 없거나 잘못됐으면 id에서 결정적으로 배정 → 구 세이브 호환
export function legendKey(it) { if (it && it.uq) { const U = UQ[it.uq]; return U && U.sk && LSK[U.sk] ? U.sk : null; } if (!it || it.s !== 'weapon' || it.g !== 4 || !LPOOL[it.h]) return null; const P = LPOOL[it.h]; return P.includes(it.u) ? it.u : P[hashId(it.id) % P.length]; }
// 장착한 고유 { weapon?: {k, a}, armor?, acc? } (출정 시 G.uq → heroes/unique.js, 무기 각성 = [E] 위력·쿨)
export function uniquesOf(save, hero) { const o = {}, eq = (save.eq || {})[hero] || {}; for (const sl of SLOT_KEYS) { const it = (save.inv || []).find(x => x.id === eq[sl]); if (it && it.uq && UQ[it.uq]) o[sl] = { k: it.uq, a: it.a || 0 }; } return o; }
export function legendOf(save, hero) { const id = ((save.eq || {})[hero] || {}).weapon, it = (save.inv || []).find(x => x.id === id); return legendKey(it); }
const rid = r => (Math.floor(r() * 2176782336)).toString(36).padStart(6, '0') + (Date.now() % 1296).toString(36);
const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];
// 가중치 뽑기 (챕터 세트 전용 — 챕터가 없을 때는 쓰지 않아 기존 난수 소비 순서 유지). 가중치 없는 키 = 1
const wpick = (keys, W, r) => { let t = 0; for (const k of keys) t += W[k] || 1; let x = r() * t; for (const k of keys) if ((x -= W[k] || 1) < 0) return k; return keys[keys.length - 1]; };
export function rollGrade(w, r = Math.random) { const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < w.length; i++) { if ((x -= w[i]) < 0) return i; } return w.length - 1; }
// ch(챕터 1..4)가 있으면 그 챕터 세트: 이름 = CHSET 표(등급당 1개, 난수 미사용), 장신구 주스탯·서브 스탯은 챕터 가중치, it.c = ch.
// ch 가 없으면 예전과 난수 소비 순서·결과가 완전히 같음 (회귀 기준)
export function makeItem(slot, hero, g, r = Math.random, ch) {
  const C = ch && CHSET[ch] ? CHSET[ch] : null, cn = k => C && C.names[k] && C.names[k][g];
  const s = SLOT_KEYS.includes(slot) ? slot : 'armor'; const it = { id: rid(r), s, g, e: 0, sub: [] };
  if (s === 'weapon') { it.h = hero; it.m = ['atk', MAIN.atk[g]]; it.n = cn(hero) || pick(GEAR_NAMES[hero][g], r); }
  else if (s === 'armor') { it.m = ['hp', MAIN.hp[g]]; it.n = cn('armor') || pick(GEAR_NAMES.armor[g], r); }
  else { const k = C ? wpick(ACC_MAIN, C.accW, r) : pick(ACC_MAIN, r); it.m = [k, MAIN[k][g]]; it.n = cn('acc') || pick(GEAR_NAMES.acc[g], r); }
  const pool = Object.keys(SUBV).filter(k => k !== it.m[0]);
  for (let i = 0; i < SUBN[g]; i++) { const k = C ? pool.splice(pool.indexOf(wpick(pool, C.subW, r)), 1)[0] : pool.splice(Math.floor(r() * pool.length), 1)[0]; it.sub.push([k, Math.round(SUBV[k] * (1 + .4 * g) * (.7 + r() * .6))]); }
  const u = legendKey(it); if (u) it.u = u; // 난수 소비 없음 (기존 시드 결과 유지)
  if (C) it.c = +ch;
  return it;
}
// ---------- 고유 아이템 (계정당 1개) ----------
// 저장에서 의미 있는 값은 { uq, e, a } 뿐 — 나머지(id·s·h·g·n·m·sub)는 항상 UQ 표에서 다시 만듦 (변조·옛 값 자동 교정, 밸런스 패치 즉시 반영)
export const uqId = k => 'u_' + k;
export function makeUnique(k, e = 0, a = 0) { const U = UQ[k]; if (!U) return null; const it = { id: uqId(k), s: U.s, g: 4, uq: k, n: U.n, m: [...U.m], sub: U.sub.map(p => [...p]), e, a };
  if (U.h) it.h = U.h; return it; }
// 이미 계정에 있는 고유? (기록 uqLog · 가방 · 📦 창고 · 상자)
export const ownsUnique = (save, k) => !!((save.uqLog || {})[k] || (save.inv || []).some(x => x.uq === k) || (save.stor || []).some(x => x.uq === k) || (save.chests || []).some(c => c.it && c.it.uq === k));
// 계정이 가진 장비 전부 (가방 + 📦 창고, 상자 제외) — 고유 카드 표시·도감 등
export const allItems = save => [...(save.inv || []), ...(save.stor || [])];
export const mainVal = it => Math.round(it.m[1] * (1 + .1 * it.e) * 10) / 10;
export function itemStats(it) { const o = {}; if (!it) return o; o[it.m[0]] = mainVal(it); for (const [k, v] of it.sub) o[k] = (o[k] || 0) + v; return o; }
export function power(it) { const s = itemStats(it); return Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 10 + it.g * 20); }
// 영웅이 장착한 장비 합산 보너스 (%)
export function bonus(save, hero) { const o = {}; const eq = (save.eq || {})[hero] || {}; for (const sl of SLOT_KEYS) { const it = (save.inv || []).find(x => x.id === eq[sl]); for (const [k, v] of Object.entries(itemStats(it))) o[k] = Math.round(((o[k] || 0) + v) * 10) / 10; } return o; }
export const canEquip = (it, hero) => it && (it.s !== 'weapon' || it.h === hero);
export function isEquipped(save, id) { return Object.values(save.eq || {}).some(e => Object.values(e || {}).includes(id)); }

// ---------- 보상 ----------
// 출정 보상 상자: 5웨이브마다 1개 (도달 웨이브 기준), 오래 버틸수록 좋은 등급
export function chestOdds(tier) { const t = Math.max(0, tier - 1); return [Math.max(8, 60 - 10 * t), 28 + 2 * t, 9 + 3 * t, 2.6 + 1.8 * t, .4 + .7 * t]; }
export const BOSS_DROP = .5; // 보스 처치 시 장비 드롭 확률
export function bossOdds(wave) { const o = chestOdds(Math.floor(wave / 5) + 1); o[0] = 0; return o; } // 보스 드롭은 최소 고급
// 드롭·상자·별 보상·제작은 모두 여기로 → 숨긴 영웅(data/heroes.js hidden) 전용 무기는 새로 만들지 않고 기본 영웅 무기로 (이미 가진 아이템은 유지)
// ch: 챕터 세트(1..4, 3·4장은 일반 등급 없음) · 챕터 배열이면 상자마다 그중 하나 (도전 모드 = 열린 챕터 무작위) · 없으면 예전 그대로
const chOf = (ch, r) => (Array.isArray(ch) ? (ch.length ? pick(ch, r) : undefined) : ch || undefined);
export function randomItem(hero, odds, r = Math.random, slot, ch) { if (isHidden(hero)) hero = DEFAULT_HERO; ch = chOf(ch, r); return makeItem(slot || pick(SLOT_KEYS, r), hero, rollGrade(ch ? chOdds(odds, ch) : odds, r), r, ch); }
export function chestsFor(wave, hero, r = Math.random, ch) { const out = []; for (let w = 5; w <= wave; w += 5) out.push(randomItem(hero, chestOdds(w / 5), r, undefined, ch)); return out; }
// 가방에 넣기 (가득 차면 자동 분해 → 재료). 반환: [save, 결과목록{it, auto}]
// ---------- 보관 중인 보상 상자 (미개봉) ----------
// save.chests = [{ id, src, it: 획득 시 미리 굴려 둔 장비, souls: 개봉 시 영혼석 }] — 개봉해야 가방에 들어감. 가방이 가득 차면 상자는 그대로 보관.
export const STOR_HARD = 300, STOR_STEPS = 4; // 📦 창고: 세이브 정리 상한(일반 장비) · 확장 단계 수 (용량·비용은 account/storage.js)
export const CHEST_CAP = 200, CHEST_SRC = ['chest', 'boss', 'stage', 'star', 'unique'], CHEST_SOULS = [4, 6, 10, 16, 30], BATCH = 10;
export const chestOf = (it, src) => ({ id: 'c' + it.id, src: CHEST_SRC.includes(src) ? src : 'chest', it, souls: it.uq ? 0 : CHEST_SOULS[it.g] || 0 });
// 상자로 보관 (보관함도 가득 차면 예전처럼 자동 분해). 반환: 결과목록{it, src, auto, chest?}
export function addChests(save, list) {
  if (!Array.isArray(save.chests)) save.chests = []; const ids = new Set(save.chests.map(c => c.id)); const res = [];
  for (const { it, src } of list) { const c = chestOf(it, src);
    if (it.uq) { if (!ids.has(c.id) && !allItems(save).some(x => x.id === it.id)) { save.chests.push(c); ids.add(c.id); res.push({ it, src, auto: false, chest: c.id }); } continue; } // 고유: 보관함 상한 예외 · 자동 분해 없음
    if (save.chests.filter(x => !x.it.uq).length < CHEST_CAP && !ids.has(c.id)) { save.chests.push(c); ids.add(c.id); res.push({ it, src, auto: false, chest: c.id }); }
    else { const y = dismantleYield(it); for (const k in y) save.mat[k] += y[k]; res.push({ it, src, auto: true, y }); } }
  return res;
}
// 상자 개봉 (한 개 / 여러 개 / 전부를 같은 함수로): n개까지 (ids가 있으면 그 상자만), 가방 빈칸만큼만 연다.
// 열린 상자는 save.chests에서 즉시 제거 → 같은 상자를 두 번 열 수 없음(중복 보상 없음). 저장은 호출하는 쪽에서 한 번만.
// 반환 [save, { opened:[{it, src, souls}], souls, left, full(가방이 부족해 못 연 상자가 있음), blocked(못 연 개수) }]
export function openChests(save, n = Infinity, ids = null) {
  if (!Array.isArray(save.chests)) save.chests = []; const L = save.chests, have = new Set(allItems(save).map(x => x.id));
  const want = (ids ? L.filter(c => ids.includes(c.id)) : L.slice()).slice(0, Math.max(0, Math.floor(n === Infinity ? L.length : +n || 0)));
  let free = Math.max(0, CAP - save.inv.length); const opened = []; let souls = 0, blocked = 0;
  for (const c of want) {
    if (have.has(c.it.id)) { L.splice(L.indexOf(c), 1); continue; } // 이미 가방·창고에 있는 장비(다른 기기에서 열림) → 상자만 정리
    const uq = !!c.it.uq; if (!uq && free <= 0) { blocked++; continue; } // 고유는 가방이 가득 차도 개봉 (최대 15개)
    L.splice(L.indexOf(c), 1); save.inv.push(c.it); have.add(c.it.id); if (!uq) free--; codexAdd(save, c.it); souls += c.souls; opened.push({ it: c.it, src: c.src, souls: c.souls });
  }
  save.souls = (save.souls || 0) + souls; if (save.stats) save.stats.souls = (save.stats.souls || 0) + souls;
  return [save, { opened, souls, left: L.length, full: blocked > 0, blocked }];
}
// 요약 화면 정렬: 등급 높은 순 → 전설 무기 → 장비 위력
export const byRarity = (a, b) => b.it.g - a.it.g || (!!legendKey(b.it) - !!legendKey(a.it)) || power(b.it) - power(a.it);
export function gradeCount(opened) { const c = [0, 0, 0, 0, 0]; for (const x of opened) c[x.it.g]++; return c; }
export function addItems(save, items) { const res = []; for (const it of items) { if (it.uq || save.inv.length < CAP) { save.inv.push(it); res.push({ it, auto: false }); } else { const y = dismantleYield(it); for (const k in y) save.mat[k] += y[k]; res.push({ it, auto: true, y }); } } return res; }

// ---------- 대장간 ----------
export const ENH_RATE = [100, 95, 90, 80, 70, 60, 50, 40, 30, 25];
export function enhCost(it) { const e = it.e; return { souls: Math.round(20 * (e + 1) * (1 + it.g * .5)), steel: 2 + e * 2, crystal: e >= 5 ? e - 4 : 0 }; }
export function dismantleYield(it) { const b = [[2, 0], [4, 0], [8, 1], [12, 3], [20, 8]][it.g]; return { steel: b[0] + it.e * 2, crystal: b[1] + Math.floor(it.e / 3) }; }
export const RECIPES = [
  { k: 'basic', n: '기본 제작', cost: { souls: 30, steel: 15, crystal: 0 }, odds: [55, 32, 11, 2, 0] },
  { k: 'fine', n: '정교한 제작', cost: { souls: 80, steel: 40, crystal: 2 }, odds: [0, 50, 35, 13, 2] },
  { k: 'master', n: '명장의 제작', cost: { souls: 200, steel: 80, crystal: 8 }, odds: [0, 0, 50, 38, 12] }];
// 챕터 세트에서 정상 경로(상자·하드 상자·보스 드롭·스테이지·별 보상·대장간 세트 제작·도전 모드)로 나오는 등급 = 도감 완성 조건의 단일 기준.
// 모든 경로가 randomItem → chOdds(원본 확률, ch) 를 거치므로, 원본 확률표(상자 tier 1·최고 tier, 보스, 제작 레시피) 합집합에 chOdds 를 씌워 0 이 아닌 등급. (관리자 우편은 정상 경로 아님)
const SRC_ODDS = () => [chestOdds(1), chestOdds(99), bossOdds(0), ...RECIPES.map(R => R.odds)];
const OBT = {}; export const obtainableGrades = ch => OBT[ch] || (OBT[ch] = [0, 1, 2, 3, 4].filter(g => SRC_ODDS().some(o => (CHSET[ch] ? chOdds(o, +ch) : o)[g] > 0)));
export const gradeMask = ch => obtainableGrades(ch).reduce((m, g) => m | (1 << g), 0);
const afford = (s, c) => s.souls >= c.souls && s.mat.steel >= c.steel && s.mat.crystal >= c.crystal;
const pay = (s, c) => { s.souls -= c.souls; s.mat.steel -= c.steel; s.mat.crystal -= c.crystal; };
// 반환 [save, 결과]  결과: 'ok' | 'fail' | 'max' | 'poor' | 'none'
export function enhance(save, id, r = Math.random) { const it = save.inv.find(x => x.id === id); if (!it) return [save, 'none']; if (it.e >= MAXE) return [save, 'max']; const c = enhCost(it); if (!afford(save, c)) return [save, 'poor']; pay(save, c); if (r() * 100 < ENH_RATE[it.e]) { it.e++; return [save, 'ok']; } return [save, 'fail']; }
export function dismantle(save, ids) { const got = { steel: 0, crystal: 0 }; let n = 0; for (const id of ids) { const i = save.inv.findIndex(x => x.id === id); if (i < 0 || isEquipped(save, id) || save.inv[i].uq) continue; /* 고유는 분해 불가 */ const y = dismantleYield(save.inv[i]); got.steel += y.steel; got.crystal += y.crystal; save.inv.splice(i, 1); n++; } save.mat.steel += got.steel; save.mat.crystal += got.crystal; return [save, got, n]; }
// 제작: ch(클리어한 챕터)를 고르면 그 챕터 세트 (비용 +20%). ch 없으면 예전 그대로
export const SET_COST = 1.2;
export const craftCost = (R, ch) => (ch ? Object.fromEntries(Object.entries(R.cost).map(([k, v]) => [k, Math.ceil(v * SET_COST)])) : R.cost);
export function craft(save, recipe, slot, hero, r = Math.random, ch) { const R = RECIPES.find(x => x.k === recipe); if (!R) return [save, 'none']; if (save.inv.length >= CAP) return [save, 'full']; ch = CHSET[ch] ? +ch : undefined; const cost = craftCost(R, ch); if (!afford(save, cost)) return [save, 'poor']; pay(save, cost); const it = randomItem(hero, R.odds, r, slot, ch); save.inv.push(it); codexAdd(save, it); return [save, 'ok', it]; }
// 🎲 옵션 재설정 (2026-10-24, 강철만): 보조 옵션(종류+수치)을 makeItem 과 같은 규칙으로 다시 굴림 (챕터 세트면 그 챕터 가중치). 일반(보조 옵션 없음)·고유(표 고정)는 불가
export const REROLL_COST = [0, 25, 40, 60, 90]; // 등급별 강철
export const canReroll = it => !!(it && !it.uq && SUBN[it.g] > 0);
export const rerollCost = it => ({ steel: REROLL_COST[it.g] || 0 });
export function rollSubs(it, r = Math.random) { const C = it.c && CHSET[it.c] ? CHSET[it.c] : null, pool = Object.keys(SUBV).filter(k => k !== it.m[0]), out = [];
  for (let i = 0; i < SUBN[it.g]; i++) { const k = C ? pool.splice(pool.indexOf(wpick(pool, C.subW, r)), 1)[0] : pool.splice(Math.floor(r() * pool.length), 1)[0]; out.push([k, Math.round(SUBV[k] * (1 + .4 * it.g) * (.7 + r() * .6))]); }
  return out; }
// 굴리기 = 강철 소모 + 후보 반환 (아직 적용 안 함). 반환 [save, 'ok'|'poor'|'no'|'none', 후보 sub]
export function reroll(save, id, r = Math.random) { const it = save.inv.find(x => x.id === id); if (!it) return [save, 'none']; if (!canReroll(it)) return [save, 'no']; const c = rerollCost(it).steel;
  if ((save.mat.steel || 0) < c) return [save, 'poor']; save.mat.steel -= c; return [save, 'ok', rollSubs(it, r)]; }
// 후보 적용: 그 장비에 나올 수 있는 모양(개수·종류·범위)일 때만. 반환 [save, 성공]
export const subRange = (g, k) => [Math.round(SUBV[k] * (1 + .4 * g) * .7), Math.round(SUBV[k] * (1 + .4 * g) * 1.3)];
export function validSubs(it, sub) { if (!canReroll(it) || !Array.isArray(sub) || sub.length !== SUBN[it.g]) return false; const seen = new Set();
  return sub.every(p => Array.isArray(p) && p.length === 2 && Object.prototype.hasOwnProperty.call(SUBV, p[0]) && p[0] !== it.m[0] && !seen.has(p[0]) && seen.add(p[0]) && Number.isInteger(p[1]) && p[1] >= subRange(it.g, p[0])[0] && p[1] <= subRange(it.g, p[0])[1]); }
export function applySubs(save, id, sub) { const it = save.inv.find(x => x.id === id); if (!it || !validSubs(it, sub)) return [save, false]; it.sub = sub.map(p => [p[0], p[1]]); return [save, true]; }
// 각성 (고유 전용, 항상 성공): 고유 정수 + 영혼석. 반환 [save, 'ok'|'max'|'poor'|'none']
export const awakeCost = it => ({ essence: AWAKE_COST[it.a || 0], souls: AWAKE_SOULS[it.a || 0] });
export function awaken(save, id) { const it = save.inv.find(x => x.id === id); if (!it || !it.uq) return [save, 'none']; if ((it.a || 0) >= AWAKE_MAX) return [save, 'max']; const c = awakeCost(it);
  if ((save.mat.essence || 0) < c.essence || save.souls < c.souls) return [save, 'poor']; save.mat.essence -= c.essence; save.souls -= c.souls; it.a = (it.a || 0) + 1; return [save, 'ok']; }
// 고유 지급: 처음이면 상자(src 'unique') + uqLog 기록, 이미 있으면 고유 정수·마력석·영혼석으로 변환. 반환 결과 1개 { it, src, dup, y?, chest? }
export function grantUnique(save, k) { const it = makeUnique(k); if (!it) return null; if (!save.uqLog) save.uqLog = {}; if (!save.uqPity) save.uqPity = {};
  if (ownsUnique(save, k)) { const y = { ...UQ_DUP }; save.mat.essence = (save.mat.essence || 0) + y.essence; save.mat.crystal += y.crystal; save.souls = (save.souls || 0) + y.souls; if (save.stats) save.stats.souls = (save.stats.souls || 0) + y.souls; save.uqLog[k] = 1; return { it, src: 'unique', dup: true, auto: false, y }; }
  save.uqLog[k] = 1; delete save.uqPity[k]; return { ...addChests(save, [{ it, src: 'unique' }])[0], dup: false }; }
// ---------- 도감 (챕터 장비) ---------- codex = { '1': { archer: 등급 비트(0..31), armor, acc, ... } }
export const codexRow = it => (it.s === 'weapon' ? it.h : it.s);
export function codexAdd(save, it) { if (!it || it.uq || !CHSET[it.c]) return; const C = save.codex || (save.codex = {}), row = codexRow(it), o = C[it.c] || (C[it.c] = {}); o[row] = (o[row] || 0) | (1 << it.g); }
export function equip(save, hero, id) { const it = save.inv.find(x => x.id === id); if (!canEquip(it, hero)) return [save, false]; for (const h in save.eq) for (const sl in save.eq[h]) if (save.eq[h][sl] === id) delete save.eq[h][sl]; save.eq[hero] = { ...(save.eq[hero] || {}), [it.s]: id }; return [save, true]; }
export function unequip(save, hero, slot) { if (save.eq[hero]) delete save.eq[hero][slot]; return save; }

// ---------- 저장 정리/병합 ----------
const fin = (v, lo, hi, d = lo) => { v = Math.floor(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
// 무기 영웅 키 별칭 (직접 입력한 세이브 호환): 총/권총/로즈 → gunner 등
export const HERO_ALIAS = { gun: 'gunner', guns: 'gunner', pistol: 'gunner', rose: 'gunner', '총사': 'gunner', '로즈': 'gunner', bow: 'archer', '궁수': 'archer', staff: 'mage', '마법사': 'mage', sword: 'warrior', '전사': 'warrior', mech: 'mechanic', mecha: 'mechanic', robot: 'mechanic', drill: 'mechanic', wrench: 'mechanic', gauntlet: 'mechanic', budeul: 'mechanic', '메카닉': 'mechanic', '버들': 'mechanic', '정비공': 'mechanic', fighter: 'fighter', fist: 'fighter', brawler: 'fighter', seoyun: 'fighter', '격투가': 'fighter', '서윤': 'fighter', '진서윤': 'fighter' };
export const heroKey = h => { if (typeof h !== 'string') return h; const k = h.trim().toLowerCase(); return HERO_ALIAS[k] || k; }; // 대소문자·공백 무시
export function cleanItem(x, heroes) {
  if (x && typeof x === 'object' && (x.uq || (typeof x.id === 'string' && x.id.startsWith('u_')))) { // 고유: 표에서 재구성 (모르는 키는 버림 — 일반 전설로 강등하지 않음)
    const k = typeof x.uq === 'string' ? x.uq : String(x.id).slice(2); return UQ[k] ? makeUnique(k, fin(x.e, 0, MAXE), fin(x.a, 0, AWAKE_MAX)) : null; }
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !SLOT_KEYS.includes(x.s)) return null; const g = fin(x.g, 0, 4);
  const okStat = k => Object.prototype.hasOwnProperty.call(STAT, k), m = Array.isArray(x.m) && okStat(x.m[0]) ? [x.m[0], Math.max(0, Math.min(100, +x.m[1] || 0))] : null; if (!m) return null;
  const it = { id: x.id.slice(0, 16), s: x.s, g, n: String(x.n || '장비').slice(0, 24), m, sub: (Array.isArray(x.sub) ? x.sub : []).filter(p => Array.isArray(p) && okStat(p[0])).slice(0, 3).map(p => [p[0], Math.max(0, Math.min(100, +p[1] || 0))]), e: fin(x.e, 0, MAXE) };
  if (x.s === 'weapon') { const h = heroKey(x.h); if (!heroes.includes(h)) return null; it.h = h; const u = legendKey({ ...it, u: x.u }); if (u) it.u = u; } if (x.c) it.c = fin(x.c, 1, 9); return it;
}
export function cleanEquip(d, e, heroes) {
  const seen = new Set(), all = (Array.isArray(d.inv) ? d.inv : []).map(x => cleanItem(x, heroes)).filter(x => x && !seen.has(x.id) && seen.add(x.id)), keep = new Set(all.filter(x => !x.uq).slice(0, CAP + 20));
  e.inv = all.filter(x => x.uq || keep.has(x)); // CAP+20 자르기는 일반 장비만 (고유는 항상 유지)
  // 📦 창고 (2026-10-24): 문자열(서버 압축)·객체 둘 다 → cleanItem. 가방에 같은 id 가 있으면 가방 쪽만 (중복 없음). 넘친 가방 장비(CAP+20 초과)는 버리지 않고 창고로.
  // 창고 용량(storCap)은 '넣을 때'만 막음 — 병합으로 넘쳐도 잃지 않음. STOR_HARD 는 망가진 세이브 방어용 상한 (일반 장비만, 고유는 항상 유지)
  const seenS = new Set(e.inv.map(x => x.id)), stor = [...(Array.isArray(d.stor) ? d.stor : []).map(x => cleanItem(unpackItem(x), heroes)), ...all.filter(x => !x.uq && !keep.has(x))].filter(x => x && !seenS.has(x.id) && seenS.add(x.id)), keepS = new Set(stor.filter(x => !x.uq).slice(0, STOR_HARD));
  e.stor = stor.filter(x => x.uq || keepS.has(x)); const sx = fin(d.storX, 0, STOR_STEPS, 0); if (sx) e.storX = sx; // 확장 단계 (0이면 키 생략)
  const m = d.mat && typeof d.mat === 'object' ? d.mat : {}; e.mat = { steel: fin(m.steel, 0, 1e7, 0), crystal: fin(m.crystal, 0, 1e7, 0) }; const es = fin(m.essence, 0, 1e7, 0); if (es) e.mat.essence = es; // 고유 정수 (0이면 키 생략 → 옛 세이브 모양 그대로)
  e.eq = {}; const eq = d.eq && typeof d.eq === 'object' ? d.eq : {};
  for (const h of heroes) { e.eq[h] = {}; for (const sl of SLOT_KEYS) { const id = (eq[h] || {})[sl], it = e.inv.find(x => x.id === id); if (it && it.s === sl && canEquip(it, h) && !isEquipped(e, id)) e.eq[h][sl] = id; } }
  const seenC = new Set(), have = new Set(allItems(e).map(x => x.id)); e.chests = [];
  let nc = 0; for (const c of Array.isArray(d.chests) ? d.chests : []) { if (!c || typeof c !== 'object') continue; const it = cleanItem(c.it, heroes); if (!it || have.has(it.id)) continue; const id = 'c' + it.id; if (seenC.has(id)) continue; if (!it.uq && nc >= CHEST_CAP) continue; seenC.add(id);
    e.chests.push({ id, src: it.uq ? 'unique' : CHEST_SRC.includes(c.src) ? c.src : 'chest', it, souls: it.uq ? 0 : fin(c.souls, 0, 100, 0) }); if (!it.uq) nc++; }
  cleanUq(d, e); return e;
}
// 병합: 아이템은 id 기준 합집합(중복 없음), 장착은 기기(local) 우선 후 계정 값으로 빈 칸 채움, 재료는 큰 값
// 고유 기록·천장·도감 정리 (cleanEquip 에서 호출). uqLog = 표에 있는 키 ∪ 가방·상자의 고유(자가 치유), uqPity 키별 0..999(보유 키는 제거), codex 챕터×행×5비트 ∪ 가방의 챕터 장비, codexRw 알려진 키만
export const CODEX_ROWS = h => [...h, 'armor', 'acc'];
export function cleanUq(d, e) {
  const L = d.uqLog && typeof d.uqLog === 'object' ? d.uqLog : {}; e.uqLog = {}; for (const k in L) if (UQ[k] && L[k]) e.uqLog[k] = 1;
  for (const it of [...allItems(e), ...e.chests.map(c => c.it)]) if (it.uq) e.uqLog[it.uq] = 1;
  const Pt = d.uqPity && typeof d.uqPity === 'object' ? d.uqPity : {}; e.uqPity = {}; for (const k in Pt) if (UQ[k] && !e.uqLog[k]) { const v = fin(Pt[k], 0, 999, 0); if (v) e.uqPity[k] = v; }
  const C = d.codex && typeof d.codex === 'object' ? d.codex : {}; e.codex = {}; const rows = new Set(CODEX_ROWS(Object.keys(e.eq || {})));
  for (const ch of CH_KEYS) { const o = C[ch] && typeof C[ch] === 'object' ? C[ch] : {}; for (const r in o) if (rows.has(r)) { const v = fin(o[r], 0, 31, 0); if (v) (e.codex[ch] ||= {})[r] = v; } }
  for (const it of allItems(e)) codexAdd(e, it);
  e.codexRw = [...new Set((Array.isArray(d.codexRw) ? d.codexRw : []).filter(k => typeof k === 'string' && /^[1-9]:[a-z]+$/.test(k) && CHSET[k.split(':')[0]] && (k.split(':')[1] === 'all' || rows.has(k.split(':')[1]))))];
  return e;
}
export function mergeEquip(a, b, m, heroes) {
  // 가방·📦 창고: id 기준 합집합 (같은 고유는 강화·각성 큰 값). 한 장비는 한 곳에만 — 위치: 병합된 장착에 쓰이면 가방, 아니면 기기(a) 위치, 기기에 없으면 계정(b) 위치
  const eq = {}; for (const h of heroes) eq[h] = { ...(b.eq[h] || {}), ...(a.eq[h] || {}) };
  const aAll = allItems(a), aStor = new Set((a.stor || []).map(x => x.id)), bStor = new Set((b.stor || []).map(x => x.id)), eqd = new Set(); for (const h in eq) for (const sl in eq[h]) eqd.add(eq[h][sl]);
  const pool = [...allItems(b)].map(x => { const o = x.uq && aAll.find(y => y.id === x.id); return o ? { ...x, e: Math.max(x.e, o.e), a: Math.max(x.a || 0, o.a || 0) } : x; }), ids = new Set(pool.map(x => x.id)); for (const it of aAll) if (!ids.has(it.id)) { pool.push(it); ids.add(it.id); }
  const inStor = it => !eqd.has(it.id) && (aAll.some(y => y.id === it.id) ? aStor.has(it.id) : bStor.has(it.id)), inv = pool.filter(x => !inStor(x)), stor = pool.filter(inStor);
  const chests = [...(b.chests || [])]; for (const c of a.chests || []) if (!chests.some(x => x.id === c.id)) chests.push(c);
  const uqLog = { ...(a.uqLog || {}), ...(b.uqLog || {}) }, uqPity = {}; for (const k in { ...a.uqPity, ...b.uqPity }) uqPity[k] = Math.max((a.uqPity || {})[k] || 0, (b.uqPity || {})[k] || 0);
  const codex = {}; for (const c of [a.codex || {}, b.codex || {}]) for (const ch in c) for (const r in c[ch]) (codex[ch] ||= {})[r] = ((codex[ch] || {})[r] || 0) | c[ch][r];
  return cleanEquip({ inv, stor, storX: Math.max(fin(a.storX, 0, STOR_STEPS, 0), fin(b.storX, 0, STOR_STEPS, 0)), eq, chests, mat: { steel: Math.max(a.mat.steel, b.mat.steel), crystal: Math.max(a.mat.crystal, b.mat.crystal), essence: Math.max(a.mat.essence || 0, b.mat.essence || 0) }, uqLog, uqPity, codex, codexRw: [...(a.codexRw || []), ...(b.codexRw || [])] }, m, heroes);
}
