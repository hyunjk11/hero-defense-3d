// 관리자 확장 API (Supabase RPC). 모든 권한은 서버(supabase/schema.sql 의 SECURITY DEFINER 함수)가 다시 검사합니다.
// 새 RPC 가 없으면(schema.sql 재실행 전) { ok:false, missing:true, msg: '서버 업데이트 필요…' } → UI 가 안내.
import { A, ensureClient } from './account.js';
import * as L from './adminlogic.js';

async function client() { return A.sb || ensureClient(); }
export async function call(fn, args = {}) {
  let r; try { const c = await client(); r = await c.rpc(fn, args); } catch (e) { r = { data: null, error: { message: String((e && e.message) || e) } }; }
  const { data, error } = r || {};
  if (error) { const missing = L.isMissingErr(error);
    return { ok: false, missing, msg: missing ? L.UPDATE_MSG : L.isForbiddenErr(error) ? '권한이 없습니다.' : /failed to fetch|network/i.test(error.message || '') ? '서버에 연결할 수 없습니다.' : error.message || '오류' }; }
  if (data && data.ok === false) { const nh = data.reason === 'bad_reward' && args.p_reward && args.p_reward.hero === 'fighter'; /* 새 영웅 보상인데 서버 검사 구버전 */ return { ok: false, reason: data.reason, count: data.count, outdated: nh || undefined, msg: nh ? L.UPDATE_MSG + ' (격투가 서윤)' : L.reasonMsg(data.reason) }; }
  return { ok: true, data };
}
export const users = (q, off = 0, lim = 20) => call('hd3d_admin_users', { p_query: q || '', p_offset: off, p_limit: lim });
export const user = id => call('hd3d_admin_user', { p_user: id });
// 클라이언트가 아는 상품인데 서버가 bad_item → 새 영웅(예: 격투가 서윤 hero_fighter) 추가 후 schema.sql 미실행 → '서버 업데이트 필요'
const newItem = r => (r && !r.ok && (r.reason === 'bad_item' || r.reason === 'bad_reward') ? { ...r, outdated: true, msg: L.UPDATE_MSG + ' (새 상품/영웅 반영)' } : r);
export const grantHero = async (id, item, reason) => newItem(await call('hd3d_admin_grant_hero', { p_user: id, p_item: item, p_reason: reason }));
export const revokeHero = async (id, item, reason) => newItem(await call('hd3d_admin_revoke_hero', { p_user: id, p_item: item, p_reason: reason }));
export const broadcastCount = () => call('hd3d_admin_broadcast_count');
export const broadcast = (title, body, reward, expected) => call('hd3d_admin_broadcast', { p_title: title, p_body: body || '', p_reward: reward && Object.keys(reward).length ? reward : null, p_expected: expected });
export const noticeSave = (id, title, body, active, starts, ends) => call('hd3d_admin_notice_save', { p_id: id == null ? null : id, p_title: title, p_body: body || '', p_active: !!active, p_starts: starts || null, p_ends: ends || null });
export const noticeActive = (id, on) => call('hd3d_admin_notice_active', { p_id: id, p_active: !!on });
export const ban = (id, reason) => call('hd3d_admin_ban', { p_user: id, p_reason: reason });
export const unban = (id, reason) => call('hd3d_admin_unban', { p_user: id, p_reason: reason });
export const orders = (status, q, off = 0, lim = 20) => call('hd3d_admin_orders', { p_status: status || null, p_query: q || '', p_offset: off, p_limit: lim });
export const refund = (id, reason) => call('hd3d_admin_refund', { p_order_id: id, p_reason: reason });
export const logs = (action, off = 0, lim = 30) => call('hd3d_admin_log_list', { p_action: action || null, p_offset: off, p_limit: lim });
export const admins = () => call('hd3d_owner_admins');
export const addAdmin = email => call('hd3d_owner_add_admin', { p_email: email });
export const removeAdmin = email => call('hd3d_owner_remove_admin', { p_email: email });
// 공지 목록 (테이블 RLS: 사용자 = 게시 중인 것만, 관리자 = 전체). 반환 { ok, list, missing }
export async function notices(limit = 30) {
  let r; try { const c = await client(); r = await c.from('hd3d_notices').select('*').order('created_at', { ascending: false }).limit(limit); } catch (e) { r = { error: { message: String(e) } }; }
  if (r.error) return { ok: false, missing: L.isMissingErr(r.error), list: [], msg: L.isMissingErr(r.error) ? L.UPDATE_MSG : r.error.message };
  return { ok: true, list: r.data || [] };
}
