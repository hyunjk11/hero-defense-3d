// 상점 · 우편함 · 관리자 클라이언트 (Supabase). 유료 영웅 소유권은 서버 테이블 hd3d_owned(사용자 쓰기 불가)에서 읽은 값만 메모리에 둠 (localStorage/세이브에 저장하지 않음).
// 테이블/함수가 아직 없으면(schema.sql 미실행) status = 'missing' → UI는 '서버 준비 중'. 게스트는 구매/우편 불가.
import { A, ensureClient, load as accLoad, store as accStore, onChange as accOnChange, setBanned, onDenied } from './account.js';
import { isBannedErr } from './adminlogic.js';
import { applyMail } from './progress.js';
import { itemsText } from './rewarditems.js';
import { SHOP, ADMIN_EMAIL } from '../config/shop.js';
import { CLASSES, DEFAULT_HERO, isHidden } from '../data/heroes.js';

const T = SHOP.tables;
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
export const S = { status: 'idle', owned: [], ownedUid: null, orders: [], mail: [], adminOrders: [], msg: '', listeners: [], me: { st: 'idle', admin: false, owner: false, banned: false, reason: null } }; // status: idle | guest | loading | ok | missing | error
// me = 서버 hd3d_my_status (관리자/owner/정지). st: idle | ok | missing(schema.sql 재실행 전) | error
const emit = () => S.listeners.forEach(f => { try { f(S); } catch (e) { console.warn(e); } });
export const onShop = f => S.listeners.push(f);
const isMissing = e => !!e && (e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42P01' || e.code === '42883' || e.status === 404);
const uid = () => (A.user && A.user.id) || '';

// ---------- 소유권 (서버 hd3d_owned 를 마지막으로 읽은 값, 현재 로그인 계정 것만) ----------
export function ownedList() { const u = uid(); return u && S.ownedUid === u ? S.owned.slice() : []; }
export const owns = item => ownedList().includes(item);
export const heroOwned = cls => !!CLASSES[cls] && !isHidden(cls) && (!CLASSES[cls].paid || owns('hero_' + cls)); // 숨긴 영웅은 소유해도 사용 불가 (소유 기록은 서버에 그대로)
export const usableHero = cls => heroOwned(cls) ? cls : isHidden(cls) ? DEFAULT_HERO : 'mage';
// 판매 중인 상품 (숨긴 영웅 상품은 목록·구매에서 제외, schema 상품은 그대로)
export const onSale = item => !!SHOP.items[item] && !(SHOP.items[item].kind === 'hero' && isHidden(SHOP.items[item].hero)); // 저장된 영웅이 잠겨 있으면 기본 영웅
// 버튼 표시용 (서버가 다시 검사): 서버 상태를 받았으면 그 값(하위 관리자 포함), 아직/구버전 서버면 owner 이메일
export const isAdminUI = () => !!A.user && (S.me.st === 'ok' ? S.me.admin : String(A.user.email || '').toLowerCase() === ADMIN_EMAIL);
export const isOwnerUI = () => !!A.user && S.me.st === 'ok' && S.me.owner;
export const isBanned = () => !!A.user && S.me.banned;
export const unread = () => S.mail.filter(m => !m.claimed && !m.revoked && (m.reward || !m.read)).length;
const BAN_MSG = { order: '계정이 정지되어 구매 신청을 할 수 없습니다.', claim: '계정이 정지되어 우편을 받을 수 없습니다.' };
// 내 상태 (관리자·정지) 다시 읽기
export async function refreshMe() {
  if (!A.user) { S.me = { st: 'idle', admin: false, owner: false, banned: false, reason: null }; setBanned(false); emit(); return S.me; }
  const u = A.user.id, c = await sb(), { data, error } = await q(c.rpc('hd3d_my_status'));
  if (!A.user || A.user.id !== u) return S.me;
  if (error) S.me = { ...S.me, st: isMissing(error) ? 'missing' : 'error', admin: false, owner: false };
  else S.me = { st: 'ok', admin: !!(data && data.admin), owner: !!(data && data.owner), banned: !!(data && data.banned), reason: (data && data.ban_reason) || null, at: (data && data.banned_at) || null };
  setBanned(S.me.banned); emit(); return S.me;
}
onDenied(() => { refreshMe().catch(() => {}); }); // 저장이 42501 로 거부되면 (정지됐을 수 있음) 상태 다시 확인

async function sb() { return A.sb || ensureClient(); }
async function q(p) { try { const r = await p; return r; } catch (e) { return { data: null, error: { message: String(e && e.message || e) } }; } }
// 서버에서 소유권·내 주문·우편을 다시 읽음
export async function refresh() {
  if (!A.user) { S.status = 'guest'; S.owned = []; S.ownedUid = null; S.orders = []; S.mail = []; emit(); return S; }
  if (S.status !== 'ok') S.status = 'loading'; emit();
  const c = await sb(), u = A.user.id;
  const [o, , r, m] = await Promise.all([q(c.from(T.owned).select('item').eq('user_id', u)), refreshMe().catch(() => {}), q(c.from(T.orders).select('*').eq('user_id', u).order('created_at', { ascending: false }).limit(50)), q(c.from(T.mail).select('*').eq('user_id', u).order('created_at', { ascending: false }).limit(100))]);
  const bad = [o, r, m].find(x => x.error);
  if (bad) { S.status = isMissing(bad.error) ? 'missing' : 'error'; S.msg = bad.error.message || ''; emit(); return S; }
  if (!A.user || A.user.id !== u) return S;
  S.owned = [...new Set((o.data || []).map(x => x.item))]; S.ownedUid = u;
  const rd = readSet(); S.orders = r.data || []; S.mail = (m.data || []).map(x => ({ ...x, read: rd.has(String(x.id)) })); S.status = 'ok'; emit();
  if (!recovering && pendList().length) setTimeout(() => recoverClaims().catch(() => {}), 0); return S;
}
const readKey = () => 'hd3d_mailread_' + uid();
function readSet() { try { return new Set(JSON.parse(ls.get(readKey()) || '[]')); } catch (e) { return new Set(); } }
export function markRead(id) { const s = readSet(); s.add(String(id)); ls.set(readKey(), JSON.stringify([...s].slice(-300))); const m = S.mail.find(x => x.id === id); if (m) m.read = true; emit(); }
export const pendingOf = item => S.orders.find(o => o.item === item && o.status === 'pending');

// ---------- 구매 신청 ----------  반환 { ok, msg }
export async function order(item) {
  if (!SHOP.items[item]) return { ok: false, msg: '알 수 없는 상품입니다.' };
  if (!onSale(item)) return { ok: false, msg: '지금은 판매하지 않는 상품입니다.' };
  if (!A.user) return { ok: false, msg: '로그인한 계정만 구매할 수 있어요. (게스트 불가)' };
  if (S.status !== 'ok') await refresh();
  if (S.status === 'missing') return { ok: false, msg: '서버 준비 중이에요. 잠시 후 다시 시도해 주세요.' };
  if (S.status !== 'ok') return { ok: false, msg: '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' };
  if (owns(item)) return { ok: false, msg: '이미 보유한 상품이에요.' };
  if (S.me.banned) return { ok: false, banned: true, msg: BAN_MSG.order };
  if (pendingOf(item)) return { ok: false, msg: '이미 구매 신청이 접수되어 관리자 확인을 기다리는 중이에요.' };
  const c = await sb(), { error } = await q(c.from(T.orders).insert({ item }));
  if (error) { await refresh(); if (isBannedErr(error)) return { ok: false, banned: true, msg: BAN_MSG.order }; if (error.code === '23505') return { ok: false, msg: owns(item) ? '이미 보유한 상품이에요.' : '이미 구매 신청이 접수되어 있어요.' }; if (isMissing(error)) return { ok: false, msg: '서버 준비 중이에요.' }; return { ok: false, msg: '구매 신청 실패: ' + (error.message || '') }; }
  await refresh(); return { ok: true, msg: '구매 신청이 접수되었습니다!' };
}

// ---------- 우편 받기 (서버 RPC: 한 번만 지급) ----------  반환 { ok, already, reward, msg }
// 보상 장부(S-3): RPC 를 부르기 전에 id 를 이 기기의 '받는 중' 목록(hd3d_mailpend_<uid>)에 적어 둠. 서버는 성공했는데 응답이 끊기면
// 목록에 남아 있다가 다음 refresh 때 다시 부름 → 서버는 already + reward 를 돌려주고(schema.sql), 세이브 장부(save.mailLog)에 없으면 그때 더함.
// '받는 중'이 아니었던 already(다른 기기에서 받음 등)는 더하지 않음 → 장부 도입 전에 받은 우편이 다시 지급되지 않음.
let claiming = new Set();
const pendKey = () => 'hd3d_mailpend_' + uid();
const pendList = () => { try { const a = JSON.parse(ls.get(pendKey()) || '[]'); return Array.isArray(a) ? a.filter(Number.isSafeInteger) : []; } catch (e) { return []; } };
const pendSet = (id, on) => { const a = new Set(pendList()); if (on) a.add(id); else a.delete(id); ls.set(pendKey(), JSON.stringify([...a].slice(-50))); };
export const pendingClaims = () => pendList();
export async function claim(id, { quiet = false } = {}) {
  if (!A.user) return { ok: false, msg: '로그인이 필요합니다.' }; if (claiming.has(id)) return { ok: false, busy: true, msg: '처리 중…' }; claiming.add(id);
  const u = uid(), wasPending = pendList().includes(id);
  try {
    pendSet(id, true);
    const c = await sb(), { data, error } = await q(c.rpc('hd3d_claim_mail', { p_mail_id: id }));
    if (error) { if (error.code === 'P0002' || /not found|revoked/i.test(error.message || '')) pendSet(id, false);
      if (isBannedErr(error)) { pendSet(id, false); refreshMe().catch(() => {}); return { ok: false, banned: true, msg: BAN_MSG.claim }; }
      if (/revoked/i.test(error.message || '') || error.hint === 'revoked') { await refresh(); return { ok: false, msg: '회수된 우편이라 받을 수 없습니다.' }; }
      return { ok: false, msg: isMissing(error) ? '서버 준비 중이에요.' : '받기 실패: ' + (error.message || '') }; }
    if (uid() !== u) return { ok: false, msg: '계정이 바뀌었습니다.' };
    const r = data || {}; let applied = false, got = [];
    if (r.reward && (!r.already || wasPending)) [applied, got] = applyReward(id, r.reward);
    pendSet(id, false); if (!quiet) markRead(id); await refresh();
    const recovered = !!(r.already && applied);
    const dup = got.filter(x => x && x.dup).length, box = got.filter(x => x && !x.dup && !x.auto).length, auto = got.filter(x => x && x.auto).length;
    const extra = (box ? ` 장비·고유 ${box}개는 🎁 보상 상자에 있어요.` : '') + (dup ? ` 이미 가진 고유 ${dup}개는 고유 정수·마력석·영혼석으로 바뀌었어요.` : '') + (auto ? ` 상자가 가득 차 ${auto}개는 재료로 분해됐어요.` : '');
    return { ok: true, already: !!r.already && !recovered, recovered, reward: r.reward || null, got, msg: (recovered ? '지난번에 받지 못한 보상을 받았습니다!' : r.already ? '이미 받은 우편이에요.' : '보상을 받았습니다!') + (applied ? extra : '') };
  } finally { claiming.delete(id); }
}
// 응답이 끊겨 '받는 중'으로 남은 우편을 다시 처리 (로그인 후 refresh 때 자동)
let recovering = false;
export async function recoverClaims() { if (recovering || !A.user) return 0; recovering = true; let n = 0;
  try { for (const id of pendList()) { const r = await claim(id, { quiet: true }); if (r.recovered || (r.ok && !r.already)) n++; } } finally { recovering = false; } return n; }
// 영혼석·재료는 저장 데이터에 더하고 장부에 id 기록 (한 번만). 영웅은 서버 hd3d_owned 로 해금 → refresh
function applyReward(id, rw) { const [s, ok, res] = applyMail(accLoad(), id, rw); if (ok) accStore(s); return [ok, res || []]; }
export function rewardText(rw) { if (!rw) return ''; const o = []; if (rw.hero && CLASSES[rw.hero]) o.push(`영웅 ${CLASSES[rw.hero].nm || ''} · ${CLASSES[rw.hero].n}`); if (+rw.souls) o.push(`영혼석 ${+rw.souls}`); if (+rw.steel) o.push(`강철 ${+rw.steel}`); if (+rw.crystal) o.push(`마력석 ${+rw.crystal}`); if (+rw.essence) o.push(`고유 정수 ${+rw.essence}`); const it = itemsText(rw.items); if (it) o.push(it); return o.join(' · '); }

// ---------- 관리자 (서버가 hd3d_is_admin()으로 다시 검사) ----------
export async function adminOrders() {
  const c = await sb(), { data, error } = await q(c.from(T.orders).select('*').order('created_at', { ascending: false }).limit(200));
  if (error) return { ok: false, msg: isMissing(error) ? '서버 준비 중 (schema.sql 실행 필요)' : error.message }; S.adminOrders = data || []; emit(); return { ok: true, list: S.adminOrders };
}
async function adminRpc(fn, args) { const c = await sb(), { data, error } = await q(c.rpc(fn, args)); if (error) return { ok: false, msg: isMissing(error) ? '서버 준비 중 (schema.sql 실행 필요)' : /forbidden|42501/.test(error.message + error.code) ? '관리자 권한이 없습니다.' : error.message };
  if (data && data.ok === false) return { ok: false, msg: { not_pending: '이미 처리된 신청입니다.', no_user: '해당 이메일의 사용자가 없습니다.', bad_reward: '보상 값이 올바르지 않습니다.', bad_title: '제목을 확인해 주세요.' }[data.reason] || '실패' }; return { ok: true, data }; }
export const approve = id => adminRpc('hd3d_admin_approve', { p_order_id: id });
export const reject = (id, reason) => adminRpc('hd3d_admin_reject', { p_order_id: id, p_reason: reason || null });
export const sendMail = (email, title, body, reward) => adminRpc('hd3d_admin_send_mail', { p_email: email, p_title: title, p_body: body || '', p_reward: reward && Object.keys(reward).length ? reward : null });

// 로그인/로그아웃 시 자동 갱신
let lastU = null; accOnChange(() => { const u = A.user ? A.user.id : null; if (u !== lastU) { lastU = u; S.owned = []; S.ownedUid = null; S.orders = []; S.mail = []; S.adminOrders = []; S.me = { st: 'idle', admin: false, owner: false, banned: false, reason: null }; setBanned(false); S.status = u ? 'loading' : 'guest'; if (u) refresh().catch(() => {}); else emit(); } });
// 새로고침으로 출정할 때(?stage&run) 유료 영웅이면 로그인·서버 소유권 확인을 먼저 (최대 ms)
export async function verifyOwned(ms = 8000) { const to = new Promise(r => setTimeout(r, ms)); try { await Promise.race([(async () => { if (!A.user) { const { autoLogin } = await import('./account.js'); await autoLogin(); } if (A.user) await refresh(); })(), to]); } catch (e) {} }
