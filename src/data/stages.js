// 챕터 → 스테이지 → 웨이브 (순수 데이터/로직, node 테스트 가능)
// stage: { id, n, waves, core:[c,r], spawns:[[c,r]...], q:[풀,흙,숲 분위수], bed: 암반 확률, hp: 몬스터 체력 배수, seed, boss? }
export const CHAPTERS = [
  { id: 1, n: '1장 · 속삭이는 숲', short: '숲', theme: 'forest', prop: 'soft', propN: '부드러운 흙', propD: '흙·숲 블록이 무르게 파여요(체력 -25%). 굴착병이 자주 나타나요.', color: '#5ac86a', bg: 'linear-gradient(160deg,#1e4a2a,#0e2414)',
    stages: [
      { id: '1-1', n: '숲 입구', waves: 10, core: [22, 7], spawns: [[0, 8]], q: [.3, .65, .8], bed: .03, hp: .8, seed: 1101 },
      { id: '1-2', n: '이끼 골짜기', waves: 10, core: [22, 3], spawns: [[0, 12]], q: [.25, .6, .78], bed: .04, hp: .88, seed: 1202 },
      { id: '1-3', n: '두 갈래 길', waves: 12, core: [21, 8], spawns: [[0, 3], [0, 12]], q: [.25, .58, .78], bed: .04, hp: .9, seed: 1303 },
      { id: '1-4', n: '버섯 숲 한가운데', waves: 12, core: [12, 8], spawns: [[0, 8], [23, 8]], q: [.2, .55, .76], bed: .05, hp: .95, seed: 1404 },
      { id: '1-5', n: '고목의 언덕', waves: 14, core: [22, 12], spawns: [[0, 2], [9, 0]], q: [.2, .55, .74], bed: .05, hp: 1, seed: 1505 },
      { id: '1-6', n: '숲의 군주', waves: 15, core: [22, 8], spawns: [[0, 3], [0, 13], [11, 0]], q: [.2, .52, .72], bed: .05, hp: 1.05, seed: 1606, boss: true },
    ] },
  { id: 2, n: '2장 · 얼어붙은 설원', short: '설원', theme: 'snow', prop: 'ice', propN: '빙판', propD: '파인 길이 얼음이 되어 몬스터가 미끄러지듯 빨라져요(+30%). 돌격병이 자주 나타나요.', color: '#7ad0ff', bg: 'linear-gradient(160deg,#2a4a6a,#101e34)',
    stages: [
      { id: '2-1', n: '눈보라 고개', waves: 12, core: [22, 8], spawns: [[0, 8]], q: [.22, .55, .7], bed: .05, hp: 1.1, seed: 2101 },
      { id: '2-2', n: '얼음 호수', waves: 12, core: [22, 2], spawns: [[0, 13], [10, 15]], q: [.2, .52, .7], bed: .06, hp: 1.15, seed: 2202 },
      { id: '2-3', n: '서리 협곡', waves: 14, core: [12, 7], spawns: [[0, 2], [23, 13]], q: [.18, .5, .66], bed: .06, hp: 1.2, seed: 2303 },
      // 2026-10-21 추가 (id 2-5·2-6 = 새 스테이지, 보스 앞에 배치 · 화면 번호는 순서로 2-4·2-5, 보스는 2-6 으로 표시 — 저장 호환: 기존 id 그대로)
      { id: '2-5', n: '얼음 동굴', waves: 14, core: [2, 8], spawns: [[23, 2], [23, 14]], q: [.18, .5, .66], bed: .06, hp: 1.24, seed: 2505 },
      { id: '2-6', n: '눈사태 능선', waves: 15, core: [12, 14], spawns: [[0, 1], [23, 1], [12, 0]], q: [.18, .5, .66], bed: .06, hp: 1.27, seed: 2606 },
      { id: '2-4', n: '빙결의 군주', waves: 15, core: [22, 8], spawns: [[0, 2], [0, 14], [12, 15]], q: [.18, .5, .66], bed: .06, hp: 1.3, seed: 2404, boss: true },
    ] },
  { id: 3, n: '3장 · 불타는 화산', short: '화산', theme: 'volcano', prop: 'lava', propN: '용암 강', propD: '흐르는 용암은 아무도 건널 수 없어요(타워 건설·굴착 불가). 몬스터는 용암 사이 틈으로 몰려요. 자폭병·공성병이 많아요.', color: '#ff7a3a', bg: 'linear-gradient(160deg,#5a1e10,#200806)',
    // lava: 용암 강 (꺾은선 [c,r] 목록, 칸 단위로 칠함). 포털·코어 주변 1칸은 항상 비움. 끊긴 곳 = 건널 수 있는 틈
    stages: [
      { id: '3-1', n: '잿빛 산기슭', waves: 12, core: [22, 8], spawns: [[0, 5]], q: [.2, .5, .66], bed: .03, hp: 1.4, seed: 3101,
        lava: [[[10, 0], [11, 4]], [[12, 7], [11, 11]], [[11, 13], [12, 15]]] },
      { id: '3-2', n: '용암 강', waves: 13, core: [22, 3], spawns: [[0, 12], [6, 15]], q: [.18, .48, .64], bed: .03, hp: 1.48, seed: 3202,
        lava: [[[3, 0], [8, 5]], [[10, 6], [15, 9]], [[17, 10], [20, 11], [23, 12]], [[13, 0], [14, 3]]] },
      { id: '3-3', n: '불꽃 협곡', waves: 14, core: [12, 8], spawns: [[0, 2], [23, 13]], q: [.18, .48, .64], bed: .03, hp: 1.56, seed: 3303,
        lava: [[[3, 4], [7, 4]], [[10, 4], [20, 4]], [[3, 12], [13, 12]], [[16, 12], [20, 12]], [[20, 5], [20, 7]], [[3, 9], [3, 11]]] },
      { id: '3-5', n: '흑요석 계곡', waves: 14, core: [2, 3], spawns: [[23, 13], [17, 0]], q: [.17, .47, .63], bed: .03, hp: 1.6, seed: 3505,
        lava: [[[7, 0], [7, 11]], [[13, 4], [13, 15]], [[19, 6], [19, 15]]] }, // 뱀처럼 굽은 세 줄기: 틈이 아래-위-위로 번갈아
      { id: '3-6', n: '분화구 가장자리', waves: 15, core: [21, 13], spawns: [[0, 0], [0, 9], [12, 0]], q: [.16, .46, .62], bed: .03, hp: 1.63, seed: 3606,
        lava: [[[15, 9], [17, 9]], [[20, 9], [23, 9]], [[15, 10], [15, 11]], [[15, 14], [15, 15]], [[3, 4], [8, 9]], [[7, 1], [10, 4]]] }, // 분화구(코어) 둘레 고리 + 비스듬한 두 줄기
      { id: '3-4', n: '화염의 군주', waves: 15, core: [22, 8], spawns: [[0, 2], [0, 14], [12, 15]], q: [.16, .46, .62], bed: .03, hp: 1.65, seed: 3404, boss: true,
        lava: [[[17, 1], [17, 5]], [[17, 11], [17, 14]], [[7, 6], [9, 7]], [[6, 10], [8, 10]], [[12, 0], [12, 3]]] },
    ] },
  { id: 4, n: '4장 · 잊혀진 폐허', short: '폐허', theme: 'ruins', prop: 'walls', propN: '무너진 성벽', propD: '이끼 낀 고대 성벽이 길을 막아요(바위보다 1.6배 단단함). 성벽이 무너지면 길이 바뀌어요. 하늘을 나는 망령·석상 가고일이 많아요.', color: '#c0a0ff', bg: 'linear-gradient(160deg,#3a2a50,#140c20)',
    // walls: 고대 성벽 (꺾은선 [c,r] 목록, 칸 단위 = 단단한 바위 칸, 무너뜨릴 수 있음). 포털·코어 주변 1칸은 항상 비움. 끊긴 곳 = 무너진 성문(틈)
    stages: [
      { id: '4-1', n: '무너진 성문', waves: 13, core: [22, 8], spawns: [[0, 4], [0, 12]], q: [.2, .5, .66], bed: .04, hp: 1.75, seed: 4101,
        walls: [[[9, 0], [9, 6]], [[9, 9], [9, 15]], [[15, 2], [15, 13]]] },
      { id: '4-2', n: '이끼 낀 회랑', waves: 14, core: [22, 13], spawns: [[0, 2], [8, 0], [0, 10]], q: [.18, .48, .64], bed: .04, hp: 1.85, seed: 4202,
        walls: [[[4, 5], [16, 5]], [[19, 5], [21, 5]], [[6, 10], [18, 10]], [[12, 10], [12, 14]]] },
      { id: '4-3', n: '망령의 신전', waves: 15, core: [12, 8], spawns: [[0, 2], [23, 2], [0, 14], [23, 14]], q: [.18, .46, .62], bed: .04, hp: 1.95, seed: 4303,
        walls: [[[7, 4], [10, 4]], [[14, 4], [17, 4]], [[7, 12], [10, 12]], [[14, 12], [17, 12]], [[7, 5], [7, 6]], [[17, 10], [17, 11]], [[7, 10], [7, 11]], [[17, 5], [17, 6]]] },
      { id: '4-5', n: '부서진 감시탑', waves: 15, core: [12, 1], spawns: [[0, 8], [23, 8], [0, 15], [23, 15]], q: [.17, .46, .61], bed: .04, hp: 1.99, seed: 4505,
        walls: [[[3, 5], [9, 5]], [[14, 5], [20, 5]], [[0, 11], [7, 11]], [[10, 11], [14, 11]], [[17, 11], [23, 11]], [[12, 12], [12, 15]]] }, // 탑을 둘러싼 두 겹 성벽, 성문은 가운데·양옆
      { id: '4-6', n: '봉인된 지하묘지', waves: 15, core: [1, 8], spawns: [[23, 0], [23, 15], [12, 0], [12, 15]], q: [.16, .45, .6], bed: .04, hp: 2.02, seed: 4606,
        walls: [[[5, 0], [5, 6]], [[5, 10], [5, 15]], [[9, 3], [9, 12]], [[16, 0], [16, 5]], [[16, 8], [16, 15]], [[20, 4], [20, 11]]] }, // 세로 성벽 네 겹, 성문이 번갈아
      { id: '4-4', n: '망국의 왕좌', waves: 15, core: [22, 8], spawns: [[0, 1], [0, 8], [0, 15], [11, 15]], q: [.16, .45, .6], bed: .04, hp: 2.05, seed: 4404, boss: true,
        walls: [[[6, 3], [6, 6]], [[6, 10], [6, 13]], [[13, 0], [13, 5]], [[13, 9], [13, 12]], [[18, 4], [18, 12]]] },
    ] },
];
// 화면에 보이는 번호 = 챕터 안 순서 (id 는 저장 키라 바뀌지 않음: 2026-10-21 에 2~4장 보스 앞에 x-5·x-6 을 끼워 넣어 보스 id x-4 는 'x-6' 으로 표시)
for (const ch of CHAPTERS) ch.stages.forEach((s, i) => { s.no = `${ch.id}-${i + 1}`; });
export const STAGES = Object.fromEntries(CHAPTERS.flatMap(ch => ch.stages.map((s, i) => [s.id, { ...s, ch: ch.id, idx: i, last: i === ch.stages.length - 1 }])));
export const STAR_D = ['스테이지 클리어', '코어 체력 70% 이상 유지', '코어 피해 없이 클리어'];
export function starsFor(coreHp, coreMax) { const r = coreMax ? coreHp / coreMax : 0; return 1 + (r >= .7 ? 1 : 0) + (r >= 1 ? 1 : 0); }
export const stageNo = id => (STAGES[id] && STAGES[id].no) || String(id);
export const stars = (save, id) => (save.st || {})[id] || 0;
export const totalStars = save => Object.values(save.st || {}).reduce((a, b) => a + b, 0);
export const chapterStars = (save, ch) => CHAPTERS.find(c => c.id === ch).stages.reduce((a, s) => a + stars(save, s.id), 0);
export function chapterUnlocked(save, ch) { const C = CHAPTERS.find(c => c.id === ch); if (!C || C.soon || !C.stages.length) return false; if (ch === 1) return true; const P = CHAPTERS.find(c => c.id === ch - 1); return !!P && P.stages.length > 0 && stars(save, P.stages[P.stages.length - 1].id) > 0; }
// 이미 깬 스테이지는 항상 열림 (보스를 깬 기존 저장: 새로 끼운 앞 스테이지를 안 깼어도 보스·다음 장이 다시 잠기지 않음)
export function stageUnlocked(save, id) { const S = STAGES[id]; if (!S || !chapterUnlocked(save, S.ch)) return false; if (S.idx === 0 || stars(save, id) > 0) return true; const C = CHAPTERS.find(c => c.id === S.ch); return stars(save, C.stages[S.idx - 1].id) > 0; }
export const STAR_STEP = 5; // 별 5개마다 별 보상 상자
export const stageReward = (id, first) => { const S = STAGES[id]; const base = 40 + S.idx * 15 + (S.ch - 1) * 60 + (S.boss ? 60 : 0); return first ? base : Math.round(base / 2); };
// ---------- 하드 모드 (2026-10-21, docs/HARD_2026-10-21.md) ----------  저장: save.hst = { id: 별 } (노말 st 와 따로, 같은 id)
// 해금: 그 챕터의 노말 보스를 깨면 그 챕터 하드 1번 스테이지가 열림 → 하드 안에서는 노말처럼 순서대로 (이미 깬 하드 스테이지는 항상 열림)
export const HARD = { hp: 2.2, hpCh: { 1: 2.2, 2: 2.05, 3: 1.9, 4: 1.75 }, hpRamp: [.73, .82, .91], dmg: 1.5, towerDmg: 1.25, spd: 1.1, bossHp: 1.3, bossCd: .8, eliteFrom: 3, eliteMax: 4, eliteHp: 2.5, eliteScale: 1.25, eliteGold: 3, eliteCore: 1, waveGold: 1.3, killGold: 1.25, startGold: 120, souls: 2, tierUp: 2, uqDrop: 3, pityStep: 2, eliteSouls: 2, eliteSoulsMax: 120 };
// 하드 체력 배수 (스테이지 체력 위에 곱함): 챕터별 HARD.hpCh (뒤 챕터는 스테이지 체력이 이미 높아 조금 낮춤), 1~3웨이브는 hpRamp 로 낮게 시작(시작 골드로 타워가 적을 때)
export const hardHp = (n, ch = 1) => (HARD.hpCh[ch] ?? HARD.hp) * (HARD.hpRamp[n - 1] ?? 1);
export const hstars = (save, id) => (save.hst || {})[id] || 0;
export const hardTotalStars = save => Object.values(save.hst || {}).reduce((a, b) => a + b, 0);
export const hardChapterStars = (save, ch) => CHAPTERS.find(c => c.id === ch).stages.reduce((a, s) => a + hstars(save, s.id), 0);
const bossOf = ch => { const C = CHAPTERS.find(c => c.id === ch); return C && C.stages.length ? C.stages[C.stages.length - 1] : null; };
export function hardChapterUnlocked(save, ch) { const B = bossOf(ch); return !!B && chapterUnlocked(save, ch) && stars(save, B.id) > 0; }
export const hardChapterCleared = (save, ch) => { const B = bossOf(ch); return !!B && hstars(save, B.id) > 0; }; // 하드 보스 클리어 = 챕터 하드 정복 배지
export function hardUnlocked(save, id) { const S = STAGES[id]; if (!S || !hardChapterUnlocked(save, S.ch)) return false; if (S.idx === 0 || hstars(save, id) > 0) return true; const C = CHAPTERS.find(c => c.id === S.ch); return hstars(save, C.stages[S.idx - 1].id) > 0; }
// Q-6 (2026-10-23): 결과 화면 '다음 스테이지' — 같은 장 다음 칸, 장 마지막이면 다음 장 첫 칸. 열려 있을 때만 (하드는 하드 해금 기준), 없으면 null
export function nextStage(save, id, hard = false) { const ids = CHAPTERS.flatMap(c => c.stages.map(s => s.id)), i = ids.indexOf(id), n = i >= 0 ? ids[i + 1] : undefined; if (n == null) return null; return (hard ? hardUnlocked(save, n) : stageUnlocked(save, n)) ? n : null; }
export const hardLockText = ch => `🔒 노말 ${stageNo(bossOf(ch) ? bossOf(ch).id : '')} 보스를 처치하면 하드가 열려요`;
// 스테이지 보상 영혼석: 하드 = 노말의 HARD.souls 배 (첫 클리어·재도전 모두)
export const stageRewardH = (id, first, hard) => stageReward(id, first) * (hard ? HARD.souls : 1);
// 폐허: 고대 성벽 칸 목록 (용암과 같은 꺾은선 규칙)
export const wallTiles = (S, GW = 24, GH = 16) => lavaTiles(S, GW, GH, 'walls');
// 용암 강 칸 목록 (꺾은선 → 칸, 포털·코어 주변 1칸 제외). 순수 함수: 렌더/경로/테스트 공용
export function lavaTiles(S, GW = 24, GH = 16, key = 'lava') {
  const out = new Set(); if (!S || !S[key]) return out; const near = (c, r) => [S.core, ...S.spawns].some(p => Math.abs(c - p[0]) <= 1 && Math.abs(r - p[1]) <= 1);
  for (const line of S[key]) for (let i = 0; i < line.length; i++) { const a = line[i], b = line[Math.min(i + 1, line.length - 1)], n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1);
    let pc = null, pr = null; const add = (c, r) => { if (c >= 0 && r >= 0 && c < GW && r < GH && !near(c, r)) out.add(c + ',' + r); };
    for (let k = 0; k <= n; k++) { const c = Math.round(a[0] + (b[0] - a[0]) * k / n), r = Math.round(a[1] + (b[1] - a[1]) * k / n); if (pc !== null && c !== pc && r !== pr) add(c, pr); add(c, r); pc = c; pr = r; } } // 대각선 이음새도 채움(4방향으로 새지 않게)
  return out;
}
