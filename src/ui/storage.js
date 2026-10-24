// 📦 창고 탭 (2026-10-24, docs/STORAGE_2026-10-24.md) — 가방 패널의 [🎒 가방][📦 창고][📖 도감] 중 하나. 로직은 account/storage.js
// 왼쪽 = 가방(장착 중 제외) · 오른쪽 = 창고. 클릭 = 선택(오른쪽 카드에서 옮기기) · Shift+클릭 / 더블클릭 = 바로 옮기기 · 필터에 맞는 것 일괄 보관/꺼내기 · 확장(강철 또는 영혼석)
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { askConfirm } from './confirm.js';
import * as Acc from '../account/account.js';
import * as E from '../account/equip.js';
import * as SG from '../account/storage.js';
import { card, tile } from './itemview.js';
const GN = g => (g === 'all' ? '전체' : g === 'uq' ? '◆ 고유' : E.GRADES[g].n);
export function renderStorage(s, X) { const ui = X.ui, f = ui.stoF, cap = SG.storCap(s), used = SG.storUsed(s), nx = SG.nextCost(s), x = SG.storX(s);
  const bag = SG.sortItems(SG.storable(s).filter(it => SG.matches(it, f)), ui.stoSort), st = SG.sortItems((s.stor || []).filter(it => SG.matches(it, f)), ui.stoSort), eqN = s.inv.length - SG.storable(s).length;
  const all = [...s.inv, ...(s.stor || [])], sel = ui.stoSel && all.find(it => it.id === ui.stoSel), selIn = sel ? ((s.stor || []).includes(sel) ? 'stor' : 'bag') : null, selEq = sel && E.isEquipped(s, sel.id);
  $('invHead').innerHTML = `📦 창고 <b class="${used >= cap ? 'full' : ''}">${used}/${cap}</b> · <span style="color:#ffe08a">계정 공용 보관함</span>`;
  const pct = Math.min(100, Math.round(used / cap * 100));
  $('storBody').innerHTML = `<div class="stoTop"><div class="stoCap"><div class="stoBar"><i style="width:${pct}%"></i></div><span id="stoCapN">📦 ${used}/${cap}칸</span></div>
    ${nx ? `<div class="stoExp"><span>칸 확장 +${SG.STOR.step} <small>(${x}/${SG.STOR.steps}단계 · 최대 ${SG.storMax()}칸)</small></span><button class="gbtn sm stoExpGo" data-pay="steel" ${s.mat.steel >= nx.steel ? '' : 'disabled'}><i class="mi steel"></i>강철 ${nx.steel}</button><button class="gbtn sm stoExpGo" data-pay="souls" ${s.souls >= nx.souls ? '' : 'disabled'}><i class="mi souls"></i>영혼석 ${nx.souls}</button></div>` : `<div class="stoExp"><span class="maxT">✦ 최대 확장 ${SG.storMax()}칸 ✦</span></div>`}</div>
    <div class="stoFilt"><div class="ftabs" id="stoSlot">${[['all', '전체'], ['weapon', '무기'], ['armor', '방어구'], ['acc', '장신구']].map(([k, n]) => `<button class="ftab ${f.slot === k ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div>
      <div class="ftabs" id="stoGrade">${SG.GRADE_F.map(g => `<button class="ftab ${String(f.grade) === String(g) ? 'on' : ''}" data-v="${g}" ${typeof g === 'number' ? `style="color:${E.GRADES[g].c}"` : ''}>${GN(g)}</button>`).join('')}</div>
      <select id="stoSort" class="stoSort" title="정렬">${Object.entries(SG.SORTS).map(([k, n]) => `<option value="${k}" ${ui.stoSort === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="stoCols"><div class="stoCol"><div class="stoH"><span>🎒 가방 <b class="${s.inv.length >= E.CAP ? 'full' : ''}">${s.inv.length}/${E.CAP}</b>${eqN ? ` <small>(장착 ${eqN}개 제외)</small>` : ''}</span><button class="gbtn sm" id="stoAllIn" ${bag.length && used < cap ? '' : 'disabled'}>일괄 보관 ▶</button></div>
        <div class="smGrid stoGrid" id="stoBag">${bag.map(it => tile(it, s, it.id === ui.stoSel ? 'sel' : '')).join('') || '<div class="emptyMsg">보관할 장비가 없어요</div>'}</div></div>
      <div class="stoCol"><div class="stoH"><span>📦 창고 <b class="${used >= cap ? 'full' : ''}">${used}/${cap}</b></span><button class="gbtn sm" id="stoAllOut" ${st.length ? '' : 'disabled'}>◀ 일괄 꺼내기</button></div>
        <div class="smGrid stoGrid" id="stoStor">${st.map(it => tile(it, s, it.id === ui.stoSel ? 'sel' : '')).join('') || `<div class="emptyMsg">${used ? '이 필터에 맞는 장비가 없어요' : '창고가 비어 있어요. 가방 장비를 Shift+클릭하거나 일괄 보관으로 넣어 보세요'}</div>`}</div></div>
      <div class="stoSide" id="stoDetail">${sel ? card(sel) + `<div class="acts">${selIn === 'bag' ? (selEq ? '<div class="warn">장착 중인 장비는 보관할 수 없어요</div>' : `<button class="gbtn main" id="stoMove">▶ 창고에 보관</button>`) : `<button class="gbtn main" id="stoMove">◀ 가방으로 꺼내기</button>`}</div>` : '<div class="hintS">장비를 눌러 자세히 보기<br>Shift+클릭 · 더블클릭 = 바로 옮기기<br>일괄 버튼 = 지금 필터에 맞는 장비 전부</div>'}</div></div>
    <div class="stoMsg" id="stoMsg">${ui.stoMsg || ''}</div>
    <div class="hintS">창고는 계정 공용이에요 (로그인하면 모든 기기에서 같은 창고) · 창고 장비는 장착·강화·분해할 수 없어요 — 꺼내서 쓰세요 · 고유 장비도 보관할 수 있어요 (계정당 1개 그대로)</div>`;
  const B = $('storBody'), rer = () => X.renderInv(), msg = t => { ui.stoMsg = t; };
  const move = ids => { const ins = ids.filter(id => s.inv.some(it => it.id === id)), outs = ids.filter(id => (s.stor || []).some(it => it.id === id)); let a = null, b = null;
    Acc.update(d => { if (ins.length) a = SG.store(d, ins)[1]; if (outs.length) b = SG.take(d, outs)[1]; return d; });
    const n = (a ? a.moved : 0) + (b ? b.moved : 0), parts = [];
    if (a && a.moved) parts.push(`${a.moved}개 보관`); if (b && b.moved) parts.push(`${b.moved}개 꺼냄`);
    if (a && a.full) parts.push(`창고가 가득 차서 ${a.full}개는 못 넣었어요 — 칸을 확장하세요`); if (a && a.eq) parts.push(`장착 중 ${a.eq}개 제외`); if (b && b.full) parts.push(`가방이 가득 차서 ${b.full}개는 못 꺼냈어요`);
    msg(parts.length ? (n ? `<span class="gotPop">${parts.join(' · ')}</span>` : parts.join(' · ')) : ''); Snd.play(n ? 'place' : 'error');
    if (n && ui.stoSel && ids.includes(ui.stoSel)) ui.stoSel = null; X.hooks().onChange(true); rer(); };
  B.querySelectorAll('.stoGrid .itile[data-id]').forEach(b => { const id = b.dataset.id;
    b.onclick = e => { if (e.shiftKey) { X.hideTip(); move([id]); return; } ui.stoSel = id; msg(''); Snd.play('select'); rer(); };
    b.ondblclick = () => { X.hideTip(); move([id]); };
    b.onpointerenter = e => { if (e.pointerType !== 'mouse') return; const it = [...Acc.load().inv, ...(Acc.load().stor || [])].find(x => x.id === id); if (it) X.showTip(b, card(it)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') X.hideTip(); }; });
  B.querySelectorAll('#stoSlot .ftab').forEach(b => b.onclick = () => { f.slot = b.dataset.v; Snd.play('ui'); rer(); });
  B.querySelectorAll('#stoGrade .ftab').forEach(b => b.onclick = () => { const v = b.dataset.v; f.grade = v === 'all' || v === 'uq' ? v : +v; Snd.play('ui'); rer(); });
  $('stoSort').onchange = e => { ui.stoSort = e.target.value; Snd.play('ui'); rer(); };
  if ($('stoMove')) $('stoMove').onclick = () => move([sel.id]);
  $('stoAllIn').onclick = () => { if (!bag.length) return; move(bag.map(it => it.id)); };
  $('stoAllOut').onclick = () => { if (!st.length) return; move(st.map(it => it.id)); };
  B.querySelectorAll('.stoExpGo').forEach(b => b.onclick = async () => { const pay = b.dataset.pay, c = SG.nextCost(Acc.load()); if (!c) return;
    if (!(await askConfirm({ title: '창고 확장', icon: '📦', body: `${pay === 'steel' ? `강철 ${c.steel}` : `영혼석 ${c.souls}`}을(를) 써서 창고를 ${SG.storCap(Acc.load())} → ${SG.storCap(Acc.load()) + SG.STOR.step}칸으로 늘릴까요?`, ok: '확장' }))) return;
    let r; Acc.update(d => { const o = SG.expand(d, pay); r = o[1]; return o[0]; });
    if (r === 'ok') { Snd.play('upgrade'); Snd.play('coins', { delay: .1 }); msg(`<span class="gotPop">창고가 ${SG.storCap(Acc.load())}칸으로 늘었어요!</span>`); X.hooks().cheer(); } else { Snd.play('error'); msg(r === 'poor' ? (pay === 'steel' ? '강철이 부족해요' : '영혼석이 부족해요') : '더 확장할 수 없어요'); }
    X.hooks().onChange(true); rer(); });
}
