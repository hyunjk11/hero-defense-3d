import { STAGES } from '../data/stages.js';
// ================= 기본 설정 =================
const GW = 24, GH = 16, S = 2, DIGK = 30;
const T = { GRASS: 0, CARVED: 1, DIRT: 2, FOREST: 3, ROCK: 4, BEDROCK: 5, SPAWN: 6, CORE: 7 };
const SPAWN = [0, 8], CORE = [22, 7];
// 스테이지 모드(?stage=1-3): 코어/포털 위치를 스테이지 설정으로 (없으면 기존 도전 모드 맵 그대로)
const STAGE = STAGES[new URLSearchParams(location.search).get('stage')] || null;
if (STAGE) { CORE[0] = STAGE.core[0]; CORE[1] = STAGE.core[1]; SPAWN[0] = STAGE.spawns[0][0]; SPAWN[1] = STAGE.spawns[0][1]; }
// 하드 모드 요청(?hard=1): 실제 적용(G.hard)은 출정 때 하드 해금 확인 후 (ui/flow.js startStageRun2)
const HARDQ = !!STAGE && new URLSearchParams(location.search).get('hard') === '1';
const SPAWNS = STAGE ? STAGE.spawns.map(s => s.slice()) : [SPAWN];
const tileX = c => (c - GW / 2 + .5) * S, tileZ = r => (r - GH / 2 + .5) * S;
const toTile = (x, z) => [Math.floor(x / S + GW / 2), Math.floor(z / S + GH / 2)];
const inGrid = (c, r) => c >= 0 && r >= 0 && c < GW && r < GH;
const isBlock = t => t === T.DIRT || t === T.FOREST || t === T.ROCK;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ================= 지형 메시 (인스턴스) =================
const NT = GW * GH;

export { STAGE, HARDQ, SPAWNS, GW, GH, S, DIGK, T, SPAWN, CORE, tileX, tileZ, toTile, inGrid, isBlock, DIRS, NT };
