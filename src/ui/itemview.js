// 아이템 표시 공용 (C-10: ui/gear.js 에서 분리 — 동작 불변): 아이콘·타일·카드·고유 출처·보너스 줄. 가방·대장간·상자·도감이 함께 씀
import { esc } from '../core/util.js';
import { CLASSES, HERO_KEYS } from '../data/heroes.js';
import * as E from '../account/equip.js';
import * as ST from '../data/stages.js';
import { UQ, UQ_COLOR, UQ_DG, AWAKE_MAX, CHSET, UQ_PITY, awakeMul, awakeCd } from '../data/items.js';
export const ICON = { ...Object.fromEntries(HERO_KEYS.map(k => [k, CLASSES[k].icon])), armor: '🛡️', acc: '💍' }; // 영웅 무기 아이콘은 data/heroes.js 의 icon (빠진 영웅이 없도록 한 곳에서)
export const FALLBACK = { weapon: '⚔️', any: '📦' }; // 모르는 영웅/슬롯 키 → 'undefined' 대신 일반 아이콘
export const iconKey = k => ICON[k] || FALLBACK.any;
export const weaponIcon = h => ICON[h] || FALLBACK.weapon;
export const icon = it => !it ? FALLBACK.any : it.uq && UQ[it.uq] && UQ[it.uq].ic ? UQ[it.uq].ic : it.s === 'weapon' ? weaponIcon(it.h) : iconKey(it.s); // 고유 방어구/장신구 = 전용 이모지
// 챕터 세트 배지 / 고유 표시 (타일·카드 공용)
export const setOf = it => (it && !it.uq && CHSET[it.c]) || null;
export const GCi = it => (it && it.uq ? UQ_COLOR : GC(it.g));
export const awStars = a => '★'.repeat(a || 0) + '☆'.repeat(AWAKE_MAX - (a || 0));
export const TR_N = { onSkill: '자동 · Q 사용 시', every: '자동 · 주기', lowHp: '자동 · 체력 위기', onHit: '자동 · 피격 시', shield: '자동 · 무피격 대기', onDeath: '자동 · 쓰러질 때', wave: '자동 · 웨이브 누적', onKill: '자동 · 처치 누적' };
export function uqSrcText(k) { const U = UQ[k], s = U.src; if (s.boss) return `${ST.stageNo(s.boss)} ${ST.STAGES[s.boss].n} 첫 처치`; if (s.stars) { const C = ST.CHAPTERS.find(c => c.id === s.stars); return `${C.short} 별 만점 (★${C.stages.length * 3})`; }
  if (s.drop) return `${ST.CHAPTERS.find(c => c.id === s.drop).short} 스테이지 보스 처치 1.5% (천장 ${UQ_PITY}회)`;
  if (s.dungeon) return `던전 원정 모르비아 처치 ${Math.round(UQ_DG.drop * 100)}% (천장 ${UQ_DG.pity}회) · 던전 상점 🏅${UQ_DG.price}`; return `도전 모드 최고 ${s.wave}웨이브`; }
export const clsN = h => (CLASSES[h] || {}).n || '알 수 없는 영웅';
export const pct = (k, v) => `${E.STAT[k]} +${v}%`;
export const GC = g => E.GRADES[g].c;
export const eqOf = (s, id) => { for (const h in s.eq) for (const sl in s.eq[h]) if (s.eq[h][sl] === id) return h; return null; };
export function sorted(list, s) { return [...list].sort((a, b) => (!!eqOf(s, b.id) - !!eqOf(s, a.id)) || b.g - a.g || b.e - a.e || E.power(b) - E.power(a)); }
export function tile(it, s, extra = '') { const h = eqOf(s, it.id), C = setOf(it); return `<button class="itile g${it.g}${it.uq ? ' uq' : ''}${C ? ' cset' : ''} ${extra}" data-id="${esc(it.id)}" style="--gc:${GCi(it)}${C ? `;--cc:${C.color}` : ''}"><span class="ic">${icon(it)}</span>${it.e ? `<span class="en">+${it.e}</span>` : ''}${h ? `<span class="eqb">${clsN(h)[0]}</span>` : ''}${it.uq ? `<span class="uqb">◆</span>${it.a ? `<span class="awb">★${it.a}</span>` : ''}` : E.legendKey(it) ? '<span class="lst">✦</span>' : ''}${C ? `<span class="chb">${C.badge}</span>` : ''}</button>`; }
export function lskHtml(it) { const k = E.legendKey(it); if (!k) return ''; const L = E.LSK[k]; return `<div class="lsk"><div class="lskH">✦ ${L.n} <i>${L.type === 'proc' ? '공격 시 발동' : '액티브 · E키'}</i></div><div class="lskD">${L.d}</div></div>`; }
// 고유 카드: 청록→금 테두리 · UNIQUE 리본 · 고정 옵션 · 고유 궁극기 · 각성 · 획득 조건
export function uqCard(it, lines) { const U = UQ[it.uq], a = it.a || 0, L = U.sk ? E.LSK[U.sk] : null;
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

