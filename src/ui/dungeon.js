// ================= 마을 던전 건물 → 던전 원정 입장 화면 (파티 · 영웅별 장비/전직 요약 · 출발) =================
// 로즈는 서버 소유 기록(account/shop.js heroOwned ← hd3d_owned)이 확인될 때만 파티에 들어감. 버들은 숨김 플래그로 제외 (data/dungeon.js dungeonParty)
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { CLASSES } from '../data/heroes.js';
import { FLOORS, ROLE, ROLE_N, DG_PAID, DG_OPEN, DG_MAX, DG_PICK_KEY, dungeonParty, pickParty, togglePick } from '../data/dungeon.js';
import { banner } from './hud.js';
import * as AD from '../data/advance.js';
import * as E from '../account/equip.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let open = false, checking = false, departing = false, H = { closeOthers: () => {} };
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
function render() { const p = $('dgPanel'); if (!p) return; const s = Acc.load(), cands = dungeonParty(c => Sh.heroOwned(c)), party = pickParty(cands, loadPick()), F = FLOORS[0];
  const paidNote = DG_PAID.filter(c => !cands.includes(c) && CLASSES[c] && !CLASSES[c].hidden).map(c => `<div class="dgCard lock"><div class="dgCH"><span class="dgIc">${CLASSES[c].icon}</span><b>${esc(CLASSES[c].nm)}</b> <small>· ${esc(CLASSES[c].n)}</small></div><div class="dgRole">${checking ? '소유 확인 중…' : '🔒 상점에서 영입하면<br>함께 출전해요'}</div></div>`).join('');
  p.innerHTML = `<button id="dgClose" class="gbtn sm xbtn">✕</button><div class="gtitle">⚔ 던전 원정</div><div class="labSub">카드를 눌러 출전할 영웅을 고르세요 (최대 ${DG_MAX}명) · 전투 중 초상화를 눌러 조작할 영웅을 바꾸고, 나머지는 역할대로 자동 전투해요</div>
    <div class="dgPickN" id="dgPickN">출전 <b>${party.length}</b> / ${DG_MAX}명</div>
    <div class="dgParty">${cands.map(c => card(s, c, party.includes(c))).join('')}${paidNote}</div>
    <div class="dgInfo"><b>${FLOORS.length}개 층</b> (${esc(F.n)} → ${esc(FLOORS[FLOORS.length - 1].n)}) · 타워 없음 · 입구 4곳에서 몬스터가 영웅을 쫓아와요<br>층 사이 <b>축복 3택1</b> · 모두의 궁극기 게이지가 차면 <b>⚡ 합동 공격</b><br><small>쓰러진 영웅은 그 층을 쉬고 다음 층에 체력 30% 로 복귀 · 파티 전멸 = 실패 · 돌파한 층만큼 보상</small></div>
    <div class="dgGo"><button id="dgStart" class="gbtn main">⚔ 원정 출발</button></div>`;
  $('dgClose').onclick = () => closeDungeon(); $('dgStart').onclick = () => depart();
  p.querySelectorAll('.dgCard.pick').forEach(b => b.onclick = () => { const r = togglePick(party, b.dataset.cls, cands); if (r.msg) { Snd.play('error'); banner(r.msg, '#ffb06a', 1100); return; } Snd.play('select'); savePick(r.pick); render(); }); }
export function openDungeon() { if (departing || !DG_OPEN) return; /* 공개 전(DG_LIVE=false): 건물은 '준비 중' */ H.closeOthers(); open = true; $('dgPanel').classList.remove('hidden'); Snd.play('ui');
  if (Acc.A.user && !checking) { checking = true; render(); Sh.verifyOwned().finally(() => { checking = false; if (open) render(); }); } else render(); }
export function closeDungeon(quiet) { if (!open) return; open = false; $('dgPanel').classList.add('hidden'); if (!quiet) Snd.play('ui'); }
function depart() { if (departing) return; departing = true; Snd.play('meteorCast', { force: true }); Snd.play('confirm'); $('fade').classList.add('on');
  const q = new URLSearchParams(location.search); q.delete('town'); q.delete('stage'); q.delete('hard'); q.set('dungeon', '1'); q.set('run', '1'); setTimeout(() => location.replace(location.pathname + '?' + q.toString()), 500); }
G.openDungeon = openDungeon;
