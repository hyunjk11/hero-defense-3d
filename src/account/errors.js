// C-6 (2026-10-23): 서버(Supabase/PostgREST) 오류 판정 한 곳 — adminlogic.js 는 이 이름들을 그대로 다시 내보냄 (기존 import 호환)
export const isMissingErr = e => !!e && (e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01' || e.code === '42883' || e.status === 404); // schema.sql 미실행 (테이블/함수 없음)
export const isForbiddenErr = e => !!e && (e.code === '42501' || /forbidden|permission denied/i.test(e.message || ''));
export const isBannedErr = e => !!e && (e.hint === 'banned' || /\bbanned\b/i.test(e.message || ''));
