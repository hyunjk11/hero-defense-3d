// 🗼 무한의 탑 서버 클라이언트 (T-7, 2026-10-24) — supabase/schema.sql hd3d_spire_* RPC (T-6)
// 기록(최고 층 · 체크포인트 · 이번 주 기록/순위 · 오늘 시작 수)은 서버 값만 메모리에 둠 (세이브/localStorage 에 저장하지 않음)
// 서버 함수가 없으면(schema.sql 다시 실행 전) st = 'missing' → 기록·보상 없는 '연습 탑'. 게스트·오프라인도 연습 탑 (던전 account/dungeon.js 와 같은 방식)
import { A, ensureClient } from './account.js';
import { isBannedErr, isMissingErr } from './adminlogic.js';
import { snapFrom } from '../data/spire.js';

export const SPS = { st: 'idle', uid: null, best: 0, cleared: 0, checkpoints: [1], week: null, weekBest: 0, weekRank: null, left: null, used: 0, limit: 30, banned: false, msg: '', unclaimed: [], titles: [] }; // st: idle | guest | loading | ok | missing | error
export const UPDATE_NEEDED = '서버 업데이트 필요';
export const SP_REASON = { bad_from: '그 층에서는 시작할 수 없어요 (돌파한 체크포인트만)', daily_limit: '오늘은 더 시작할 수 없어요 (하루 30회 · 한국 시간 0시 초기화)', bad_token: '도전 정보가 맞지 않아요', used: '이미 끝난 도전이에요', expired: '도전 시간이 지났어요 (3시간)', bad_floor: '체크포인트 층이 아니에요', not_ended: '아직 끝나지 않은 주예요 (한국 시간 월요일 0시 정산)', no_record: '그 주에는 기록이 없어요', claimed: '이미 받은 주간 보상이에요', bad_week: '주 정보가 맞지 않아요', too_fast: '너무 빨라서 아직 체크포인트로 인정되지 않았어요', bad_kind: '랭킹 종류가 잘못됐어요' };
const TOK = 'hd3d_sptok'; // 출발 → 새로고침(?dungeon=1&run=1&spire=N) 사이에 token 을 넘기는 곳 (sessionStorage: 이 탭만)
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };
const uid = () => (A.user && A.user.id) || null;
async function rpc(fn, args) { try { const c = A.sb || await ensureClient(); const r = await c.rpc(fn, args); return r || { data: null, error: { message: 'no response' } }; } catch (e) { return { data: null, error: { message: String(e && e.message || e) } }; } }
export const offline = e => !!e && (e.status === 0 || /fetch|network|no response|timeout/i.test(e.message || ''));
const sleep = ms => new Promise(f => setTimeout(f, ms));
export let RETRY_MS = 1500; export const setRetryMs = ms => { RETRY_MS = ms; }; // 테스트에서 줄임
// 오프라인(연결 오류)일 때만 다시 시도 (최대 n번, 1.5초 · 3초 …) — 서버가 거절한 응답(ok:false)은 다시 보내지 않음
async function rpcRetry(fn, args, n = 3) { let r = null; for (let i = 0; i < n; i++) { r = await rpc(fn, args); if (!r.error || !offline(r.error)) break; if (i < n - 1) await sleep(RETRY_MS * (i + 1)); } return r; }
function setErr(e) { SPS.st = isMissingErr(e) ? 'missing' : 'error'; SPS.msg = SPS.st === 'missing' ? UPDATE_NEEDED : offline(e) ? '서버에 연결할 수 없어요' : (e.message || '서버 오류'); }
const ints = a => Array.isArray(a) ? a.map(x => Math.floor(+x)).filter(x => x >= 1) : [];
const errMsg = (e, what) => isMissingErr(e) ? UPDATE_NEEDED : isBannedErr(e) ? '계정이 정지되어 ' + what + ' 수 없어요.' : offline(e) ? '서버에 연결할 수 없어요.' : (e.message || '서버 오류');

// 최고 층 · 체크포인트 · 이번 주 기록/순위 · 오늘 남은 시작 (서버)
export async function spStatus() {
  const u = uid(); if (!u) { Object.assign(SPS, { st: 'guest', uid: null, best: 0, cleared: 0, checkpoints: [1], weekBest: 0, weekRank: null, left: null, used: 0, banned: false, msg: '', unclaimed: [], titles: [] }); return SPS; }
  if (SPS.uid !== u) Object.assign(SPS, { uid: u, best: 0, cleared: 0, checkpoints: [1], weekBest: 0, weekRank: null, left: null, used: 0, unclaimed: [], titles: [] }); SPS.st = SPS.st === 'ok' ? 'ok' : 'loading';
  const { data, error } = await rpc('hd3d_spire_status'); if (uid() !== u) return SPS;
  if (error || !data) { setErr(error || {}); return SPS; }
  const cp = ints(data.checkpoints); Object.assign(SPS, { st: 'ok', best: Math.max(0, +data.best || 0), cleared: Math.max(0, +data.cleared || 0), checkpoints: cp.length ? cp : [1], week: data.week || null,
    weekBest: Math.max(0, +data.week_best || 0), weekRank: data.week_rank == null ? null : +data.week_rank, left: Math.max(0, +data.left || 0), used: +data.used || 0, limit: +data.limit || 30, banned: !!data.banned, msg: '',
    unclaimed: weeksOf(data.unclaimed), titles: Array.isArray(data.titles) ? data.titles.filter(t => typeof t === 'string' && /^spire_/.test(t)) : [] });
  return SPS;
}
// 받지 않은 지난 주 보상 (T-9 · 서버 hd3d_spire_status.unclaimed) — 서버가 T-6 판이면 없음 = []
const weeksOf = a => (Array.isArray(a) ? a : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.week))).slice(0, 8).map(x => ({ week: String(x.week), best: Math.max(0, +x.best || 0), rank: x.rank == null ? null : +x.rank,
  title: typeof x.title === 'string' ? x.title : null, souls: Math.max(0, +x.souls || 0), medals: Math.max(0, +x.medals || 0) }));
// 주간 정산 (T-9): 끝난 주 한 번 · 영혼석/메달 우편 · 지난주면 주간 칭호 교체 → { ok, week, best, rank, souls, medals, title, mail } | { ok:false, msg }
export async function spClaimWeek(week) {
  if (!uid()) return { ok: false, msg: '로그인이 필요해요.' };
  const { data, error } = await rpc('hd3d_spire_claim_week', week ? { p_week: week } : {});
  if (error) return { ok: false, offline: offline(error), msg: errMsg(error, '받을') };
  if (!data || data.ok === false) { if (data && data.reason === 'claimed') SPS.unclaimed = SPS.unclaimed.filter(x => x.week !== week); return { ok: false, reason: data && data.reason, msg: SP_REASON[data && data.reason] || '받지 못했어요' }; }
  SPS.unclaimed = SPS.unclaimed.filter(x => x.week !== String(data.week));
  return { ok: true, week: String(data.week), best: +data.best || 0, rank: data.rank == null ? null : +data.rank, souls: +data.souls || 0, medals: +data.medals || 0, title: data.title || null, mail: data.mail || null };
}
// 출발: 서버에 도전 등록. → { mode: 'ranked', token, from } | { mode: 'practice', why: 'guest'|'missing'|'error' } | { blocked: true, msg }
export async function spStart(from) {
  from = snapFrom(from); const u = uid(); if (!u) return { mode: 'practice', why: 'guest', from: 1 };
  const { data, error } = await rpc('hd3d_spire_start', { p_from: from });
  if (error) { if (isBannedErr(error)) return { blocked: true, msg: '계정이 정지되어 무한의 탑에 입장할 수 없어요.' }; setErr(error); return { mode: 'practice', why: SPS.st === 'missing' ? 'missing' : 'error', from: 1 }; }
  if (!data || data.ok === false) { if (data && data.reason === 'daily_limit') { SPS.left = 0; SPS.used = +data.used || SPS.used; } return { blocked: true, reason: data && data.reason, msg: SP_REASON[data && data.reason] || '입장할 수 없어요.' }; }
  SPS.left = Math.max(0, +data.left || 0); SPS.used = +data.used || 0; const f = Math.floor(+data.from || from);
  ss.set(TOK, JSON.stringify({ t: String(data.token), u, from: f, best: Math.max(0, +data.best || 0), cleared: SPS.cleared, at: Date.now() })); return { mode: 'ranked', token: String(data.token), from: f };
}
// 연습 탑 표시 (새로고침 뒤 run.js 가 읽음)
export const markPractice = (why, from) => ss.set(TOK, JSON.stringify({ practice: String(why || 'guest'), from: snapFrom(from), u: uid(), at: Date.now() }));
// 판 시작 때 한 번 꺼냄 (꺼낸 뒤 지움 → 판 중 새로고침 = 그 도전 종료. 그때까지 체크포인트로 인정된 기록·보상은 서버에 남아 있음)
// from = URL 의 시작 층 — token 의 시작 층과 다르면(주소를 직접 바꿈) 연습
export function takeEntry(from) { let o = null; try { o = JSON.parse(ss.get(TOK) || 'null'); } catch (e) {} ss.del(TOK);
  if (!o || typeof o !== 'object' || Date.now() - (+o.at || 0) > 10 * 60 * 1000) return { mode: 'practice', why: uid() ? 'reload' : 'guest' };
  if (o.practice) return { mode: 'practice', why: String(o.practice) };
  if (typeof o.t === 'string' && /^[0-9a-f-]{36}$/i.test(o.t) && o.u && (!uid() || o.u === uid()) && +o.from === +from) return { mode: 'ranked', token: o.t, from: +o.from, best: +o.best || 0, cleared: +o.cleared || 0 };
  return { mode: 'practice', why: 'reload' }; }
// 보스층(5의 배수) 돌파 체크포인트 — 연결 오류면 다시 시도. → { ok, floor, best, new_best, week_best, reward } | { ok:false, reason, msg, offline }
export async function spPing(token, floor) {
  if (!token || !uid()) return { ok: false, msg: '로그인이 필요해요.' };
  const { data, error } = await rpcRetry('hd3d_spire_ping', { p_token: token, p_floor: Math.max(0, Math.floor(+floor || 0)) });
  if (error) return { ok: false, offline: offline(error), msg: errMsg(error, '기록할') };
  if (!data || data.ok === false) return { ok: false, reason: data && data.reason, msg: SP_REASON[data && data.reason] || '체크포인트 저장 실패' };
  return norm(data);
}
// 정산: 서버가 경과 시간으로 층 수를 다시 검사해 최고 기록 · 이번 주 기록 · 첫 돌파 보상 (token 당 한 번). → { ok, top, capped, best, new_best, week_best, reward } | { ok:false, msg }
export async function spFinish(token, top, summary) {
  if (!token || !uid()) return { ok: false, msg: '로그인이 필요해요.' };
  let sum = null; try { sum = summary && JSON.stringify(summary).length <= 3800 ? summary : null; } catch (e) { sum = null; }
  const { data, error } = await rpcRetry('hd3d_spire_finish', { p_token: token, p_top: Math.max(0, Math.floor(+top || 0)), p_summary: sum });
  if (error) return { ok: false, offline: offline(error), msg: errMsg(error, '기록할') };
  if (!data || data.ok === false) return { ok: false, reason: data && data.reason, top: data && data.top, msg: SP_REASON[data && data.reason] || '정산 실패' };
  return { ...norm(data), capped: !!data.capped, from: +data.from || 0 };
}
function norm(d) { const rw = d.reward || {};
  const r = { ok: true, floor: +d.floor || 0, top: +d.top || 0, best: Math.max(0, +d.best || 0), newBest: !!d.new_best, weekBest: Math.max(0, +d.week_best || 0),
    reward: { floors: ints(rw.floors), souls: Math.max(0, +rw.souls || 0), medals: Math.max(0, +rw.medals || 0), titles: Array.isArray(rw.titles) ? rw.titles.filter(t => typeof t === 'string') : [], mail: rw.mail || null } };
  if (r.best > SPS.best) { SPS.best = r.best; const cp = [1]; for (let k = 5; k <= r.best; k += 5) cp.push(k + 1); SPS.checkpoints = cp; } if (r.weekBest > SPS.weekBest) SPS.weekBest = r.weekBest; return r; }
// 랭킹: kind 'week' | 'all' → { ok, kind, week, top: [{rank, nick, floor, at, me}], me: {rank, floor} | null } | { ok:false, msg }
export async function spRank(kind = 'week', week = null) {
  if (!uid()) return { ok: false, msg: '로그인하면 랭킹을 볼 수 있어요.' };
  const { data, error } = await rpc('hd3d_spire_rank', week ? { p_kind: kind, p_week: week } : { p_kind: kind });
  if (error) return { ok: false, msg: errMsg(error, '볼') };
  if (!data || data.ok === false) return { ok: false, msg: SP_REASON[data && data.reason] || '랭킹을 불러오지 못했어요' };
  const top = (Array.isArray(data.top) ? data.top : []).slice(0, 50).map(x => ({ rank: +x.rank || 0, nick: String(x.nick || '용사').slice(0, 24), floor: +x.floor || 0, at: x.at || null, me: !!x.me }));
  return { ok: true, kind: data.kind || kind, week: data.week || null, top, me: data.me && data.me.rank ? { rank: +data.me.rank, floor: +data.me.floor || 0 } : null };
}
// 결과 화면 합계: 체크포인트(ping)들 + 정산(finish)의 첫 돌파 보상을 한 목록으로
export function mergeRewards(list) { const out = { floors: [], souls: 0, medals: 0, titles: [], mails: [] };
  for (const r of list) { if (!r || !r.ok || !r.reward) continue; const w = r.reward; for (const f of w.floors) if (!out.floors.includes(f)) out.floors.push(f); out.souls += w.souls; out.medals += w.medals;
    for (const t of w.titles) if (!out.titles.includes(t)) out.titles.push(t); if (w.mail) out.mails.push(w.mail); }
  out.floors.sort((a, b) => a - b); return out; }
