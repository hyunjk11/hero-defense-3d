// ui/keys.js: Esc 층 스택 — 맨 위 하나만 닫음
import { escLayer, escTop, openLayers } from '../src/ui/keys.js';
let fail = 0; const ok = (n, c, d = '') => { console.log((c ? 'OK ' : 'FAIL ') + n + (c ? '' : ' ' + d)); if (!c) fail = 1; };
const st = { panel: true, ov: true, confirm: false };
escLayer('ov', 15, () => st.ov, () => st.ov = false); escLayer('panel', 40, () => st.panel, () => st.panel = false); escLayer('confirm', 100, () => st.confirm, () => st.confirm = false);
ok('order', openLayers().join() === 'panel,ov', openLayers().join());
ok('top_only', escTop() === 'panel' && !st.panel && st.ov);
st.confirm = true; ok('confirm_first', escTop() === 'confirm' && !st.confirm && st.ov);
ok('then_ov', escTop() === 'ov' && !st.ov); ok('none', escTop() === null);
escLayer('bad', 50, () => { throw new Error('x'); }, () => {}); ok('throwing_isOpen_ignored', openLayers().length === 0);
process.exit(fail);
