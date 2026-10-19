// 장비 시스템 (순수 로직, DOM·네트워크 없음 → node 테스트 가능)
// item = { id, s: 'weapon'|'armor'|'acc', h?: 영웅(무기만), g: 등급 0..4, n: 이름, m: [스탯, 값], sub: [[스탯, 값]...], e: 강화 0..10 }
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
const NAMES = {
  archer: [['낡은 사냥 활', '참나무 활'], ['숲지기의 장궁', '바람결 활'], ['은월의 활', '매의 눈 장궁'], ['폭풍추적자', '별빛 사수의 활'], ['세계수의 활 이그드라', '태양궁 아폴리아']],
  mage: [['견습생 지팡이', '참나무 지팡이'], ['수정 지팡이', '불씨 지팡이'], ['비전의 홀', '서리꽃 지팡이'], ['심연의 지팡이', '성운의 홀'], ['대현자의 지팡이 아르카나', '별을 삼킨 홀']],
  warrior: [['녹슨 장검', '병사의 검'], ['기사의 장검', '강철 대검'], ['푸른 서약의 검', '사자심장 대검'], ['용살자의 대검', '폭군의 검'], ['성검 엑스칼리온', '파멸의 대검 라그나']],
  gunner: [['낡은 부싯돌 쌍권총', '견습 총사의 쌍권총'], ['은탄 쌍권총', '장미 문양 쌍권총'], ['황혼의 쌍권총', '가시덤불 쌍권총'], ['붉은 달 쌍권총', '폭풍의 쌍권총'], ['장미여왕의 쌍권총 로제아', '심홍의 쌍권총 블러디로즈']],
  mechanic: [['낡은 렌치 건틀릿', '견습 정비공의 건틀릿'], ['강철 드릴 건틀릿', '증기 해머 건틀릿'], ['초록불 파일벙커', '덩굴 드릴암'], ['광산왕의 굴착기', '천둥 해머 암'], ['버들의 개조암 그린기어', '대지분쇄 드릴 타이탄']],
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
};
export const LPOOL = { archer: ['multishot', 'pierce'], mage: ['frostorb', 'meteorstorm'], warrior: ['boomerang', 'quake'], gunner: ['ricochet', 'rosebarrage'], mechanic: ['overdrill', 'gigahammer'] };
const hashId = id => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
// 무기의 고유 스킬 키 (전설 무기가 아니면 null). 저장값이 없거나 잘못됐으면 id에서 결정적으로 배정 → 구 세이브 호환
export function legendKey(it) { if (!it || it.s !== 'weapon' || it.g !== 4 || !LPOOL[it.h]) return null; const P = LPOOL[it.h]; return P.includes(it.u) ? it.u : P[hashId(it.id) % P.length]; }
export function legendOf(save, hero) { const id = ((save.eq || {})[hero] || {}).weapon, it = (save.inv || []).find(x => x.id === id); return legendKey(it); }
export const MATS = { steel: '강철', crystal: '마력석' };
const rid = r => (Math.floor(r() * 2176782336)).toString(36).padStart(6, '0') + (Date.now() % 1296).toString(36);
const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];
export function rollGrade(w, r = Math.random) { const t = w.reduce((a, b) => a + b, 0); let x = r() * t; for (let i = 0; i < w.length; i++) { if ((x -= w[i]) < 0) return i; } return w.length - 1; }
export function makeItem(slot, hero, g, r = Math.random) {
  const s = SLOT_KEYS.includes(slot) ? slot : 'armor'; const it = { id: rid(r), s, g, e: 0, sub: [] };
  if (s === 'weapon') { it.h = hero; it.m = ['atk', MAIN.atk[g]]; it.n = pick(NAMES[hero][g], r); }
  else if (s === 'armor') { it.m = ['hp', MAIN.hp[g]]; it.n = pick(NAMES.armor[g], r); }
  else { const k = pick(ACC_MAIN, r); it.m = [k, MAIN[k][g]]; it.n = pick(NAMES.acc[g], r); }
  const pool = Object.keys(SUBV).filter(k => k !== it.m[0]);
  for (let i = 0; i < SUBN[g]; i++) { const k = pool.splice(Math.floor(r() * pool.length), 1)[0]; it.sub.push([k, Math.round(SUBV[k] * (1 + .4 * g) * (.7 + r() * .6))]); }
  const u = legendKey(it); if (u) it.u = u; // 난수 소비 없음 (기존 시드 결과 유지)
  return it;
}
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
export function randomItem(hero, odds, r = Math.random, slot) { return makeItem(slot || pick(SLOT_KEYS, r), hero, rollGrade(odds, r), r); }
export function chestsFor(wave, hero, r = Math.random) { const out = []; for (let w = 5; w <= wave; w += 5) out.push(randomItem(hero, chestOdds(w / 5), r)); return out; }
// 가방에 넣기 (가득 차면 자동 분해 → 재료). 반환: [save, 결과목록{it, auto}]
export function addItems(save, items) { const res = []; for (const it of items) { if (save.inv.length < CAP) { save.inv.push(it); res.push({ it, auto: false }); } else { const y = dismantleYield(it); for (const k in y) save.mat[k] += y[k]; res.push({ it, auto: true, y }); } } return res; }

// ---------- 대장간 ----------
export const ENH_RATE = [100, 95, 90, 80, 70, 60, 50, 40, 30, 25];
export function enhCost(it) { const e = it.e; return { souls: Math.round(20 * (e + 1) * (1 + it.g * .5)), steel: 2 + e * 2, crystal: e >= 5 ? e - 4 : 0 }; }
export function dismantleYield(it) { const b = [[2, 0], [4, 0], [8, 1], [12, 3], [20, 8]][it.g]; return { steel: b[0] + it.e * 2, crystal: b[1] + Math.floor(it.e / 3) }; }
export const RECIPES = [
  { k: 'basic', n: '기본 제작', cost: { souls: 30, steel: 15, crystal: 0 }, odds: [55, 32, 11, 2, 0] },
  { k: 'fine', n: '정교한 제작', cost: { souls: 80, steel: 40, crystal: 2 }, odds: [0, 50, 35, 13, 2] },
  { k: 'master', n: '명장의 제작', cost: { souls: 200, steel: 80, crystal: 8 }, odds: [0, 0, 50, 38, 12] }];
const afford = (s, c) => s.souls >= c.souls && s.mat.steel >= c.steel && s.mat.crystal >= c.crystal;
const pay = (s, c) => { s.souls -= c.souls; s.mat.steel -= c.steel; s.mat.crystal -= c.crystal; };
// 반환 [save, 결과]  결과: 'ok' | 'fail' | 'max' | 'poor' | 'none'
export function enhance(save, id, r = Math.random) { const it = save.inv.find(x => x.id === id); if (!it) return [save, 'none']; if (it.e >= MAXE) return [save, 'max']; const c = enhCost(it); if (!afford(save, c)) return [save, 'poor']; pay(save, c); if (r() * 100 < ENH_RATE[it.e]) { it.e++; return [save, 'ok']; } return [save, 'fail']; }
export function dismantle(save, ids) { const got = { steel: 0, crystal: 0 }; let n = 0; for (const id of ids) { const i = save.inv.findIndex(x => x.id === id); if (i < 0 || isEquipped(save, id)) continue; const y = dismantleYield(save.inv[i]); got.steel += y.steel; got.crystal += y.crystal; save.inv.splice(i, 1); n++; } save.mat.steel += got.steel; save.mat.crystal += got.crystal; return [save, got, n]; }
export function craft(save, recipe, slot, hero, r = Math.random) { const R = RECIPES.find(x => x.k === recipe); if (!R) return [save, 'none']; if (save.inv.length >= CAP) return [save, 'full']; if (!afford(save, R.cost)) return [save, 'poor']; pay(save, R.cost); const it = randomItem(hero, R.odds, r, slot); save.inv.push(it); return [save, 'ok', it]; }
export function equip(save, hero, id) { const it = save.inv.find(x => x.id === id); if (!canEquip(it, hero)) return [save, false]; for (const h in save.eq) for (const sl in save.eq[h]) if (save.eq[h][sl] === id) delete save.eq[h][sl]; save.eq[hero] = { ...(save.eq[hero] || {}), [it.s]: id }; return [save, true]; }
export function unequip(save, hero, slot) { if (save.eq[hero]) delete save.eq[hero][slot]; return save; }

// ---------- 저장 정리/병합 ----------
const fin = (v, lo, hi, d = lo) => { v = Math.floor(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
// 무기 영웅 키 별칭 (직접 입력한 세이브 호환): 총/권총/로즈 → gunner 등
export const HERO_ALIAS = { gun: 'gunner', guns: 'gunner', pistol: 'gunner', rose: 'gunner', '총사': 'gunner', '로즈': 'gunner', bow: 'archer', '궁수': 'archer', staff: 'mage', '마법사': 'mage', sword: 'warrior', '전사': 'warrior', mech: 'mechanic', mecha: 'mechanic', robot: 'mechanic', drill: 'mechanic', wrench: 'mechanic', gauntlet: 'mechanic', budeul: 'mechanic', '메카닉': 'mechanic', '버들': 'mechanic', '정비공': 'mechanic' };
export const heroKey = h => (typeof h === 'string' && HERO_ALIAS[h.trim().toLowerCase()]) || h;
export function cleanItem(x, heroes) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !SLOT_KEYS.includes(x.s)) return null; const g = fin(x.g, 0, 4);
  const okStat = k => Object.prototype.hasOwnProperty.call(STAT, k), m = Array.isArray(x.m) && okStat(x.m[0]) ? [x.m[0], Math.max(0, Math.min(100, +x.m[1] || 0))] : null; if (!m) return null;
  const it = { id: x.id.slice(0, 16), s: x.s, g, n: String(x.n || '장비').slice(0, 24), m, sub: (Array.isArray(x.sub) ? x.sub : []).filter(p => Array.isArray(p) && okStat(p[0])).slice(0, 3).map(p => [p[0], Math.max(0, Math.min(100, +p[1] || 0))]), e: fin(x.e, 0, MAXE) };
  if (x.s === 'weapon') { const h = heroKey(x.h); if (!heroes.includes(h)) return null; it.h = h; const u = legendKey({ ...it, u: x.u }); if (u) it.u = u; } if (x.c) it.c = fin(x.c, 1, 9); return it;
}
export function cleanEquip(d, e, heroes) {
  const seen = new Set(); e.inv = (Array.isArray(d.inv) ? d.inv : []).map(x => cleanItem(x, heroes)).filter(x => x && !seen.has(x.id) && seen.add(x.id)).slice(0, CAP + 20);
  const m = d.mat && typeof d.mat === 'object' ? d.mat : {}; e.mat = { steel: fin(m.steel, 0, 1e7, 0), crystal: fin(m.crystal, 0, 1e7, 0) };
  e.eq = {}; const eq = d.eq && typeof d.eq === 'object' ? d.eq : {};
  for (const h of heroes) { e.eq[h] = {}; for (const sl of SLOT_KEYS) { const id = (eq[h] || {})[sl], it = e.inv.find(x => x.id === id); if (it && it.s === sl && canEquip(it, h) && !isEquipped(e, id)) e.eq[h][sl] = id; } }
  return e;
}
// 병합: 아이템은 id 기준 합집합(중복 없음), 장착은 기기(local) 우선 후 계정 값으로 빈 칸 채움, 재료는 큰 값
export function mergeEquip(a, b, m, heroes) {
  const inv = [...b.inv]; for (const it of a.inv) if (!inv.some(x => x.id === it.id)) inv.push(it);
  const eq = {}; for (const h of heroes) eq[h] = { ...(b.eq[h] || {}), ...(a.eq[h] || {}) };
  return cleanEquip({ inv, eq, mat: { steel: Math.max(a.mat.steel, b.mat.steel), crystal: Math.max(a.mat.crystal, b.mat.crystal) } }, m, heroes);
}
