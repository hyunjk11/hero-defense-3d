// ui/panel.js: 공용 패널 등록 · Esc 층 · closePanels
import { definePanel, panel, openPanels, closePanels } from '../src/ui/panel.js';
import { escTop, openLayers } from '../src/ui/keys.js';
let fail = 0; const ok = (n, c, d = '') => { console.log((c ? 'OK ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) fail = 1; };
const mkEl = () => { const s = new Set(['hidden']); return { classList: { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c) }, contains: () => false }; };
const a = { el: mkEl() }, b = { el: mkEl() }; const log = [];
const A = definePanel('a', { el: a.el, z: 40, close: s => { log.push('a' + (s ? 's' : '')); A.hide(); } });
const B = definePanel('b', { el: b.el, z: 42 });
ok('closed_initially', openPanels().length === 0 && !A.isOpen());
A.show(); B.show(); ok('both_open', openPanels().join() === 'a,b', openPanels().join());
ok('layers_order', openLayers().join() === 'b,a', openLayers().join());
ok('esc_top_b', escTop() === 'b' && !B.isOpen() && A.isOpen());
B.show(); ok('closePanels_except_b', closePanels('b').join() === 'a' && log.at(-1) === 'as' && B.isOpen() && !A.isOpen());
ok('panel_lookup', panel('a') === A && panel('zz') === null);
const C = definePanel('c', { el: mkEl(), isOpen: () => { throw new Error('x'); } }); ok('throwing_isOpen', !C.isOpen() && !openPanels().includes('c'));
process.exit(fail);
