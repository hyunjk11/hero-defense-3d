// core/nav.js navQuery: 모드 키만 바꾸고 다른 키는 유지
import { navQuery, MODE_KEYS } from '../src/core/nav.js';
let fail = 0; const ok = (n, c, d = '') => { console.log((c ? 'OK ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) fail = 1; };
const P = s => Object.fromEntries(new URLSearchParams(s));
ok('keys', MODE_KEYS.join() === 'town,stage,run,hard,dungeon');
let r = P(navQuery('?town=1&rng=7&sb=mock', { stage: 's3', hard: true }));
ok('stage_hard', r.stage === 's3' && r.run === '1' && r.hard === '1' && !r.town && r.rng === '7' && r.sb === 'mock', JSON.stringify(r));
r = P(navQuery('?town=1&hard=1', { stage: 's1' })); ok('stage_normal_clears_hard', r.stage === 's1' && !r.hard && !r.town, JSON.stringify(r));
r = P(navQuery('?stage=s2&run=1&hard=1&rng=3', { town: 1 })); ok('town', r.town === '1' && !r.stage && !r.run && !r.hard && r.rng === '3', JSON.stringify(r));
r = P(navQuery('?dungeon=1&run=1&seed=9', { town: 1 })); ok('town_from_dungeon', r.town === '1' && !r.dungeon && !r.run && r.seed === '9', JSON.stringify(r));
r = P(navQuery('?town=1&stage=s1&hard=1', { dungeon: 1 })); ok('dungeon', r.dungeon === '1' && r.run === '1' && !r.town && !r.stage && !r.hard, JSON.stringify(r));
process.exit(fail);
