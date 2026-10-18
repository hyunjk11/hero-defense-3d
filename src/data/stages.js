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
      { id: '2-4', n: '빙결의 군주', waves: 15, core: [22, 8], spawns: [[0, 2], [0, 14], [12, 15]], q: [.18, .5, .66], bed: .06, hp: 1.3, seed: 2404, boss: true },
    ] },
  { id: 3, n: '3장 · 불타는 화산', short: '화산', theme: 'volcano', prop: 'lava', propN: '용암', propD: '용암 지대를 피해 다녀요. 자폭병이 많아요.', color: '#ff7a3a', bg: 'linear-gradient(160deg,#5a1e10,#200806)', soon: true, stages: [] },
  { id: 4, n: '4장 · 잊혀진 폐허', short: '폐허', theme: 'ruins', prop: 'collapse', propN: '무너지는 벽', propD: '벽이 무너지며 길이 바뀌어요.', color: '#c0a0ff', bg: 'linear-gradient(160deg,#3a2a50,#140c20)', soon: true, stages: [] },
];
export const STAGES = Object.fromEntries(CHAPTERS.flatMap(ch => ch.stages.map((s, i) => [s.id, { ...s, ch: ch.id, idx: i, last: i === ch.stages.length - 1 }])));
export const chapterOf = id => CHAPTERS.find(c => c.id === STAGES[id]?.ch);
export const STAR_D = ['스테이지 클리어', '코어 체력 70% 이상 유지', '코어 피해 없이 클리어'];
export function starsFor(coreHp, coreMax) { const r = coreMax ? coreHp / coreMax : 0; return 1 + (r >= .7 ? 1 : 0) + (r >= 1 ? 1 : 0); }
export const stars = (save, id) => (save.st || {})[id] || 0;
export const totalStars = save => Object.values(save.st || {}).reduce((a, b) => a + b, 0);
export const chapterStars = (save, ch) => CHAPTERS.find(c => c.id === ch).stages.reduce((a, s) => a + stars(save, s.id), 0);
export function chapterUnlocked(save, ch) { const C = CHAPTERS.find(c => c.id === ch); if (!C || C.soon || !C.stages.length) return false; if (ch === 1) return true; const P = CHAPTERS.find(c => c.id === ch - 1); return !!P && P.stages.length > 0 && stars(save, P.stages[P.stages.length - 1].id) > 0; }
export function stageUnlocked(save, id) { const S = STAGES[id]; if (!S || !chapterUnlocked(save, S.ch)) return false; if (S.idx === 0) return true; const C = CHAPTERS.find(c => c.id === S.ch); return stars(save, C.stages[S.idx - 1].id) > 0; }
export const STAR_STEP = 5; // 별 5개마다 별 보상 상자
export const stageReward = (id, first) => { const S = STAGES[id]; const base = 40 + S.idx * 15 + (S.ch - 1) * 60 + (S.boss ? 60 : 0); return first ? base : Math.round(base / 2); };
export const PREFIX = { 1: '숲의 ', 2: '서리 ', 3: '화염 ', 4: '폐허의 ' };
