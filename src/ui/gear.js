// ================= 장비 UI: 가방(장착/비교) · 대장간(강화/분해/제작) · 보상 상자 개봉 =================
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { CLASSES } from '../data/heroes.js';
import * as Acc from '../account/account.js';
import * as E from '../account/equip.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { archer: '🏹', mage: '🪄', warrior: '🗡️', armor: '🛡️', acc: '💍' };
export const icon = it => it.s === 'weapon' ? ICON[it.h] : ICON[it.s];
const pct = (k, v) => `${E.STAT[k]} +${v}%`;
const GC = g => E.GRADES[g].c;
let ui = { inv: false, smith: false, invSel: null, invF: 'all', smTab: 'enh', smSel: null, dis: new Set(), crSlot: 'weapon', busy: false };
let hooks = { onChange: () => {}, cheer: () => {} };
export function initGear(h) { hooks = { ...hooks, ...h }; bind(); }
const S = () => Acc.load(), hero = () => S().hero;
const eqOf = (s, id) => { for (const h in s.eq) for (const sl in s.eq[h]) if (s.eq[h][sl] === id) return h; return null; };
function sorted(list, s) { return [...list].sort((a, b) => (!!eqOf(s, b.id) - !!eqOf(s, a.id)) || b.g - a.g || b.e - a.e || E.power(b) - E.power(a)); }
function tile(it, s, extra = '') { const h = eqOf(s, it.id); return `<button class="itile g${it.g} ${extra}" data-id="${it.id}" style="--gc:${GC(it.g)}"><span class="ic">${icon(it)}</span>${it.e ? `<span class="en">+${it.e}</span>` : ''}${h ? `<span class="eqb">${CLASSES[h].n[0]}</span>` : ''}</button>`; }
export function card(it, cmp) {
  if (!it) return '<div class="icard empty">빈 칸</div>'; const st = E.itemStats(it), cs = cmp ? E.itemStats(cmp) : null, keys = new Set([...Object.keys(st), ...(cs ? Object.keys(cs) : [])]);
  const lines = [...keys].map(k => { const v = st[k] || 0, d = cs ? Math.round((v - (cs[k] || 0)) * 10) / 10 : 0; return `<div class="sl ${k === it.m[0] ? 'main' : ''}">${E.STAT[k]} <b>+${v}%</b>${cs && d ? `<i class="${d > 0 ? 'gup' : 'gdn'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</i>` : ''}</div>`; }).join('');
  return `<div class="icard g${it.g}" style="--gc:${GC(it.g)}"><div class="ih"><span class="ic">${icon(it)}</span><div><div class="in">${esc(it.n)}${it.e ? ` <span class="en">+${it.e}</span>` : ''}</div><div class="ig">${E.GRADES[it.g].n} · ${E.SLOTS[it.s]}${it.h ? ' · ' + CLASSES[it.h].n + ' 전용' : ''}</div></div></div>${lines}${cmp ? `<div class="cmpn">장착 중인 장비와 비교</div>` : ''}</div>`;
}
export function bonusHtml(b) { const e = Object.entries(b); return e.length ? e.map(([k, v]) => `<span>${pct(k, v)}</span>`).join('') : '<span class="none">장착한 장비 없음</span>'; }
export function heroDots(s, h) { return E.SLOT_KEYS.map(sl => { const it = s.inv.find(x => x.id === (s.eq[h] || {})[sl]); return `<i class="dot" style="background:${it ? GC(it.g) : '#3a3450'}" title="${E.SLOTS[sl]}"></i>`; }).join(''); }

// ---------- 가방 ----------
export function openInv() { ui.inv = true; $('invPanel').classList.remove('hidden'); Snd.play('ui'); closeSmith(true); renderInv(); }
export function closeInv() { if (ui.inv) Snd.play('ui'); ui.inv = false; $('invPanel').classList.add('hidden'); }
function renderInv() {
  if (!ui.inv) return; const s = S(), h = s.hero, eq = s.eq[h] || {};
  const list = sorted(s.inv.filter(x => ui.invF === 'all' || x.s === ui.invF), s);
  const sel = s.inv.find(x => x.id === ui.invSel), cur = sel ? s.inv.find(x => x.id === eq[sel.s]) : null;
  $('invHead').innerHTML = `🎒 가방 <b class="${s.inv.length >= E.CAP ? 'full' : ''}">${s.inv.length}/${E.CAP}</b> · <span style="color:#ffe08a">${CLASSES[h].n}</span>`;
  $('invSlots').innerHTML = E.SLOT_KEYS.map(sl => { const it = s.inv.find(x => x.id === eq[sl]); return `<div class="slot" data-sl="${sl}"><div class="slh">${E.SLOTS[sl]}</div>${it ? tile(it, s) : `<div class="itile emptyT"><span class="ic">${sl === 'weapon' ? ICON[h] : ICON[sl]}</span></div>`}</div>`; }).join('');
  $('invBonus').innerHTML = bonusHtml(E.bonus(s, h));
  $('invFilt').innerHTML = [['all', '전체'], ['weapon', '무기'], ['armor', '방어구'], ['acc', '장신구']].map(([k, n]) => `<button class="ftab ${ui.invF === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
  $('invGrid').innerHTML = list.length ? list.map(it => tile(it, s, it.id === ui.invSel ? 'sel' : '')).join('') : '<div class="emptyMsg">장비가 없어요. 출정해서 5웨이브마다 보상 상자를, 보스에게서 장비를 얻거나 대장간에서 제작하세요!</div>';
  const full = s.inv.length >= E.CAP; $('invMsg').innerHTML = full ? '⚠ 가방이 가득 찼어요! 새 장비는 자동으로 분해됩니다 — 대장간에서 분해해 공간을 만드세요.' : s.inv.length >= E.CAP - 5 ? `가방이 거의 찼어요 (${E.CAP - s.inv.length}칸 남음)` : '';
  let act = '';
  if (sel) { const who = eqOf(s, sel.id); act = !E.canEquip(sel, h) ? `<div class="warn">${CLASSES[sel.h].n} 전용 무기예요</div>` : who === h ? `<button class="gbtn" id="invUneq">해제</button>` : `<button class="gbtn main" id="invEq">장착${who ? ` (${CLASSES[who].n}에게서 가져오기)` : ''}</button>`; }
  $('invDetail').innerHTML = sel ? card(sel, cur && cur.id !== sel.id ? cur : null) + `<div class="acts">${act}</div>` : '<div class="hintS">장비를 눌러 자세히 보기 · 마우스를 올리면 비교</div>';
  document.querySelectorAll('#invPanel .itile[data-id]').forEach(b => { b.onclick = () => { ui.invSel = b.dataset.id; Snd.play('select'); renderInv(); };
    b.onmouseenter = () => { const it = S().inv.find(x => x.id === b.dataset.id); if (!it) return; const c = S().inv.find(x => x.id === (S().eq[h] || {})[it.s]); showTip(b, card(it, c && c.id !== it.id ? c : null)); }; b.onmouseleave = hideTip; });
  document.querySelectorAll('#invFilt .ftab').forEach(b => b.onclick = () => { ui.invF = b.dataset.f; Snd.play('ui'); renderInv(); });
  if ($('invEq')) $('invEq').onclick = () => { Acc.update(d => E.equip(d, h, sel.id)[0]); Snd.play('upgrade'); hooks.cheer(); hooks.onChange(); };
  if ($('invUneq')) $('invUneq').onclick = () => { Acc.update(d => E.unequip(d, h, sel.s)); Snd.play('ui'); hooks.onChange(); };
}
function showTip(el, html) { const t = $('itemTip'); t.innerHTML = html; t.classList.remove('hidden'); const r = el.getBoundingClientRect(); let x = r.right + 8, y = r.top; if (x + 230 > innerWidth) x = r.left - 238; t.style.left = x + 'px'; t.style.top = Math.min(y, innerHeight - t.offsetHeight - 8) + 'px'; }
function hideTip() { $('itemTip').classList.add('hidden'); }

// ---------- 대장간 ----------
export const smithOpen = () => ui.smith;
export function openSmith() { if (!ui.smith) { Snd.play('hitArmor'); Snd.play('confirm'); } ui.smith = true; $('smithPanel').classList.remove('hidden'); closeInv(); renderSmith(); }
export function closeSmith(silent) { if (ui.smith && !silent) Snd.play('ui'); ui.smith = false; $('smithPanel').classList.add('hidden'); hideTip(); }
const costHtml = (c, s) => [['souls', '영혼석', s.souls], ['steel', '강철', s.mat.steel], ['crystal', '마력석', s.mat.crystal]].filter(([k]) => c[k]).map(([k, n, have]) => `<span class="cost ${have >= c[k] ? '' : 'lack'}"><i class="mi ${k}"></i>${n} ${c[k]}<small>/${have}</small></span>`).join('');
function renderSmith() {
  if (!ui.smith) return; const s = S();
  $('smMats').innerHTML = `<span><i class="mi souls"></i>${s.souls}</span><span><i class="mi steel"></i>강철 ${s.mat.steel}</span><span><i class="mi crystal"></i>마력석 ${s.mat.crystal}</span>`;
  document.querySelectorAll('#smTabs .ftab').forEach(b => { b.classList.toggle('on', b.dataset.t === ui.smTab); b.onclick = () => { if (ui.busy) return; ui.smTab = b.dataset.t; Snd.play('ui'); renderSmith(); }; });
  const body = $('smBody');
  if (ui.smTab === 'enh') {
    const list = sorted(s.inv, s); if (!list.some(x => x.id === ui.smSel)) ui.smSel = list[0]?.id || null; const it = s.inv.find(x => x.id === ui.smSel);
    let right = '<div class="hintS">강화할 장비가 없어요</div>';
    if (it) { const c = E.enhCost(it), max = it.e >= E.MAXE, nx = { ...it, e: it.e + 1 };
      right = `<div class="anvil" id="anvil"><div class="bigTile g${it.g}" style="--gc:${GC(it.g)}"><span class="ic">${icon(it)}</span><span class="en">+${it.e}</span></div><div class="hammer" id="hammer">🔨</div><div class="sparks" id="sparks"></div><div class="enhRes ${ui.res && ui.res.id === it.id ? ui.res.c : ''}" id="enhRes">${ui.res && ui.res.id === it.id ? ui.res.t : ''}</div></div>
        <div class="enhInfo"><div class="in" style="color:${GC(it.g)}">${esc(it.n)}</div>${max ? '<div class="maxT">✦ 최대 강화 +10 ✦</div>' : `<div class="lv">+${it.e} <b>→</b> <span>+${it.e + 1}</span></div>
        <div class="sl">${E.STAT[it.m[0]]} ${E.mainVal(it)}% <b>→</b> <span class="gup">${E.mainVal(nx)}%</span></div><div class="rate">성공 확률 <b style="color:${E.ENH_RATE[it.e] >= 70 ? '#8aff9a' : E.ENH_RATE[it.e] >= 40 ? '#ffe066' : '#ff9a7a'}">${E.ENH_RATE[it.e]}%</b> <small>(실패해도 장비는 사라지지 않아요)</small></div>
        <div class="costs">${costHtml(c, s)}</div><button class="gbtn main" id="enhGo" ${ui.busy ? 'disabled' : ''}>🔨 강화하기</button>`}</div>`; }
    body.innerHTML = `<div class="smCols"><div class="smList">${list.map(x => tile(x, s, x.id === ui.smSel ? 'sel' : '')).join('') || '<div class="emptyMsg">장비 없음</div>'}</div><div class="smMain">${right}</div></div>`;
    body.querySelectorAll('.smList .itile').forEach(b => { b.onclick = () => { if (ui.busy) return; ui.res = null; ui.smSel = b.dataset.id; Snd.play('select'); renderSmith(); }; tipBind(b); });
    if ($('enhGo')) $('enhGo').onclick = () => doEnhance(it.id);
  } else if (ui.smTab === 'dis') {
    const list = sorted(s.inv.filter(x => !eqOf(s, x.id)), s); for (const id of [...ui.dis]) if (!list.some(x => x.id === id)) ui.dis.delete(id);
    const y = { steel: 0, crystal: 0 }; for (const id of ui.dis) { const r = E.dismantleYield(s.inv.find(x => x.id === id)); y.steel += r.steel; y.crystal += r.crystal; }
    body.innerHTML = `<div class="disBulk">${E.GRADES.map((g, i) => `<button class="ftab gb" data-g="${i}" style="--gc:${g.c}">${g.n} 전체</button>`).join('')}<button class="ftab" data-g="x">선택 해제</button></div>
      <div class="smGrid" id="disGrid">${list.map(x => tile(x, s, ui.dis.has(x.id) ? 'pick' : '')).join('') || '<div class="emptyMsg">분해할 수 있는 장비가 없어요 (장착 중인 장비는 분해되지 않아요)</div>'}</div>
      <div class="disFoot"><div>획득 예정: <b><i class="mi steel"></i>강철 ${y.steel}</b> · <b><i class="mi crystal"></i>마력석 ${y.crystal}</b></div><button class="gbtn main" id="disGo" ${ui.dis.size ? '' : 'disabled'}>⚒ 분해하기 (${ui.dis.size}개)</button></div>
      <div class="hintS">분해: 일반 강철2 · 고급 4 · 희귀 8+마력석1 · 영웅 12+3 · 전설 20+8 (강화 수치당 강철 +2)</div>`;
    body.querySelectorAll('#disGrid .itile').forEach(b => { b.onclick = () => { const id = b.dataset.id; ui.dis.has(id) ? ui.dis.delete(id) : ui.dis.add(id); Snd.play('select'); renderSmith(); }; tipBind(b); });
    body.querySelectorAll('.disBulk .ftab').forEach(b => b.onclick = () => { Snd.play('ui'); if (b.dataset.g === 'x') ui.dis.clear(); else list.filter(x => x.g === +b.dataset.g).forEach(x => ui.dis.add(x.id)); renderSmith(); });
    $('disGo').onclick = () => doDismantle();
  } else {
    const h = s.hero; const slots = [['weapon', `무기 (${CLASSES[h].n})`], ['armor', '방어구'], ['acc', '장신구']];
    body.innerHTML = `<div class="crSlots">${slots.map(([k, n]) => `<button class="ftab ${ui.crSlot === k ? 'on' : ''}" data-s="${k}">${k === 'weapon' ? ICON[h] : ICON[k]} ${n}</button>`).join('')}</div>
      <div class="recipes">${E.RECIPES.map(R => `<div class="recipe"><div class="rn">${R.n}</div><div class="odds">${R.odds.map((o, i) => o ? `<div class="ob" style="--gc:${GC(i)};flex:${o}"><span>${E.GRADES[i].n} ${o}%</span></div>` : '').join('')}</div><div class="costs">${costHtml(R.cost, s)}</div><button class="gbtn main crGo" data-r="${R.k}">⚒ 제작</button></div>`).join('')}</div>
      ${s.inv.length >= E.CAP ? '<div class="warn">가방이 가득 차서 제작할 수 없어요. 먼저 분해하세요!</div>' : ''}`;
    body.querySelectorAll('.crSlots .ftab').forEach(b => b.onclick = () => { ui.crSlot = b.dataset.s; Snd.play('ui'); renderSmith(); });
    body.querySelectorAll('.crGo').forEach(b => b.onclick = () => doCraft(b.dataset.r));
  }
}
function tipBind(b) { b.onmouseenter = () => { const it = S().inv.find(x => x.id === b.dataset.id); if (it) showTip(b, card(it)); }; b.onmouseleave = hideTip; }
function sparks(n, color) { const w = $('sparks'); if (!w) return; for (let i = 0; i < n; i++) { const p = document.createElement('i'), a = Math.random() * 6.283, d = 40 + Math.random() * 90; p.style.setProperty('--dx', Math.cos(a) * d + 'px'); p.style.setProperty('--dy', (Math.sin(a) * d - 30) + 'px'); p.style.background = color; p.style.animationDelay = Math.random() * .1 + 's'; w.appendChild(p); setTimeout(() => p.remove(), 900); } }
export function doEnhance(id, quick) {
  if (ui.busy) return; const s0 = S(), it0 = s0.inv.find(x => x.id === id); if (!it0) return;
  if (it0.e >= E.MAXE) return; const c = E.enhCost(it0); if (!(s0.souls >= c.souls && s0.mat.steel >= c.steel && s0.mat.crystal >= c.crystal)) { Snd.play('error'); flashMsg('재료가 부족해요', '#ff9a7a'); return; }
  ui.busy = true; ui.res = null; const er = $('enhRes'); if (er) { er.className = 'enhRes'; er.textContent = ''; } $('enhGo') && ($('enhGo').disabled = true); const an = $('anvil'); an && an.classList.add('working');
  let k = 0; const strike = () => { Snd.play('hitArmor', { rate: .8 + k * .15 }); sparks(10 + k * 4, k % 2 ? '#ffd27a' : '#ff8a3a'); k++; };
  const T = quick ? [0, 0, 0] : [150, 450, 750]; T.forEach(t => setTimeout(strike, t));
  setTimeout(() => { let res; Acc.update(d => { const [n, r] = E.enhance(d, id); res = r; return n; }); ui.busy = false; renderSmith(); hooks.onChange(true);
    const it = S().inv.find(x => x.id === id), el = $('enhRes'), a2 = $('anvil');
    if (res === 'ok') { Snd.play('upgrade'); Snd.play('levelUp', { vol: .6 }); sparks(40, GC(it.g)); ui.res = { id, c: 'ok', t: `강화 성공! +${it.e}` }; if (el) { el.className = 'enhRes ok'; el.textContent = ui.res.t; } a2 && a2.classList.add('success'); hooks.cheer(); }
    else { Snd.play('error'); ui.res = { id, c: 'fail', t: '강화 실패… (장비는 무사해요)' }; if (el) { el.className = 'enhRes fail'; el.textContent = ui.res.t; } a2 && a2.classList.add('failed'); }
    G_last = res; }, quick ? 10 : 1000);
}
let G_last = null; export const lastEnh = () => G_last;
function flashMsg(t, c) { const el = $('enhRes'); if (el) { el.className = 'enhRes fail'; el.style.color = c; el.textContent = t; } }
function doDismantle() {
  const s = S(), ids = [...ui.dis], hi = ids.map(id => s.inv.find(x => x.id === id)).filter(x => x && x.g >= 3);
  if (hi.length && !confirm(`영웅/전설 등급 장비 ${hi.length}개가 포함되어 있어요. 정말 분해할까요?`)) return;
  document.querySelectorAll('#disGrid .itile.pick').forEach(b => b.classList.add('melt'));
  Snd.play('breakRock'); Snd.play('coins', { delay: .2 });
  setTimeout(() => { let got; Acc.update(d => { const r = E.dismantle(d, ids); got = r[1]; return r[0]; }); ui.dis.clear(); renderSmith(); hooks.onChange(true); const f = document.querySelector('.disFoot div'); if (f) f.innerHTML = `<span class="gotPop">+ 강철 ${got.steel} · 마력석 ${got.crystal} 획득!</span>`; }, 450);
}
function doCraft(rk) {
  const s = S(); let res, it; Acc.update(d => { const r = E.craft(d, rk, ui.crSlot, s.hero); res = r[1]; it = r[2]; return r[0]; });
  if (res === 'full') { Snd.play('error'); alertMsg('가방이 가득 찼어요! 먼저 분해하세요.'); return; } if (res !== 'ok') { Snd.play('error'); alertMsg('재료가 부족해요'); return; }
  Snd.play('hitArmor'); Snd.play('hitArmor', { delay: .25, rate: 1.2 }); renderSmith(); hooks.onChange(true); reveal([{ it, src: 'craft' }]);
}
function alertMsg(t) { const w = document.querySelector('#smBody .warn') || Object.assign(document.createElement('div'), { className: 'warn' }); w.textContent = t; $('smBody').appendChild(w); }

// ---------- 상자 개봉 연출 ----------
let RQ = [], RDone = null;
export function reveal(list, done) { RQ = [...list]; RDone = done || null; $('chestOv').classList.remove('hidden'); nextReveal(); }
export const revealing = () => !$('chestOv').classList.contains('hidden');
function nextReveal() {
  const ov = $('chestOv'); if (!RQ.length) { ov.classList.add('hidden'); ov.innerHTML = ''; const d = RDone; RDone = null; d && d(); return; }
  const total = RQ.length, x = RQ.shift(), it = x.it, c = GC(it.g), src = x.src === 'boss' ? '👑 보스 전리품' : x.src === 'craft' ? '⚒ 대장간 제작' : '🎁 출정 보상 상자';
  ov.innerHTML = `<div class="cvStage g${it.g}" style="--gc:${c}"><div class="cvSrc">${src}${total > 1 ? ` · 남은 상자 ${total - 1}` : ''}</div><div class="rays"></div><div class="cglow"></div>
    <div class="chest ${x.src === 'boss' ? 'boss' : ''}"><div class="lid"></div><div class="body"><div class="lock"></div></div></div>
    <div class="cvItem">${card(it)}${x.auto ? `<div class="warn">가방이 가득 차서 자동 분해: 강철 +${x.y.steel}${x.y.crystal ? ` · 마력석 +${x.y.crystal}` : ''}</div>` : ''}<div class="cvGrade" style="color:${c}">${E.GRADES[it.g].n}${it.g === 4 ? ' ★' : ''}</div></div><div class="cvTap">눌러서 열기</div></div>`;
  const st = ov.querySelector('.cvStage'); let phase = 0; Snd.play('place');
  const open = () => { if (phase) return; phase = 1; st.classList.add('shake'); Snd.play('hitArmor'); setTimeout(() => { st.classList.add('open'); Snd.play(it.g >= 3 ? 'victory' : 'levelUp', { force: true }); Snd.play('coins'); if (it.g >= 3) Snd.play('glass', { rate: 1.4 }); st.querySelector('.cvTap').textContent = RQ.length ? '눌러서 다음 상자' : '눌러서 닫기'; phase = 2; }, 700); };
  st.onclick = () => { if (phase === 0) open(); else if (phase === 2) { Snd.play('ui'); nextReveal(); } };
  setTimeout(open, 500);
}
export function refreshGear() { renderInv(); renderSmith(); }
function bind() {
  $('invClose').onclick = () => closeInv(); $('smClose').onclick = () => closeSmith();
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (revealing()) return; closeInv(); closeSmith(); } if (e.key.toLowerCase() === 'i' && document.activeElement?.tagName !== 'INPUT' && !$('scr_town').classList.contains('hidden')) ui.inv ? closeInv() : openInv(); });
}
