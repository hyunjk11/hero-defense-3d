// 마을 공지 배너 (서버 hd3d_notices, 로그인 사용자 = 게시 중인 공지만) + 계정 정지 안내.
// 공지는 '확인'/✕ 로 닫으면 그 공지 id 를 localStorage(hd3d_notice_seen)에 적어 다시 띄우지 않음. 서버에 표가 없으면(schema.sql 재실행 전) 조용히 생략.
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';
import * as Adm from '../account/admin.js';
import * as L from '../account/adminlogic.js';

const KEY = 'hd3d_notice_seen';
const seen = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const keep = a => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} };
let queue = [], token = 0;
// 마을 입장 시 호출
export async function showNotices() {
  const my = ++token; if (!Acc.A.user) { queue = []; render(); return; }
  const r = await Adm.notices(20); if (my !== token) return;
  queue = r.ok && Acc.A.user ? L.pendingNotices(r.list, seen()) : []; render();
}
function render() {
  const el = $('noticeBar'); if (!el) return; const n = queue[0];
  if (!n) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.innerHTML = `<div class="nbHead"><span class="nbIco">📢</span><b class="nbT">${esc(n.title)}</b>${queue.length > 1 ? `<small class="nbN">1 / ${queue.length}</small>` : ''}<button class="gbtn sm nbX" id="nbClose" title="닫기">✕</button></div>${n.body ? `<div class="nbB">${esc(n.body)}</div>` : ''}<div class="nbAct"><button class="gbtn sm" id="nbOk">${queue.length > 1 ? '확인 · 다음 공지' : '확인'}</button></div>`;
  el.classList.remove('hidden'); el.dataset.id = n.id;
  $('nbOk').onclick = $('nbClose').onclick = () => { keep(L.dismissNotice(seen(), n.id)); queue.shift(); Snd.play('ui'); render(); };
}
// 정지 안내 (서버 상태가 바뀔 때마다)
export function renderBan() {
  const el = $('banNote'); if (!el) return; const b = Sh.isBanned(), r = Sh.S.me.reason || '';
  const h = b ? `<b>⛔ 계정이 정지되었습니다</b>${r ? `<span class="bnR">사유: ${esc(r)}</span>` : ''}<small>진행은 이 기기에만 저장되고, 서버 저장 · 구매 신청 · 우편 받기가 제한됩니다. 문의는 관리자에게 해 주세요.</small>` : '';
  if (el._h !== h) { el._h = h; el.innerHTML = h; } el.classList.toggle('hidden', !b);
}
export function initNotice() { Sh.onShop(renderBan); Acc.onChange(renderBan); renderBan(); }
