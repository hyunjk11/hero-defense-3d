// ================= 장비 UI: 가방(장착/비교) · 대장간(강화/분해/제작) · 보상 상자 개봉 =================
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import { escLayer } from './keys.js';
import { definePanel } from './panel.js';
import { askConfirm } from './confirm.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import * as Acc from '../account/account.js';
import * as E from '../account/equip.js';
import * as P from '../account/progress.js';
import * as SX from '../account/steel.js';
import { closeLab } from './lab.js';
import * as ST from '../data/stages.js';
import { closeStats } from './stats.js';
import { UQ_COLOR, UQ_DUP, AWAKE_MAX, CHSET, CH_KEYS, chOdds } from '../data/items.js';

import * as CX from './codex.js';
import { renderStorage } from './storage.js';
import { codexClaimable } from './codex.js';
export { codexClaimable, sampleItem } from './codex.js';
import { iconKey, weaponIcon, icon, setOf, GCi, clsN, GC, eqOf, sorted, tile, lskHtml, card, bonusHtml } from './itemview.js';
export { iconKey, weaponIcon, icon, uqSrcText, lskHtml, card, bonusHtml, heroDots } from './itemview.js'; // 기존 import 경로 호환
import { reveal, revealing, chestCount, openChestUI, lastChestBatch, initChest } from './chest.js';
export { reveal, revealing, chestCount, openChestUI, lastChestBatch } from './chest.js'; // 기존 import 경로 호환
let ui = { inv: false, smith: false, invSel: null, invF: 'all', invTab: 'bag', cxTab: 1, smTab: 'enh', smSel: null, awSel: null, dis: new Set(), crSlot: 'weapon', crSet: 0, busy: false, rrSel: null, rrCand: null, xchMsg: '', stoF: { slot: 'all', grade: 'all' }, stoSort: 'grade', stoSel: null, stoMsg: '' };
let hooks = { onChange: () => {}, cheer: () => {} };
export function initGear(h) { hooks = { ...hooks, ...h }; bind(); }
const S = () => Acc.load(), hero = () => S().hero;
// ---------- 가방 ----------
export function openInv(tab) { if (tab === 'stor' || tab === 'bag' || tab === 'codex') ui.invTab = tab; closeLab(true); closeStats(); ui.inv = true; IP.show(); Snd.play('ui'); closeSmith(true); renderInv(); }
export function closeInv() { if (ui.inv) Snd.play('ui'); ui.inv = false; IP.hide(); hideTip(); }
const IP = definePanel('inv', { id: 'invPanel', z: 41, isOpen: () => ui.inv, close: () => closeInv() });
function renderInv() {
  if (!ui.inv) return; const s = S(), h = s.hero, eq = s.eq[h] || {};
  $('invTabs').innerHTML = [['bag', '🎒 가방'], ['stor', '📦 창고'], ['codex', '📖 도감']].map(([k, n]) => `<button class="ftab ${ui.invTab === k ? 'on' : ''}" data-v="${k}">${n}${k === 'codex' && codexClaimable(s) ? ' <i class="newDot"></i>' : ''}</button>`).join('');
  document.querySelectorAll('#invTabs .ftab').forEach(b => b.onclick = () => { ui.invTab = b.dataset.v; ui.stoMsg = ''; Snd.play('ui'); hideTip(); renderInv(); });
  const cx = ui.invTab === 'codex', so = ui.invTab === 'stor'; for (const id of ['invTopW', 'invFilt', 'invMidW', 'invMsg']) $(id).classList.toggle('hidden', cx || so); $('codexBody').classList.toggle('hidden', !cx); $('storBody').classList.toggle('hidden', !so); $('invPanel').classList.toggle('wide', so);
  if (so) { renderStorage(s, STC); return; } if (cx) { $('invHead').innerHTML = `📖 장비 도감 · <span style="color:#ffe08a">${heroLabel(h)}</span>`; renderCodex(s); return; }
  const list = sorted(s.inv.filter(x => ui.invF === 'all' || x.s === ui.invF), s);
  const sel = s.inv.find(x => x.id === ui.invSel), cur = sel ? s.inv.find(x => x.id === eq[sel.s]) : null;
  $('invHead').innerHTML = `🎒 가방 <b class="${s.inv.length >= E.CAP ? 'full' : ''}">${s.inv.length}/${E.CAP}</b> · <span style="color:#ffe08a">${heroLabel(h)}</span>`;
  $('invSlots').innerHTML = E.SLOT_KEYS.map(sl => { const it = s.inv.find(x => x.id === eq[sl]); return `<div class="slot" data-sl="${sl}"><div class="slh">${E.SLOTS[sl]}</div>${it ? tile(it, s) : `<div class="itile emptyT"><span class="ic">${sl === 'weapon' ? weaponIcon(h) : iconKey(sl)}</span></div>`}</div>`; }).join('');
  $('invBonus').innerHTML = bonusHtml(E.bonus(s, h));
  $('invFilt').innerHTML = [['all', '전체'], ['weapon', '무기'], ['armor', '방어구'], ['acc', '장신구']].map(([k, n]) => `<button class="ftab ${ui.invF === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
  $('invGrid').innerHTML = list.length ? list.map(it => tile(it, s, it.id === ui.invSel ? 'sel' : '')).join('') : '<div class="emptyMsg">장비가 없어요. 출정해서 5웨이브마다 보상 상자를, 보스에게서 장비를 얻거나 대장간에서 제작하세요!</div>';
  const full = s.inv.length >= E.CAP; $('invMsg').innerHTML = full ? '⚠ 가방이 가득 찼어요! 보상 상자를 열 수 없어요 — 대장간에서 분해해 공간을 만드세요. <button class="gbtn sm" id="invToDis">⚒ 분해하러 가기</button>' : s.inv.length >= E.CAP - 5 ? `가방이 거의 찼어요 (${E.CAP - s.inv.length}칸 남음)` : ''; if ($('invToDis')) $('invToDis').onclick = () => { Snd.play('ui'); ui.smTab = 'dis'; openSmith(); }; // Q-10 가방 가득 → 대장간 분해 탭
  let act = '';
  if (sel) { const who = eqOf(s, sel.id); act = !E.canEquip(sel, h) ? `<div class="warn">${clsN(sel.h)} 전용 무기예요</div>` : who === h ? `<button class="gbtn" id="invUneq">해제</button>` : `<button class="gbtn main" id="invEq">장착${who ? ` (${clsN(who)}에게서 가져오기)` : ''}</button>${pwrLine(cur && cur.id !== sel.id ? cur : null, sel)}`; }
  $('invDetail').innerHTML = sel ? card(sel, cur && cur.id !== sel.id ? cur : null) + `<div class="acts">${act}</div>` : '<div class="hintS">장비를 눌러 자세히 보기 · 마우스를 올리면 비교</div>';
  document.querySelectorAll('#invPanel .itile[data-id]').forEach(b => { b.onclick = () => { ui.invSel = b.dataset.id; Snd.play('select'); renderInv(); };
    b.onpointerenter = e => { if (e.pointerType !== 'mouse') return; const it = S().inv.find(x => x.id === b.dataset.id); if (!it) return; const c = S().inv.find(x => x.id === (S().eq[h] || {})[it.s]); showTip(b, card(it, c && c.id !== it.id ? c : null)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); }; });
  document.querySelectorAll('#invFilt .ftab').forEach(b => b.onclick = () => { ui.invF = b.dataset.f; Snd.play('ui'); renderInv(); });
  if ($('invEq')) $('invEq').onclick = () => { Acc.update(d => E.equip(d, h, sel.id)[0]); Snd.play('upgrade'); hooks.cheer(); hooks.onChange(); };
  if ($('invUneq')) $('invUneq').onclick = () => { Acc.update(d => E.unequip(d, h, sel.s)); Snd.play('ui'); hooks.onChange(); };
}
// U-10 (2026-10-23): 오른쪽에 자리가 없으면 왼쪽, 양쪽 다 없으면 화면 안으로 · 아래로 넘치면 위로 올림 (높이는 CSS max-height 로 화면 안)
export function showTip(el, html) { const t = $('itemTip'); t.innerHTML = html; t.classList.remove('hidden'); const r = el.getBoundingClientRect(), M = 8, W = t.offsetWidth || 230, H = t.offsetHeight;
  let x = r.right + M; if (x + W > innerWidth - M) x = r.left - W - M; if (x < M) x = Math.max(M, Math.min(innerWidth - W - M, r.left));
  const y = Math.max(M, Math.min(r.top, innerHeight - H - M)); t.style.left = x + 'px'; t.style.top = y + 'px'; }
export function hideTip() { $('itemTip').classList.add('hidden'); }

// ---------- 대장간 ----------
export function openSmith() { closeLab(true); closeStats(); if (!ui.smith) ui.xchMsg = ''; if (!ui.smith) { Snd.play('hitArmor'); Snd.play('confirm'); } ui.smith = true; SMP.show(); closeInv(); renderSmith(); }
export function closeSmith(silent) { if (ui.smith && !silent) Snd.play('ui'); ui.smith = false; SMP.hide(); hideTip(); }
const SMP = definePanel('smith', { id: 'smithPanel', z: 40, isOpen: () => ui.smith, close: s => closeSmith(s) });
const costHtml = (c, s) => [['souls', '영혼석', s.souls], ['steel', '강철', s.mat.steel], ['crystal', '마력석', s.mat.crystal]].filter(([k]) => c[k]).map(([k, n, have]) => `<span class="cost ${have >= c[k] ? '' : 'lack'}"><i class="mi ${k}"></i>${n} ${c[k]}<small>/${have}</small></span>`).join('');
// Q-8 (2026-10-23): 전투력 변화 한 줄 (장착 버튼 옆 · 강화 미리보기). a 없음 = 빈 칸에 장착
const pwrLine = (a, b, pre = '') => { const p0 = a ? E.power(a) : 0, p1 = E.power(b), d = p1 - p0; return `<div class="pwrLine">${pre}전투력 ${a ? `${p0} → ` : ''}<b>${p1}</b> <span class="${d > 0 ? 'gup' : d < 0 ? 'gdown' : ''}">(${d > 0 ? '+' : ''}${d})</span></div>`; };
function renderSmith() {
  if (!ui.smith) return; const s = S();
  $('smMats').innerHTML = `<span><i class="mi souls"></i>${s.souls}</span><span><i class="mi steel"></i>강철 ${s.mat.steel}</span><span><i class="mi crystal"></i>마력석 ${s.mat.crystal}</span><span class="essM" title="고유 정수 — 고유 장비 각성 재료 (고유 중복 획득·도감 보상·도전 모드 보스)"><i class="mi essence"></i>고유 정수 ${s.mat.essence || 0}</span>`;
  document.querySelectorAll('#smTabs .ftab').forEach(b => { b.classList.toggle('on', b.dataset.t === ui.smTab); b.onclick = () => { if (ui.busy) return; ui.smTab = b.dataset.t; ui.xchMsg = ''; Snd.play('ui'); hideTip(); renderSmith(); }; });
  const body = $('smBody');
  if (ui.smTab === 'enh') {
    const list = sorted(s.inv, s); if (!list.some(x => x.id === ui.smSel)) ui.smSel = list[0]?.id || null; const it = s.inv.find(x => x.id === ui.smSel);
    let right = '<div class="hintS">강화할 장비가 없어요</div>';
    if (it) { const c = E.enhCost(it), max = it.e >= E.MAXE, nx = { ...it, e: it.e + 1 };
      right = `<div class="anvil" id="anvil"><div class="bigTile g${it.g}${it.uq ? ' uq' : ''}" style="--gc:${GCi(it)}"><span class="ic">${icon(it)}</span><span class="en">+${it.e}</span></div><div class="hammer" id="hammer">🔨</div><div class="sparks" id="sparks"></div><div class="enhRes ${ui.res && ui.res.id === it.id ? ui.res.c : ''}" id="enhRes">${ui.res && ui.res.id === it.id ? ui.res.t : ''}</div></div>
        <div class="enhInfo"><div class="in" style="color:${GC(it.g)}">${esc(it.n)}</div>${lskHtml(it)}${max ? '<div class="maxT">✦ 최대 강화 +10 ✦</div>' : `<div class="lv">+${it.e} <b>→</b> <span>+${it.e + 1}</span></div>
        <div class="sl">${E.STAT[it.m[0]]} ${E.mainVal(it)}% <b>→</b> <span class="gup">${E.mainVal(nx)}%</span></div>${pwrLine(it, nx, '강화 후 ')}<div class="rate">성공 확률 <b style="color:${E.ENH_RATE[it.e] >= 70 ? '#8aff9a' : E.ENH_RATE[it.e] >= 40 ? '#ffe066' : '#ff9a7a'}">${E.ENH_RATE[it.e]}%</b> <small>(실패해도 장비는 사라지지 않아요)</small></div>
        <div class="costs">${costHtml(c, s)}</div><button class="gbtn main" id="enhGo" ${ui.busy ? 'disabled' : ''}>🔨 강화하기</button>`}</div>`; }
    body.innerHTML = `<div class="smCols"><div class="smList">${list.map(x => tile(x, s, x.id === ui.smSel ? 'sel' : '')).join('') || '<div class="emptyMsg">장비 없음</div>'}</div><div class="smMain">${right}</div></div>`;
    body.querySelectorAll('.smList .itile').forEach(b => { b.onclick = () => { if (ui.busy) return; ui.res = null; ui.smSel = b.dataset.id; Snd.play('select'); renderSmith(); }; tipBind(b); });
    if ($('enhGo')) $('enhGo').onclick = () => doEnhance(it.id);
  } else if (ui.smTab === 'dis') {
    const list = sorted(s.inv.filter(x => !eqOf(s, x.id) && !x.uq), s); for (const id of [...ui.dis]) if (!list.some(x => x.id === id)) ui.dis.delete(id); // 고유는 분해 불가 (목록에서 제외)
    const y = { steel: 0, crystal: 0 }; for (const id of ui.dis) { const r = E.dismantleYield(s.inv.find(x => x.id === id)); y.steel += r.steel; y.crystal += r.crystal; }
    body.innerHTML = `<div class="disBulk">${E.GRADES.map((g, i) => `<button class="ftab gb" data-g="${i}" style="--gc:${g.c}">${g.n} 전체</button>`).join('')}${[1, 2].map(i => `<button class="ftab le" data-le="${i}" title="${E.GRADES.slice(0, i + 1).map(g => g.n).join('·')} 모두 선택 (장착·고유 제외)">${E.GRADES[i].n} 이하 모두</button>`).join('')}<button class="ftab" data-g="x">선택 해제</button></div>
      <div class="smGrid" id="disGrid">${list.map(x => tile(x, s, ui.dis.has(x.id) ? 'pick' : '')).join('') || '<div class="emptyMsg">분해할 수 있는 장비가 없어요 (장착 중인 장비는 분해되지 않아요)</div>'}</div>
      <div class="disFoot"><div>획득 예정: <b><i class="mi steel"></i>강철 ${y.steel}</b> · <b><i class="mi crystal"></i>마력석 ${y.crystal}</b></div><button class="gbtn main" id="disGo" ${ui.dis.size ? '' : 'disabled'}>⚒ 분해하기 (${ui.dis.size}개)</button></div>
      <div class="hintS">분해: 일반 강철2 · 고급 4 · 희귀 8+마력석1 · 영웅 12+3 · 전설 20+8 (강화 수치당 강철 +2)${s.inv.some(x => x.uq) ? ' · ◆ 고유 장비는 분해할 수 없어요' : ''}</div>`;
    body.querySelectorAll('#disGrid .itile').forEach(b => { b.onclick = () => { const id = b.dataset.id; ui.dis.has(id) ? ui.dis.delete(id) : ui.dis.add(id); Snd.play('select'); renderSmith(); }; tipBind(b); });
    body.querySelectorAll('.disBulk .ftab').forEach(b => b.onclick = () => { Snd.play('ui'); if (b.dataset.g === 'x') ui.dis.clear(); else list.filter(x => b.dataset.le != null ? x.g <= +b.dataset.le : x.g === +b.dataset.g).forEach(x => ui.dis.add(x.id)); renderSmith(); });
    $('disGo').onclick = () => doDismantle();
  } else if (ui.smTab === 'rr') { // 🎲 옵션 재설정 (강철만, docs/STEEL_2026-10-24.md): 굴리면 강철 소모 → 새 옵션을 보고 적용/유지 선택
    const list = sorted(s.inv.filter(E.canReroll), s); if (!list.some(x => x.id === ui.rrSel)) { ui.rrSel = list[0]?.id || null; ui.rrCand = null; } const it = s.inv.find(x => x.id === ui.rrSel);
    if (ui.rrCand && (!it || ui.rrCand.id !== it.id)) ui.rrCand = null;
    let right = '<div class="hintS">재설정할 장비가 없어요 (고급 이상 · 고유 제외)</div>';
    if (it) { const c = E.rerollCost(it), cand = ui.rrCand && ui.rrCand.sub, row = (p, cls = '') => `<div class="rrLine ${cls}"><span>${E.STAT[p[0]]}</span><b>+${p[1]}%</b><small>(${E.subRange(it.g, p[0]).join('~')})</small></div>`;
      right = `${card(it)}<div class="rrBox"><div class="rrCol"><div class="rrH">현재 옵션</div>${it.sub.map(p => row(p)).join('')}</div>${cand ? `<div class="rrArrow">➜</div><div class="rrCol new"><div class="rrH">새 옵션</div>${cand.map(p => row(p, 'gup')).join('')}</div>` : ''}</div>
        ${cand ? `<div class="pwrLine">전투력 ${E.power(it)} → <b>${E.power({ ...it, sub: cand })}</b></div><div class="rrActs"><button class="gbtn main" id="rrApply">✔ 새 옵션 적용</button><button class="gbtn" id="rrKeep">↩ 기존 유지</button></div>`
        : `<div class="costs">${costHtml(c, s)}</div><button class="gbtn main" id="rrGo" ${s.mat.steel >= c.steel ? '' : 'disabled'}>🎲 옵션 재설정</button>`}`; }
    body.innerHTML = `<div class="smCols"><div class="smList">${list.map(x => tile(x, s, x.id === ui.rrSel ? 'sel' : '')).join('') || '<div class="emptyMsg">장비 없음</div>'}</div><div class="smMain rrMain">${right}<div class="hintS">보조 옵션의 종류와 수치를 다시 굴려요 (주 옵션·강화 수치는 그대로) · 강철만 사용: 고급 ${E.REROLL_COST[1]} · 희귀 ${E.REROLL_COST[2]} · 영웅 ${E.REROLL_COST[3]} · 전설 ${E.REROLL_COST[4]} · 새 옵션이 마음에 안 들면 기존 유지 (강철은 돌려받지 못해요)</div></div></div>`;
    body.querySelectorAll('.smList .itile').forEach(b => { b.onclick = () => { if (ui.rrCand && ui.rrCand.id !== b.dataset.id) ui.rrCand = null; ui.rrSel = b.dataset.id; Snd.play('select'); renderSmith(); }; tipBind(b); });
    if ($('rrGo')) $('rrGo').onclick = () => { let r, sub; Acc.update(d => { const o = E.reroll(d, it.id); r = o[1]; sub = o[2]; return o[0]; }); if (r === 'ok') { ui.rrCand = { id: it.id, sub }; Snd.play('hitArmor'); Snd.play('magic', { vol: .4 }); } else Snd.play('error'); renderSmith(); hooks.onChange(true); };
    if ($('rrApply')) $('rrApply').onclick = () => { const c = ui.rrCand; let ok = false; Acc.update(d => { const o = E.applySubs(d, c.id, c.sub); ok = o[1]; return o[0]; }); ui.rrCand = null; if (ok) { Snd.play('upgrade'); hooks.cheer(); } else Snd.play('error'); renderSmith(); hooks.onChange(true); };
    if ($('rrKeep')) $('rrKeep').onclick = () => { ui.rrCand = null; Snd.play('ui'); renderSmith(); };
  } else if (ui.smTab === 'xch') { // ⚖ 강철 → 영혼석 교환 (하루 상한, 한국 시간 0시 초기화)
    const X = SX.XCH, used = SX.xchUsed(s), left = X.daily - used, mx = SX.xchMax(s), btn = (n, lbl) => `<button class="gbtn ${n === mx && n > 1 ? 'main' : ''} xchGo" data-n="${n}" ${n >= 1 && n <= mx ? '' : 'disabled'}>${lbl}<small>강철 ${n * X.steel} → 영혼석 ${n * X.souls}</small></button>`;
    body.innerHTML = `<div class="xchBox"><div class="xchRate"><span class="cost"><i class="mi steel"></i>강철 ${X.steel}</span><b>➜</b><span class="cost"><i class="mi souls"></i>영혼석 ${X.souls}</span></div>
      <div class="xchLeft">오늘 남은 교환 <b id="xchLeftN">${left}</b>/${X.daily}회 <small>(한국 시간 0시에 초기화)</small></div><div class="xchPips">${Array.from({ length: X.daily }, (_, i) => `<i class="${i < used ? 'on' : ''}"></i>`).join('')}</div>
      <div class="xchBtns">${btn(1, '1회')}${btn(5, '5회')}${btn(mx, `최대 ${mx}회`)}</div><div class="xchMsg" id="xchMsg">${ui.xchMsg || (left <= 0 ? '오늘 교환을 모두 썼어요. 내일 다시 오세요!' : s.mat.steel < X.steel ? `강철이 부족해요 (1회에 ${X.steel})` : '')}</div>
      <div class="hintS">남는 강철을 영혼석으로 바꿔요 · 하루 최대 강철 ${X.steel * X.daily} → 영혼석 ${X.souls * X.daily} · 영혼석은 출정이 주 수입이에요 (교환은 보조)</div></div>`;
    body.querySelectorAll('.xchGo').forEach(b => b.onclick = () => { if (b.disabled) return; let r, got; Acc.update(d => { const o = P.exchangeSteel(d, +b.dataset.n); r = o[1]; got = o[2]; return o[0]; });
      if (r === 'ok') { Snd.play('coins'); ui.xchMsg = `<span class="gotPop">강철 ${got.steel} → 영혼석 +${got.souls} 교환 완료!</span>`; } else { Snd.play('error'); ui.xchMsg = r === 'cap' ? '오늘 교환 횟수가 부족해요' : '강철이 부족해요'; } renderSmith(); hooks.onChange(true); });
  } else if (ui.smTab === 'awk') { // 각성: 고유 정수로 고유 궁극기 강화 (항상 성공)
    const list = sorted(s.inv.filter(x => x.uq), s); if (!list.some(x => x.id === ui.awSel)) ui.awSel = list[0]?.id || null; const it = s.inv.find(x => x.id === ui.awSel);
    let right = '<div class="hintS">고유 장비가 없어요. 챕터 보스 첫 처치·별 만점·도전 모드 기록으로 얻을 수 있어요!</div>';
    if (it) { const max = (it.a || 0) >= AWAKE_MAX, c = E.awakeCost(it);
      right = `${card(it)}${max ? '<div class="maxT">✦ 최대 각성 ★5 ✦</div>' : `<div class="lv">각성 ★${it.a || 0} <b>→</b> <span>★${(it.a || 0) + 1}</span> <small>(위력 +8% · 쿨 -4%${(it.a || 0) === 2 ? ' · ★3 효과 해금' : ''})</small></div>
        <div class="costs"><span class="cost ${(s.mat.essence || 0) >= c.essence ? '' : 'lack'}"><i class="mi essence"></i>고유 정수 ${c.essence}<small>/${s.mat.essence || 0}</small></span>${costHtml({ souls: c.souls }, s)}</div><button class="gbtn main" id="awkGo">✦ 각성하기</button>`}`; }
    body.innerHTML = `<div class="smCols"><div class="smList">${list.map(x => tile(x, s, x.id === ui.awSel ? 'sel' : '')).join('') || '<div class="emptyMsg">고유 장비 없음</div>'}</div><div class="smMain awkMain">${right}<div class="hintS">고유 정수: 이미 가진 고유를 또 얻으면 ×${UQ_DUP.essence} · 도감 챕터 완성 ×10 · 도전 모드 20웨이브 이후 보스</div></div></div>`;
    body.querySelectorAll('.smList .itile').forEach(b => { b.onclick = () => { ui.awSel = b.dataset.id; Snd.play('select'); renderSmith(); }; tipBind(b); });
    if ($('awkGo')) $('awkGo').onclick = () => { let r; Acc.update(d => { const o = E.awaken(d, it.id); r = o[1]; return o[0]; }); if (r === 'ok') { Snd.play('upgrade'); Snd.play('levelUp', { force: true }); hooks.cheer(); } else Snd.play('error'); renderSmith(); hooks.onChange(true); };
  } else {
    const h = s.hero; const slots = [['weapon', `무기 (${CLASSES[h].n})`], ['armor', '방어구'], ['acc', '장신구']], sets = clearedSets(s); if (!sets.includes(ui.crSet)) ui.crSet = 0;
    body.innerHTML = `<div class="crSlots">${slots.map(([k, n]) => `<button class="ftab ${ui.crSlot === k ? 'on' : ''}" data-s="${k}">${k === 'weapon' ? weaponIcon(h) : iconKey(k)} ${n}</button>`).join('')}</div>
      <div class="crSets">세트 <button class="ftab ${!ui.crSet ? 'on' : ''}" data-c="0">🎲 무작위</button>${CH_KEYS.map(c => { const C = CHSET[c], un = sets.includes(c); return `<button class="ftab ${ui.crSet === c ? 'on' : ''}" data-c="${c}" ${un ? '' : 'disabled title="그 챕터 보스를 처치하면 열려요"'} style="--cc:${C.color}">${C.badge} ${C.n}${un ? '' : ' 🔒'}</button>`; }).join('')}<small>${ui.crSet ? '세트 제작: 비용 +20%' : ''}</small></div>
      <div class="recipes">${E.RECIPES.map(R => { const od = ui.crSet ? chOdds(R.odds, ui.crSet) : R.odds, t = od.reduce((a, b) => a + b, 0); return `<div class="recipe"><div class="rn">${R.n}</div><div class="odds">${od.map((o, i) => o ? `<div class="ob" style="--gc:${GC(i)};flex:${o}"><span>${E.GRADES[i].n} ${Math.round(o / t * 100)}%</span></div>` : '').join('')}</div><div class="costs">${costHtml(E.craftCost(R, ui.crSet || undefined), s)}</div><button class="gbtn main crGo" data-r="${R.k}">⚒ 제작</button></div>`; }).join('')}</div>
      ${s.inv.length >= E.CAP ? '<div class="warn">가방이 가득 차서 제작할 수 없어요. 먼저 분해하세요!</div>' : ''}`;
    body.querySelectorAll('.crSlots .ftab').forEach(b => b.onclick = () => { ui.crSlot = b.dataset.s; Snd.play('ui'); renderSmith(); });
    body.querySelectorAll('.crSets .ftab').forEach(b => b.onclick = () => { if (b.disabled) return; ui.crSet = +b.dataset.c; Snd.play('ui'); renderSmith(); });
    body.querySelectorAll('.crGo').forEach(b => b.onclick = () => doCraft(b.dataset.r));
  }
}
// 마우스: 올리면 툴팁 · 터치: 누를 때 툴팁 (잠시 후/다른 곳을 누르면 닫힘)
function tipBind(b) { const sh = () => { const it = S().inv.find(x => x.id === b.dataset.id); if (it) showTip(b, card(it)); };
  b.onpointerenter = e => { if (e.pointerType === 'mouse') sh(); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); };
  b.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { const id = b.dataset.id; setTimeout(() => { const nb = document.querySelector(`#smBody .itile[data-id="${CSS.escape(id)}"]`); if (nb) { const it = S().inv.find(x => x.id === id); if (it) showTip(nb, card(it)); clearTimeout(tipT); tipT = setTimeout(hideTip, 2600); } }, 0); } }); }
let tipT = 0; addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && !(e.target.closest && e.target.closest('.itile'))) hideTip(); }, true);
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
// 세트 제작이 열린 챕터 = 그 챕터 보스(마지막 스테이지)를 클리어한 챕터
const clearedSets = s => CH_KEYS.filter(c => { const C = ST.CHAPTERS.find(x => x.id === c); return C && ST.stars(s, C.stages[C.stages.length - 1].id) > 0; });
function flashMsg(t, c) { const el = $('enhRes'); if (el) { el.className = 'enhRes fail'; el.style.color = c; el.textContent = t; } }
async function doDismantle() {
  const s = S(), ids = [...ui.dis], hi = ids.map(id => s.inv.find(x => x.id === id)).filter(x => x && x.g >= 3);
  if (hi.length && !(await askConfirm({ title: '고급 장비 분해', icon: '⚒', body: `영웅/전설 등급 장비 ${hi.length}개가 포함되어 있어요.\n정말 분해할까요?`, ok: '분해', tone: 'danger' }))) return;
  document.querySelectorAll('#disGrid .itile.pick').forEach(b => b.classList.add('melt'));
  Snd.play('breakRock'); Snd.play('coins', { delay: .2 });
  setTimeout(() => { let got; Acc.update(d => { const r = E.dismantle(d, ids); got = r[1]; return r[0]; }); ui.dis.clear(); renderSmith(); hooks.onChange(true); const f = document.querySelector('.disFoot div'); if (f) f.innerHTML = `<span class="gotPop">+ 강철 ${got.steel} · 마력석 ${got.crystal} 획득!</span>`; }, 450);
}
function doCraft(rk) {
  const s = S(), ch = clearedSets(s).includes(ui.crSet) ? ui.crSet : undefined; let res, it; Acc.update(d => { const r = E.craft(d, rk, ui.crSlot, s.hero, Math.random, ch); res = r[1]; it = r[2]; return r[0]; });
  if (res === 'full') { Snd.play('error'); alertMsg('가방이 가득 찼어요! 먼저 분해하세요.'); return; } if (res !== 'ok') { Snd.play('error'); alertMsg('재료가 부족해요'); return; }
  Snd.play('hitArmor'); Snd.play('hitArmor', { delay: .25, rate: 1.2 }); renderSmith(); hooks.onChange(true); reveal([{ it, src: 'craft' }]);
}
function alertMsg(t) { const w = document.querySelector('#smBody .warn') || Object.assign(document.createElement('div'), { className: 'warn' }); w.textContent = t; $('smBody').appendChild(w); }

// ---------- 상자 개봉 연출 · 보관 상자 → ui/chest.js (C-10c) ----------
initChest({ ui, hooks: () => hooks, S: () => S(), openSmith: () => openSmith(), closeInv: () => closeInv(), closeSmith: s => closeSmith(s), showTip: (el, h) => showTip(el, h), hideTip: () => hideTip() });
// ---------- 도감 → ui/codex.js (C-10b) ----------
const CXC = { ui, hooks: () => hooks, renderInv: () => renderInv(), S: () => S(), tipLater: () => { clearTimeout(tipT); tipT = setTimeout(hideTip, 3200); } };
function renderCodex(s) { return CX.renderCodex(s, CXC); }
// ---------- 📦 창고 → ui/storage.js (2026-10-24) ----------
const STC = { ui, hooks: () => hooks, renderInv: () => renderInv(), showTip: (el, h) => showTip(el, h), hideTip: () => hideTip() };
export function refreshGear() { renderInv(); renderSmith(); }
function bind() {
  $('invClose').onclick = () => closeInv(); $('smClose').onclick = () => closeSmith();
  escLayer('reveal', 90, () => revealing(), () => {});
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'i' && document.activeElement?.tagName !== 'INPUT' && !$('scr_town').classList.contains('hidden')) ui.inv ? closeInv() : openInv(); });
}
