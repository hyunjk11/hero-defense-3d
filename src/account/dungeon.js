// 던전 메달 · 하루 3회 입장 · 던전 상점 클라이언트 (서버 supabase/schema.sql hd3d_dungeon_* RPC — 5단계, 2026-10-23)
// 메달 잔액·입장 수는 서버 값만 메모리에 둠 (세이브/localStorage 에 저장하지 않음). 서버 함수가 없으면(schema.sql 다시 실행 전) st = 'missing'
// → 입장 화면 '서버 업데이트 필요' + 메달 없는 '연습 원정'(임시 영혼석 보상)으로 던전은 그대로 즐길 수 있음. 게스트·오프라인도 연습 원정.
import { A, ensureClient } from './account.js';
import { isBannedErr, isMissingErr } from './adminlogic.js';
import { DG_REASON } from '../data/dungeon.js';

export const DGS = { st: 'idle', uid: null, left: null, used: 0, limit: 3, medals: 0, titles: [], banned: false, msg: '' }; // st: idle | guest | loading | ok | missing | error
export const UPDATE_NEEDED = '서버 업데이트 필요';
const TOK = 'hd3d_dgtok'; // 출발 → 새로고침(?dungeon=1&run=1) 사이에 token 을 넘기는 곳 (sessionStorage: 이 탭만)
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: k => { try { sessionStorage.removeItem(k); } catch (e) {} } };
const uid = () => (A.user && A.user.id) || null;
async function rpc(fn, args) { try { const c = A.sb || await ensureClient(); const r = await c.rpc(fn, args); return r || { data: null, error: { message: 'no response' } }; } catch (e) { return { data: null, error: { message: String(e && e.message || e) } }; } }
const offline = e => !!e && (e.status === 0 || /fetch|network|no response/i.test(e.message || ''));
function setErr(e) { DGS.st = isMissingErr(e) ? 'missing' : 'error'; DGS.msg = DGS.st === 'missing' ? UPDATE_NEEDED : offline(e) ? '서버에 연결할 수 없어요' : (e.message || '서버 오류'); }

// 오늘 남은 입장 · 메달 · 칭호 (서버)
export async function dgStatus() {
  const u = uid(); if (!u) { Object.assign(DGS, { st: 'guest', uid: null, left: null, used: 0, medals: 0, titles: [], banned: false, msg: '' }); return DGS; }
  if (DGS.uid !== u) Object.assign(DGS, { uid: u, left: null, used: 0, medals: 0, titles: [] }); DGS.st = DGS.st === 'ok' ? 'ok' : 'loading';
  const { data, error } = await rpc('hd3d_dungeon_status'); if (uid() !== u) return DGS;
  if (error || !data) { setErr(error || {}); return DGS; }
  Object.assign(DGS, { st: 'ok', left: Math.max(0, +data.left || 0), used: +data.used || 0, limit: +data.limit || 3, medals: Math.max(0, +data.medals || 0), titles: Array.isArray(data.titles) ? data.titles.filter(x => typeof x === 'string') : [], banned: !!data.banned, msg: '' });
  return DGS;
}
// 출발: 서버 입장 등록. → { mode: 'ranked', token } | { mode: 'practice', why: 'guest'|'missing'|'error' } | { blocked: true, msg }
export async function dgStart() {
  const u = uid(); if (!u) return { mode: 'practice', why: 'guest' };
  const { data, error } = await rpc('hd3d_dungeon_start');
  if (error) { if (isBannedErr(error)) return { blocked: true, msg: '계정이 정지되어 던전에 입장할 수 없어요.' }; setErr(error); return { mode: 'practice', why: DGS.st === 'missing' ? 'missing' : 'error' }; }
  if (!data || data.ok === false) { if (data && data.reason === 'daily_limit') { DGS.left = 0; DGS.used = +data.used || DGS.used; } return { blocked: true, msg: DG_REASON[data && data.reason] || '입장할 수 없어요.' }; }
  DGS.left = Math.max(0, +data.left || 0); DGS.used = +data.used || 0;
  ss.set(TOK, JSON.stringify({ t: String(data.token), u, at: Date.now() })); return { mode: 'ranked', token: String(data.token) };
}
// 연습 원정 표시 (새로고침 뒤 run.js 가 읽음)
export const markPractice = why => ss.set(TOK, JSON.stringify({ practice: String(why || 'guest'), u: uid(), at: Date.now() }));
// 판 시작 때 한 번 꺼냄 (꺼낸 뒤 지움 → 판 중 새로고침 = 그 입장 소모, 메달 없음)
export function takeEntry() { let o = null; try { o = JSON.parse(ss.get(TOK) || 'null'); } catch (e) {} ss.del(TOK);
  if (!o || typeof o !== 'object' || Date.now() - (+o.at || 0) > 10 * 60 * 1000) return { mode: 'practice', why: uid() ? 'reload' : 'guest' };
  if (o.practice) return { mode: 'practice', why: String(o.practice) };
  if (typeof o.t === 'string' && /^[0-9a-f-]{36}$/i.test(o.t) && o.u && o.u === uid()) return { mode: 'ranked', token: o.t };
  return { mode: 'practice', why: 'reload' }; }
// 정산: 서버가 층 수·시간을 다시 검사해 메달 지급 (token 당 한 번). → { ok, medals, total, floors, capped } | { ok:false, msg }
export async function dgFinish(token, floors, win) {
  if (!token || !uid()) return { ok: false, msg: '로그인이 필요해요.' };
  let r = null; for (let i = 0; i < 3; i++) { r = await rpc('hd3d_dungeon_finish', { p_token: token, p_floors: Math.max(0, Math.floor(+floors || 0)), p_win: !!win }); if (!r.error || !offline(r.error)) break; await new Promise(f => setTimeout(f, 1500 * (i + 1))); }
  const { data, error } = r; if (error) return { ok: false, msg: isMissingErr(error) ? UPDATE_NEEDED : isBannedErr(error) ? '계정이 정지되어 메달을 받을 수 없어요.' : offline(error) ? '서버에 연결할 수 없어 메달을 받지 못했어요.' : '정산 실패: ' + (error.message || '') };
  if (!data || data.ok === false) return { ok: false, msg: DG_REASON[data && data.reason] || '정산 실패' };
  DGS.medals = Math.max(0, +data.total || 0); return { ok: true, medals: +data.medals || 0, total: DGS.medals, floors: +data.floors || 0, win: !!data.win, capped: !!data.capped };
}
// 던전 상점 구매 (가격은 서버 상수). 재료는 우편으로 → { ok, msg, mail }
export async function dgBuy(item) {
  if (!uid()) return { ok: false, msg: '로그인한 계정만 던전 상점을 쓸 수 있어요.' };
  const { data, error } = await rpc('hd3d_dungeon_buy', { p_item: String(item) });
  if (error) return { ok: false, msg: isMissingErr(error) ? UPDATE_NEEDED + ' — 관리자가 schema.sql 을 다시 실행하면 열려요.' : isBannedErr(error) ? '계정이 정지되어 구매할 수 없어요.' : offline(error) ? '서버에 연결할 수 없어요.' : '구매 실패: ' + (error.message || '') };
  if (!data || data.ok === false) { if (data && data.medals != null) DGS.medals = Math.max(0, +data.medals || 0); return { ok: false, msg: DG_REASON[data && data.reason] || '구매 실패' }; }
  DGS.medals = Math.max(0, +data.medals || 0); if (Array.isArray(data.titles)) DGS.titles = data.titles.filter(x => typeof x === 'string');
  return { ok: true, mail: data.mail || null, msg: data.mail ? '구매 완료! 우편함에서 받기를 눌러 주세요.' : '구매 완료!' };
}
