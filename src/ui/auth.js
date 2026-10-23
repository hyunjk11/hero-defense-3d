// ================= 로그인 화면 · 메인 메뉴 (C-9, ui/flow.js 에서 이동 — 동작 불변) =================
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import * as Acc from '../account/account.js';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); // flow.js 와 같은 정의 (util.esc 는 null → '' 이라 그대로 둠)
// 화면 전환(show)은 flow.js 가 가진 SCREENS 상태 — initAuth 로 받음
let H = { show: () => {} };
export function initAuth(h) { H = h; }
export async function afterIntro() {
  Snd.unlock(); Snd.play('confirm'); H.show('login'); refreshLogin(); $('lgMsg').textContent = '';
  if (Acc.hasSession()) { $('lgMsg').textContent = '자동 로그인 중…'; setBusy(true); const ok = await Acc.autoLogin(); setBusy(false); if (ok) { toMenu(); return; } $('lgMsg').textContent = Acc.A.msg || '세션이 만료되었습니다. 다시 로그인해 주세요.'; }
}
function setBusy(b) { document.querySelectorAll('#scr_login button').forEach(x => x.disabled = b); }
export function refreshLogin() { const st = $('lgStatus'); if (st) st.textContent = Acc.A.user ? `로그인됨: ${Acc.A.user.email}` : ''; }
export async function doAuth(kind) {
  const email = $('lgEmail').value.trim(), pw = $('lgPw').value; Snd.play('ui');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('lgMsg').textContent = '이메일을 정확히 입력해 주세요.'; return; }
  if (pw.length < 6) { $('lgMsg').textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
  setBusy(true); $('lgMsg').textContent = kind === 'up' ? '회원가입 중…' : '로그인 중…';
  try { await (kind === 'up' ? Acc.signUp(email, pw) : Acc.signIn(email, pw)); $('lgMsg').textContent = ''; Snd.play('confirm'); toMenu(); }
  catch (e) { $('lgMsg').textContent = e.message || String(e); Snd.play('error'); }
  setBusy(false);
}
export function toMenu() { H.show('menu'); refreshMenu(); }
export function refreshMenu() {
  if (G.screen !== 'menu') return; const s = Acc.load(), A = Acc.A;
  $('mnAcct').innerHTML = A.user ? `<b>${esc(A.user.email)}</b><br><span class="sync s_${A.sync}">${Acc.SYNC_TXT[A.sync] || ''}</span>` : `<b>게스트</b><br><span class="sync">이 기기에만 저장됩니다</span>`;
  if (document.activeElement !== $('mnNick')) $('mnNick').value = s.nick || '';
  $('mnCont').disabled = !(s.stats.runs > 0 || s.souls > 0); $('mnSummary').innerHTML = `영혼석 <b>${s.souls}</b> · 최고 웨이브 <b>${s.bestWave}</b> · 출정 ${s.stats.runs}회`;
  $('mnAuth').textContent = A.user ? '로그아웃' : '로그인 / 회원가입';
}
