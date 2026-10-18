import { T } from '../core/grid.js';

const BLK = {
  [T.DIRT]: { n: '흙더미', hp: 140, clear: 10, deb: [0xa86a3a, 0x7a4a26, 0x8ccf5a] },
  [T.FOREST]: { n: '숲', hp: 240, clear: 20, deb: [0x7a4a26, 0x5cc05a, 0x3f9a48] },
  [T.ROCK]: { n: '바위', hp: 480, clear: 35, deb: [0xb8bed0, 0x8a90a6, 0x6a7088] },
};
const TNAME = { [T.GRASS]: '풀밭', [T.CARVED]: '파인 길', [T.BEDROCK]: '수정 암반', [T.SPAWN]: '몬스터 포털', [T.CORE]: '수정 코어' };

export { BLK, TNAME };
