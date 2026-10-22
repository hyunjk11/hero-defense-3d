// 관리자 · 공지 · 정지 안내의 순수 로직 (DOM·네트워크 없음, node 테스트: tests/admin.test.mjs).
// 서버(supabase/schema.sql)가 모든 값을 다시 검사합니다. 여기 검사는 UI 안내용.
import { MAX_ESSENCE, cleanItems, validItems } from './rewarditems.js';
export const MAX_RW = 1000000;
export const UPDATE_MSG = '서버 업데이트 필요: schema.sql 을 다시 실행해 주세요';
// 폼 값 → 보상 객체 (0 은 빼고, 0~1,000,000 정수). hero 는 판매 영웅 키만
// items: 보상 아이템 줄 목록 (rewarditems.validItem 으로 거른 뒤 최대 10개), essence = 고유 정수(조각) 0~10,000
export function buildReward({ souls, steel, crystal, essence, hero, items } = {}, heroes = ['gunner', 'mechanic']) {
  const n = (v, cap = MAX_RW) => Math.max(0, Math.min(cap, Math.floor(+v || 0))), r = {};
  if (n(souls)) r.souls = n(souls); if (n(steel)) r.steel = n(steel); if (n(crystal)) r.crystal = n(crystal); if (n(essence, MAX_ESSENCE)) r.essence = n(essence, MAX_ESSENCE);
  if (hero && heroes.includes(hero)) r.hero = hero; const L = cleanItems(items); if (L.length) r.items = L.map(x => ({ ...x })); return r;
}
// hd3d_valid_reward 와 같은 규칙
export function validReward(r) {
  if (r == null) return true; if (typeof r !== 'object' || Array.isArray(r)) return false;
  return Object.keys(r).every(k => ['souls', 'steel', 'crystal', 'hero', 'essence', 'items'].includes(k)) && ['souls', 'steel', 'crystal'].every(k => r[k] == null || (Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= MAX_RW))
    && (r.essence == null || (Number.isInteger(r.essence) && r.essence >= 0 && r.essence <= MAX_ESSENCE)) && (r.hero == null || r.hero === 'gunner' || r.hero === 'mechanic') && validItems(r.items);
}
// 사유: 앞뒤 공백 제거, 1~200자 아니면 null (서버 hd3d_reason 과 같음)
export const cleanReason = s => { const t = String(s == null ? '' : s).trim(); return t.length >= 1 && t.length <= 200 ? t : null; };
export const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()) && String(e).trim().length <= 254;
// 서버 실패 사유 → 한국어
export const REASON = {
  not_pending: '이미 처리된 신청입니다.', not_approved: '승인된 주문만 환불할 수 있습니다.', no_user: '해당 사용자가 없습니다.', bad_reward: '보상 값이 올바르지 않습니다.', bad_title: '제목을 확인해 주세요 (1~60자, 공지는 80자).',
  bad_body: '내용이 너무 깁니다.', bad_reason: '사유를 1~200자로 입력해 주세요.', bad_item: '알 수 없는 상품입니다.', already: '이미 처리되어 있습니다.', not_owned: '보유하지 않은 영웅입니다.',
  self: '자기 자신은 정지할 수 없습니다.', target_admin: '관리자 계정은 정지할 수 없습니다.', target_banned: '정지된 계정은 관리자로 추가할 수 없습니다.', not_banned: '정지된 계정이 아닙니다.',
  count_mismatch: '받는 사람 수가 바뀌었습니다. 다시 확인해 주세요.', too_soon: '방금 전체 우편을 보냈습니다. 30초 뒤에 다시 시도해 주세요.', bad_range: '종료 시각이 시작 시각보다 뒤여야 합니다.',
  not_found: '대상을 찾을 수 없습니다.', bad_status: '알 수 없는 상태입니다.', owner: '최고 관리자는 삭제할 수 없습니다.', not_admin: '관리자가 아닙니다.',
};
export const reasonMsg = r => REASON[r] || '실패했습니다.' + (r ? ` (${r})` : '');
export const isMissingErr = e => !!e && (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883' || e.status === 404);
export const isForbiddenErr = e => !!e && (e.code === '42501' || /forbidden|permission denied/i.test(e.message || ''));
export const isBannedErr = e => !!e && (e.hint === 'banned' || /\bbanned\b/i.test(e.message || ''));
// 페이지 표시
export function pageInfo(total, offset, limit) { total = Math.max(0, +total || 0); limit = Math.max(1, +limit || 1); offset = Math.max(0, +offset || 0);
  const pages = Math.max(1, Math.ceil(total / limit)), page = Math.min(pages, Math.floor(offset / limit) + 1); return { page, pages, prev: page > 1 ? (page - 2) * limit : null, next: page < pages ? page * limit : null }; }
// 진행 요약 → 짧은 문장들
export function summaryParts(sm, heroName = k => k, advName = (h, b) => b) {
  if (!sm) return ['저장 없음']; const f = n => (+n || 0).toLocaleString('ko-KR');
  const adv = Object.entries(sm.adv || {}).map(([h, b]) => `${heroName(h)}→${advName(h, b)}`);
  return [`★ ${f(sm.stars)} · 하드 ★ ${f(sm.hstars)}`, `영혼석 ${f(sm.souls)} · 마력석 ${f(sm.crystal)} · 정수 ${f(sm.essence)}`, `최고 웨이브 ${f(sm.bestWave)} · 출정 ${f(sm.runs)}`, adv.length ? `전직: ${adv.join(', ')}` : '전직: 없음'];
}
// 공지: 게시 중(기간 안 · active) + 닫지 않은 것, 최신순
export function activeNotices(list, now = Date.now()) { return (Array.isArray(list) ? list : []).filter(n => n && n.active && (!n.starts_at || Date.parse(n.starts_at) <= now) && (!n.ends_at || Date.parse(n.ends_at) > now))
  .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : (b.id || 0) - (a.id || 0))); }
export const pendingNotices = (list, dismissed, now) => { const d = new Set((dismissed || []).map(String)); return activeNotices(list, now).filter(n => !d.has(String(n.id))); };
export const NOTICE_KEEP = 200;
export const dismissNotice = (dismissed, id) => [...new Set([...(Array.isArray(dismissed) ? dismissed : []).map(String), String(id)])].slice(-NOTICE_KEEP);
// 공지 상태 표시
export function noticeState(n, now = Date.now()) { if (!n.active) return 'off'; if (n.starts_at && Date.parse(n.starts_at) > now) return 'wait'; if (n.ends_at && Date.parse(n.ends_at) <= now) return 'ended'; return 'on'; }
export const NOTICE_ST = { on: '게시 중', off: '비활성', wait: '예약', ended: '기간 종료' };
// datetime-local 값 ↔ ISO (빈 값 = null)
export const localToIso = v => { if (!v) return null; const t = Date.parse(v); return isNaN(t) ? null : new Date(t).toISOString(); };
export const isoToLocal = s => { if (!s) return ''; const d = new Date(s); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
// 관리 기록
export const ACTION_N = { order_approve: '주문 승인', order_reject: '주문 거절', order_refund: '환불 처리', mail_send: '우편 보내기', broadcast: '전체 우편', hero_grant: '영웅 지급', hero_revoke: '영웅 회수',
  ban: '계정 정지', unban: '정지 해제', notice_create: '공지 작성', notice_update: '공지 수정', notice_activate: '공지 게시', notice_deactivate: '공지 내림', admin_add: '관리자 추가', admin_remove: '관리자 삭제' };
export function logDetail(l, rewardText = () => '') { const d = l && l.detail || {}, o = [];
  if (d.item) o.push(d.item === 'hero_gunner' ? '로즈' : d.item === 'hero_mechanic' ? '버들' : d.item); if (d.order) o.push('주문 #' + d.order); if (d.title) o.push('「' + d.title + '」');
  if (d.reward) { const t = rewardText(d.reward); if (t) o.push(t); } if (d.recipients != null) o.push(d.recipients + '명'); if (d.notice) o.push('공지 #' + d.notice); if (d.reason) o.push('사유: ' + d.reason); return o.join(' · '); }
// 전체 우편 확인 문구
export function broadcastConfirmText(count, rewardText) { return `이 게임의 사용자 <b>${count}명</b> 모두에게 우편을 보냅니다.${rewardText ? `<br>보상: <b>${rewardText}</b> (1인당)` : ''}<br>보낸 뒤에는 되돌릴 수 없습니다.`; }
