// C-7: src 가 G 에 붙이는 모든 속성이 docs/G_REGISTRY.md 에 있어야 함 (새 훅은 먼저 레지스트리에 — node tests/gregistry.mjs --write)
import { scan, documented } from './gregistry.mjs';
let fail = 0; const ok = (n, c, d = '') => { console.log((c ? 'OK ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) fail = 1; };
const M = scan(), D = documented(), miss = [...M.keys()].filter(k => !D.has(k)), stale = [...D].filter(k => !M.has(k));
ok('scan_found', M.size > 100, M.size); ok('all_documented', !miss.length, miss.join(' ')); ok('no_stale', !stale.length, stale.join(' '));
process.exit(fail);
