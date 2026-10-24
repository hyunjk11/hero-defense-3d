// 전직(클래스 전직) 데이터 · 순수 함수 (DOM/three 없음 → node 테스트). 설계: design/items_plan.md 7절
// ADV[영웅][분기] = { n 칭호, icon, c CSS색, col 투사체/오라 색, d 설명, mod 스탯 배수(armor·aoe 는 설정값), atk 기본 공격 변형, skill Q 키, sk Q 이름, sd Q 설명, tower 타워 보너스(연구와 곱), td 타워 보너스 설명, ws 무기 스케일 }
// 수치는 '두 분기 기본 DPS 차이 10% 이내'(advDps) 기준으로 맞춤 — tests/advance.test.mjs 가 검사
import { CLASSES, HERO_KEYS, isHidden } from './heroes.js';
import * as ST from './stages.js';
export const ADV = {
  archer: {
    wind: { n: '바람의 순찰자', icon: '🍃', c: '#9affe0', col: 0x9affe0, d: '공격속도 ×1.25 · 피해 ×0.9 · 기본 공격 대상 2명(두 번째 70%) — 다수 처리', mod: { rate: 1.25, dmg: .9 }, atk: { targets: 2, k2: .7 },
      skill: 'storm', sk: '폭풍 화살비', sd: '반경 4.2→5.5 · 화살 36→48 · 맞은 적 1초 30% 둔화', tower: { arrow: { rate: 1.06, br: { multi: { targets: 1 } } } }, td: '화살 타워 공속 +6% · 연발 사수 대상 +1', ws: 1 },
    hawk: { n: '매의 눈 저격수', icon: '🦅', c: '#ffd86a', col: 0xffd86a, d: '사거리 ×1.3 · 피해 ×1.7 · 공격속도 ×0.65 · 체력 높은 적(보스) 우선 + 방어 무시', mod: { range: 1.3, dmg: 1.7, rate: .65 }, atk: { prio: 'hp', ap: true },
      skill: 'snipe', sk: '일섬 저격', sd: '화살비 대신 직선 관통 600% 한 발 (방어 무시)', tower: { arrow: { rng: 1.05, br: { snipe: { dmg: 1.1 } } } }, td: '저격수 타워 피해 +10% · 화살 타워 사거리 +5%', ws: 1.1 },
  },
  mage: {
    flame: { n: '업화의 대마도사', icon: '🔥', c: '#ff9a4a', col: 0xff8a3a, d: '폭발 범위 2→3 · 피해 ×0.95 · 착탄 지점 1.5초 불꽃(초당 15%)', mod: { aoe: 3, dmg: .95 }, atk: { burn: { t: 1.5, k: .15, r: 1.6 } },
      skill: 'meteors', sk: '유성우', sd: '메테오 1개(×16) → 3개(각 ×7, 0.3초 간격, 반경 3 산포)', tower: { cannon: { splash: 1.08 } }, td: '대포 타워 폭발 반경 +8%', ws: 1.1 },
    frost: { n: '서리 마녀', icon: '❄️', c: '#8ae8ff', col: 0x8ae8ff, d: '공격마다 1.5초 30% 둔화 · 5번째 공격마다 0.8초 빙결(보스 0.3초) · 공격속도 ×1.1', mod: { rate: 1.1 }, atk: { slow: .3, slowT: 1.5, freezeEvery: 5, freezeT: .8, freezeBoss: .3 },
      skill: 'glacier', sk: '빙하 낙하', sd: '얼음 혜성 ×12 + 반경 5 적 2초 빙결(보스 0.5초)', tower: { magic: { slowAdd: .1, br: { frost: { freezeEvery: 3 } } } }, td: '마법 타워 둔화 +10%p · 서리 결정 빙결 주기 4→3', ws: 1.1 },
  },
  warrior: {
    paladin: { n: '성기사', icon: '🛡️', c: '#ffe9a0', col: 0xffe9a0, d: '체력 ×1.25 · 방어 .40→.55 · 피격 시 10% 확률 주변 적 0.5초 기절(내부 쿨 2초)', mod: { hp: 1.25, armor: .55 }, atk: { stunCh: .1, stunT: .5, stunCd: 2, stunR: 3 },
      skill: 'sanct', sk: '성역', sd: '4초 성역(반경 3.5): 적 40% 둔화 + 0.5초마다 공격력 50% · 영웅 초당 3% 회복', tower: { bar: 1.15 }, td: '바리케이드 체력 +15%', ws: 1.1 },
    berserk: { n: '광전사', icon: '💢', c: '#ff5a5a', col: 0xff4a4a, d: '공격속도 ×1.3 · 피해 ×0.8 · 방어 .40→.25 · 피해의 4% 흡혈 · 체력 50% 이하 공격력 +20%', mod: { rate: 1.3, dmg: .8, armor: .25 }, atk: { leech: .04, lowHp: .5, lowAtk: 1.2 },
      skill: 'bloodspin', sk: '피의 회오리', sd: '지속 2.5→4초 · 회전 반경 +20% · 회전 중 이동 +30%', tower: { cannon: { dmg: 1.05 } }, td: '대포 타워 피해 +5%', ws: 1.2 },
  },
  gunner: {
    duel: { n: '장미 결투가', icon: '🌹', c: '#ff9ad0', col: 0xff9ad0, d: '공격속도 ×1.2 · 6번째 탄마다 도탄(3명, 각 50%) 확정 — 지속 화력', mod: { rate: 1.2 }, atk: { ricoEvery: 6, ricoN: 3, ricoK: .5 },
      skill: 'rose+', sk: '로즈 피니시+', sd: '지속 +40% · 탄 수 +30%', tower: { arrow: { rate: 1.05 } }, td: '화살 타워 공속 +5%', ws: 1 },
    // 2026-10-22 교체: 가시 장미 포격수(🥀 소폭발·장미 포탄) → 장미 저격수. 키 'thorn' 유지 = 기존 저장의 2차 전직이 비용 없이 그대로 새 분기가 됨
    // 느리지만 강한 소총: 관통(3명 100/70/50%) · 치명 +15% · 보스/정예 +20%. model/prop = 이 분기일 때만 지연 로딩하는 소총 모델(실패하면 쌍권총 모델)
    thorn: { n: '장미 저격수', icon: '🎯', c: '#c8174a', col: 0xc8174a, d: '공격속도 ×0.45 · 피해 ×2.5 · 사거리 ×1.4 · 소총 탄이 일직선 3명 관통(100/70/50%) · 치명타 확률 +15% · 보스/정예 피해 +20%', mod: { rate: .45, dmg: 2.5, range: 1.4 }, atk: { pierce: [1, .7, .5], pierceW: .75, crit: 15, bossK: 1.2 },
      skill: 'pierceshot', sk: '관통 저격', sd: '0.6초 조준 → 직선 위 모든 적(보스 포함)에게 600% 관통 저격', tower: { arrow: { rng: 1.08 } }, td: '화살 타워 사거리 +8%', ws: 1, model: 'rose_rifle_meshy', prop: 'rose_rifle_gun' },
  },
  // 서윤(2026-10-24, 기획 /workspace/plans/SEOYUN_ADV_2026-10-23.md): 권법 특화 vs 기공술 특화. 동작 = heroes/fighter.js (ftOpt 로 전직 수치를 읽음 — FT 전역 상수는 불변)
  // atk: fin 3타 완성 뒤 다음 유효 근접 타격 추가 피해 · leech 콤보 피해 회복 비율 · leechCap 콤보 1회 회복 상한(최대 체력 비율) / jpFull 완전 충전 시간 · jpFullMul 완전 장풍 배수 · jpWMul 판정 폭 배수 · jpSlow/jpSlowT 장풍 둔화
  fighter: {
    tiger: { n: '백호권성', icon: '🐯', c: '#ff6a3d', col: 0xff6a3d, d: '공격속도 ×1.2 · 피해 ×0.9 · 3연타 완성 뒤 다음 근접 타격 +35% · 콤보 피해의 2% 회복(콤보당 최대 체력 2%까지) — 붙어서 몰아치는 권법', mod: { dmg: .9, rate: 1.2 }, atk: { fin: .35, leech: .02, leechCap: .02 },
      skill: 'tigerquake', sk: '백호진천권', sd: '제자리에서 기를 모아 땅을 내려침 → 땅이 폭발해 주변(반경 4.6) 500% + 0.8초 기절(보스 제외) → 충격파가 7.5 까지 퍼지며 200% · 백호의 기운 · 시전 중 받는 피해 -30%', tower: { arrow: { rate: 1.05 } }, td: '화살 타워 공격속도 +5%', ws: 1 },
    dragon: { n: '천기권사', icon: '🐉', c: '#65dfff', col: 0x65dfff, d: '피해 ×1.2 · 공격속도 ×0.9 · 장풍 완전 충전 1.2→0.8초 · 완전 장풍 250→300% · 판정 폭 +20% · 장풍 맞은 적 1초 20% 둔화 — 대열을 꿰뚫는 기공', mod: { dmg: 1.2, rate: .9 }, atk: { jpFull: .8, jpFullMul: 3, jpWMul: 1.2, jpSlow: .2, jpSlowT: 1 },
      skill: 'dragonwave', sk: '천룡파', sd: '거대한 푸른 용이 적을 쫓아 날아감(비행 24 · 폭 3.8 · 가까운 적 자동 추적) 관통 500% (적마다 1회) · 일반 적 1초 기절 / 보스 2초 25% 둔화', tower: { magic: { rng: 1.06 } }, td: '마법 타워 사거리 +6%', ws: 1 },
  },
  // 버들(숨김): 분기 예약만 — 숨김 해제 때 수치·스킬 확정 (reserved → 전직 탭·해금·적용 모두 제외)
  mechanic: {
    armor: { n: '중장 기갑', icon: '⚙️', c: '#7aff5a', col: 0x7aff5a, d: '(예약) 로봇 지속 +5초 · 흡수 +30%', mod: {}, atk: {}, skill: null, sk: '', sd: '', tower: {}, td: '', ws: 1, reserved: true },
    engineer: { n: '현장 공병', icon: '🔧', c: '#ffa04a', col: 0xffa04a, d: '(예약) 변신 대신 20초 임시 미니 화살 타워 2개', mod: {}, atk: {}, skill: null, sk: '', sd: '', tower: {}, td: '', ws: 1, reserved: true },
  },
};
for (const h in ADV) for (const b in ADV[h]) Object.assign(ADV[h][b], { h, k: b });
export const ADV_COST = { souls: 1500, crystal: 20, essence: 3 }, ADV_SWITCH = { souls: 500 };
export const ADV_LV = 10, ADV_TRIAL = 1, ADV_CH = 3; // 영구 강화 합 10 · 보스 스테이지 클리어 1회 · 3장 열림(= 2장 보스 id '2-4' 클리어, 화면 번호 2-6)
export const PERM_MAX = 10, PERM_MAX_ADV = 15;
export const ADV_HEROES = HERO_KEYS.filter(h => ADV[h] && !isHidden(h) && !Object.values(ADV[h]).some(x => x.reserved));
export const branchesOf = h => (ADV[h] ? Object.keys(ADV[h]) : []);
// 저장 기록 {b, n} → ADV 항목 (없거나 예약/숨김이면 null)
export function advOf(h, rec) { const b = rec && (typeof rec === 'string' ? rec : rec.b), A = ADV[h] && ADV[h][b]; return A && !A.reserved && !isHidden(h) ? A : null; }
export const advTitle = (h, rec) => { const A = advOf(h, rec); return A ? `${CLASSES[h].nm} · ${A.n}` : ''; };
// 스탯 적용 (기본 → 여신탑 → 전직 → 장비 순서에서 '전직'). A 없으면 C 그대로(같은 객체)
export function applyAdv(C, A) {
  if (!A || A.reserved) return C; const m = A.mod || {};
  const o = { ...C, hp: Math.round(C.hp * (m.hp || 1)), dmg: C.dmg * (m.dmg || 1), rate: C.rate * (m.rate || 1), range: C.range * (m.range || 1), adv: A, title: A.n, color: A.col };
  if (m.armor !== undefined) o.armor = m.armor; if (m.aoe !== undefined) o.aoe = m.aoe; if (A.sk) o.skill = A.sk; return o;
}
// 기본 DPS 감각 = 적 1명에게 내는 초당 피해 (그 적에게 남는 불꽃 · 전직 치명타 기대값(×1.5) 포함 · 두 번째 대상/도탄/관통/방어 무시/저체력/보스 추가 피해 같은 상황 효과 제외)
export const ADV_CRIT_X = 1.5;
export function advDps(h, b) { const C = b ? applyAdv(CLASSES[h], ADV[h][b]) : CLASSES[h], a = (b && ADV[h][b].atk) || {};
  let k = 1; if (a.burn) k += a.burn.t * a.burn.k; if (a.crit) k *= 1 + a.crit / 100 * (ADV_CRIT_X - 1); return C.dmg * C.rate * k; }
// 무리 DPS 감각 (적 n명이 영웅 앞에 모여 있을 때 초당 총피해): 도탄 = ricoEvery 발마다 (n-1)명까지 ricoK · 관통 = 뒤 대상이 사선(폭 0.75) 안에 들어오는 비율 line 만큼 추가
// line 기본 0.1 = 부채꼴 무리 실측(tests/rose_rifle.py --dps: 9명 부채꼴에서 관통 추가분 ≈ 0) · line 1 = 한 줄로 늘어선 행렬(관통이 빛나는 상황)
export function advSwarmDps(h, b, n = 6, line = .1) { const d = advDps(h, b), a = (b && ADV[h][b].atk) || {};
  if (a.ricoEvery) return d * (1 + Math.min(a.ricoN, n - 1) * a.ricoK / a.ricoEvery);
  if (a.pierce) return d * (1 + line * a.pierce.slice(1, n).reduce((x, y) => x + y, 0));
  if (a.targets) return d * (1 + Math.min(a.targets - 1, n - 1) * a.k2);
  return d; }
// 전직 전용 모델 (로즈 장미 저격수 = 소총 몸 + 소총 소품). 없으면 []
export const advModels = A => (A && A.model ? [A.model, ...(A.prop ? [A.prop] : [])] : []);
// 타워 보너스 (연구 resMods 결과에 곱). 출정 영웅의 분기만 — A 없으면 모두 1/0
export function advTowerMods(A, type) { const t = (A && A.tower && A.tower[type]) || {}; return { dmg: t.dmg || 1, rate: t.rate || 1, rng: t.rng || 1, splash: t.splash || 1, slowAdd: t.slowAdd || 0, br: t.br || {} }; }
export const advBarMul = A => (A && A.tower && A.tower.bar) || 1;
// 해금 조건 체크리스트 (UI ✓/✗) — 순서: 챕터 진행 → 영웅 숙련 → 전직 시련 → 재료
const lvSum = (s, h) => { const l = (s.heroLv || {})[h] || {}; return (l.hp || 0) + (l.atk || 0); };
export function advChecks(s, h) { const q = ((s.hq || {})[h]) || {}, m = s.mat || {}, nm = CLASSES[h] ? CLASSES[h].nm : h;
  return [
    { k: 'ch', ok: ST.chapterUnlocked(s, ADV_CH), t: `2장 보스(${ST.stageNo('2-4')}) 클리어` },
    { k: 'lv', ok: lvSum(s, h) >= ADV_LV, t: `${nm} 영구 강화 합 ${ADV_LV} (${Math.min(lvSum(s, h), ADV_LV)}/${ADV_LV})` },
    { k: 'trial', ok: (q.boss || 0) >= ADV_TRIAL, t: `전직 시련: ${nm}(으)로 보스 스테이지 클리어 (${Math.min(q.boss || 0, ADV_TRIAL)}/${ADV_TRIAL})` },
    { k: 'mat', ok: (s.souls || 0) >= ADV_COST.souls && (m.crystal || 0) >= ADV_COST.crystal && (m.essence || 0) >= ADV_COST.essence, t: `재료: 영혼석 ${ADV_COST.souls} · 마력석 ${ADV_COST.crystal} · 고유 정수 ${ADV_COST.essence}` },
  ]; }
// 전직 가능 여부: null = 가능, 아니면 사유 (resBlock 과 같은 모양). owned = 서버 소유권(hd3d_owned) 확인 결과 — 세이브는 믿지 않음
export function advBlock(s, h, b, owned = true) {
  if (!ADV[h] || isHidden(h) || !ADV_HEROES.includes(h)) return '전직할 수 없는 영웅'; if (!owned) return '영웅 미보유';
  if (b !== undefined && !advOf(h, b)) return '알 수 없는 분기';
  const cur = advOf(h, (s.adv || {})[h]);
  if (cur) { if (b === undefined) return '이미 전직함'; if (cur.k === b) return '현재 분기'; return (s.souls || 0) >= ADV_SWITCH.souls ? null : '영혼석 부족'; } // 재전직
  const L = advChecks(s, h), f = L.find(x => !x.ok); if (!f) return null;
  if (f.k === 'mat') { const m = s.mat || {}; return (s.souls || 0) < ADV_COST.souls ? '영혼석 부족' : (m.crystal || 0) < ADV_COST.crystal ? '마력석 부족' : '고유 정수 부족'; }
  return f.t;
}
// 여신탑 영구 강화 상한: 전직하면 그 영웅만 10 → 15
export const permMax = (s, h) => (advOf(h, ((s && s.adv) || {})[h]) ? PERM_MAX_ADV : PERM_MAX);
