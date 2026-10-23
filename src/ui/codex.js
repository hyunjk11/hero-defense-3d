// 도감 탭 (C-10b: ui/gear.js 에서 분리 — 동작 불변). 가방 패널 상태(ui)·훅·다시 그리기는 gear.js 가 X 로 넘김
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import { CLASSES } from '../data/heroes.js';
import * as Acc from '../account/account.js';
import * as E from '../account/equip.js';
import * as P from '../account/progress.js';
import * as ST from '../data/stages.js';
import { DGS, dgStatus } from '../account/dungeon.js';
import { UQ, UQ_COLOR, UQ_DG, CHSET, CH_KEYS, UQ_PITY, CODEX_RW } from '../data/items.js';
import { iconKey, weaponIcon, icon, clsN, GC, awStars, uqSrcText, card } from './itemview.js';
import { showTip, hideTip } from './gear.js'; // 순환 import — 호출 시점에만 씀
// 도감 (가방 패널의 '도감' 탭) ----------
export const cxRowIcon = row => (row === 'armor' || row === 'acc' ? iconKey(row) : weaponIcon(row));
export const cxRowN = row => (row === 'armor' ? '방어구' : row === 'acc' ? '장신구' : `${(CLASSES[row] || {}).nm || clsN(row)} 무기`);
export const cxSlot = row => (row === 'armor' || row === 'acc' ? row : 'weapon');
export const rwTxt = rw => [rw.crystal ? `마력석 ${rw.crystal}` : '', rw.essence ? `고유 정수 ${rw.essence}` : '', rw.souls ? `영혼석 ${rw.souls}` : ''].filter(Boolean).join(' · ');
export function codexClaimable(s) { return CH_KEYS.some(ch => { const C = P.codexState(s, ch); return C.rows.some(r => r.done && !r.got) || (C.all.done && !C.all.got); }); }
// 견본(표시용, 저장 안 함): 고정 시드
export const sampleR = () => { let q = 12345; return () => (q = (q * 16807) % 2147483647) / 2147483647; };
export const sampleItem = (ch, row, g) => E.makeItem(cxSlot(row), cxSlot(row) === 'weapon' ? row : P.codexRows()[0], g, sampleR(), ch);
export function renderCodex(s, X) { const ui = X.ui;
  const tabs = [...CH_KEYS.map(c => [c, `${CHSET[c].badge} ${CHSET[c].n}`, (C => `${C.seen}/${C.total}`)(P.codexState(s, c))]), [0, '◆ 고유', `${Object.keys(UQ).filter(k => E.ownsUnique(s, k)).length}/${Object.keys(UQ).length}`]];
  let h = `<div class="cxTabs">${tabs.map(([c, n, sm]) => `<button class="ftab ${ui.cxTab === c ? 'on' : ''}" data-c="${c}" style="--cc:${c ? CHSET[c].color : UQ_COLOR}">${n} <small>${sm}</small></button>`).join('')}</div>`;
  if (ui.cxTab) { const ch = ui.cxTab, C = P.codexState(s, ch), SC = ST.CHAPTERS.find(c => c.id === ch), un = ST.chapterUnlocked(s, ch);
    h += `<div class="cxGrid" style="--cc:${CHSET[ch].color}"><div class="cxHd"></div>${E.GRADES.map(g => `<div class="cxHd" style="color:${g.c}">${g.n}</div>`).join('')}<div class="cxHd">보상</div>`
      + C.rows.map(r => `<div class="cxRow">${cxRowIcon(r.row)}<small>${cxRowN(r.row)}</small></div>` + [0, 1, 2, 3, 4].map(g => { const seen = r.bits & (1 << g), na = !(C.mask & (1 << g)); /* na: 이 챕터에서 나오지 않는 등급 (완성 조건 아님) — 예전 저장·관리자 우편으로 등록돼 있으면 보여 주되 extra */ return `<button class="cxC ${seen ? 'seen' : ''}${na ? ' na' : ''}" data-ch="${ch}" data-row="${r.row}" data-g="${g}" style="--gc:${GC(g)}">${seen ? `<span>${cxRowIcon(r.row)}</span>` : na ? '—' : '?'}</button>`; }).join('')
        + `<div class="cxRw">${r.got ? '✓' : r.done ? `<button class="gbtn sm main cxGet" data-k="${r.key}">받기</button>` : `${r.n}/${r.max}`}</div>`).join('') + '</div>'
      + `<div class="cxFoot"><span>${SC.n} · 본 장비 <b>${C.seen}/${C.total}</b>${un ? '' : ' · 🔒 아직 열리지 않은 챕터'}</span><span class="cxAllRw">행 완성 ${rwTxt(CODEX_RW.row)} · 전부 완성 ${rwTxt(CODEX_RW.all)}</span>${C.all.got ? '<b class="cxDone">✓ 완성 보상 받음</b>' : C.all.done ? `<button class="gbtn main cxGet" data-k="${C.all.key}">🏆 완성 보상 받기</button>` : ''}</div>`;
  } else {
    if (DGS.st === 'idle' && Acc.A.user) dgStatus().then(() => { if (ui.inv && ui.cxTab === 0 && DGS.st === 'ok') X.renderInv(); }).catch(() => {}); // 던전 고유 천장·메달 (서버 값)
    h += `<div class="uqGrid">${Object.keys(UQ).map(k => { const U = UQ[k], have = E.ownsUnique(s, k), it = s.inv.find(x => x.uq === k), src = U.src;
      const prog = have ? `<b class="uqSt">${awStars(it ? it.a : 0)}</b>` : src.boss ? (ST.stars(s, src.boss) ? '✓' : '미처치') : src.stars ? `★ ${ST.chapterStars(s, src.stars)}/${P.chapterMax(src.stars)}` : src.drop ? `천장 ${(s.uqPity || {})[k] || 0}/${UQ_PITY}` : src.dungeon ? (DGS.st === 'ok' ? `천장 ${DGS.uqPity}/${UQ_DG.pity} · 🏅 ${DGS.medals}/${UQ_DG.price}` : '던전 원정 (로그인)') : `최고 ${s.bestWave}/${src.wave}웨이브`;
      return `<button class="uqCell ${have ? 'have' : ''}" data-k="${k}"><span class="ic">${have ? icon(E.makeUnique(k)) : '?'}</span><span class="un">${have ? esc(U.n) : '???'}</span><small>${esc(uqSrcText(k))}</small><small class="pg">${prog}</small></button>`; }).join('')}</div>`;
  }
  $('codexBody').innerHTML = h;
  document.querySelectorAll('#codexBody .cxTabs .ftab').forEach(b => b.onclick = () => { ui.cxTab = +b.dataset.c; Snd.play('ui'); hideTip(); X.renderInv(); });
  document.querySelectorAll('#codexBody .cxGet').forEach(b => b.onclick = () => { let rw; Acc.update(d => { const o = P.claimCodex(d, b.dataset.k); rw = o[1]; return o[0]; }); if (rw) { Snd.play('levelUp', { force: true }); Snd.play('coins'); X.hooks().cheer(); } else Snd.play('error'); X.hooks().onChange(true); X.renderInv(); });
  const tipOf = b => { if (b.dataset.k) { const k = b.dataset.k, it = X.S().inv.find(x => x.uq === k) || E.makeUnique(k); return card(it); } const it = sampleItem(+b.dataset.ch, b.dataset.row, +b.dataset.g), na = b.classList.contains('na'); return (na ? `<div class="cxUnseen">${CHSET[+b.dataset.ch].n} 세트는 ${E.GRADES[+b.dataset.g].n} 등급이 나오지 않아요 · 도감 완성에 필요 없음${b.classList.contains('seen') ? ' (특별 획득)' : ''}</div>` : b.classList.contains('seen') ? '' : '<div class="cxUnseen">아직 얻지 못한 장비 (견본)</div>') + card(it); };
  document.querySelectorAll('#codexBody .cxC, #codexBody .uqCell').forEach(b => { b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, tipOf(b)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); };
    b.onclick = () => { showTip(b, tipOf(b)); X.tipLater(); Snd.play('select'); }; });
}
