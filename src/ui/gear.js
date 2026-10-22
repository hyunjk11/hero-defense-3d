// ================= 장비 UI: 가방(장착/비교) · 대장간(강화/분해/제작) · 보상 상자 개봉 =================
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import { CLASSES, HERO_KEYS, heroLabel } from '../data/heroes.js';
import * as Acc from '../account/account.js';
import * as E from '../account/equip.js';
import { closeLab } from './lab.js';
import * as P from '../account/progress.js';
import * as ST from '../data/stages.js';
import { DGS, dgStatus } from '../account/dungeon.js';
import { UQ, UQ_COLOR, UQ_DUP, UQ_DG, AWAKE_MAX, CHSET, CH_KEYS, UQ_PITY, CODEX_RW, awakeMul, awakeCd, chOdds } from '../data/items.js';

const ICON = { ...Object.fromEntries(HERO_KEYS.map(k => [k, CLASSES[k].icon])), armor: '🛡️', acc: '💍' }; // 영웅 무기 아이콘은 data/heroes.js 의 icon (빠진 영웅이 없도록 한 곳에서)
const FALLBACK = { weapon: '⚔️', any: '📦' }; // 모르는 영웅/슬롯 키 → 'undefined' 대신 일반 아이콘
export const iconKey = k => ICON[k] || FALLBACK.any;
export const weaponIcon = h => ICON[h] || FALLBACK.weapon;
export const icon = it => !it ? FALLBACK.any : it.uq && UQ[it.uq] && UQ[it.uq].ic ? UQ[it.uq].ic : it.s === 'weapon' ? weaponIcon(it.h) : iconKey(it.s); // 고유 방어구/장신구 = 전용 이모지
// 챕터 세트 배지 / 고유 표시 (타일·카드 공용)
const setOf = it => (it && !it.uq && CHSET[it.c]) || null;
const GCi = it => (it && it.uq ? UQ_COLOR : GC(it.g));
const awStars = a => '★'.repeat(a || 0) + '☆'.repeat(AWAKE_MAX - (a || 0));
const TR_N = { onSkill: '자동 · Q 사용 시', every: '자동 · 주기', lowHp: '자동 · 체력 위기', onHit: '자동 · 피격 시', shield: '자동 · 무피격 대기', onDeath: '자동 · 쓰러질 때', wave: '자동 · 웨이브 누적', onKill: '자동 · 처치 누적' };
export function uqSrcText(k) { const U = UQ[k], s = U.src; if (s.boss) return `${ST.stageNo(s.boss)} ${ST.STAGES[s.boss].n} 첫 처치`; if (s.stars) { const C = ST.CHAPTERS.find(c => c.id === s.stars); return `${C.short} 별 만점 (★${C.stages.length * 3})`; }
  if (s.drop) return `${ST.CHAPTERS.find(c => c.id === s.drop).short} 스테이지 보스 처치 1.5% (천장 ${UQ_PITY}회)`;
  if (s.dungeon) return `던전 원정 모르비아 처치 ${Math.round(UQ_DG.drop * 100)}% (천장 ${UQ_DG.pity}회) · 던전 상점 🏅${UQ_DG.price}`; return `도전 모드 최고 ${s.wave}웨이브`; }
const clsN = h => (CLASSES[h] || {}).n || '알 수 없는 영웅';
const pct = (k, v) => `${E.STAT[k]} +${v}%`;
const GC = g => E.GRADES[g].c;
let ui = { inv: false, smith: false, invSel: null, invF: 'all', invTab: 'bag', cxTab: 1, smTab: 'enh', smSel: null, awSel: null, dis: new Set(), crSlot: 'weapon', crSet: 0, busy: false };
let hooks = { onChange: () => {}, cheer: () => {} };
export function initGear(h) { hooks = { ...hooks, ...h }; bind(); }
const S = () => Acc.load(), hero = () => S().hero;
const eqOf = (s, id) => { for (const h in s.eq) for (const sl in s.eq[h]) if (s.eq[h][sl] === id) return h; return null; };
function sorted(list, s) { return [...list].sort((a, b) => (!!eqOf(s, b.id) - !!eqOf(s, a.id)) || b.g - a.g || b.e - a.e || E.power(b) - E.power(a)); }
function tile(it, s, extra = '') { const h = eqOf(s, it.id), C = setOf(it); return `<button class="itile g${it.g}${it.uq ? ' uq' : ''}${C ? ' cset' : ''} ${extra}" data-id="${esc(it.id)}" style="--gc:${GCi(it)}${C ? `;--cc:${C.color}` : ''}"><span class="ic">${icon(it)}</span>${it.e ? `<span class="en">+${it.e}</span>` : ''}${h ? `<span class="eqb">${clsN(h)[0]}</span>` : ''}${it.uq ? `<span class="uqb">◆</span>${it.a ? `<span class="awb">★${it.a}</span>` : ''}` : E.legendKey(it) ? '<span class="lst">✦</span>' : ''}${C ? `<span class="chb">${C.badge}</span>` : ''}</button>`; }
export function lskHtml(it) { const k = E.legendKey(it); if (!k) return ''; const L = E.LSK[k]; return `<div class="lsk"><div class="lskH">✦ ${L.n} <i>${L.type === 'proc' ? '공격 시 발동' : '액티브 · E키'}</i></div><div class="lskD">${L.d}</div></div>`; }
// 고유 카드: 청록→금 테두리 · UNIQUE 리본 · 고정 옵션 · 고유 궁극기 · 각성 · 획득 조건
function uqCard(it, lines) { const U = UQ[it.uq], a = it.a || 0, L = U.sk ? E.LSK[U.sk] : null;
  return `<div class="icard uq g4" style="--gc:${UQ_COLOR}"><div class="uqRib">UNIQUE · 고유</div><div class="ih"><span class="ic">${icon(it)}${U.s === 'weapon' ? '<i class="uqw">✦</i>' : ''}</span><div><div class="in uqn">${esc(it.n)}${it.e ? ` <span class="en">+${it.e}</span>` : ''}</div><div class="ig">고유 · ${E.SLOTS[it.s]}${it.h ? ' · ' + clsN(it.h) + ' 전용' : ''}</div></div></div>
    <div class="uqLock">🔒 고정 옵션</div>${lines}<div class="lsk uqk"><div class="lskH">✦✦ 고유 궁극기 — ${U.un} <i>${L ? '[E] 액티브' : TR_N[U.tr] || '자동'}</i></div><div class="lskD">${esc(U.d)}</div>
    <div class="uqA3 ${a >= 3 ? 'on' : ''}">★3 각성: ${esc(U.a3)}</div></div><div class="uqAw">각성 <b>${awStars(a)}</b>${a ? ` <small>위력 +${Math.round((awakeMul(a) - 1) * 100)}% · 쿨 -${Math.round((1 - awakeCd(a)) * 100)}%</small>` : ''}</div>
    <div class="uqFoot">계정에 하나뿐 · 분해 불가 · 획득: ${esc(uqSrcText(it.uq))}</div></div>`; }
export function card(it, cmp) {
  if (!it) return '<div class="icard empty">빈 칸</div>'; const st = E.itemStats(it), cs = cmp ? E.itemStats(cmp) : null, keys = new Set([...Object.keys(st), ...(cs ? Object.keys(cs) : [])]);
  const lines = [...keys].map(k => { const v = st[k] || 0, d = cs ? Math.round((v - (cs[k] || 0)) * 10) / 10 : 0; return `<div class="sl ${k === it.m[0] ? 'main' : ''}">${E.STAT[k]} <b>+${v}%</b>${cs && d ? `<i class="${d > 0 ? 'gup' : 'gdn'}">${d > 0 ? '▲' : '▼'}${Math.abs(d)}</i>` : ''}</div>`; }).join('');
  if (it.uq && UQ[it.uq]) return uqCard(it, lines + (cmp ? '' : ''));
  const C = setOf(it);
  return `<div class="icard g${it.g}${C ? ' cset' : ''}" style="--gc:${GC(it.g)}${C ? `;--cc:${C.color}` : ''}"><div class="ih"><span class="ic">${icon(it)}${C ? `<i class="chb">${C.badge}</i>` : ''}</span><div><div class="in">${esc(it.n)}${it.e ? ` <span class="en">+${it.e}</span>` : ''}</div><div class="ig">${E.GRADES[it.g].n} · ${E.SLOTS[it.s]}${it.h ? ' · ' + clsN(it.h) + ' 전용' : ''}</div>${C ? `<div class="iset">${C.badge} ${C.n} 세트 · ${ST.CHAPTERS.find(c => c.id === it.c).n.split(' · ')[0]}</div>` : ''}</div></div>${lines}${lskHtml(it)}${cmp ? `<div class="cmpn">장착 중인 장비와 비교</div>` : ''}</div>`;
}
export function bonusHtml(b) { const e = Object.entries(b); return e.length ? e.map(([k, v]) => `<span>${pct(k, v)}</span>`).join('') : '<span class="none">장착한 장비 없음</span>'; }
export function heroDots(s, h) { return E.SLOT_KEYS.map(sl => { const it = s.inv.find(x => x.id === (s.eq[h] || {})[sl]); return `<i class="dot" style="background:${it ? GCi(it) : '#3a3450'}" title="${E.SLOTS[sl]}"></i>`; }).join(''); }

// ---------- 가방 ----------
export function openInv() { closeLab(true); ui.inv = true; $('invPanel').classList.remove('hidden'); Snd.play('ui'); closeSmith(true); renderInv(); }
export function closeInv() { if (ui.inv) Snd.play('ui'); ui.inv = false; $('invPanel').classList.add('hidden'); hideTip(); }
function renderInv() {
  if (!ui.inv) return; const s = S(), h = s.hero, eq = s.eq[h] || {};
  $('invTabs').innerHTML = [['bag', '🎒 가방'], ['codex', '📖 도감']].map(([k, n]) => `<button class="ftab ${ui.invTab === k ? 'on' : ''}" data-v="${k}">${n}${k === 'codex' && codexClaimable(s) ? ' <i class="newDot"></i>' : ''}</button>`).join('');
  document.querySelectorAll('#invTabs .ftab').forEach(b => b.onclick = () => { ui.invTab = b.dataset.v; Snd.play('ui'); hideTip(); renderInv(); });
  const cx = ui.invTab === 'codex'; for (const id of ['invTopW', 'invFilt', 'invMidW', 'invMsg']) $(id).classList.toggle('hidden', cx); $('codexBody').classList.toggle('hidden', !cx); if (cx) { $('invHead').innerHTML = `📖 장비 도감 · <span style="color:#ffe08a">${heroLabel(h)}</span>`; renderCodex(s); return; }
  const list = sorted(s.inv.filter(x => ui.invF === 'all' || x.s === ui.invF), s);
  const sel = s.inv.find(x => x.id === ui.invSel), cur = sel ? s.inv.find(x => x.id === eq[sel.s]) : null;
  $('invHead').innerHTML = `🎒 가방 <b class="${s.inv.length >= E.CAP ? 'full' : ''}">${s.inv.length}/${E.CAP}</b> · <span style="color:#ffe08a">${heroLabel(h)}</span>`;
  $('invSlots').innerHTML = E.SLOT_KEYS.map(sl => { const it = s.inv.find(x => x.id === eq[sl]); return `<div class="slot" data-sl="${sl}"><div class="slh">${E.SLOTS[sl]}</div>${it ? tile(it, s) : `<div class="itile emptyT"><span class="ic">${sl === 'weapon' ? weaponIcon(h) : iconKey(sl)}</span></div>`}</div>`; }).join('');
  $('invBonus').innerHTML = bonusHtml(E.bonus(s, h));
  $('invFilt').innerHTML = [['all', '전체'], ['weapon', '무기'], ['armor', '방어구'], ['acc', '장신구']].map(([k, n]) => `<button class="ftab ${ui.invF === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
  $('invGrid').innerHTML = list.length ? list.map(it => tile(it, s, it.id === ui.invSel ? 'sel' : '')).join('') : '<div class="emptyMsg">장비가 없어요. 출정해서 5웨이브마다 보상 상자를, 보스에게서 장비를 얻거나 대장간에서 제작하세요!</div>';
  const full = s.inv.length >= E.CAP; $('invMsg').innerHTML = full ? '⚠ 가방이 가득 찼어요! 보상 상자를 열 수 없어요 — 대장간에서 분해해 공간을 만드세요.' : s.inv.length >= E.CAP - 5 ? `가방이 거의 찼어요 (${E.CAP - s.inv.length}칸 남음)` : '';
  let act = '';
  if (sel) { const who = eqOf(s, sel.id); act = !E.canEquip(sel, h) ? `<div class="warn">${clsN(sel.h)} 전용 무기예요</div>` : who === h ? `<button class="gbtn" id="invUneq">해제</button>` : `<button class="gbtn main" id="invEq">장착${who ? ` (${clsN(who)}에게서 가져오기)` : ''}</button>`; }
  $('invDetail').innerHTML = sel ? card(sel, cur && cur.id !== sel.id ? cur : null) + `<div class="acts">${act}</div>` : '<div class="hintS">장비를 눌러 자세히 보기 · 마우스를 올리면 비교</div>';
  document.querySelectorAll('#invPanel .itile[data-id]').forEach(b => { b.onclick = () => { ui.invSel = b.dataset.id; Snd.play('select'); renderInv(); };
    b.onpointerenter = e => { if (e.pointerType !== 'mouse') return; const it = S().inv.find(x => x.id === b.dataset.id); if (!it) return; const c = S().inv.find(x => x.id === (S().eq[h] || {})[it.s]); showTip(b, card(it, c && c.id !== it.id ? c : null)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); }; });
  document.querySelectorAll('#invFilt .ftab').forEach(b => b.onclick = () => { ui.invF = b.dataset.f; Snd.play('ui'); renderInv(); });
  if ($('invEq')) $('invEq').onclick = () => { Acc.update(d => E.equip(d, h, sel.id)[0]); Snd.play('upgrade'); hooks.cheer(); hooks.onChange(); };
  if ($('invUneq')) $('invUneq').onclick = () => { Acc.update(d => E.unequip(d, h, sel.s)); Snd.play('ui'); hooks.onChange(); };
}
export function showTip(el, html) { const t = $('itemTip'); t.innerHTML = html; t.classList.remove('hidden'); const r = el.getBoundingClientRect(); let x = r.right + 8, y = r.top; if (x + 230 > innerWidth) x = r.left - 238; t.style.left = x + 'px'; t.style.top = Math.min(y, innerHeight - t.offsetHeight - 8) + 'px'; }
export function hideTip() { $('itemTip').classList.add('hidden'); }

// ---------- 대장간 ----------
export function openSmith() { closeLab(true); if (!ui.smith) { Snd.play('hitArmor'); Snd.play('confirm'); } ui.smith = true; $('smithPanel').classList.remove('hidden'); closeInv(); renderSmith(); }
export function closeSmith(silent) { if (ui.smith && !silent) Snd.play('ui'); ui.smith = false; $('smithPanel').classList.add('hidden'); hideTip(); }
const costHtml = (c, s) => [['souls', '영혼석', s.souls], ['steel', '강철', s.mat.steel], ['crystal', '마력석', s.mat.crystal]].filter(([k]) => c[k]).map(([k, n, have]) => `<span class="cost ${have >= c[k] ? '' : 'lack'}"><i class="mi ${k}"></i>${n} ${c[k]}<small>/${have}</small></span>`).join('');
function renderSmith() {
  if (!ui.smith) return; const s = S();
  $('smMats').innerHTML = `<span><i class="mi souls"></i>${s.souls}</span><span><i class="mi steel"></i>강철 ${s.mat.steel}</span><span><i class="mi crystal"></i>마력석 ${s.mat.crystal}</span><span class="essM" title="고유 정수 — 고유 장비 각성 재료 (고유 중복 획득·도감 보상·도전 모드 보스)"><i class="mi essence"></i>고유 정수 ${s.mat.essence || 0}</span>`;
  document.querySelectorAll('#smTabs .ftab').forEach(b => { b.classList.toggle('on', b.dataset.t === ui.smTab); b.onclick = () => { if (ui.busy) return; ui.smTab = b.dataset.t; Snd.play('ui'); hideTip(); renderSmith(); }; });
  const body = $('smBody');
  if (ui.smTab === 'enh') {
    const list = sorted(s.inv, s); if (!list.some(x => x.id === ui.smSel)) ui.smSel = list[0]?.id || null; const it = s.inv.find(x => x.id === ui.smSel);
    let right = '<div class="hintS">강화할 장비가 없어요</div>';
    if (it) { const c = E.enhCost(it), max = it.e >= E.MAXE, nx = { ...it, e: it.e + 1 };
      right = `<div class="anvil" id="anvil"><div class="bigTile g${it.g}${it.uq ? ' uq' : ''}" style="--gc:${GCi(it)}"><span class="ic">${icon(it)}</span><span class="en">+${it.e}</span></div><div class="hammer" id="hammer">🔨</div><div class="sparks" id="sparks"></div><div class="enhRes ${ui.res && ui.res.id === it.id ? ui.res.c : ''}" id="enhRes">${ui.res && ui.res.id === it.id ? ui.res.t : ''}</div></div>
        <div class="enhInfo"><div class="in" style="color:${GC(it.g)}">${esc(it.n)}</div>${lskHtml(it)}${max ? '<div class="maxT">✦ 최대 강화 +10 ✦</div>' : `<div class="lv">+${it.e} <b>→</b> <span>+${it.e + 1}</span></div>
        <div class="sl">${E.STAT[it.m[0]]} ${E.mainVal(it)}% <b>→</b> <span class="gup">${E.mainVal(nx)}%</span></div><div class="rate">성공 확률 <b style="color:${E.ENH_RATE[it.e] >= 70 ? '#8aff9a' : E.ENH_RATE[it.e] >= 40 ? '#ffe066' : '#ff9a7a'}">${E.ENH_RATE[it.e]}%</b> <small>(실패해도 장비는 사라지지 않아요)</small></div>
        <div class="costs">${costHtml(c, s)}</div><button class="gbtn main" id="enhGo" ${ui.busy ? 'disabled' : ''}>🔨 강화하기</button>`}</div>`; }
    body.innerHTML = `<div class="smCols"><div class="smList">${list.map(x => tile(x, s, x.id === ui.smSel ? 'sel' : '')).join('') || '<div class="emptyMsg">장비 없음</div>'}</div><div class="smMain">${right}</div></div>`;
    body.querySelectorAll('.smList .itile').forEach(b => { b.onclick = () => { if (ui.busy) return; ui.res = null; ui.smSel = b.dataset.id; Snd.play('select'); renderSmith(); }; tipBind(b); });
    if ($('enhGo')) $('enhGo').onclick = () => doEnhance(it.id);
  } else if (ui.smTab === 'dis') {
    const list = sorted(s.inv.filter(x => !eqOf(s, x.id) && !x.uq), s); for (const id of [...ui.dis]) if (!list.some(x => x.id === id)) ui.dis.delete(id); // 고유는 분해 불가 (목록에서 제외)
    const y = { steel: 0, crystal: 0 }; for (const id of ui.dis) { const r = E.dismantleYield(s.inv.find(x => x.id === id)); y.steel += r.steel; y.crystal += r.crystal; }
    body.innerHTML = `<div class="disBulk">${E.GRADES.map((g, i) => `<button class="ftab gb" data-g="${i}" style="--gc:${g.c}">${g.n} 전체</button>`).join('')}<button class="ftab" data-g="x">선택 해제</button></div>
      <div class="smGrid" id="disGrid">${list.map(x => tile(x, s, ui.dis.has(x.id) ? 'pick' : '')).join('') || '<div class="emptyMsg">분해할 수 있는 장비가 없어요 (장착 중인 장비는 분해되지 않아요)</div>'}</div>
      <div class="disFoot"><div>획득 예정: <b><i class="mi steel"></i>강철 ${y.steel}</b> · <b><i class="mi crystal"></i>마력석 ${y.crystal}</b></div><button class="gbtn main" id="disGo" ${ui.dis.size ? '' : 'disabled'}>⚒ 분해하기 (${ui.dis.size}개)</button></div>
      <div class="hintS">분해: 일반 강철2 · 고급 4 · 희귀 8+마력석1 · 영웅 12+3 · 전설 20+8 (강화 수치당 강철 +2)${s.inv.some(x => x.uq) ? ' · ◆ 고유 장비는 분해할 수 없어요' : ''}</div>`;
    body.querySelectorAll('#disGrid .itile').forEach(b => { b.onclick = () => { const id = b.dataset.id; ui.dis.has(id) ? ui.dis.delete(id) : ui.dis.add(id); Snd.play('select'); renderSmith(); }; tipBind(b); });
    body.querySelectorAll('.disBulk .ftab').forEach(b => b.onclick = () => { Snd.play('ui'); if (b.dataset.g === 'x') ui.dis.clear(); else list.filter(x => x.g === +b.dataset.g).forEach(x => ui.dis.add(x.id)); renderSmith(); });
    $('disGo').onclick = () => doDismantle();
  } else if (ui.smTab === 'awk') { // 각성: 고유 정수로 고유 궁극기 강화 (항상 성공)
    const list = sorted(s.inv.filter(x => x.uq), s); if (!list.some(x => x.id === ui.awSel)) ui.awSel = list[0]?.id || null; const it = s.inv.find(x => x.id === ui.awSel);
    let right = '<div class="hintS">고유 장비가 없어요. 챕터 보스 첫 처치·별 만점·도전 모드 기록으로 얻을 수 있어요!</div>';
    if (it) { const max = (it.a || 0) >= AWAKE_MAX, c = E.awakeCost(it);
      right = `${card(it)}${max ? '<div class="maxT">✦ 최대 각성 ★5 ✦</div>' : `<div class="lv">각성 ★${it.a || 0} <b>→</b> <span>★${(it.a || 0) + 1}</span> <small>(위력 +8% · 쿨 -4%${(it.a || 0) === 2 ? ' · ★3 효과 해금' : ''})</small></div>
        <div class="costs"><span class="cost ${(s.mat.essence || 0) >= c.essence ? '' : 'lack'}"><i class="mi essence"></i>고유 정수 ${c.essence}<small>/${s.mat.essence || 0}</small></span>${costHtml({ souls: c.souls }, s)}</div><button class="gbtn main" id="awkGo">✦ 각성하기</button>`}`; }
    body.innerHTML = `<div class="smCols"><div class="smList">${list.map(x => tile(x, s, x.id === ui.awSel ? 'sel' : '')).join('') || '<div class="emptyMsg">고유 장비 없음</div>'}</div><div class="smMain awkMain">${right}<div class="hintS">고유 정수: 이미 가진 고유를 또 얻으면 ×${UQ_DUP.essence} · 도감 챕터 완성 ×10 · 도전 모드 20웨이브 이후 보스</div></div></div>`;
    body.querySelectorAll('.smList .itile').forEach(b => { b.onclick = () => { ui.awSel = b.dataset.id; Snd.play('select'); renderSmith(); }; tipBind(b); });
    if ($('awkGo')) $('awkGo').onclick = () => { let r; Acc.update(d => { const o = E.awaken(d, it.id); r = o[1]; return o[0]; }); if (r === 'ok') { Snd.play('upgrade'); Snd.play('levelUp', { force: true }); hooks.cheer(); } else Snd.play('error'); G_lastAwk = r; renderSmith(); hooks.onChange(true); };
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
let G_last = null, G_lastAwk = null; export const lastEnh = () => G_last; export const lastAwk = () => G_lastAwk;
// 세트 제작이 열린 챕터 = 그 챕터 보스(마지막 스테이지)를 클리어한 챕터
const clearedSets = s => CH_KEYS.filter(c => { const C = ST.CHAPTERS.find(x => x.id === c); return C && ST.stars(s, C.stages[C.stages.length - 1].id) > 0; });
function flashMsg(t, c) { const el = $('enhRes'); if (el) { el.className = 'enhRes fail'; el.style.color = c; el.textContent = t; } }
function doDismantle() {
  const s = S(), ids = [...ui.dis], hi = ids.map(id => s.inv.find(x => x.id === id)).filter(x => x && x.g >= 3);
  if (hi.length && !confirm(`영웅/전설 등급 장비 ${hi.length}개가 포함되어 있어요. 정말 분해할까요?`)) return;
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
export const chestCount = () => (S().chests || []).length;
export function openChestUI(done) { if (!chestCount()) { done && done(); return; } CB = { done: done || null, lock: false, busy: false }; RQ = []; RDone = null; closeInv(); closeSmith(true); $('chestOv').classList.remove('hidden'); nextChest(); }
function closeChestUI() { const ov = $('chestOv'); ov.classList.add('hidden'); ov.innerHTML = ''; hideTip(); hooks.onChange(true); const d = CB.done; CB.done = null; d && d(); }
// 개봉 (n개, ids 지정 가능) — 저장은 한 번만
function doOpen(n, ids) { let r; Acc.update(d => { const o = E.openChests(d, n, ids); r = o[1]; return o[0]; }); hooks.onChange(true); return r; }
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
  const ov = $('chestOv'), L = S().chests || []; if (!L.length) { closeChestUI(); return; }
  const x = L[0], uqx = !!x.it.uq, full = S().inv.length >= E.CAP && !uqx, boss = x.src === 'boss' || uqx; // 고유 상자는 가방이 가득 차도 열림
  ov.innerHTML = `<div class="cvStage chestMode g${x.it.g}${uqx ? ' uqStage' : ''}" style="--gc:${uqx ? UQ_COLOR : GC(x.it.g)}"><div class="cvSrc">${SRC_N[x.src] || SRC_N.chest}</div><div class="rays"></div><div class="cglow"></div>
    <div class="chest ${boss ? 'boss' : ''}"><div class="lid"></div><div class="body"><div class="lock"></div></div></div>
    <div class="cvItem"></div><div class="cvTap">${full ? '가방이 가득 찼어요' : '눌러서 열기'}</div></div>${chestBar(L.length)}${full || note ? `<div class="cbNote">${note || fullMsg(L.length)}</div>` : ''}`;
  bindBar(); const st = ov.querySelector('.cvStage'); let phase = 0; Snd.play('place');
  const open = () => { if (phase || CB.lock) return; if (S().inv.length >= E.CAP && !uqx) { Snd.play('error'); st.classList.add('shake'); setTimeout(() => st.classList.remove('shake'), 720); showNote(fullMsg(chestCount())); return; }
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
    b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, card(x.it)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); }; });
  $('cbOk').onclick = () => { Snd.play('ui'); closeChestUI(); };
  if ($('cbMore')) $('cbMore').onclick = () => { Snd.play('ui'); CB.lock = false; nextChest(); };
  if ($('cbSmith')) $('cbSmith').onclick = () => { Snd.play('ui'); const d = CB.done; CB.done = null; closeChestUI(); d && d(); ui.smTab = 'dis'; openSmith(); };
  CB.lock = false;
}
// ---------- 도감 (가방 패널의 '도감' 탭) ----------
const cxRowIcon = row => (row === 'armor' || row === 'acc' ? iconKey(row) : weaponIcon(row));
const cxRowN = row => (row === 'armor' ? '방어구' : row === 'acc' ? '장신구' : `${(CLASSES[row] || {}).nm || clsN(row)} 무기`);
const cxSlot = row => (row === 'armor' || row === 'acc' ? row : 'weapon');
const rwTxt = rw => [rw.crystal ? `마력석 ${rw.crystal}` : '', rw.essence ? `고유 정수 ${rw.essence}` : '', rw.souls ? `영혼석 ${rw.souls}` : ''].filter(Boolean).join(' · ');
export function codexClaimable(s) { return CH_KEYS.some(ch => { const C = P.codexState(s, ch); return C.rows.some(r => r.done && !r.got) || (C.all.done && !C.all.got); }); }
// 견본(표시용, 저장 안 함): 고정 시드
const sampleR = () => { let q = 12345; return () => (q = (q * 16807) % 2147483647) / 2147483647; };
export const sampleItem = (ch, row, g) => E.makeItem(cxSlot(row), cxSlot(row) === 'weapon' ? row : P.codexRows()[0], g, sampleR(), ch);
let lastClaim = null; export const lastCodexClaim = () => lastClaim;
function renderCodex(s) {
  const tabs = [...CH_KEYS.map(c => [c, `${CHSET[c].badge} ${CHSET[c].n}`, (C => `${C.seen}/${C.total}`)(P.codexState(s, c))]), [0, '◆ 고유', `${Object.keys(UQ).filter(k => E.ownsUnique(s, k)).length}/${Object.keys(UQ).length}`]];
  let h = `<div class="cxTabs">${tabs.map(([c, n, sm]) => `<button class="ftab ${ui.cxTab === c ? 'on' : ''}" data-c="${c}" style="--cc:${c ? CHSET[c].color : UQ_COLOR}">${n} <small>${sm}</small></button>`).join('')}</div>`;
  if (ui.cxTab) { const ch = ui.cxTab, C = P.codexState(s, ch), SC = ST.CHAPTERS.find(c => c.id === ch), un = ST.chapterUnlocked(s, ch);
    h += `<div class="cxGrid" style="--cc:${CHSET[ch].color}"><div class="cxHd"></div>${E.GRADES.map(g => `<div class="cxHd" style="color:${g.c}">${g.n}</div>`).join('')}<div class="cxHd">보상</div>`
      + C.rows.map(r => `<div class="cxRow">${cxRowIcon(r.row)}<small>${cxRowN(r.row)}</small></div>` + [0, 1, 2, 3, 4].map(g => { const seen = r.bits & (1 << g), na = !(C.mask & (1 << g)); /* na: 이 챕터에서 나오지 않는 등급 (완성 조건 아님) — 예전 저장·관리자 우편으로 등록돼 있으면 보여 주되 extra */ return `<button class="cxC ${seen ? 'seen' : ''}${na ? ' na' : ''}" data-ch="${ch}" data-row="${r.row}" data-g="${g}" style="--gc:${GC(g)}">${seen ? `<span>${cxRowIcon(r.row)}</span>` : na ? '—' : '?'}</button>`; }).join('')
        + `<div class="cxRw">${r.got ? '✓' : r.done ? `<button class="gbtn sm main cxGet" data-k="${r.key}">받기</button>` : `${r.n}/${r.max}`}</div>`).join('') + '</div>'
      + `<div class="cxFoot"><span>${SC.n} · 본 장비 <b>${C.seen}/${C.total}</b>${un ? '' : ' · 🔒 아직 열리지 않은 챕터'}</span><span class="cxAllRw">행 완성 ${rwTxt(CODEX_RW.row)} · 전부 완성 ${rwTxt(CODEX_RW.all)}</span>${C.all.got ? '<b class="cxDone">✓ 완성 보상 받음</b>' : C.all.done ? `<button class="gbtn main cxGet" data-k="${C.all.key}">🏆 완성 보상 받기</button>` : ''}</div>`;
  } else {
    if (DGS.st === 'idle' && Acc.A.user) dgStatus().then(() => { if (ui.inv && ui.cxTab === 0 && DGS.st === 'ok') renderInv(); }).catch(() => {}); // 던전 고유 천장·메달 (서버 값)
    h += `<div class="uqGrid">${Object.keys(UQ).map(k => { const U = UQ[k], have = E.ownsUnique(s, k), it = s.inv.find(x => x.uq === k), src = U.src;
      const prog = have ? `<b class="uqSt">${awStars(it ? it.a : 0)}</b>` : src.boss ? (ST.stars(s, src.boss) ? '✓' : '미처치') : src.stars ? `★ ${ST.chapterStars(s, src.stars)}/${P.chapterMax(src.stars)}` : src.drop ? `천장 ${(s.uqPity || {})[k] || 0}/${UQ_PITY}` : src.dungeon ? (DGS.st === 'ok' ? `천장 ${DGS.uqPity}/${UQ_DG.pity} · 🏅 ${DGS.medals}/${UQ_DG.price}` : '던전 원정 (로그인)') : `최고 ${s.bestWave}/${src.wave}웨이브`;
      return `<button class="uqCell ${have ? 'have' : ''}" data-k="${k}"><span class="ic">${have ? icon(E.makeUnique(k)) : '?'}</span><span class="un">${have ? esc(U.n) : '???'}</span><small>${esc(uqSrcText(k))}</small><small class="pg">${prog}</small></button>`; }).join('')}</div>`;
  }
  $('codexBody').innerHTML = h;
  document.querySelectorAll('#codexBody .cxTabs .ftab').forEach(b => b.onclick = () => { ui.cxTab = +b.dataset.c; Snd.play('ui'); hideTip(); renderInv(); });
  document.querySelectorAll('#codexBody .cxGet').forEach(b => b.onclick = () => { let rw; Acc.update(d => { const o = P.claimCodex(d, b.dataset.k); rw = o[1]; return o[0]; }); lastClaim = rw; if (rw) { Snd.play('levelUp', { force: true }); Snd.play('coins'); hooks.cheer(); } else Snd.play('error'); hooks.onChange(true); renderInv(); });
  const tipOf = b => { if (b.dataset.k) { const k = b.dataset.k, it = S().inv.find(x => x.uq === k) || E.makeUnique(k); return card(it); } const it = sampleItem(+b.dataset.ch, b.dataset.row, +b.dataset.g), na = b.classList.contains('na'); return (na ? `<div class="cxUnseen">${CHSET[+b.dataset.ch].n} 세트는 ${E.GRADES[+b.dataset.g].n} 등급이 나오지 않아요 · 도감 완성에 필요 없음${b.classList.contains('seen') ? ' (특별 획득)' : ''}</div>` : b.classList.contains('seen') ? '' : '<div class="cxUnseen">아직 얻지 못한 장비 (견본)</div>') + card(it); };
  document.querySelectorAll('#codexBody .cxC, #codexBody .uqCell').forEach(b => { b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, tipOf(b)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); };
    b.onclick = () => { showTip(b, tipOf(b)); clearTimeout(tipT); tipT = setTimeout(hideTip, 3200); Snd.play('select'); }; });
}
export function refreshGear() { renderInv(); renderSmith(); }
function bind() {
  $('invClose').onclick = () => closeInv(); $('smClose').onclick = () => closeSmith();
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (revealing()) return; closeInv(); closeSmith(); } if (e.key.toLowerCase() === 'i' && document.activeElement?.tagName !== 'INPUT' && !$('scr_town').classList.contains('hidden')) ui.inv ? closeInv() : openInv(); });
}
