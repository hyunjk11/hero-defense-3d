// ================= 관리자 패널: 주문 관리 · 유저 관리 · 우편 보내기 · 전체 우편 · 공지 · 활동 기록 · 관리자(owner) =================
// 버튼 표시는 서버 상태(Sh.isAdminUI)로만 하고, 실제 권한은 서버 RPC 가 다시 검사합니다 (src/account/admin.js, supabase/schema.sql).
// 되돌릴 수 없는 일(환불·회수·정지·전체 우편·관리자 삭제)은 게임 안 확인 창(#admConfirm)을 거칩니다. 사유가 필요한 일은 사유 입력 필수.
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import { CLASSES, heroLabel, VISIBLE_HEROES } from '../data/heroes.js';
import * as AD from '../data/advance.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';
import * as Adm from '../account/admin.js';
import * as L from '../account/adminlogic.js';
import * as RI from '../account/rewarditems.js';
import { GRADES, SLOTS, SLOT_KEYS } from '../account/equip.js';
import { CHSET, CH_KEYS, UQ } from '../data/items.js';
import { SHOP } from '../config/shop.js';

const fmtD = s => { const d = new Date(s); return !s || isNaN(d) ? '—' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ST_N = { pending: '승인 대기', approved: '승인됨', rejected: '거절됨', refunded: '환불됨' };
const ITEMS = Object.keys(SHOP.items), ICO = { hero_gunner: '🌹', hero_mechanic: '🛠️', hero_fighter: '👊' };
const itemN = k => (SHOP.items[k] || {}).n || k, heroOf = k => (SHOP.items[k] || {}).hero;
const heroName = h => (CLASSES[h] ? heroLabel(h) : h), advName = (h, b) => { const a = AD.ADV[h] && AD.ADV[h][b]; return a ? a.icon + ' ' + a.n : b; };
const rwText = rw => Sh.rewardText(rw);
let isOpen = false, hooks = { closeOthers: () => {}, onChange: () => {} }, fresh = false;
const st = { tab: 'orders', msg: null, ord: { status: '', q: '', off: 0, lim: 20, data: null, legacy: false }, usr: { q: '', off: 0, lim: 20, data: null, sel: null, detail: null },
  ntc: { list: null, edit: null }, log: { action: '', off: 0, lim: 30, data: null }, adm: { list: null }, busy: false, rw: { ud: [], am: [], bc: [] } };
export const adminOpen = () => isOpen;
const paintMsg = () => { const m = $('admMsg'), x = st.msg; if (m) m.innerHTML = x ? `<span class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✅' : '⚠'} ${esc(x.t)}</span>` : ''; };
const msg = (t, ok = false) => { st.msg = t ? { t, ok } : null; paintMsg(); };

// ---------- 열기 / 닫기 ----------
export function openAdmin() { if (!Sh.isAdminUI()) return; Snd.play('confirm'); hooks.closeOthers('admin'); isOpen = true; $('adminPanel').classList.remove('hidden'); msg(''); st.usr.sel = null; renderAdmin(); load(st.tab); }
export function closeAdmin(silent) {
  if (!silent && !$('admConfirm').classList.contains('hidden')) { $('acfNo').click(); return; } // 확인 창이 열려 있으면 그것만 닫음
  if (isOpen && !silent) Snd.play('ui'); isOpen = false; $('adminPanel').classList.add('hidden'); $('admConfirm').classList.add('hidden');
}
function setTab(t) { if (t === 'admins' && !Sh.isOwnerUI()) t = 'orders'; st.tab = t; msg(''); fresh = true; renderAdmin(); load(t); }
async function load(t) {
  if (t === 'orders') return loadOrders(); if (t === 'users') return st.usr.sel ? loadUser(st.usr.sel) : loadUsers(); if (t === 'notice') return loadNotices(); if (t === 'log') return loadLog(); if (t === 'admins') return loadAdmins();
}
const need = r => { if (!r.ok) msg(r.msg); return r.ok; };

// ---------- 확인 창 (사유 입력 옵션) → Promise<{reason}|null> ----------
function confirmBox({ title, html, reason = false, yes = '확인', danger = true }) {
  return new Promise(res => {
    const box = $('admConfirm'); box.querySelector('.acfT').textContent = title; box.querySelector('.acfM').innerHTML = html; box.querySelector('.acfR').classList.toggle('hidden', !reason);
    $('acfReason').value = ''; box.querySelector('.acfE').textContent = ''; $('acfYes').textContent = yes; $('acfYes').classList.toggle('danger', danger); box.classList.remove('hidden'); Snd.play('ui');
    if (reason) setTimeout(() => $('acfReason').focus(), 60);
    const done = v => { box.classList.add('hidden'); $('acfYes').onclick = $('acfNo').onclick = null; res(v); };
    $('acfNo').onclick = () => { Snd.play('ui'); done(null); };
    $('acfYes').onclick = () => { let r = null; if (reason) { r = L.cleanReason($('acfReason').value); if (!r) { box.querySelector('.acfE').textContent = '사유를 입력해 주세요 (1~200자).'; Snd.play('error'); return; } } done({ reason: r }); };
  });
}

// ---------- 공용 렌더 ----------
function setBody(h) { // 같은 id 입력칸 값은 다시 그려도 유지 (fresh = 의도적으로 새 값)
  const b = $('admBody'); if (b._h === h) return; const keep = {}; if (!fresh) b.querySelectorAll('input[id],textarea[id],select[id]').forEach(e => { keep[e.id] = e.type === 'checkbox' ? e.checked : e.value; });
  b._h = h; b.innerHTML = h; fresh = false; for (const [id, v] of Object.entries(keep)) { const e = b.querySelector('#' + id); if (e) { if (e.type === 'checkbox') e.checked = v; else e.value = v; } }
  for (const px of ['ud', 'am', 'bc']) if ($(px + 'Prev')) { rwPaint(px); if ($(px + 'Q') && $(px + 'Q').value) rwSearch(px); const sl = $(px + 'Slot'); if (sl && $(px + 'H')) $(px + 'H').disabled = sl.value !== 'weapon'; }
}
const pager = (d, act) => { if (!d || d.total <= d.limit) return ''; const p = L.pageInfo(d.total, d.offset, d.limit);
  return `<div class="admPager"><button class="gbtn sm" data-act="${act}" data-off="${p.prev ?? ''}" ${p.prev == null ? 'disabled' : ''}>◀ 이전</button><span>${p.page} / ${p.pages} 쪽 · 전체 ${d.total}</span><button class="gbtn sm" data-act="${act}" data-off="${p.next ?? ''}" ${p.next == null ? 'disabled' : ''}>다음 ▶</button></div>`; };
// ---------- 보상 입력 (재화 + 고유 정수(조각) + 아이템 줄 최대 10개 + 미리보기). px = ud(유저 상세) · am(우편 보내기) · bc(전체 우편) ----------
// 아이템 줄은 st.rw[px] 에 보관 (다시 그려도 유지). 서버가 hd3d_valid_reward/hd3d_valid_item 으로 다시 검사
const rwNum = (px, k, n, max) => `<label>${n}<input id="${px}${k}" type="number" min="0" max="${max}" value="0" data-rw="${px}"></label>`;
const gOpts = g => GRADES.map((G, i) => `<option value="${i}" ${i === g ? 'selected' : ''}>${G.n}</option>`).join('');
function rwLines(px) { const Ls = st.rw[px];
  if (!Ls.length) return '<div class="rwEmpty">아이템 없음 — 위에서 검색하거나 장비/고유를 골라 추가하세요 (최대 10개)</div>';
  return Ls.map((x, i) => `<div class="rwLine" style="--gc:${RI.gradeColor(x)}"><span class="rwIc">${RI.itemIcon(x)}</span><span class="rwN">${esc(RI.itemLabel(x))}</span>`
    + (x.k === 'gear' ? `<select class="rwG" data-change="rwg" data-px="${px}" data-i="${i}" aria-label="등급">${gOpts(x.g)}</select>` : '')
    + `<button class="gbtn sm" data-act="rwdel" data-px="${px}" data-i="${i}" aria-label="빼기">✕</button></div>`).join(''); }
function rwPrev(px) { const rw = rwRead(px), P = RI.previewLines(rw); return P.length ? `<b>받을 보상 미리보기</b><ul>${P.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<span class="dim">보상 없음 (메시지만 보냅니다)</span>'; }
const rwForm = (px, hero = true) => `<div class="rwBox" id="${px}Rw"><div class="amRw">${rwNum(px, 'Souls', '영혼석', 1000000)}${rwNum(px, 'Steel', '강철', 1000000)}${rwNum(px, 'Crystal', '마력석', 1000000)}${rwNum(px, 'Ess', '고유 정수(조각)', RI.MAX_ESSENCE)}${rwNum(px, 'Med', '🏅 던전 메달', L.MAX_MEDALS)}${hero ? `<label>영웅 지급<select id="${px}Hero" data-rw="${px}"><option value="">없음</option>${ITEMS.filter(Sh.onSale).map(k => `<option value="${heroOf(k)}">${esc(heroName(heroOf(k)))}</option>`).join('')}</select></label>` : ''}</div>
  <div class="rwAdd"><label class="rwQ">아이템 검색<input id="${px}Q" maxlength="30" placeholder="이름으로 검색 (예: 세계수, 전설 방어구)" data-rwq="${px}" autocomplete="off"></label><div class="rwRes" id="${px}Res"></div></div>
  <div class="rwAdd rwPick"><select id="${px}Slot" data-change="rwslot" data-px="${px}" aria-label="부위">${SLOT_KEYS.map(k => `<option value="${k}">${SLOTS[k]}</option>`).join('')}</select><select id="${px}H" aria-label="영웅">${VISIBLE_HEROES.map(h => `<option value="${h}">${esc(heroName(h))}</option>`).join('')}</select><select id="${px}G" aria-label="등급">${gOpts(4)}</select><select id="${px}C" aria-label="세트"><option value="">세트 없음</option>${CH_KEYS.map(c => `<option value="${c}">${CHSET[c].badge} ${CHSET[c].n} 세트</option>`).join('')}</select><button class="gbtn sm" data-act="rwgear" data-px="${px}">＋ 장비</button>
    <select id="${px}U" aria-label="고유 아이템">${RI.UQ_KEYS.map(k => `<option value="${k}">◆ ${esc(UQ[k].n)}</option>`).join('')}</select><button class="gbtn sm" data-act="rwuq" data-px="${px}">＋ 고유</button></div>
  <div class="rwLines" id="${px}Lines">${rwLines(px)}</div><div class="rwPrev" id="${px}Prev">${rwPrev(px)}</div></div>`;
const rv = id => { const e = $(id); return e ? e.value : ''; };
const rwRead = px => L.buildReward({ souls: rv(px + 'Souls'), steel: rv(px + 'Steel'), crystal: rv(px + 'Crystal'), essence: rv(px + 'Ess'), medals: rv(px + 'Med'), hero: rv(px + 'Hero'), items: st.rw[px] });
const rwPaint = px => { const a = $(px + 'Lines'), b = $(px + 'Prev'); if (a) a.innerHTML = rwLines(px); if (b) b.innerHTML = rwPrev(px); };
const rwReset = px => { st.rw[px] = []; };
const rwAddLine = (px, spec) => { if (st.rw[px].length >= RI.MAX_ITEMS) { msg(`아이템은 우편 한 통에 최대 ${RI.MAX_ITEMS}개까지 넣을 수 있어요.`); Snd.play('error'); return; } if (!RI.validItem(spec)) return; st.rw[px].push({ ...spec }); Snd.play('ui'); rwPaint(px); };
let rwHits = {};
function rwSearch(px) { const q = $(px + 'Q').value, H = RI.searchCatalog(q, 8, CAT()); rwHits[px] = H; const el = $(px + 'Res'); if (!el) return;
  el.innerHTML = !q.trim() ? '' : H.length ? H.map((e, i) => `<button class="rwHit" data-act="rwhit" data-px="${px}" data-i="${i}" style="--gc:${RI.gradeColor(e.spec)}">${RI.itemIcon(e.spec)} ${esc(e.label)}</button>`).join('') : '<span class="dim">검색 결과 없음</span>'; }
let catC = null; const CAT = () => catC || (catC = RI.catalog());
const badge = (t, c) => `<em class="aBadge ${c}">${t}</em>`;

export function renderAdmin() {
  if (!isOpen) return;
  const own = Sh.isOwnerUI(); document.querySelectorAll('#admTabs .ftab').forEach(b => { b.classList.toggle('on', b.dataset.t === st.tab); if (b.dataset.t === 'admins') b.classList.toggle('hidden', !own); });
  if (st.tab === 'admins' && !own) st.tab = 'orders';
  setBody(({ orders: hOrders, users: hUsers, mail: hMail, broadcast: hBroadcast, notice: hNotice, log: hLog, admins: hAdmins })[st.tab]());
  paintMsg();
}

// ---------- 주문 관리 ----------
async function loadOrders(keepMsg = false) {
  const o = st.ord, r = await Adm.orders(o.status, o.q, o.off, o.lim);
  if (r.ok) { o.data = r.data; o.legacy = false; Sh.S.adminOrders = r.data.rows || []; }
  else if (r.missing) { // 서버가 예전 schema → 예전 목록(승인/거절만)
    const r2 = await Sh.adminOrders(); o.legacy = true;
    if (r2.ok) { const cnt = {}; for (const x of r2.list) cnt[x.status] = (cnt[x.status] || 0) + 1; o.data = { rows: r2.list, total: r2.list.length, offset: 0, limit: Math.max(1, r2.list.length), counts: cnt }; if (!keepMsg) msg(L.UPDATE_MSG + ' (주문 승인/거절만 가능)'); }
    else { o.data = null; msg(r2.msg); }
  } else msg(r.msg);
  renderAdmin();
}
function hOrders() {
  const o = st.ord, d = o.data, rows = d ? d.rows || [] : [], cnt = (d && d.counts) || {}, all = Object.values(cnt).reduce((a, b) => a + b, 0);
  const chips = o.legacy ? '' : `<div class="admChips">${[['', '전체', all], ...['pending', 'approved', 'rejected', 'refunded'].map(s => [s, ST_N[s], cnt[s] || 0])].map(([s, n, c]) => `<button class="ftab ${o.status === s ? 'on' : ''}" data-act="ostatus" data-s="${s}">${n} <b>${c}</b></button>`).join('')}</div>`;
  const bar = `<div class="admBar">${o.legacy ? `<span>대기 <b>${cnt.pending || 0}</b> · 전체 ${rows.length}</span>` : `<input id="aoQ" placeholder="이메일 · 닉네임으로 찾기" maxlength="100" data-enter="osearch" value="${esc(o.q)}"><button class="gbtn sm" data-act="osearch">🔍 검색</button>`}<input id="admReason" placeholder="거절 사유 (선택)" maxlength="200"><button class="gbtn sm" id="admReload" data-act="oreload">새로고침</button></div>`;
  const list = rows.length ? `<div class="admTable">${rows.map(x => `<div class="admRow s_${x.status}"><div class="aWho"><b>${esc(x.nickname || '—')}</b><small>${esc(x.email || x.user_id)}</small></div><div class="aItem">${ICO[x.item] || '🎁'} ${esc(itemN(x.item))}<small>주문 #${x.id}</small></div><div class="aDate">${fmtD(x.created_at)}</div><div class="aSt">${ST_N[x.status] || esc(x.status)}${x.decided_at ? `<small>${fmtD(x.decided_at)}</small>` : ''}${x.status === 'refunded' && x.refund_note ? `<small>사유: ${esc(x.refund_note)}</small>` : x.status === 'rejected' && x.note ? `<small>사유: ${esc(x.note)}</small>` : ''}</div>
    <div class="aAct">${x.status === 'pending' ? `<button class="gbtn main admOk" data-act="oapprove" data-id="${x.id}">승인</button><button class="gbtn admNo" data-act="oreject" data-id="${x.id}">거절</button>` : x.status === 'approved' && !o.legacy ? `<button class="gbtn admRefund" data-act="orefund" data-id="${x.id}">↩ 환불</button>` : ''}</div></div>`).join('')}</div>` : `<div class="emptyMsg">${d ? (o.q || o.status ? '조건에 맞는 주문이 없어요.' : '구매 신청이 없어요.') : '불러오는 중…'}</div>`;
  return chips + bar + list + (o.legacy ? '' : pager(d, 'opage'));
}
async function decide(b, p, okMsg) { b.disabled = true; Snd.play('ui'); const r = await p; msg(r.ok ? okMsg : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); await loadOrders(true); }

// ---------- 유저 관리 ----------
async function loadUsers() { const u = st.usr, r = await Adm.users(u.q, u.off, u.lim); if (need(r)) u.data = r.data; else u.data = u.data || null; renderAdmin(); }
async function loadUser(id) { const u = st.usr; if (u.sel !== id) rwReset('ud'); u.sel = id; const r = await Adm.user(id); if (need(r)) u.detail = r.data; else if (!u.detail || u.detail.user.id !== id) { u.detail = null; u.sel = null; } renderAdmin(); }
const ownedIcons = c => (c.owned || []).map(k => `<i title="${esc(itemN(k))}">${ICO[k] || '🎁'}</i>`).join('');
const roleBadges = c => (c.owner ? badge('최고 관리자', 'own') : c.admin ? badge('관리자', 'adm') : '') + (c.banned ? badge('⛔ 정지', 'ban') : '');
function hUsers() {
  const u = st.usr; if (u.sel) return hUser();
  const d = u.data, rows = d ? d.rows || [] : [];
  const bar = `<div class="admBar"><input id="auQ" placeholder="이메일 · 닉네임으로 찾기 (비우면 전체)" maxlength="100" data-enter="usearch" value="${esc(u.q)}"><button class="gbtn sm main" data-act="usearch">🔍 검색</button><span class="aCnt">${d ? `${d.total}명` : ''}</span></div>`;
  const list = rows.length ? `<div class="admTable">${rows.map(c => { const s = c.summary;
    return `<div class="admRow auRow ${c.banned ? 's_banned' : ''}" data-act="uopen" data-id="${esc(c.id)}"><div class="aWho"><b>${esc(c.nickname || '—')} ${roleBadges(c)}</b><small>${esc(c.email || '')}</small></div>
      <div class="aSum">${s ? `★ ${s.stars} · 하드 ★ ${s.hstars}<small>영혼석 ${(+s.souls).toLocaleString('ko-KR')} · 마력석 ${(+s.crystal).toLocaleString('ko-KR')} · 정수 ${+s.essence}</small>` : '<small>저장 없음</small>'}</div>
      <div class="aOwn">${ownedIcons(c) || '<small>유료 영웅 없음</small>'}${s && Object.keys(s.adv || {}).length ? `<small>전직 ${Object.keys(s.adv).length}</small>` : ''}</div>
      <div class="aDate"><small>가입 ${fmtD(c.created_at)}</small><small>접속 ${fmtD(c.last_seen)}</small><small>저장 ${fmtD(c.saved_at)}</small></div><div class="aAct"><span class="aGo">상세 ▶</span></div></div>`; }).join('')}</div>`
    : `<div class="emptyMsg">${d ? '찾는 사용자가 없어요.' : '불러오는 중…'}</div>`;
  return bar + list + pager(d, 'upage');
}
function hUser() {
  const D = st.usr.detail; if (!D) return '<div class="admBar"><button class="gbtn sm" data-act="uback">← 목록</button></div><div class="emptyMsg">불러오는 중…</div>';
  const c = D.user, me = Acc.A.user && Acc.A.user.id === c.id, parts = L.summaryParts(c.summary, heroName, advName);
  const heroes = ITEMS.map(k => { const has = (c.owned || []).includes(k); return `<div class="udHero ${has ? 'has' : ''}"><i>${ICO[k] || '🎁'}</i><b>${esc(heroName(heroOf(k)))}</b><span>${has ? '보유 ✓' : '미보유'}</span>${has ? `<button class="gbtn sm" data-act="urevoke" data-k="${k}">회수</button>` : `<button class="gbtn sm main" data-act="ugrant" data-k="${k}">지급</button>`}</div>`; }).join('');
  const banBox = c.admin ? `<div class="hintS">관리자 계정은 정지할 수 없어요.</div>` : me ? `<div class="hintS">자기 자신은 정지할 수 없어요.</div>` : c.banned
    ? `<div class="udBan on">⛔ 정지됨 · ${fmtD(c.banned_at)}<small>사유: ${esc(c.ban_reason || '')}</small></div><button class="gbtn sm" data-act="uunban">정지 해제</button>`
    : `<div class="udBan">정상 계정</div><button class="gbtn sm danger" data-act="uban">⛔ 계정 정지</button>`;
  const ords = (D.orders || []).map(o => `<li>${ICO[o.item] || '🎁'} ${esc(itemN(o.item))} · <b class="s_${o.status}">${ST_N[o.status] || esc(o.status)}</b> · ${fmtD(o.created_at)}</li>`).join('') || '<li class="hintS">없음</li>';
  const mails = (D.mail || []).map(m => `<li>${esc(m.title)}${m.reward ? ` · <small>${esc(rwText(m.reward))}</small>` : ''} · ${m.revoked && !m.claimed ? '<b class="s_rejected">회수됨</b>' : m.claimed ? '<b class="s_approved">받음</b>' : m.reward ? '<b class="s_pending">미수령</b>' : '<small>안내</small>'} · <small>${fmtD(m.created_at)}</small></li>`).join('') || '<li class="hintS">없음</li>';
  const logs = (D.log || []).map(l => `<li><b>${esc(L.ACTION_N[l.action] || l.action)}</b> · ${esc(L.logDetail(l, rwText))} · <small>${esc(l.admin_email || '')} · ${fmtD(l.created_at)}</small></li>`).join('') || '<li class="hintS">없음</li>';
  return `<div class="admBar"><button class="gbtn sm" data-act="uback">← 목록</button><b class="udName">${esc(c.nickname || '—')} ${roleBadges(c)}</b><span class="udMail">${esc(c.email || '')}</span><button class="gbtn sm" data-act="ureload">새로고침</button></div>
  <div class="udGrid"><div class="udCol">
    <div class="udCard"><div class="udH">계정 정보</div><div class="udKv"><span>가입</span><b>${fmtD(c.created_at)}</b><span>최근 접속</span><b>${fmtD(c.last_seen)}</b><span>마지막 저장</span><b>${fmtD(c.saved_at)}</b><span>ID</span><b class="udId">${esc(c.id)}</b></div></div>
    <div class="udCard"><div class="udH">진행 요약</div>${parts.map(p => `<div class="udLine">${esc(p)}</div>`).join('')}</div>
    <div class="udCard"><div class="udH">유료 영웅 (서버 소유권)</div>${heroes}</div>
    <div class="udCard"><div class="udH">던전 (서버)</div>${D.dungeon ? `<div class="udKv" id="udDungeon"><span>던전 메달</span><b>🏅 ${+D.dungeon.medals || 0}</b><span>모은/쓴 메달</span><b>${+D.dungeon.earned || 0} / ${+D.dungeon.spent || 0}</b><span>오늘 입장</span><b>${+D.dungeon.today || 0} / 3</b><span>전체 원정</span><b>${+D.dungeon.runs || 0}</b></div>` : `<div class="hintS">${esc(L.UPDATE_MSG)} (던전 메달)</div>`}</div>
    <div class="udCard"><div class="udH">계정 상태</div><div class="udBanRow">${banBox}</div></div>
  </div><div class="udCol">
    <div class="udCard admForm"><div class="udH">이 사용자에게 우편 보내기</div><label>제목<input id="udTitle" maxlength="60" value="운영자의 선물"></label><label>내용<textarea id="udBody" maxlength="1000" rows="2">모험에 도움이 되길 바랍니다!</textarea></label>${rwForm('ud')}<button class="gbtn main" data-act="umail">✉ 우편 보내기</button></div>
    <div class="udCard"><div class="udH">최근 주문</div><ul class="udList">${ords}</ul></div>
    <div class="udCard"><div class="udH">최근 우편</div><ul class="udList">${mails}</ul></div>
    <div class="udCard"><div class="udH">관리 기록</div><ul class="udList">${logs}</ul></div>
  </div></div>`;
}

// ---------- 우편 보내기 (이메일) ----------
function hMail() {
  return `<div class="admForm"><label>받는 사람 이메일<input id="amEmail" type="email" placeholder="user@example.com" maxlength="254"></label><label>제목<input id="amTitle" maxlength="60" value="운영자의 선물"></label>
    <label>내용<textarea id="amBody" maxlength="1000" rows="3">모험에 도움이 되길 바랍니다!</textarea></label>${rwForm('am')}<button class="gbtn main" id="amSend" data-act="amsend">✉ 우편 보내기</button><div class="hintS">특정 사용자 한 명에게 보냅니다. 모두에게 보내려면 「📨 전체 우편」 탭을 쓰세요.</div></div>`;
}
// ---------- 전체 우편 ----------
function hBroadcast() {
  return `<div class="admForm"><div class="bcInfo">📨 이 게임의 <b>모든 사용자</b>(닉네임/저장이 있는 계정)에게 우편을 <b>1통씩</b> 보냅니다. 각자 <b>한 번만</b> 받을 수 있어요 (서버에서 확인). 발송 뒤에 가입한 사용자는 받지 않아요.</div>
    <label>제목<input id="bcTitle" maxlength="60" placeholder="예) 점검 보상"></label><label>내용<textarea id="bcBody" maxlength="1000" rows="3" placeholder="모두에게 보낼 메시지"></textarea></label>${rwForm('bc')}
    <button class="gbtn main" id="bcSend" data-act="bcsend" ${st.busy ? 'disabled' : ''}>📨 전체 우편 보내기…</button><div class="hintS">보내기 전에 받는 사람 수를 확인하는 창이 뜹니다. 같은 우편을 30초 안에 다시 보낼 수 없어요.</div></div>`;
}
// ---------- 공지 ----------
async function loadNotices() { const r = await Adm.notices(50); if (r.ok) st.ntc.list = r.list; else { st.ntc.list = st.ntc.list || []; msg(r.msg); } renderAdmin(); }
function hNotice() {
  const N = st.ntc, e = N.edit, list = N.list;
  const form = `<div class="admForm ntForm"><div class="udH">${e ? `공지 #${e.id} 수정` : '새 공지'}</div><label>제목<input id="ntTitle" maxlength="80" value="${esc(e ? e.title : '')}" placeholder="예) 오늘 밤 11시 서버 점검"></label><label>내용<textarea id="ntBody" maxlength="2000" rows="2">${esc(e ? e.body : '')}</textarea></label>
    <div class="amRw"><label>시작 (비우면 바로)<input id="ntStart" type="datetime-local" value="${e ? L.isoToLocal(e.starts_at) : ''}"></label><label>종료 (비우면 계속)<input id="ntEnd" type="datetime-local" value="${e ? L.isoToLocal(e.ends_at) : ''}"></label><label class="amChk"><input id="ntActive" type="checkbox" ${!e || e.active ? 'checked' : ''}> 게시</label></div>
    <div class="row2"><button class="gbtn main" id="ntSave" data-act="ntsave">${e ? '💾 수정 저장' : '📢 공지 등록'}</button>${e ? '<button class="gbtn" data-act="ntcancel">취소</button>' : ''}</div></div>`;
  const rows = !list ? '<div class="emptyMsg">불러오는 중…</div>' : !list.length ? '<div class="emptyMsg">공지가 없어요.</div>' : `<div class="admTable">${list.map(n => { const s = L.noticeState(n);
    return `<div class="admRow ntRow nt_${s}"><div class="aWho"><b>${esc(n.title)}</b><small>${esc((n.body || '').slice(0, 80))}</small></div><div class="aDate"><small>시작 ${n.starts_at ? fmtD(n.starts_at) : '즉시'}</small><small>종료 ${n.ends_at ? fmtD(n.ends_at) : '없음'}</small></div><div class="aSt">${L.NOTICE_ST[s]}<small>#${n.id} · ${fmtD(n.created_at)}</small></div>
      <div class="aAct"><button class="gbtn sm" data-act="ntedit" data-id="${n.id}">수정</button>${n.active ? `<button class="gbtn sm" data-act="ntoff" data-id="${n.id}">내리기</button>` : `<button class="gbtn sm main" data-act="nton" data-id="${n.id}">게시</button>`}</div></div>`; }).join('')}</div>`;
  return form + rows;
}
// ---------- 활동 기록 ----------
async function loadLog() { const g = st.log, r = await Adm.logs(g.action, g.off, g.lim); if (need(r)) g.data = r.data; renderAdmin(); }
function hLog() {
  const g = st.log, d = g.data, rows = d ? d.rows || [] : [];
  const bar = `<div class="admBar"><label class="amChk">종류 <select id="alAct" data-change="lfilter"><option value="">전체</option>${Object.entries(L.ACTION_N).map(([k, n]) => `<option value="${k}" ${g.action === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><button class="gbtn sm" data-act="lreload">새로고침</button><span class="aCnt">${d ? `${d.total}건` : ''}</span></div>`;
  const list = rows.length ? `<div class="admTable">${rows.map(l => `<div class="admRow logRow"><div class="aDate">${fmtD(l.created_at)}</div><div class="aWho"><b>${esc(L.ACTION_N[l.action] || l.action)}</b><small>by ${esc(l.admin_email || '')}</small></div><div class="aWho"><b>${esc(l.target_email || (l.target_user ? l.target_user.slice(0, 8) : '—'))}</b></div><div class="aDet">${esc(L.logDetail(l, rwText))}</div></div>`).join('')}</div>`
    : `<div class="emptyMsg">${d ? '기록이 없어요.' : '불러오는 중…'}</div>`;
  return bar + list + pager(d, 'lpage');
}
// ---------- 관리자 (owner 만) ----------
async function loadAdmins() { const r = await Adm.admins(); if (need(r)) st.adm.list = r.data.rows || []; renderAdmin(); }
function hAdmins() {
  const list = st.adm.list;
  return `<div class="admBar"><input id="aaEmail" type="email" placeholder="관리자로 추가할 계정 이메일" maxlength="254" data-enter="aadd"><button class="gbtn sm main" data-act="aadd">➕ 관리자 추가</button></div>
    <div class="hintS">하위 관리자는 관리자 관리(이 탭)를 뺀 모든 관리자 기능을 쓸 수 있어요. 최고 관리자는 삭제할 수 없어요.</div>` +
    (!list ? '<div class="emptyMsg">불러오는 중…</div>' : `<div class="admTable">${list.map(a => `<div class="admRow admAdm"><div class="aWho"><b>${esc(a.nickname || '—')} ${a.owner ? badge('최고 관리자', 'own') : badge('관리자', 'adm')}</b><small>${esc(a.email || '')}</small></div><div class="aDate"><small>추가 ${fmtD(a.created_at)}</small></div><div class="aAct">${a.owner ? '' : `<button class="gbtn sm danger" data-act="aremove" data-email="${esc(a.email)}">삭제</button>`}</div></div>`).join('')}</div>`);
}

// ---------- 동작 ----------
const ACT = {
  ostatus: b => { st.ord.status = b.dataset.s; st.ord.off = 0; Snd.play('ui'); loadOrders(); },
  osearch: () => { st.ord.q = ($('aoQ').value || '').trim(); st.ord.off = 0; Snd.play('ui'); loadOrders(); },
  oreload: () => { Snd.play('ui'); loadOrders(); },
  opage: b => { st.ord.off = +b.dataset.off || 0; loadOrders(); },
  oapprove: b => decide(b, Sh.approve(+b.dataset.id), '승인 완료 · 보상 우편을 보냈어요'),
  oreject: b => decide(b, Sh.reject(+b.dataset.id, $('admReason').value.trim()), '거절 완료 · 안내 우편을 보냈어요'),
  orefund: async b => { const o = (st.ord.data.rows || []).find(x => x.id === +b.dataset.id); if (!o) return;
    const c = await confirmBox({ title: '↩ 환불 처리', html: `<b>${esc(o.nickname || o.email || '')}</b> 님의 <b>${esc(itemN(o.item))}</b> (주문 #${o.id}) 을 환불 처리합니다.<br>서버에서 <b>영웅 소유권이 회수</b>되고, 아직 받지 않은 지급 우편도 회수됩니다. 사용자에게 안내 우편이 갑니다.`, reason: true, yes: '환불 처리' });
    if (!c) return; const r = await Adm.refund(o.id, c.reason); msg(r.ok ? `주문 #${o.id} 환불 처리 완료 (소유권 회수)` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadOrders(); },
  usearch: () => { st.usr.q = ($('auQ').value || '').trim(); st.usr.off = 0; Snd.play('ui'); loadUsers(); },
  upage: b => { st.usr.off = +b.dataset.off || 0; loadUsers(); },
  uopen: b => { Snd.play('select'); st.usr.detail = null; st.usr.sel = b.dataset.id; fresh = true; renderAdmin(); loadUser(b.dataset.id); },
  uback: () => { Snd.play('ui'); st.usr.sel = null; st.usr.detail = null; fresh = true; renderAdmin(); loadUsers(); },
  ureload: () => { Snd.play('ui'); loadUser(st.usr.sel); },
  ugrant: async b => { const c = st.usr.detail.user, k = b.dataset.k;
    const ok = await confirmBox({ title: '🎁 유료 영웅 지급', html: `<b>${esc(c.nickname || c.email)}</b> 님에게 <b>${esc(itemN(k))}</b> 를 바로 지급합니다 (서버 소유권 기록).`, reason: true, yes: '지급', danger: false });
    if (!ok) return; const r = await Adm.grantHero(c.id, k, ok.reason); msg(r.ok ? `${heroName(heroOf(k))} 지급 완료` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadUser(c.id); },
  urevoke: async b => { const c = st.usr.detail.user, k = b.dataset.k;
    const ok = await confirmBox({ title: '유료 영웅 회수', html: `<b>${esc(c.nickname || c.email)}</b> 님의 <b>${esc(itemN(k))}</b> 소유권을 회수합니다.<br>이 영웅을 주는 미수령 우편도 회수됩니다. (영웅 레벨·장비 기록은 남고 영웅만 잠깁니다)`, reason: true, yes: '회수' });
    if (!ok) return; const r = await Adm.revokeHero(c.id, k, ok.reason); msg(r.ok ? `${heroName(heroOf(k))} 회수 완료` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadUser(c.id); },
  uban: async () => { const c = st.usr.detail.user;
    const ok = await confirmBox({ title: '⛔ 계정 정지', html: `<b>${esc(c.nickname || '')}</b> (${esc(c.email || '')}) 계정을 정지합니다.<br>정지된 계정은 <b>진행 저장 · 구매 신청 · 우편 받기</b>가 서버에서 막힙니다.`, reason: true, yes: '정지' });
    if (!ok) return; const r = await Adm.ban(c.id, ok.reason); msg(r.ok ? '계정을 정지했어요.' : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadUser(c.id); },
  uunban: async () => { const c = st.usr.detail.user;
    const ok = await confirmBox({ title: '정지 해제', html: `<b>${esc(c.nickname || '')}</b> (${esc(c.email || '')}) 계정의 정지를 해제합니다.`, reason: true, yes: '해제', danger: false });
    if (!ok) return; const r = await Adm.unban(c.id, ok.reason); msg(r.ok ? '정지를 해제했어요.' : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadUser(c.id); },
  rwgear: b => { const px = b.dataset.px, sl = $(px + 'Slot').value, spec = { k: 'gear', s: sl, g: +$(px + 'G').value }; if (sl === 'weapon') spec.h = $(px + 'H').value; if ($(px + 'C').value) spec.c = +$(px + 'C').value; rwAddLine(px, spec); },
  rwuq: b => { const px = b.dataset.px; rwAddLine(px, { k: 'uq', u: $(px + 'U').value }); },
  rwhit: b => { const px = b.dataset.px, e = (rwHits[px] || [])[+b.dataset.i]; if (e) rwAddLine(px, e.spec); },
  rwdel: b => { const px = b.dataset.px; st.rw[px].splice(+b.dataset.i, 1); Snd.play('ui'); rwPaint(px); },
  rwg: t => { const px = t.dataset.px, x = st.rw[px][+t.dataset.i]; if (x && x.k === 'gear') { x.g = +t.value; rwPaint(px); } },
  rwslot: t => { const h = $(t.dataset.px + 'H'); if (h) h.disabled = t.value !== 'weapon'; },
  umail: async b => { const c = st.usr.detail.user, ti = $('udTitle').value.trim(); if (!ti) { msg('제목을 입력해 주세요.'); Snd.play('error'); return; }
    b.disabled = true; const r = await Sh.sendMail(c.email, ti, $('udBody').value, rwRead('ud')); b.disabled = false; msg(r.ok ? `${c.email} 에게 우편을 보냈어요.` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); if (r.ok) { rwReset('ud'); fresh = true; loadUser(c.id); } },
  amsend: async b => { const em = $('amEmail').value.trim(), ti = $('amTitle').value.trim(); if (!L.validEmail(em) || !ti) { msg('이메일과 제목을 확인해 주세요.'); Snd.play('error'); return; }
    b.disabled = true; const r = await Sh.sendMail(em, ti, $('amBody').value, rwRead('am')); b.disabled = false; msg(r.ok ? `${em} 에게 우편을 보냈어요.` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); if (r.ok) { rwReset('am'); rwPaint('am'); } },
  bcsend: async b => { if (st.busy) return; const ti = $('bcTitle').value.trim(), body = $('bcBody').value, rw = rwRead('bc'); if (!ti) { msg('제목을 입력해 주세요.'); Snd.play('error'); return; }
    st.busy = true; b.disabled = true; try {
      const n = await Adm.broadcastCount(); if (!need(n)) return; const cnt = n.data.count; if (!cnt) { msg('받을 사용자가 없어요.'); return; }
      const t = rwText(rw), ok = await confirmBox({ title: '📨 전체 우편 보내기', html: `<div class="bcCnt">받는 사람 <b>${cnt}명</b></div>` + L.broadcastConfirmText(cnt, esc(t)) + `<div class="bcPrev"><b>${esc(ti)}</b><small>${esc(body.slice(0, 120))}</small></div>` + (rw.items ? `<ul class="bcItems">${RI.previewLines({ items: rw.items }).map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') + (rw.hero ? '<div class="warn">⚠ 유료 영웅을 모두에게 지급합니다!</div>' : '') + ((rw.items || []).some(x => x.k === 'uq' || x.g === 4) ? '<div class="warn">⚠ 고유/전설 아이템을 모두에게 지급합니다!</div>' : ''), yes: `${cnt}명에게 보내기` });
      if (!ok) { msg('전체 우편을 취소했어요.'); return; }
      const r = await Adm.broadcast(ti, body, rw, cnt); if (r.ok) { msg(`${r.data.count}명에게 전체 우편을 보냈어요.`, true); Snd.play('confirm'); rwReset('bc'); fresh = true; renderAdmin(); }
      else { msg(r.reason === 'count_mismatch' ? `받는 사람 수가 ${cnt}명 → ${r.count}명으로 바뀌었어요. 다시 보내기를 눌러 확인해 주세요.` : r.msg); Snd.play('error'); }
    } finally { st.busy = false; const x = $('bcSend'); if (x) x.disabled = false; } },
  ntsave: async b => { const e = st.ntc.edit, ti = $('ntTitle').value.trim(); if (!ti) { msg('공지 제목을 입력해 주세요.'); Snd.play('error'); return; }
    const s = L.localToIso($('ntStart').value), en = L.localToIso($('ntEnd').value); if (s && en && Date.parse(en) <= Date.parse(s)) { msg(L.REASON.bad_range); Snd.play('error'); return; }
    b.disabled = true; const r = await Adm.noticeSave(e ? e.id : null, ti, $('ntBody').value, $('ntActive').checked, s, en); b.disabled = false;
    msg(r.ok ? (e ? '공지를 수정했어요.' : '공지를 등록했어요.') : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); if (r.ok) { st.ntc.edit = null; fresh = true; loadNotices(); } },
  ntedit: b => { st.ntc.edit = (st.ntc.list || []).find(n => n.id === +b.dataset.id) || null; Snd.play('ui'); fresh = true; renderAdmin(); $('admBody').scrollTop = 0; },
  ntcancel: () => { st.ntc.edit = null; fresh = true; Snd.play('ui'); renderAdmin(); },
  ntoff: async b => { const r = await Adm.noticeActive(+b.dataset.id, false); msg(r.ok ? '공지를 내렸어요.' : r.msg, r.ok); Snd.play(r.ok ? 'ui' : 'error'); loadNotices(); },
  nton: async b => { const r = await Adm.noticeActive(+b.dataset.id, true); msg(r.ok ? '공지를 게시했어요.' : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadNotices(); },
  lfilter: () => { st.log.action = $('alAct').value; st.log.off = 0; loadLog(); },
  lreload: () => { Snd.play('ui'); loadLog(); },
  lpage: b => { st.log.off = +b.dataset.off || 0; loadLog(); },
  aadd: async () => { const em = $('aaEmail').value.trim(); if (!L.validEmail(em)) { msg('이메일을 확인해 주세요.'); Snd.play('error'); return; }
    const ok = await confirmBox({ title: '➕ 관리자 추가', html: `<b>${esc(em)}</b> 계정에 관리자 권한(관리자 관리 제외 전체)을 줍니다.`, yes: '추가', danger: false });
    if (!ok) return; const r = await Adm.addAdmin(em); msg(r.ok ? `${em} 을(를) 관리자로 추가했어요.` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); if (r.ok) { $('aaEmail').value = ''; } loadAdmins(); },
  aremove: async b => { const em = b.dataset.email;
    const ok = await confirmBox({ title: '관리자 삭제', html: `<b>${esc(em)}</b> 의 관리자 권한을 회수합니다.`, yes: '삭제' });
    if (!ok) return; const r = await Adm.removeAdmin(em); msg(r.ok ? `${em} 의 관리자 권한을 회수했어요.` : r.msg, r.ok); Snd.play(r.ok ? 'confirm' : 'error'); loadAdmins(); },
};

export function initAdmin(h) {
  hooks = { ...hooks, ...h };
  $('admClose').onclick = () => closeAdmin();
  document.querySelectorAll('#admTabs .ftab').forEach(b => b.onclick = () => { if (st.tab === b.dataset.t && !(b.dataset.t === 'users' && st.usr.sel)) return; Snd.play('ui'); if (b.dataset.t === 'users') { st.usr.sel = null; st.usr.detail = null; } setTab(b.dataset.t); });
  const body = $('admBody');
  body.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.disabled || !body.contains(b)) return; const f = ACT[b.dataset.act]; if (f) f(b); });
  body.addEventListener('keydown', e => { if (e.key !== 'Enter') return; const t = e.target.closest('[data-enter]'); if (t && ACT[t.dataset.enter]) { e.preventDefault(); ACT[t.dataset.enter](t); } });
  body.addEventListener('input', e => { const q = e.target.closest('[data-rwq]'); if (q) return rwSearch(q.dataset.rwq); const r = e.target.closest('[data-rw]'); if (r) { const p = $(r.dataset.rw + 'Prev'); if (p) p.innerHTML = rwPrev(r.dataset.rw); } });
  body.addEventListener('change', e => { const r = e.target.closest('[data-rw]'); if (r) { const p = $(r.dataset.rw + 'Prev'); if (p) p.innerHTML = rwPrev(r.dataset.rw); } });
  body.addEventListener('change', e => { const t = e.target.closest('[data-change]'); if (t && ACT[t.dataset.change]) ACT[t.dataset.change](t); });
  $('admConfirm').addEventListener('click', e => { if (e.target.id === 'admConfirm') $('acfNo').click(); });
}
export const _adminState = () => st; // 테스트용
