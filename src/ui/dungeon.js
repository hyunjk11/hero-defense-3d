// ================= 마을 던전 건물 → 던전 원정 입장 화면 (파티 · 영웅별 장비/전직 요약 · 출발) =================
// 로즈는 서버 소유 기록(account/shop.js heroOwned ← hd3d_owned)이 확인될 때만 파티에 들어감. 버들은 숨김 플래그로 제외 (data/dungeon.js dungeonParty)
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { CLASSES } from '../data/heroes.js';
import { FLOORS, ROLE, ROLE_N, DG_PAID, DG_OPEN, DG_MAX, DG_PICK_KEY, DG_MEDAL, DG_SHOP, DG_SHOP_BY, DG_TITLES, dungeonParty, pickParty, togglePick, shopState } from '../data/dungeon.js';
import * as DS from '../account/dungeon.js';
import { banner } from './hud.js';
import * as AD from '../data/advance.js';
import * as E from '../account/equip.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let open = false, checking = false, departing = false, view = 'party', buying = false, H = { closeOthers: () => {} };
export const dungeonOpen = () => open;
export function initDungeonUI(o) { H = { ...H, ...o };
  if ($('dgPanel')) return; const p = document.createElement('div'); p.id = 'dgPanel'; p.className = 'gpanel bigPanel wide hidden'; $('scr_town').appendChild(p); }
// 고른 파티 (이 기기에만 저장 · 출발 때 서버 소유로 다시 거름 — dungeon/run.js)
const loadPick = () => { try { const a = JSON.parse(localStorage.getItem(DG_PICK_KEY) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } };
const savePick = p => { try { localStorage.setItem(DG_PICK_KEY, JSON.stringify(p)); } catch (e) {} };
function card(s, c, on) { const C = CLASSES[c], A = AD.advOf(c, (s.adv || {})[c]), eq = E.bonus(s, c), lv = s.heroLv[c] || { hp: 0, atk: 0 }, top = Object.entries(eq).sort((a, b) => b[1] - a[1]);
  const slots = ((s.eq || {})[c]) || {}, n = Object.values(slots).filter(Boolean).length, leg = E.legendOf(s, c), uq = E.uniquesOf(s, c), nu = Object.keys(uq || {}).length;
  return `<button type="button" class="dgCard pick ${on ? 'on' : 'off'}" data-cls="${c}" aria-pressed="${on}" style="--hc:#${C.color.toString(16).padStart(6, '0')}"><span class="dgChk">${on ? '✔ 출전' : '대기'}</span><div class="dgCH"><span class="dgIc">${C.icon}</span><b>${esc(C.nm)}</b> <small>· ${esc(C.n)}</small></div>
    <div class="dgRole">${ROLE_N[ROLE[c]] || ''}</div>
    <div class="dgAdv">${A ? `<span style="color:${A.c}">${A.icon} ${esc(A.n)}</span>` : '<span class="dim">전직 없음</span>'}</div>
    <div class="dgEq">🎒 장비 ${n}/3${leg ? ' · ✦ 전설' : ''}${nu ? ` · ◆ 고유 ${nu}` : ''}</div>
    <div class="dgSt">${top.length ? top.slice(0, 3).map(([k, v]) => `${E.STAT[k]} +${v}%`).join('<br>') + (top.length > 3 ? `<br><span class="dim">외 ${top.length - 3}개</span>` : '') : '<span class="dim">장비 보너스 없음</span>'}</div>
    <div class="dgLv">여신 강화 · 체력 ${lv.hp} · 공격 ${lv.atk}</div></button>`; }
// ---------- 5단계: 오늘 남은 입장 · 던전 메달 (서버 값) ----------
const titleTxt = () => DS.DGS.titles.map(t => DG_TITLES[t]).filter(Boolean).join(' ');
function dayHtml() { const D = DS.DGS;
  if (D.st === 'guest' || !Acc.A.user) return '<span class="dgPr">👤 게스트 · 메달 없는 <b>연습 원정</b> (보상: 영혼석) — 로그인하면 던전 메달을 받아요</span>';
  if (D.st === 'missing') return '<span class="dgUpd">⚠ 서버 업데이트 필요</span> · 지금은 메달 없는 <b>연습 원정</b> (임시 보상: 영혼석)';
  if (D.st === 'error') return '<span class="dgUpd">서버에 연결할 수 없어요</span> · 출발하면 메달 없는 연습 원정';
  if (D.st !== 'ok') return '<span class="dim">입장 정보 확인 중…</span>';
  return `오늘 남은 입장 <b id="dgLeft">${D.left}</b>/${D.limit} · 🏅 던전 메달 <b id="dgMedals">${D.medals}</b>${titleTxt() ? ` · <span class="dgTitle">${esc(titleTxt())}</span>` : ''}<small> · 층마다 메달 ${DG_MEDAL.perFloor} · 완주 +${DG_MEDAL.clearBonus} · 한국 시간 0시 초기화</small>`; }
function paintDay() { const d = $('dgDay'); if (d) d.innerHTML = dayHtml(); const b = $('dgStart'); if (b && !departing) { const none = DS.DGS.st === 'ok' && DS.DGS.left === 0; b.disabled = none; b.textContent = none ? '오늘 입장 끝 (0시 초기화)' : '⚔ 원정 출발'; }
  const m = $('dgShopMedals'); if (m) m.textContent = DS.DGS.medals; }
function refreshDay() { DS.dgStatus().then(() => { if (open) { if (view === 'shop') renderShop(); else paintDay(); } }).catch(() => {}); }
// 던전 고유(계정당 1개): 서버 지갑 기록 ∪ 이 세이브에 이미 있는 고유 → '보유 중'
const ownedUq = () => { const s = Acc.load(); return [...new Set([...DS.DGS.uniques, ...DG_SHOP.filter(it => it.uq && E.ownsUnique(s, it.uq)).map(it => it.uq)])]; };
// ---------- 던전 상점 (메달 → 재료는 우편으로, 칭호는 서버 지갑에) ----------
function renderShop() { const p = $('dgPanel'); if (!p) return; const D = DS.DGS, on = D.st === 'ok' && !!Acc.A.user;
  const note = !Acc.A.user ? '로그인한 계정만 던전 상점을 쓸 수 있어요.' : D.st === 'missing' ? '⚠ 서버 업데이트 필요 — 관리자가 schema.sql 을 다시 실행하면 열려요.' : D.st !== 'ok' ? '서버에 연결할 수 없어요.' : '산 재료는 📮 우편함으로 와요 (받기를 눌러 수령). 가격은 서버가 정해요.';
  p.innerHTML = `<button id="dgClose" class="gbtn sm xbtn">✕</button><div class="gtitle">🏪 던전 상점</div><div class="labSub">던전 원정에서 모은 던전 메달로 재료를 사요</div>
    <div class="dgDay">🏅 던전 메달 <b id="dgShopMedals">${on ? D.medals : '-'}</b>${titleTxt() ? ` · <span class="dgTitle">${esc(titleTxt())}</span>` : ''}</div>
    <div class="dgShop">${DG_SHOP.map(it => { const stt = on ? shopState(it, D.medals, D.titles, ownedUq()) : 'off'; return `<div class="dgShopIt ${stt}${it.uq ? ' uq' : ''}" data-id="${it.id}"><span class="dgSIc">${it.icon}</span><b>${esc(it.n)}</b><small>${esc(it.desc)}</small>
      <button class="gbtn sm dgBuy" data-buy="${it.id}" ${stt === 'ok' && !buying ? '' : 'disabled'}>${stt === 'own' ? '✔ 보유 중' : `🏅 ${it.price}`}</button></div>`; }).join('')}</div>
    <div class="dgInfo"><small>${esc(note)}</small></div><div class="dgGo"><button id="dgBack" class="gbtn">← 원정 준비</button></div>`;
  $('dgClose').onclick = () => closeDungeon(); $('dgBack').onclick = () => { Snd.play('ui'); view = 'party'; render(); };
  p.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy)); }
async function buy(id) { const it = DG_SHOP_BY[id]; if (!it || buying) return; if (!confirm(`${it.n} 을(를) 던전 메달 ${it.price}개로 살까요?`)) return;
  buying = true; renderShop(); const r = await DS.dgBuy(id); buying = false; Snd.play(r.ok ? 'confirm' : 'error'); banner(r.msg, r.ok ? '#9affb0' : '#ffb06a', 2200); G.dgLastBuy = r;
  if (r.ok && r.mail) Sh.refresh().catch(() => {}); if (!r.ok && DS.DGS.st === 'ok') refreshDay(); if (open && view === 'shop') renderShop(); }
function render() { if (view === 'shop') return renderShop(); const p = $('dgPanel'); if (!p) return; const s = Acc.load(), cands = dungeonParty(c => Sh.heroOwned(c)), party = pickParty(cands, loadPick()), F = FLOORS[0];
  const paidNote = DG_PAID.filter(c => !cands.includes(c) && CLASSES[c] && !CLASSES[c].hidden).map(c => `<div class="dgCard lock"><div class="dgCH"><span class="dgIc">${CLASSES[c].icon}</span><b>${esc(CLASSES[c].nm)}</b> <small>· ${esc(CLASSES[c].n)}</small></div><div class="dgRole">${checking ? '소유 확인 중…' : '🔒 상점에서 영입하면<br>함께 출전해요'}</div></div>`).join('');
  p.innerHTML = `<button id="dgClose" class="gbtn sm xbtn">✕</button><div class="gtitle">⚔ 던전 원정</div><div class="labSub">카드를 눌러 출전할 영웅을 고르세요 (최대 ${DG_MAX}명) · 전투 중 초상화를 눌러 조작할 영웅을 바꾸고, 나머지는 역할대로 자동 전투해요</div>
    <div class="dgPickN" id="dgPickN">출전 <b>${party.length}</b> / ${DG_MAX}명</div>
    <div class="dgParty">${cands.map(c => card(s, c, party.includes(c))).join('')}${paidNote}</div>
    <div class="dgInfo"><b>${FLOORS.length}개 층</b> (${esc(F.n)} → ${esc(FLOORS[FLOORS.length - 1].n)}) · 타워 없음 · 입구 4곳에서 몬스터가 영웅을 쫓아와요<br>층 사이 <b>축복 3택1</b> · 모두의 궁극기 게이지가 차면 <b>⚡ 합동 공격</b><br><small>쓰러진 영웅은 그 층을 쉬고 다음 층에 체력 30% 로 복귀 · 파티 전멸 = 실패 · 돌파한 층만큼 보상</small></div>
    <div class="dgDay" id="dgDay">${dayHtml()}</div>
    <div class="dgGo"><button id="dgShopBtn" class="gbtn">🏪 던전 상점</button><button id="dgStart" class="gbtn main">⚔ 원정 출발</button></div>`;
  $('dgClose').onclick = () => closeDungeon(); $('dgStart').onclick = () => depart(); $('dgShopBtn').onclick = () => { Snd.play('ui'); view = 'shop'; renderShop(); refreshDay(); }; paintDay();
  p.querySelectorAll('.dgCard.pick').forEach(b => b.onclick = () => { const r = togglePick(party, b.dataset.cls, cands); if (r.msg) { Snd.play('error'); banner(r.msg, '#ffb06a', 1100); return; } Snd.play('select'); savePick(r.pick); render(); }); }
export function openDungeon() { if (departing || !DG_OPEN) return; /* 공개 전(DG_LIVE=false): 건물은 '준비 중' */ H.closeOthers(); open = true; view = 'party'; $('dgPanel').classList.remove('hidden'); Snd.play('ui'); refreshDay();
  if (Acc.A.user && !checking) { checking = true; render(); Sh.verifyOwned().finally(() => { checking = false; if (open) render(); }); } else render(); }
export function closeDungeon(quiet) { if (!open) return; open = false; $('dgPanel').classList.add('hidden'); if (!quiet) Snd.play('ui'); }
// 출발: 로그인 계정은 서버 입장 등록(하루 3회) 성공 때 메달 원정, 게스트·서버 업데이트 전·오프라인은 연습 원정. 횟수 초과·정지는 출발 막음
async function depart() { if (departing) return; departing = true; const b = $('dgStart'); if (b) { b.disabled = true; b.textContent = '입장 확인 중…'; }
  const r = await DS.dgStart(); G.dgEntry = r;
  if (r.blocked) { departing = false; Snd.play('error'); banner(r.msg, '#ffb06a', 2600); paintDay(); return; }
  if (r.mode === 'practice') DS.markPractice(r.why);
  Snd.play('meteorCast', { force: true }); Snd.play('confirm'); $('fade').classList.add('on');
  const q = new URLSearchParams(location.search); q.delete('town'); q.delete('stage'); q.delete('hard'); q.set('dungeon', '1'); q.set('run', '1'); setTimeout(() => location.replace(location.pathname + '?' + q.toString()), 500); }
G.openDungeon = openDungeon;
