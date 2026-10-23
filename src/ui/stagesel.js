// ================= 스테이지 선택 지도 (출정의 문) =================
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { escLayer } from './keys.js';
import * as Acc from '../account/account.js';
import * as ST from '../data/stages.js';
import * as P from '../account/progress.js';
import * as E from '../account/equip.js';
import { UQ, CHAL_UQ } from '../data/items.js';
import { GRADES } from '../account/equip.js';
import { card, showTip, hideTip, sampleItem, weaponIcon, iconKey, icon } from './gear.js';

const ICONS = { forest: ['🌲', '🍄', '🍃', '🌳'], snow: ['❄️', '⛄', '🌨️', '❄️'], volcano: ['🌋', '🔥', '☄️', '🔥'], ruins: ['🏛️', '🗿', '🕸️', '🏺'] };
let ui = { open: false, ch: 1, sel: null, hard: false }, hooks = { challenge: () => {}, start: () => {} };
export function initStageSel(h) { hooks = { ...hooks, ...h }; $('stClose').onclick = () => closeStageSel(); escLayer('stage', 40, () => ui.open, () => closeStageSel()); }
function current(s) { for (const ch of ST.CHAPTERS) for (const st of ch.stages) if (ST.stageUnlocked(s, st.id) && !ST.stars(s, st.id)) return st.id; return null; }
// Q-5 (2026-10-23): 마지막 출정 기억 (localStorage hd3d_lastStage {id, hard}) — 지도를 다시 열면 그 챕터·노말/하드로. 그 칸을 깼으면 다음 열린 칸, 잠겼으면 무시(진행 중 칸)
const LAST = 'hd3d_lastStage';
function recall(s) { let L = null; try { L = JSON.parse(localStorage.getItem(LAST) || 'null'); } catch (e) {} if (!L || !ST.STAGES[L.id]) return;
  const H = !!L.hard && ST.hardUnlocked(s, L.id), done = H ? ST.hstars(s, L.id) : ST.stars(s, L.id), id = done ? (ST.nextStage(s, L.id, H) || L.id) : L.id;
  if (!(H ? ST.hardUnlocked(s, id) : ST.stageUnlocked(s, id))) return; ui.sel = id; ui.ch = ST.STAGES[id].ch; ui.hard = H; }
export function rememberStage(id, hard) { try { localStorage.setItem(LAST, JSON.stringify({ id, hard: !!hard })); } catch (e) {} }
export function openStageSel() {
  const s = Acc.load(); if (!ui.open) { Snd.play('confirm'); Snd.play('magic', { rate: .7 }); }
  ui.open = true; if (!ui.sel) recall(s); const cur = current(s); if (cur && !ui.sel) { ui.sel = cur; ui.ch = ST.STAGES[cur].ch; } if (!ui.sel) ui.sel = ST.CHAPTERS[0].stages[0].id;
  $('stagePanel').classList.remove('hidden'); render();
}
export function closeStageSel(silent) { if (ui.open && !silent) Snd.play('ui'); ui.open = false; $('stagePanel').classList.add('hidden'); hideTip(); }
const starStr = n => [0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');
function render() {
  if (!ui.open) return; const s = Acc.load(), C = ui.ch === 0 ? null : ST.CHAPTERS.find(c => c.id === ui.ch);
  $('stTabs').innerHTML = ST.CHAPTERS.map(c => { const un = ST.chapterUnlocked(s, c.id), tot = c.stages.length * 3; const hd = ui.hard && ST.hardChapterUnlocked(s, c.id), hb = ST.hardChapterCleared(s, c.id) ? '<i class="hardBadge" title="하드 정복: 하드 보스 처치">🔥</i>' : ''; return `<button class="chtab ${ui.ch === c.id ? 'on' : ''} ${un ? '' : 'locked'} ${hd ? 'hardT' : ''}" data-c="${c.id}" style="--cc:${c.color}"><b>${hb}${c.short}</b><small>${c.soon ? '준비 중' : !un ? '🔒 잠김' : hd ? `하드 ★ ${ST.hardChapterStars(s, c.id)}/${tot}` : `★ ${ST.chapterStars(s, c.id)}/${tot} · ◆ ${P.uniqueCount(s, c.id)}/3`}</small></button>`; }).join('')
    + `<button class="chtab chal ${ui.ch === 0 ? 'on' : ''}" data-c="0" style="--cc:#ff5a7a"><b>도전 모드</b><small>최고 ${s.bestWave}웨이브</small></button>`;
  document.querySelectorAll('#stTabs .chtab').forEach(b => b.onclick = () => { ui.ch = +b.dataset.c; const c = ST.CHAPTERS.find(x => x.id === ui.ch); if (c && ui.hard && !ST.hardChapterUnlocked(s, c.id)) ui.hard = false; ui.sel = c && c.stages.length ? (c.stages.find(x => ui.hard ? ST.hardUnlocked(s, x.id) && !ST.hstars(s, x.id) : ST.stageUnlocked(s, x.id) && !ST.stars(s, x.id)) || c.stages[0]).id : null; Snd.play('select'); render(); });
  $('stTotal').innerHTML = `총 별 <b>★ ${ST.totalStars(s)}</b> · 다음 별 보상 상자까지 ${ST.STAR_STEP - ST.totalStars(s) % ST.STAR_STEP}개${ST.hardTotalStars(s) ? ` · <span class="hardTxt">하드 ★ ${ST.hardTotalStars(s)}</span>` : ''}`;
  const map = $('stMap'), info = $('stInfo');
  if (!C) { map.classList.remove('hard'); map.style.background = 'linear-gradient(160deg,#4a1a2a,#140810)'; map.innerHTML = floaties(['⚔️', '💀', '🔥', '👑']) + `<div class="chalBig"><div class="chalIco">♾️</div><div class="chalT">끝없는 도전</div><div class="chalD">기존의 무한 웨이브 모드. 어디까지 버틸 수 있을까요?<br>5웨이브마다 보상 상자, 보스 장비 드롭</div><div class="chalBest">최고 기록 <b>${s.bestWave}</b> 웨이브</div><div class="chalMs">${CHAL_UQ.map(k => { const w = UQ[k].src.wave, have = E.ownsUnique(s, k); return `<button class="msC ${have ? 'have' : ''}" data-uq="${k}"><span>${UQ[k].ic}</span><b>${w}</b><small>${have ? '✓ 획득' : `${Math.min(s.bestWave, w)}/${w}`}</small></button>`; }).join('')}</div></div>`;
    info.innerHTML = `<div class="sn">도전 모드</div><div class="sd">웨이브 제한 없음 · 패배하거나 귀환할 때까지</div><button class="gbtn main bigGo" id="stChalGo">🌀 도전 시작</button>`; $('stChalGo').onclick = () => { closeStageSel(true); hooks.challenge(); }; bindTips(map, s); return; }
  map.style.background = C.bg; map.classList.remove('hard');
  if (C.soon || !C.stages.length) { map.innerHTML = floaties(ICONS[C.theme]) + `<div class="soonBig"><div class="chalIco">${ICONS[C.theme][0]}</div><div class="chalT">${C.n}</div><div class="chalD">${C.propN}: ${C.propD}</div><div class="soonTag">준비 중 · 곧 열립니다</div></div>`; info.innerHTML = `<div class="sn">${C.n}</div><div class="sd">준비 중인 챕터예요.</div>`; return; }
  const n = C.stages.length, pos = C.stages.map((st, i) => [8 + i * 84 / (n - 1), 50 + (i % 2 ? -22 : 20) + Math.sin(i * 1.7) * 6]);
  const un = ST.chapterUnlocked(s, C.id), hun = ST.hardChapterUnlocked(s, C.id); if (!hun) ui.hard = false; const H = ui.hard, cc = H ? '#ff4a3a' : C.color;
  const isU = id => H ? ST.hardUnlocked(s, id) : ST.stageUnlocked(s, id), starOf = id => H ? ST.hstars(s, id) : ST.stars(s, id);
  map.classList.toggle('hard', H);
  // 노말/하드 토글 (지도 왼쪽 위): 하드는 그 챕터 노말 보스를 깨야 열림 — 잠기면 누를 때 해금 방법 안내
  const tog = un ? `<div class="modeTog" role="group" aria-label="난이도"><button class="mt ${H ? '' : 'on'}" data-m="n">노말</button><button class="mt hardB ${H ? 'on' : ''} ${hun ? '' : 'locked'}" data-m="h" title="${hun ? '하드: 몬스터 강화 · 정예 출현 · 보상 2배' : ST.hardLockText(C.id).replace('🔒 ', '')}">${hun ? '🔥' : '🔒'} 하드</button></div>` : '';
  map.innerHTML = floaties(ICONS[C.theme]) + (H ? '<div class="hardVeil"></div>' : '') + `<svg class="stPath" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${pos.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')}" /></svg>`
    + C.stages.map((st, i) => { const u = isU(st.id), k = starOf(st.id), cur = u && !k; return `<button class="snode ${u ? '' : 'locked'} ${cur ? 'cur' : ''} ${st.boss ? 'boss' : ''} ${H ? 'hard' : ''} ${ui.sel === st.id ? 'sel' : ''}" data-id="${st.id}" style="left:${pos[i][0]}%;top:${pos[i][1]}%;--cc:${cc}"><span class="num">${u ? (st.boss ? '👑' : st.no) : '🔒'}</span>${!H && st.boss && !E.ownsUnique(s, P.dropPreview(st.id, s.hero, s).uq[0].k) ? '<i class="uqNode" title="고유 장비 첫 처치 보상">💎</i>' : ''}<span class="stars">${starStr(k)}</span><span class="nm">${st.n}</span></button>`; }).join('')
    + tog + (un ? '' : `<div class="lockVeil">🔒 ${ST.CHAPTERS.find(c => c.id === C.id - 1).n}의 보스를 처치하면 열려요</div>`);
  map.querySelectorAll('.snode').forEach(b => b.onclick = () => { ui.sel = b.dataset.id; Snd.play('select'); render(); });
  map.querySelectorAll('.modeTog .mt').forEach(b => b.onclick = e => { e.stopPropagation(); const want = b.dataset.m === 'h';
    if (want && !hun) { Snd.play('error'); showTip(b, `<div class="hardLock">${ST.hardLockText(C.id)}</div>`); clearTimeout(tipT); tipT = setTimeout(hideTip, 3200); return; }
    if (want === ui.hard) return; ui.hard = want; Snd.play(want ? 'magic' : 'select'); const c2 = C.stages.find(x => (want ? ST.hardUnlocked(s, x.id) && !ST.hstars(s, x.id) : ST.stageUnlocked(s, x.id) && !ST.stars(s, x.id))); if (c2) ui.sel = c2.id; render(); });
  const S = ST.STAGES[ui.sel] || C.stages[0], u = isU(S.id), k = starOf(S.id), HD = ST.HARD, r2 = v => Math.round(v * 100) / 100;
  info.innerHTML = `<div class="sn">${H ? '<span class="hardTag">하드</span> ' : ''}${S.no} · ${S.n}${S.boss ? ' <span class="bossT">챕터 보스</span>' : ''}</div>
    <div class="sd">${H ? `웨이브 ${S.waves} · 체력 ×${r2(S.hp * ST.hardHp(9, S.ch))}${S.boss ? ` (보스 ×${r2(S.hp * ST.hardHp(9, S.ch) * HD.bossHp)})` : ''} · 피해 ×${HD.dmg} · 속도 +${Math.round((HD.spd - 1) * 100)}% · 정예 ${HD.eliteFrom}웨이브~` : `웨이브 ${S.waves} · 몬스터 포털 ${S.spawns.length}개 · 몬스터 체력 ×${S.hp}`}</div>
    <div class="prop" style="--cc:${C.color}"><b>${C.propN}</b> ${C.propD}</div>
    <div class="conds">${ST.STAR_D.map((d, i) => `<div class="${i < k ? 'got' : ''}">${i < k ? '★' : '☆'} ${d}</div>`).join('')}</div>
    ${H ? `<div class="rw hardRw">보상: 영혼석 <b>${ST.stageRewardH(S.id, !k, true)}</b> (×${HD.souls})${k ? ' (재도전) + 장비 50%' : ' + 장비 1개'} <span style="color:${C.color}">(등급 +${HD.tierUp})</span> · 정예 처치 +${HD.eliteSouls}</div>`
      : `<div class="rw">보상: 영혼석 ${ST.stageReward(S.id, !k)}${k ? ' (재도전)' : ` + <span style="color:${C.color}">${C.short} 장비</span> 1개 (첫 클리어)`}</div>`}${dropHtml(P.dropPreview(S.id, s.hero, s, H))}
    ${u ? `<button class="gbtn main bigGo ${H ? 'hardGo' : ''}" id="stGo">${H ? '🔥 하드 출정!' : '⚔ 출정!'}</button>` : `<div class="warn">🔒 ${H ? '이전 하드 스테이지' : '이전 스테이지'}를 클리어하면 열려요</div>`}`;
  if ($('stGo')) $('stGo').onclick = () => { closeStageSel(true); hooks.start(S.id, H); };
  bindTips(info, s);
}
function floaties(ic) { let h = '<div class="floaties">'; for (let i = 0; i < 14; i++) h += `<i style="left:${(i * 37) % 100}%;animation-delay:${-(i * 1.3) % 9}s;animation-duration:${8 + (i % 5)}s;font-size:${14 + (i % 4) * 6}px">${ic[i % ic.length]}</i>`; return h + '</div>'; }

// ---------- 드롭 미리보기 (정보 패널): 세트 칩(현재 영웅 무기·방어구·장신구) + 첫 클리어 등급 범위 점 + 고유 3칸 ----------
const KIND_N = { boss: '보스 첫 처치', stars: '별 만점', drop: '보스 처치 1.5%', dropH: `하드 보스 처치 ${Math.round(1.5 * ST.HARD.uqDrop * 10) / 10}% · 천장 ${ST.HARD.pityStep}배 빠름` };
function dropHtml(D) {
  if (!D) return ''; const C = D.set, top = D.grades.lastIndexOf(true);
  const chips = [['weapon', weaponIcon(D.hero)], ['armor', iconKey('armor')], ['acc', iconKey('acc')]].map(([sl, ic]) => `<button class="drc" data-tip="set" data-sl="${sl}" data-g="${top}" data-ch="${D.ch}" data-h="${D.hero}">${ic}<i>${C.badge}</i></button>`).join('');
  const dots = D.grades.map((on, g) => `<i class="gd ${on ? 'on' : ''}" style="--gc:${GRADES[g].c}" title="${GRADES[g].n} ${Math.round(D.odds[g] * 1000) / 10}%"></i>`).join('');
  const uq = D.uq.map(u => { const it = E.makeUnique(u.k), tag = u.have ? '✓' : u.kind === 'drop' ? `${u.pity}/${D.pityMax}` : u.kind === 'stars' ? `★${D.stars}/${D.starsMax}` : '?';
    return `<button class="dru ${u.have ? 'have' : ''} ${u.here ? '' : 'far'}" data-tip="uq" data-k="${u.k}" title="${KIND_N[D.hard && u.kind === 'drop' ? 'dropH' : u.kind]}"><span class="ic">${icon(it)}</span><small>${tag}</small></button>`; }).join('');
  return `<div class="drop" style="--cc:${C.color}"><div class="drRow"><span class="drL">${C.badge} ${C.n} 세트</span><span class="drChips">${chips}</span><span class="drG">${dots}</span></div><div class="drRow"><span class="drL">◆ 고유</span><span class="drUq">${uq}</span></div></div>`;
}
let tipT = 0;
function bindTips(root, s) {
  const html = b => { if (b.dataset.tip === 'set') { const it = sampleItem(+b.dataset.ch, b.dataset.sl === 'weapon' ? b.dataset.h : b.dataset.sl, +b.dataset.g); return `<div class="cxUnseen">견본 · 이 스테이지 최고 등급 ${GRADES[+b.dataset.g].n}</div>${card(it)}`; }
    const k = b.dataset.k || b.dataset.uq; const it = s.inv.find(x => x.uq === k) || E.makeUnique(k); return card(it); };
  root.querySelectorAll('.drc, .dru, .msC').forEach(b => { b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, html(b)); }; b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); };
    b.onclick = e => { e.stopPropagation(); showTip(b, html(b)); clearTimeout(tipT); tipT = setTimeout(hideTip, 3200); Snd.play('select'); }; });
}
