// 계정 + 저장: 로컬 저장(localStorage 'hd3d_save')이 항상 기준이고, 로그인 시 Supabase hd3d_progress에 디바운스 업로드.
// 실패/오프라인 → dirty 플래그 유지 + 백오프 재시도. 기기에서 첫 로그인 시 게스트 저장을 한 번 병합. 테이블이 없으면(schema.sql 미실행) '서버 준비 중' + 로컬 저장.
// 기기 간 충돌(S-2): 마지막으로 본 서버 행의 updated_at(hd3d_cloud_ts_<uid>)을 기억해 두고 "그 시각 그대로일 때만" update (낙관적 동시성).
//   0행 갱신(다른 기기가 먼저 저장) → 서버 행을 다시 읽어 P.merge(로컬, 서버) 후 새 updated_at 기준으로 다시 저장. 행이 없을 때는 insert (동시 insert 는 23505 → 같은 병합 경로)
// 탭 숨김/페이지 닫힘(S-4): visibilitychange(hidden)·pagehide 에서 즉시 저장, 이때 요청은 fetch keepalive 로 보냄
import { SUPABASE } from '../config/supabase.js';
import * as P from './progress.js';
import { isHidden } from '../data/heroes.js';

const T = SUPABASE.tables, AUTH_KEY = 'hd3dSbAuth', K_SAVE = 'hd3d_save', K_GUEST = 'hd3d_guest', K_UID = 'hd3d_uid', K_DIRTY = 'hd3d_dirty', K_MODE = 'hd3d_mode';
const mergedKey = uid => 'hd3d_merged_' + uid, tsKey = uid => 'hd3d_cloud_ts_' + uid;
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

export const A = { sb: null, user: null, tables: 'unknown', sync: 'local', msg: '', listeners: [], mode: ls.get(K_MODE) || '', conflicts: 0, leaving: false, banned: false }; // mode: '' | 'guest' | 'account'
let timer = 0, retry = 0, sbP = null;
const emit = () => { if (A.banned && A.user) A.sync = 'banned'; A.listeners.forEach(f => { try { f(A); } catch (e) { console.warn(e); } }); };
export const onChange = f => A.listeners.push(f);
// 계정 정지 (서버 hd3d_my_status → account/shop.js): 서버 저장을 멈추고 이 기기에만 저장. 해제되면 밀린 저장을 다시 올림
let deniedHook = () => {};
export const onDenied = f => { deniedHook = f; };
export function setBanned(b) { b = !!b; if (A.banned === b) return; A.banned = b; clearTimeout(timer);
  if (b) { A.sync = 'banned'; emit(); } else if (A.user && A.tables === 'ok') { if (ls.get(K_DIRTY) === '1') save(); else { A.sync = 'saved'; emit(); } } }

// ---------- 로컬 저장 ----------
export function load() { const raw = parse(ls.get(K_SAVE)) || {}, s = P.clean(raw); if (!ls.get(K_SAVE)) migrateOld(s); else if (raw.hero !== s.hero && isHidden(raw.hero)) store(s); return s; } // 숨긴 영웅 → 기본 영웅 이전은 바로 저장
function migrateOld(s) { const b = +ls.get('hd3d_best') || 0; s.bestWave = Math.max(s.bestWave, b); const a = parse(ls.get('hd3d_audio')); if (a) s.settings.audio = P.clean({ settings: { audio: a } }).settings.audio; }
export function store(s, { cloud = true } = {}) { s = P.clean(s); ls.set(K_SAVE, JSON.stringify(s)); if (cloud && A.user) { ls.set(K_DIRTY, '1'); schedule(); } emit(); return s; }
export function update(fn) { return store(fn(load())); }

export function koErr(e) {
  const c = String(e?.code || e?.error_code || ''), m = String(e?.message || e || '');
  if (c === 'invalid_credentials' || /invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (c === 'email_not_confirmed' || /email not confirmed/i.test(m)) return '이메일 인증이 필요한 계정입니다. 메일의 확인 링크를 누른 뒤 로그인해 주세요.';
  if (c === 'user_already_exists' || c === 'email_exists' || /already registered/i.test(m)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (c === 'weak_password' || /password should|at least/i.test(m)) return '비밀번호는 6자 이상이어야 합니다.';
  if (c === 'email_address_invalid' || /invalid format|is invalid|validate email/i.test(m)) return '이메일 형식이 올바르지 않습니다.';
  if (c === 'signup_disabled' || /signups not allowed/i.test(m)) return '현재 회원가입이 막혀 있습니다.';
  if (c.startsWith('over_') || /rate limit|too many/i.test(m) || e?.status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if (/failed to fetch|network|load failed|fetch/i.test(m)) return '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
  return '오류가 발생했습니다: ' + (m || c || '알 수 없음');
}

// ---------- Supabase 클라이언트 ----------
async function loadClient() {
  const create = window.__hd3dSupabaseMock || (await import('supabase')).createClient;
  // 페이지를 떠나는 중(A.leaving)에 보내는 쓰기 요청은 keepalive (탭이 닫혀도 브라우저가 끝까지 보냄, 본문 64KB 제한 = 저장 jsonb 상한과 같음)
  const kf = (u, o = {}) => fetch(u, A.leaving && o.method && o.method !== 'GET' ? { ...o, keepalive: true } : o);
  A.sb = create(SUPABASE.url, SUPABASE.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_KEY }, global: { fetch: kf } });
  A.sb.auth.onAuthStateChange((ev, session) => setTimeout(() => { if (ev === 'SIGNED_OUT' && A.user) restoreGuest(); }, 0));
  return A.sb;
}
export function ensureClient() { if (!sbP) sbP = loadClient().catch(e => { sbP = null; throw e; }); return sbP; }
export const hasSession = () => !!ls.get(AUTH_KEY);

// 저장된 세션이 있으면 자동 로그인. 결과: true(로그인됨) / false
export async function autoLogin() {
  if (!hasSession()) return false;
  try { const sb = await ensureClient(); const { data } = await sb.auth.getSession(); if (data?.session?.user) { await onLogin(data.session.user); return true; } } catch (e) { A.msg = koErr(e); }
  if (ls.get(K_UID)) restoreGuest(); return false;
}
export async function signIn(email, pw) {
  const sb = await ensureClient(); const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(koErr(error)); await onLogin(data.user); return A.user;
}
// 회원가입: 이메일 인증이 꺼져 있으면 바로 세션이 옴. 세션이 없으면 로그인 시도 → 그래도 안 되면 안내
export async function signUp(email, pw) {
  const sb = await ensureClient(); const { data, error } = await sb.auth.signUp({ email, password: pw });
  if (error) throw new Error(koErr(error));
  if (data?.session?.user) { await onLogin(data.session.user); return A.user; }
  if (data?.user && Array.isArray(data.user.identities) && !data.user.identities.length) throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.');
  const r = await sb.auth.signInWithPassword({ email, password: pw });
  if (r.data?.session?.user) { await onLogin(r.data.session.user); return A.user; }
  if (r.error && !/invalid login/i.test(r.error.message || '')) throw new Error('가입은 완료됐지만 바로 로그인되지 않았습니다. ' + koErr(r.error));
  throw new Error('가입은 완료됐지만 바로 로그인되지 않았습니다. 이메일 인증이 켜져 있다면 받은 메일의 확인 링크를 누른 뒤 로그인해 주세요.');
}
export function playGuest() { if (A.user) return; A.mode = 'guest'; ls.set(K_MODE, 'guest'); A.sync = 'local'; emit(); }
export async function signOut() { try { if (A.sb) await A.sb.auth.signOut(); } catch (e) {} restoreGuest(); }

function restoreGuest() {
  A.user = null; A.tables = 'unknown'; A.sync = 'local'; A.banned = false; clearTimeout(timer);
  const g = ls.get(K_GUEST); if (g) ls.set(K_SAVE, g); ls.del(K_GUEST); ls.del(K_UID); ls.del(K_DIRTY); A.mode = ''; ls.set(K_MODE, ''); emit();
}

async function checkTables() {
  const r = await Promise.all([[T.progress, 'user_id'], [T.profiles, 'id']].map(([t, c]) => A.sb.from(t).select(c).limit(1)));
  const bad = r.find(x => x.error && x.error.code !== '42501'); if (!bad) return (A.tables = 'ok');
  const e = bad.error; return (A.tables = e.code === 'PGRST205' || e.code === '42P01' || bad.status === 404 ? 'missing' : 'error');
}

async function onLogin(u) {
  if (A.user && A.user.id === u.id) return; A.user = u; A.mode = 'account'; ls.set(K_MODE, 'account');
  const cur = ls.get(K_UID) || ''; if (cur && cur !== u.id) restoreGuest();
  if (!ls.get(K_UID)) ls.set(K_GUEST, JSON.stringify(load())); A.user = u; A.mode = 'account'; ls.set(K_MODE, 'account'); ls.set(K_UID, u.id);
  A.sync = 'loading'; emit();
  await checkTables().catch(() => (A.tables = 'error'));
  if (A.tables !== 'ok') { A.sync = A.tables === 'missing' ? 'missing' : 'error'; emit(); if (A.tables === 'error') setTimeout(() => A.user && loadCloud(), 15000); return; }
  await loadCloud();
}
async function loadCloud() {
  if (!A.user) return; const uid = A.user.id;
  try {
    const { data: row, error } = await A.sb.from(T.progress).select('data, merged, updated_at').eq('user_id', uid).maybeSingle(); if (error) throw error;
    const local = load(), cloud = row?.data || null, seen = ls.get(tsKey(uid)); let d;
    if (ls.get(mergedKey(uid)) !== '1') { d = P.merge(local, cloud); ls.set(mergedKey(uid), '1'); }
    else if (ls.get(K_DIRTY) === '1' && cloud && row.updated_at !== seen) { d = P.merge(local, cloud); A.conflicts++; } // 이 기기에 안 올린 진행 + 그 사이 다른 기기 저장 → 병합
    else if (ls.get(K_DIRTY) === '1' || !cloud) d = local; else d = P.clean(cloud);
    if (row) ls.set(tsKey(uid), row.updated_at); else ls.del(tsKey(uid));
    store(d, { cloud: false });
    const pr = await A.sb.from(T.profiles).select('nickname').eq('id', uid).maybeSingle();
    if (!pr.error && pr.data?.nickname) store({ ...load(), nick: pr.data.nickname }, { cloud: false });
    else if (!pr.error) await saveNick(load().nick || (A.user.email || '용사').split('@')[0].slice(0, 12));
    if (!cloud || cloud.hero !== load().hero || JSON.stringify(P.clean(cloud)) !== JSON.stringify(load())) await save(); else { A.sync = 'saved'; ls.del(K_DIRTY); }
  } catch (e) { A.sync = 'offline'; A.msg = koErr(e); schedule(true); }
  emit();
}
export async function saveNick(nick) {
  nick = String(nick || '').trim().slice(0, 12) || '용사'; store({ ...load(), nick }, { cloud: !!A.user });
  if (A.user && A.tables === 'ok') { const { error } = await A.sb.from(T.profiles).upsert({ id: A.user.id, nickname: nick }); if (error) A.msg = koErr(error); }
  return nick;
}
function schedule(isRetry) {
  clearTimeout(timer); if (!A.user || A.tables !== 'ok') return; if (A.banned) { A.sync = 'banned'; return; }
  const ms = isRetry ? SUPABASE.retryMs[Math.min(retry++, SUPABASE.retryMs.length - 1)] : SUPABASE.saveDebounceMs; A.sync = isRetry ? 'offline' : 'pending';
  timer = setTimeout(() => save(), ms);
}
let inflight = null, again = false;
export function save() {
  if (!A.user || A.tables !== 'ok') return Promise.resolve(false); if (A.banned) { A.sync = 'banned'; emit(); return Promise.resolve(false); }
  if (inflight) { again = true; return inflight; } // 저장 중에 또 저장 → 끝난 뒤 한 번 더 (같은 기준 시각으로 두 번 쓰지 않게 직렬화)
  inflight = (async () => { let r; do { again = false; r = await saveOnce(); } while (again && r && A.user); return r; })().finally(() => { inflight = null; });
  return inflight;
}
async function saveOnce() {
  if (!A.user || A.tables !== 'ok') return false; clearTimeout(timer); A.sync = 'saving'; emit(); const uid = A.user.id;
  try {
    for (let i = 0; i < 4; i++) {
      const base = ls.get(tsKey(uid)), data = load(), row = { data, merged: true };
      const r = base ? await A.sb.from(T.progress).update(row).eq('user_id', uid).eq('updated_at', base).select('updated_at')
        : await A.sb.from(T.progress).insert({ user_id: uid, ...row }).select('updated_at');
      if (r.error && !(!base && r.error.code === '23505')) throw r.error;
      const ok = !r.error && Array.isArray(r.data) && r.data[0];
      if (!A.user || A.user.id !== uid) return false;
      if (ok) { ls.set(tsKey(uid), ok.updated_at); if (JSON.stringify(load()) === JSON.stringify(data)) ls.del(K_DIRTY); retry = 0; A.sync = ls.get(K_DIRTY) === '1' ? 'pending' : 'saved'; emit(); return true; }
      // 충돌: 다른 기기가 먼저 저장함 → 서버 행을 읽어 병합한 뒤 그 시각 기준으로 다시
      const c = await A.sb.from(T.progress).select('data, updated_at').eq('user_id', uid).maybeSingle(); if (c.error) throw c.error;
      if (!A.user || A.user.id !== uid) return false;
      A.conflicts++; if (!c.data) { ls.del(tsKey(uid)); continue; }
      store(P.merge(load(), c.data.data), { cloud: false }); ls.set(K_DIRTY, '1'); ls.set(tsKey(uid), c.data.updated_at);
    }
    throw new Error('save conflict');
  } catch (e) { A.msg = koErr(e); if (e && e.code === '42501') deniedHook(); schedule(true); emit(); return false; }
}
// 즉시 저장 (판 종료 시 등) — 디바운스 무시
export const flush = () => save();
// 네트워크 복구(online): 백오프(최대 60초)를 기다리지 않고 바로 재시도 + 백오프 단계 초기화 (Q-12)
addEventListener('online', () => { retry = 0; if (A.user && ls.get(K_DIRTY) === '1') { clearTimeout(timer); save(); } });
// 탭 숨김(앱 전환·화면 끔)·페이지 닫힘: 디바운스 기다리지 않고 바로 저장 (beforeunload 의 async 저장은 자주 누락됨)
function leaveFlush() { if (A.user && ls.get(K_DIRTY) === '1') { A.leaving = true; save().finally(() => { A.leaving = false; }); } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leaveFlush(); });
addEventListener('pagehide', leaveFlush);
addEventListener('beforeunload', leaveFlush);
export const SYNC_TXT = { local: '이 기기에 저장', loading: '불러오는 중…', missing: '서버 준비 중 · 이 기기에 저장', error: '서버 오류 · 이 기기에 저장', pending: '저장 대기', saving: '저장 중…', saved: '클라우드 저장됨 ✓', offline: '오프라인 · 재시도 예정', banned: '⛔ 계정 정지 · 서버 저장 중단 (이 기기에만 저장)' };
