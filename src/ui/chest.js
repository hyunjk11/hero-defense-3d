// ================= 보상 상자: 개봉 연출(reveal) · 보관 상자 한 개/10개/모두 열기 (C-10c, ui/gear.js 에서 이동 — 동작 불변) =================
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import * as Acc from '../account/account.js';
import * as E from '../account/equip.js';
import { UQ_COLOR } from '../data/items.js';
import { icon, setOf, GCi, GC, card } from './itemview.js';
// gear.js 의 상태(ui·hooks)와 가방/대장간/툴팁 함수는 initChest 로 받음 (codex.js 의 CXC 와 같은 방식)
let C = { ui: {}, hooks: () => ({ onChange: () => {} }), S: () => Acc.load(), openSmith: () => {}, closeInv: () => {}, closeSmith: () => {}, showTip: () => {}, hideTip: () => {} };
export function initChest(c) { C = c; }
// ---------- 상자 개봉 연출 ----------
let RQ = [], RDone = null;
export function reveal(list, done) { RQ = [...list]; RDone = done || null; $('chestOv').classList.remove('hidden'); nextReveal(); }
export const revealing = () => !$('chestOv').classList.contains('hidden');
function nextReveal() {
  const ov = $('chestOv'); if (!RQ.length) { ov.classList.add('hidden'); ov.innerHTML = ''; const d = RDone; RDone = null; d && d(); return; }
  const total = RQ.length, x = RQ.shift(), it = x.it, c = GCi(it), src = x.src === 'boss' ? '👑 보스 전리품' : x.src === 'craft' ? '⚒ 대장간 제작' : x.src === 'unique' ? '💎 고유 보상' : '🎁 출정 보상 상자';
  ov.innerHTML = `<div class="cvStage g${it.g}" style="--gc:${c}"><div class="cvSrc">${src}${total > 1 ? ` · 남은 상자 ${total - 1}` : ''}</div><div class="rays"></div><div class="cglow"></div>
    <div class="chest ${x.src === 'boss' ? 'boss' : ''}"><div class="lid"></div><div class="body"><div class="lock"></div></div></div>
    <div class="cvItem">${card(it)}${x.auto ? `<div class="warn">가방이 가득 차서 자동 분해: 강철 +${x.y.steel}${x.y.crystal ? ` · 마력석 +${x.y.crystal}` : ''}</div>` : ''}<div class="cvGrade" style="color:${c}">${E.GRADES[it.g].n}${it.g === 4 ? ' ★' : ''}</div></div><div class="cvTap">눌러서 열기</div></div>`;
  const st = ov.querySelector('.cvStage'); let phase = 0; Snd.play('place');
  const open = () => { if (phase) return; phase = 1; st.classList.add('shake'); Snd.play('hitArmor'); setTimeout(() => { st.classList.add('open'); Snd.play(it.g >= 3 ? 'victory' : 'levelUp', { force: true }); Snd.play('coins'); if (it.g >= 3) Snd.play('glass', { rate: 1.4 }); st.querySelector('.cvTap').textContent = RQ.length ? '눌러서 다음 상자' : '눌러서 닫기'; phase = 2; }, 700); };
  st.onclick = () => { if (phase === 0) open(); else if (phase === 2) { Snd.play('ui'); nextReveal(); } };
  setTimeout(open, 500);
}
// ---------- 보관 중인 상자: 한 개씩 열기 · 10개 열기 · 모두 열기 ----------
// 상자 내용은 획득 시 정해져 save.chests에 있음. 여는 순간 한 번의 Acc.update(=저장 1회)로 가방에 넣고 상자를 지움 → 더블 클릭해도 중복 보상 없음.
const SRC_N = { boss: '👑 보스 전리품', stage: '🗺 스테이지 첫 클리어', star: '⭐ 별 보상 상자', chest: '🎁 출정 보상 상자', unique: '💎 고유 보상 도착!' };
let CB = { done: null, lock: false, busy: false }; // lock: 개봉 처리 중(중복 클릭 차단)
export const chestCount = () => (C.S().chests || []).length;
export function openChestUI(done) { if (!chestCount()) { done && done(); return; } CB = { done: done || null, lock: false, busy: false }; RQ = []; RDone = null; C.closeInv(); C.closeSmith(true); $('chestOv').classList.remove('hidden'); nextChest(); }
function closeChestUI() { const ov = $('chestOv'); ov.classList.add('hidden'); ov.innerHTML = ''; C.hideTip(); C.hooks().onChange(true); const d = CB.done; CB.done = null; d && d(); }
// 개봉 (n개, ids 지정 가능) — 저장은 한 번만
function doOpen(n, ids) { let r; Acc.update(d => { const o = E.openChests(d, n, ids); r = o[1]; return o[0]; }); C.hooks().onChange(true); return r; }
const fullMsg = n => `🎒 가방이 가득 찼어요! ${n ? `상자 ${n}개는 그대로 보관돼요 — ` : ''}대장간에서 분해해 공간을 만든 뒤 다시 열어 주세요.`;
function chestBar(left) {
  if (!left) return '';
  return `<div class="cbBar" id="cbBar"><div class="cbN">🎁 남은 상자 <b id="cbLeft">${left}</b>개</div>${left > 1 ? `<button class="gbtn main" id="cbAll">✨ 모두 열기 <small>(${left})</small></button>` : ''}${left > E.BATCH ? `<button class="gbtn" id="cbTen">${E.BATCH}개 열기</button>` : ''}<button class="gbtn ghost" id="cbLater">나중에 열기</button></div>`;
}
function bindBar() {
  const all = $('cbAll'), ten = $('cbTen'), later = $('cbLater');
  const go = n => e => { e && e.stopPropagation(); if (CB.lock || CB.busy) return; CB.lock = true; document.querySelectorAll('#cbBar button').forEach(b => b.disabled = true); openBatch(n); };
  if (all) all.onclick = go(Infinity); if (ten) ten.onclick = go(E.BATCH);
  if (later) later.onclick = e => { e.stopPropagation(); if (CB.lock) return; Snd.play('ui'); closeChestUI(); };
}
function nextChest(note) {
  const ov = $('chestOv'), L = C.S().chests || []; if (!L.length) { closeChestUI(); return; }
  const x = L[0], uqx = !!x.it.uq, full = C.S().inv.length >= E.CAP && !uqx, boss = x.src === 'boss' || uqx; // 고유 상자는 가방이 가득 차도 열림
  ov.innerHTML = `<div class="cvStage chestMode g${x.it.g}${uqx ? ' uqStage' : ''}" style="--gc:${uqx ? UQ_COLOR : GC(x.it.g)}"><div class="cvSrc">${SRC_N[x.src] || SRC_N.chest}</div><div class="rays"></div><div class="cglow"></div>
    <div class="chest ${boss ? 'boss' : ''}"><div class="lid"></div><div class="body"><div class="lock"></div></div></div>
    <div class="cvItem"></div><div class="cvTap">${full ? '가방이 가득 찼어요' : '눌러서 열기'}</div></div>${chestBar(L.length)}${full || note ? `<div class="cbNote">${note || fullMsg(L.length)}</div>` : ''}`;
  bindBar(); const st = ov.querySelector('.cvStage'); let phase = 0; Snd.play('place');
  const open = () => { if (phase || CB.lock) return; if (C.S().inv.length >= E.CAP && !uqx) { Snd.play('error'); st.classList.add('shake'); setTimeout(() => st.classList.remove('shake'), 720); showNote(fullMsg(chestCount())); return; }
    phase = 1; CB.busy = true; st.classList.add('shake'); Snd.play('hitArmor');
    setTimeout(() => { if (!ov.contains(st)) return; const r = doOpen(1, [x.id]); CB.busy = false; const o = r.opened[0];
      if (!o) { if (r.full) showNote(fullMsg(r.left)); phase = 0; st.classList.remove('shake'); if (!r.full) nextChest(); return; }
      st.className = `cvStage chestMode g${o.it.g}${o.it.uq ? ' uqStage' : ''} open`; st.style.setProperty('--gc', GCi(o.it)); st.querySelector('.cvItem').innerHTML = `${card(o.it)}<div class="cvGrade" style="color:${GCi(o.it)}">${o.it.uq ? '◆ 고유 ◆' : E.GRADES[o.it.g].n + (o.it.g === 4 ? ' ★' : '')}</div>${o.souls ? `<div class="cvSoul">영혼석 +${o.souls}</div>` : ''}`;
      if (o.it.uq) Snd.play('levelUp', { force: true, delay: .3 }); Snd.play(o.it.g >= 3 ? 'victory' : 'levelUp', { force: true }); Snd.play('coins'); if (o.it.g >= 3) Snd.play('glass', { rate: 1.4 });
      const left = r.left; st.querySelector('.cvTap').textContent = left ? '눌러서 다음 상자' : '눌러서 닫기'; const bar = $('cbBar'); if (bar) { bar.outerHTML = chestBar(left); bindBar(); }
      phase = 2; }, uqx ? 1300 : 700); }; // 고유: 0.6초 더 길게
  st.onclick = () => { if (CB.lock) return; if (phase === 0) open(); else if (phase === 2) { Snd.play('ui'); nextChest(); } };
  if (!full && L.length === 1) setTimeout(() => { if (ov.contains(st)) open(); }, 500); // 상자가 하나뿐이면 자동 개봉, 여러 개면 탭 또는 모두 열기
}
function showNote(t) { let n = document.querySelector('#chestOv .cbNote'); if (!n) { n = document.createElement('div'); n.className = 'cbNote'; $('chestOv').appendChild(n); } n.textContent = t; }
let lastBatch = null; export const lastChestBatch = () => lastBatch;
function openBatch(n) {
  const ov = $('chestOv'); const st = ov.querySelector('.cvStage'); if (st) st.classList.add('shake'); Snd.play('hitArmor'); Snd.play('hitArmor', { delay: .15, rate: 1.2 });
  const r = doOpen(n); lastBatch = r; setTimeout(() => showSummary(r), 450);
}
function showSummary(r) {
  const ov = $('chestOv'), list = [...r.opened].sort(E.byRarity), cnt = E.gradeCount(r.opened.filter(x => !x.it.uq)), nUq = r.opened.filter(x => x.it.uq).length, best = list.length ? list[0].it.g : 0;
  const tiles = list.map((x, i) => `<button class="itile sumT g${x.it.g}${x.it.uq ? ' uq' : ''}" data-i="${i}" style="--gc:${GCi(x.it)};--d:${Math.min(i, 30) * 45}ms"><span class="ic">${icon(x.it)}</span>${x.it.uq ? '<span class="uqb">◆</span>' : E.legendKey(x.it) ? '<span class="lst">✦</span>' : ''}${setOf(x.it) ? `<span class="chb">${setOf(x.it).badge}</span>` : ''}${x.it.g === 4 ? '<i class="spk"></i><i class="spk s2"></i><i class="spk s3"></i>' : ''}</button>`).join('');
  const gc = cnt.map((c, g) => c ? `<span class="gcn" style="--gc:${GC(g)}">${E.GRADES[g].n} <b>${c}</b></span>` : '').join('') + (nUq ? `<span class="gcn uqc" style="--gc:${UQ_COLOR}">고유 <b>${nUq}</b></span>` : ''); // 고유는 전설과 따로 셈
  ov.innerHTML = `<div class="cbSum g${best}" id="cbSum" style="--gc:${GC(best)}"><div class="cbFlash"></div><div class="gtitle">🎁 상자 ${r.opened.length}개 개봉!</div>
    <div class="cbTot"><span class="cbSoul"><span class="soulico"></span>영혼석 <b>+${r.souls}</b></span><span>장비 <b>${r.opened.length}</b>개</span>${gc}</div>
    <div class="cbGrid" id="cbGrid">${tiles || '<div class="emptyMsg">열린 상자가 없어요</div>'}</div><div class="cbDetail" id="cbDetail"><div class="hintS">장비를 눌러 자세히 보기</div></div>
    ${r.full ? `<div class="cbNote">${fullMsg(r.left)}</div>` : r.left ? `<div class="hintS">남은 상자 ${r.left}개</div>` : ''}
    <div class="cbActs">${r.left && !r.full ? `<button class="gbtn" id="cbMore">🎁 남은 상자 열기 (${r.left})</button>` : ''}${r.full ? '<button class="gbtn" id="cbSmith">⚒ 대장간에서 분해</button>' : ''}<button class="gbtn main" id="cbOk">확인</button></div></div>`;
  if (cnt[4] || nUq) { Snd.play('victory', { force: true }); Snd.play('glass', { rate: 1.4, delay: .3 }); } else if (cnt[3]) Snd.play('levelUp', { force: true }); Snd.play('coins', { delay: .2 });
  ov.querySelectorAll('.sumT').forEach(b => { const x = list[+b.dataset.i]; b.onclick = () => { ov.querySelectorAll('.sumT.sel').forEach(e => e.classList.remove('sel')); b.classList.add('sel'); $('cbDetail').innerHTML = card(x.it); Snd.play('select'); };
    b.onpointerenter = e => { if (e.pointerType === 'mouse') C.showTip(b, card(x.it)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') C.hideTip(); }; });
  $('cbOk').onclick = () => { Snd.play('ui'); closeChestUI(); };
  if ($('cbMore')) $('cbMore').onclick = () => { Snd.play('ui'); CB.lock = false; nextChest(); };
  if ($('cbSmith')) $('cbSmith').onclick = () => { Snd.play('ui'); const d = CB.done; CB.done = null; closeChestUI(); d && d(); C.ui.smTab = 'dis'; C.openSmith(); };
  CB.lock = false;
}
