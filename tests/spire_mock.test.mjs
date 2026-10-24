// 🗼 무한의 탑 T-6: tests/sbmock.js 의 hd3d_spire_* 흉내가 schema.sql 규칙(시작층·시간 하한·token 1회·첫 돌파 보상·랭킹)과 같게 동작하는지 (node, 브라우저 없음)
const store = {}; globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.window = globalThis; globalThis.location = { origin: 'http://x', href: 'http://x/' };
await import(new URL('./sbmock.js', import.meta.url));
const c = window.__hd3dSupabaseMock('u', 'k', { auth: { storageKey: 'sk' } });
await c.auth.signUp({ email: 'a@b.kr', password: 'secret1' });
const R = async (f, a) => (await c.rpc(f, a)).data; const D = () => JSON.parse(localStorage.getItem('__mockdb'));
const as = (n, v) => { console.log(v ? 'OK  ' : 'FAIL', n); if (!v) process.exitCode = 1; };
let st = await R('hd3d_spire_status'); as('status', st.best === 0 && st.checkpoints.join() === '1' && st.left === 30);
as('bad_from', (await R('hd3d_spire_start', { p_from: 6 })).reason === 'bad_from');
let s = await R('hd3d_spire_start', { p_from: 1 }); as('start', s.ok && s.token);
as('too_fast', (await R('hd3d_spire_ping', { p_token: s.token, p_floor: 5 })).reason === 'too_fast');
let d = D(); d.sp_runs[s.token].started -= 340e3; localStorage.setItem('__mockdb', JSON.stringify(d));
let p = await R('hd3d_spire_ping', { p_token: s.token, p_floor: 5 }); as('ping5', p.ok && p.best === 5 && p.reward.souls === 400 && p.reward.mail);
let f = await R('hd3d_spire_finish', { p_token: s.token, p_top: 20 }); as('finish capped', f.ok && f.top === 12 && f.capped && f.best === 12 && f.reward.floors.join() === '10' && f.reward.medals === 6, f);
as('once', (await R('hd3d_spire_finish', { p_token: s.token, p_top: 20 })).reason === 'used');
st = await R('hd3d_spire_status'); as('status2', st.best === 12 && st.checkpoints.join() === '1,6,11' && st.week_best === 12 && st.week_rank === 1);
const rk = await R('hd3d_spire_rank', { p_kind: 'week' }); as('rank', rk.top.length === 1 && rk.top[0].floor === 12 && rk.me.rank === 1);
localStorage.setItem('__mockflags', '{"noSpire": true}'); as('noSpire', (await c.rpc('hd3d_spire_status')).error.code === 'PGRST202');
