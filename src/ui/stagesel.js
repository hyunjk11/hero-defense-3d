// ================= 스테이지 선택 지도 (출정의 문) =================
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import * as Acc from '../account/account.js';
import * as ST from '../data/stages.js';
import * as P from '../account/progress.js';
import * as E from '../account/equip.js';
import { UQ, CHAL_UQ, CHSET } from '../data/items.js';
import { GRADES } from '../account/equip.js';
import { card, showTip, hideTip, sampleItem, weaponIcon, iconKey, icon } from './gear.js';

const ICONS = { forest: ['🌲', '🍄', '🍃', '🌳'], snow: ['❄️', '⛄', '🌨️', '❄️'], volcano: ['🌋', '🔥', '🪨', '🔥'], ruins: ['🏛️', '🗿', '🕸️', '🏺'] };
let ui = { open: false, ch: 1, sel: null }, hooks = { challenge: () => {}, start: () => {} };
export const stageOpen = () => ui.open;
export function initStageSel(h) { hooks = { ...hooks, ...h }; $('stClose').onclick = () => closeStageSel(); addEventListener('keydown', e => { if (e.key === 'Escape' && ui.open) closeStageSel(); }); }
function current(s) { for (const ch of ST.CHAPTERS) for (const st of ch.stages) if (ST.stageUnlocked(s, st.id) && !ST.stars(s, st.id)) return st.id; return null; }
export function openStageSel() {
  const s = Acc.load(); if (!ui.open) { Snd.play('confirm'); Snd.play('magic', { rate: .7 }); }
  ui.open = true; const cur = current(s); if (cur && !ui.sel) { ui.sel = cur; ui.ch = ST.STAGES[cur].ch; } if (!ui.sel) ui.sel = ST.CHAPTERS[0].stages[0].id;
  $('stagePanel').classList.remove('hidden'); render();
}
export function closeStageSel(silent) { if (ui.open && !silent) Snd.play('ui'); ui.open = false; $('stagePanel').classList.add('hidden'); hideTip(); }
const starStr = n => [0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');
function render() {
  if (!ui.open) return; const s = Acc.load(), C = ui.ch === 0 ? null : ST.CHAPTERS.find(c => c.id === ui.ch);
  $('stTabs').innerHTML = ST.CHAPTERS.map(c => { const un = ST.chapterUnlocked(s, c.id), tot = c.stages.length * 3; return `<button class="chtab ${ui.ch === c.id ? 'on' : ''} ${un ? '' : 'locked'}" data-c="${c.id}" style="--cc:${c.color}"><b>${c.short}</b><small>${c.soon ? '준비 중' : un ? `★ ${ST.chapterStars(s, c.id)}/${tot} · ◆ ${P.uniqueCount(s, c.id)}/3` : '🔒 잠김'}</small></button>`; }).join('')
    + `<button class="chtab chal ${ui.ch === 0 ? 'on' : ''}" data-c="0" style="--cc:#ff5a7a"><b>도전 모드</b><small>최고 ${s.bestWave}웨이브</small></button>`;
  document.querySelectorAll('#stTabs .chtab').forEach(b => b.onclick = () => { ui.ch = +b.dataset.c; const c = ST.CHAPTERS.find(x => x.id === ui.ch); ui.sel = c && c.stages.length ? (c.stages.find(x => ST.stageUnlocked(s, x.id) && !ST.stars(s, x.id)) || c.stages[0]).id : null; Snd.play('select'); render(); });
  $('stTotal').innerHTML = `총 별 <b>★ ${ST.totalStars(s)}</b> · 다음 별 보상 상자까지 ${ST.STAR_STEP - ST.totalStars(s) % ST.STAR_STEP}개`;
  const map = $('stMap'), info = $('stInfo');
  if (!C) { map.style.background = 'linear-gradient(160deg,#4a1a2a,#140810)'; map.innerHTML = floaties(['⚔️', '💀', '🔥', '👑']) + `<div class="chalBig"><div class="chalIco">♾️</div><div class="chalT">끝없는 도전</div><div class="chalD">기존의 무한 웨이브 모드. 어디까지 버틸 수 있을까요?<br>5웨이브마다 보상 상자, 보스 장비 드롭</div><div class="chalBest">최고 기록 <b>${s.bestWave}</b> 웨이브</div><div class="chalMs">${CHAL_UQ.map(k => { const w = UQ[k].src.wave, have = E.ownsUnique(s, k); return `<button class="msC ${have ? 'have' : ''}" data-uq="${k}"><span>${UQ[k].ic}</span><b>${w}</b><small>${have ? '✓ 획득' : `${Math.min(s.bestWave, w)}/${w}`}</small></button>`; }).join('')}</div></div>`;
    info.innerHTML = `<div class="sn">도전 모드</div><div class="sd">웨이브 제한 없음 · 패배하거나 귀환할 때까지</div><button class="gbtn main bigGo" id="stChalGo">🌀 도전 시작</button>`; $('stChalGo').onclick = () => { closeStageSel(true); hooks.challenge(); }; bindTips(map, s); return; }
  map.style.background = C.bg;
  if (C.soon || !C.stages.length) { map.innerHTML = floaties(ICONS[C.theme]) + `<div class="soonBig"><div class="chalIco">${ICONS[C.theme][0]}</div><div class="chalT">${C.n}</div><div class="chalD">${C.propN}: ${C.propD}</div><div class="soonTag">준비 중 · 곧 열립니다</div></div>`; info.innerHTML = `<div class="sn">${C.n}</div><div class="sd">준비 중인 챕터예요.</div>`; return; }
  const n = C.stages.length, pos = C.stages.map((st, i) => [8 + i * 84 / (n - 1), 50 + (i % 2 ? -22 : 20) + Math.sin(i * 1.7) * 6]);
  const un = ST.chapterUnlocked(s, C.id);
  map.innerHTML = floaties(ICONS[C.theme]) + `<svg class="stPath" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${pos.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')}" /></svg>`
    + C.stages.map((st, i) => { const u = ST.stageUnlocked(s, st.id), k = ST.stars(s, st.id), cur = u && !k; return `<button class="snode ${u ? '' : 'locked'} ${cur ? 'cur' : ''} ${st.boss ? 'boss' : ''} ${ui.sel === st.id ? 'sel' : ''}" data-id="${st.id}" style="left:${pos[i][0]}%;top:${pos[i][1]}%;--cc:${C.color}"><span class="num">${u ? (st.boss ? '👑' : st.id) : '🔒'}</span>${st.boss && !E.ownsUnique(s, P.dropPreview(st.id, s.hero, s).uq[0].k) ? '<i class="uqNode" title="고유 장비 첫 처치 보상">💎</i>' : ''}<span class="stars">${starStr(k)}</span><span class="nm">${st.n}</span></button>`; }).join('')
    + (un ? '' : `<div class="lockVeil">🔒 ${ST.CHAPTERS.find(c => c.id === C.id - 1).n}의 보스를 처치하면 열려요</div>`);
  map.querySelectorAll('.snode').forEach(b => b.onclick = () => { ui.sel = b.dataset.id; Snd.play('select'); render(); });
  const S = ST.STAGES[ui.sel] || C.stages[0], u = ST.stageUnlocked(s, S.id), k = ST.stars(s, S.id);
  info.innerHTML = `<div class="sn">${S.id} · ${S.n}${S.boss ? ' <span class="bossT">챕터 보스</span>' : ''}</div>
    <div class="sd">웨이브 ${S.waves} · 몬스터 포털 ${S.spawns.length}개 · 몬스터 체력 ×${S.hp}</div>
    <div class="prop" style="--cc:${C.color}"><b>${C.propN}</b> ${C.propD}</div>
    <div class="conds">${ST.STAR_D.map((d, i) => `<div class="${i < k ? 'got' : ''}">${i < k ? '★' : '☆'} ${d}</div>`).join('')}</div>
    <div class="rw">보상: 영혼석 ${ST.stageReward(S.id, !k)}${k ? ' (재도전)' : ` + <span style="color:${C.color}">${C.short} 장비</span> 1개 (첫 클리어)`}</div>${dropHtml(P.dropPreview(S.id, s.hero, s))}
    ${u ? `<button class="gbtn main bigGo" id="stGo">⚔ 출정!</button>` : `<div class="warn">🔒 이전 스테이지를 클리어하면 열려요</div>`}`;
  if ($('stGo')) $('stGo').onclick = () => { closeStageSel(true); hooks.start(S.id); };
  bindTips(info, s);
}
function floaties(ic) { let h = '<div class="floaties">'; for (let i = 0; i < 14; i++) h += `<i style="left:${(i * 37) % 100}%;animation-delay:${-(i * 1.3) % 9}s;animation-duration:${8 + (i % 5)}s;font-size:${14 + (i % 4) * 6}px">${ic[i % ic.length]}</i>`; return h + '</div>'; }

// ---------- 드롭 미리보기 (정보 패널): 세트 칩(현재 영웅 무기·방어구·장신구) + 첫 클리어 등급 범위 점 + 고유 3칸 ----------
const KIND_N = { boss: '보스 첫 처치', stars: '별 만점', drop: '보스 처치 1.5%' };
function dropHtml(D) {
  if (!D) return ''; const C = D.set, top = D.grades.lastIndexOf(true);
  const chips = [['weapon', weaponIcon(D.hero)], ['armor', iconKey('armor')], ['acc', iconKey('acc')]].map(([sl, ic]) => `<button class="drc" data-tip="set" data-sl="${sl}" data-g="${top}" data-ch="${D.ch}" data-h="${D.hero}">${ic}<i>${C.badge}</i></button>`).join('');
  const dots = D.grades.map((on, g) => `<i class="gd ${on ? 'on' : ''}" style="--gc:${GRADES[g].c}" title="${GRADES[g].n} ${Math.round(D.odds[g] * 1000) / 10}%"></i>`).join('');
  const uq = D.uq.map(u => { const it = E.makeUnique(u.k), tag = u.have ? '✓' : u.kind === 'drop' ? `${u.pity}/${D.pityMax}` : u.kind === 'stars' ? `★${D.stars}/${D.starsMax}` : '?';
    return `<button class="dru ${u.have ? 'have' : ''} ${u.here ? '' : 'far'}" data-tip="uq" data-k="${u.k}" title="${KIND_N[u.kind]}"><span class="ic">${icon(it)}</span><small>${tag}</small></button>`; }).join('');
  return `<div class="drop" style="--cc:${C.color}"><div class="drRow"><span class="drL">${C.badge} ${C.n} 세트</span><span class="drChips">${chips}</span><span class="drG">${dots}</span></div><div class="drRow"><span class="drL">◆ 고유</span><span class="drUq">${uq}</span></div></div>`;
}
let tipT = 0;
function bindTips(root, s) {
  const html = b => { if (b.dataset.tip === 'set') { const it = sampleItem(+b.dataset.ch, b.dataset.sl === 'weapon' ? b.dataset.h : b.dataset.sl, +b.dataset.g); return `<div class="cxUnseen">견본 · 이 스테이지 최고 등급 ${GRADES[+b.dataset.g].n}</div>${card(it)}`; }
    const k = b.dataset.k || b.dataset.uq; const it = s.inv.find(x => x.uq === k) || E.makeUnique(k); return card(it); };
  root.querySelectorAll('.drc, .dru, .msC').forEach(b => { b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, html(b)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); };
    b.onclick = e => { e.stopPropagation(); showTip(b, html(b)); clearTimeout(tipT); tipT = setTimeout(hideTip, 3200); Snd.play('select'); }; });
}
