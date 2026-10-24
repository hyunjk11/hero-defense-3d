// ================= 🗼 무한의 탑 입장 화면 (T-8, 2026-10-24) — 던전 건물 패널(ui/dungeon.js)의 탭 [⚔ 던전 원정] [🗼 무한의 탑] [🏪 던전 상점] =================
// 시작 층 칩(1 · 돌파한 체크포인트+1) · 다음 5개 층 어픽스 미리보기 · 다음 첫 돌파 보상 · 탑 전용 파티(hd3d_sppick) · 랭킹(주간/전체) · 출발(서버 등록 → 새로고침 진입)
// SP_OPEN(SP_LIVE 또는 ?sptest=1) 일 때만 탭이 보임 — T-10(2026-10-24) 부터 SP_LIVE=true 로 공개
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import { go } from '../core/nav.js';
import { G } from '../core/state.js';
import { DG_MAX, dungeonParty, pickParty, togglePick } from '../data/dungeon.js';
import { SP_PICK_KEY, SP_TYPE, SP_AFFIX_BY, SP_TITLES, SP_SERVER, preview, weekKey, catchupBless, firstClear, bandOf } from '../data/spire.js';
import * as SS from '../account/spire.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';
import { banner } from './hud.js';

let from = null, picked = false, sub = 'main', rankKind = 'week', rank = null, departing = false, H = null;
const loadPick = () => { try { const a = JSON.parse(localStorage.getItem(SP_PICK_KEY) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; } };
const savePick = p => { try { localStorage.setItem(SP_PICK_KEY, JSON.stringify(p)); } catch (e) {} };
// 탑 파티: 탑 전용 저장이 없으면 원정 파티에서 시작
const pickOf = (cands, dgPick) => pickParty(cands, loadPick() || dgPick);
const ranked = () => SS.SPS.st === 'ok' && !!Acc.A.user;
const cps = () => ranked() ? SS.SPS.checkpoints : [1];
const curFrom = () => { const L = cps(); if (!picked || from == null || !L.includes(from)) from = L[L.length - 1]; return from; };
function headHtml() { const S = SS.SPS;
  if (S.st === 'guest' || !Acc.A.user) return '<span class="dgPr">👤 게스트 · 기록·보상 없는 <b>연습 탑</b> — 로그인하면 최고 기록 · 첫 돌파 보상 · 랭킹이 저장돼요</span>';
  if (S.st === 'missing') return '<span class="dgUpd">⚠ 서버 업데이트 필요</span> · 지금은 기록·보상 없는 <b>연습 탑</b> (1층부터)';
  if (S.st === 'error') return '<span class="dgUpd">서버에 연결할 수 없어요</span> · 출발하면 기록 없는 연습 탑';
  if (S.st !== 'ok') return '<span class="dim">기록 확인 중…</span>';
  return `🗼 최고 <b id="spBest">${S.best}층</b> · 이번 주 <b id="spWeek">${S.weekBest}층</b>${S.weekRank ? ` (주간 <b>${S.weekRank}위</b>)` : ''}${S.titles.length ? ` · <span class="spTitles" id="spTitles">${S.titles.map(t => esc(SP_TITLES[t] || t)).join(' ')}</span>` : ''} · 오늘 남은 도전 <b id="spLeft">${S.left}</b>/${S.limit}<small> · 한국 시간 월요일 0시에 주간 기록 초기화</small>`; }
const affChip = id => { const A = SP_AFFIX_BY[id]; return A ? `<span class="spAff${A.good ? ' good' : ''}" title="${esc(A.n + ' — ' + A.desc)}">${A.icon} ${esc(A.n)}</span>` : ''; };
function previewHtml(f) { return preview(f, weekKey(), 5).map(x => { const T = SP_TYPE[x.type] || SP_TYPE.normal;
  return `<div class="spPv ${x.type}"><b class="spPvN">${x.floor}층</b><span class="spPvT">${T.icon || '▫'} ${esc(x.boss || T.n)}</span><span class="spPvA">${x.affixes.length ? x.affixes.map(affChip).join('') : '<span class="dim">변형 없음</span>'}</span></div>`; }).join(''); }
function nextRewardHtml() { const base = ranked() ? Math.max(SS.SPS.cleared, Math.floor(SS.SPS.best / 5) * 5) : 0, n = (Math.floor(base / 5) + 1) * 5, x = firstClear(n);
  if (!x) return ''; const parts = [x.souls ? `영혼석 ${x.souls}` : '', x.medals ? `🏅 던전 메달 ${x.medals}` : '', x.title ? `칭호 ${SP_TITLES[x.title]}` : ''].filter(Boolean).join(' · ');
  return `🎁 다음 첫 돌파 보상: <b>${n}층</b> — ${esc(parts)}${ranked() ? '' : ' <small>(로그인 계정만)</small>'}`; }
export function renderSpire(p, h) { H = h; if (sub === 'rank') return renderRank(p);
  const s = Acc.load(), cands = dungeonParty(c => Sh.heroOwned(c)), party = pickOf(cands, h.dgPick()), f = curFrom(), L = cps(), cu = catchupBless(f);
  const nextLock = ranked() ? (Math.floor(SS.SPS.best / 5) + 1) * 5 + 1 : 6, chipsL = L.length > 9 ? [L[0], ...L.slice(-8)] : L;
  const wk = weekRwHtml(); // 받을 주간 보상이 있으면 규칙 안내 줄 대신 (860px 높이에 맞춤)
  p.innerHTML = `<button id="dgClose" class="gbtn sm xbtn ui-x">✕</button><div class="gtitle">🗼 무한의 탑</div>${h.tabs('spire')}
    <div class="labSub">끝없이 오르는 탑 · 5층마다 체크포인트 · 주마다 바뀌는 층 변형(어픽스)에 맞춰 편성하세요</div>
    <div class="dgDay spHead" id="spHead">${headHtml()}</div>
    <div class="spRow"><span class="spLbl">시작 층</span><div class="ftabs spChips" id="spChips">${chipsL.map(n => `<button class="ftab spChip${n === f ? ' on' : ''}" data-from="${n}">${n}층</button>`).join('')}<button class="ftab spChip lock" disabled title="${nextLock - 1}층을 돌파하면 열려요">🔒 ${nextLock}층</button></div>
      <small class="spCu">${cu ? `출발 축복 ${cu}번 (따라잡기)` : '출발 축복 없음'} · ${esc(bandOf(f).n)}</small></div>
    <div class="spPrev" id="spPrev"><div class="spPvH">다음 5개 층 미리보기 <small>(이번 주 · 모두 같은 탑)</small></div>${previewHtml(f)}</div>
    <div class="spNext" id="spNext">${nextRewardHtml()}</div>${wk}
    <div class="dgPickN" id="spPickN">출전 <b>${party.length}</b> / ${DG_MAX}명 <small>· 탑 파티는 원정과 따로 저장돼요</small></div>
    <div class="dgParty spParty">${cands.map(c => h.card(s, c, party.includes(c))).join('')}</div>
    ${wk ? '' : `<div class="dgInfo"><small>층 사이 생존 영웅 체력 +15% · 쓰러진 영웅은 다음 층에 30% 로 복귀 · 보스 층(5의 배수) 돌파 = 축복 3택1 + 체크포인트 저장 · 한 도전 최대 +${SP_SERVER.maxPerRun}층</small></div>`}
    <div class="dgGo"><button id="spRankBtn" class="gbtn">🏆 랭킹</button><button id="spGo" class="gbtn main">🗼 ${f}층부터 오르기</button></div>`;
  h.wire(p); $('spRankBtn').onclick = () => { Snd.play('ui'); sub = 'rank'; rank = null; renderSpire(p, h); loadRank(p); }; $('spGo').onclick = () => depart();
  p.querySelectorAll('.spWkBtn').forEach(b => b.onclick = () => claimWeek(p, b));
  paintGo(); p.querySelectorAll('.spChip[data-from]').forEach(b => b.onclick = () => { Snd.play('select'); from = +b.dataset.from; picked = true; renderSpire(p, h); });
  p.querySelectorAll('.dgCard.pick').forEach(b => b.onclick = () => { const r = togglePick(party, b.dataset.cls, cands); if (r.msg) { Snd.play('error'); banner(r.msg, '#ffb06a', 1100); return; } Snd.play('select'); savePick(r.pick); renderSpire(p, h); }); }
// 지난 주 기록 보상 (T-9): 받지 않은 주마다 한 줄 · 받기 → 우편함
function weekRwHtml() { const U = ranked() ? SS.SPS.unclaimed : []; if (!U.length) return '';
  return `<div class="spWkRw" id="spWkRw">${U.slice(0, 2).map(x => `<div class="spWk"><span class="spWkT">📅 <b>${esc(x.week.slice(5).replace('-', '/'))}</b> 주 · 최고 <b>${x.best}층</b>${x.rank ? ` · 주간 ${x.rank}위` : ''}</span><span class="spWkR">영혼석 ${x.souls}${x.medals ? ` · 🏅 ${x.medals}` : ''}${x.title ? ` · 칭호 ${esc(SP_TITLES[x.title] || x.title)}` : ''}</span><button class="gbtn sm main spWkBtn" data-week="${esc(x.week)}">받기</button></div>`).join('')}</div>`; }
async function claimWeek(p, b) { if (b.disabled) return; b.disabled = true; b.textContent = '받는 중…'; const r = await SS.spClaimWeek(b.dataset.week); G.spClaim = r;
  if (r.ok) { Snd.play('confirm'); banner(`📮 주간 보상 (영혼석 ${r.souls}${r.medals ? ` · 🏅 메달 ${r.medals}` : ''}) 을 우편함으로 보냈어요${r.title ? ` · 칭호 ${SP_TITLES[r.title] || r.title}` : ''}`, '#ffd27a', 2600); Sh.refresh().catch(() => {}); await SS.spStatus(); }
  else { Snd.play('error'); banner(r.msg, '#ffb06a', 2200); }
  if (H && H.isOpen() && H.view() === 'spire' && sub === 'main') renderSpire(p, H); }
function paintGo() { const b = $('spGo'); if (!b || departing) return; const none = ranked() && SS.SPS.left === 0; b.disabled = none; b.textContent = none ? '오늘 도전 끝 (0시 초기화)' : `🗼 ${curFrom()}층부터 오르기`; }
function renderRank(p) { const h = H, R = rank, me = R && R.ok && R.me;
  const rows = !Acc.A.user ? '<div class="spRkMsg">로그인하면 랭킹을 볼 수 있어요.</div>' : !R ? '<div class="spRkMsg dim">불러오는 중…</div>' : !R.ok ? `<div class="spRkMsg dgUpd">⚠ ${esc(R.msg)}</div>`
    : R.top.length ? R.top.map(x => `<div class="spRk${x.me ? ' me' : ''}"><b class="spRkN">${x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : x.rank}</b><span class="spRkNick">${esc(x.nick)}${x.me ? ' (나)' : ''}</span><span class="spRkF">${x.floor}층</span></div>`).join('') : '<div class="spRkMsg dim">아직 기록이 없어요 — 첫 번째로 올라 보세요!</div>';
  p.innerHTML = `<button id="dgClose" class="gbtn sm xbtn ui-x">✕</button><div class="gtitle">🏆 무한의 탑 랭킹</div>${h.tabs('spire')}
    <div class="ftabs spRkTabs"><button class="ftab${rankKind === 'week' ? ' on' : ''}" data-k="week">이번 주</button><button class="ftab${rankKind === 'all' ? ' on' : ''}" data-k="all">전체</button></div>
    <div class="labSub">${rankKind === 'week' ? `주간 (${esc(weekKey())} 월요일부터, 한국 시간) — 1위 ${esc(SP_TITLES.spire_w1)} · 2~10위 ${esc(SP_TITLES.spire_w10)} 칭호` : '전체 최고 층'} · 같은 층이면 먼저 도달한 순서</div>
    <div class="spRkList" id="spRkList">${rows}</div>
    <div class="spRkMe" id="spRkMe">${me ? `내 순위 <b>${me.rank}위</b> · ${me.floor}층` : Acc.A.user && R && R.ok ? '내 기록 없음' : ''}</div>
    <div class="dgGo"><button id="spRkBack" class="gbtn">← 탑으로</button></div>`;
  h.wire(p); $('spRkBack').onclick = () => { Snd.play('ui'); sub = 'main'; renderSpire(p, h); };
  p.querySelectorAll('.spRkTabs .ftab').forEach(b => b.onclick = () => { if (rankKind === b.dataset.k) return; Snd.play('ui'); rankKind = b.dataset.k; rank = null; renderRank(p); loadRank(p); }); }
async function loadRank(p) { const k = rankKind; const r = await SS.spRank(k); if (k !== rankKind || sub !== 'rank' || !H || !H.isOpen()) return; rank = r; G.spRank = r; renderRank(p); }
export const resetSpireView = () => { sub = 'main'; rank = null; };
export function refreshSpire(p) { if (!H || !H.isOpen() || H.view() !== 'spire') return; if (sub === 'rank') return; renderSpire(p, H); }
// 출발: 로그인 계정은 서버 도전 등록(하루 30회 · 시작 층 검사) 성공 때 정식, 게스트·서버 업데이트 전·오프라인은 연습. 상한·정지·잘못된 시작층은 막음
async function depart() { if (departing) return; departing = true; const b = $('spGo'); if (b) { b.disabled = true; b.textContent = '입장 확인 중…'; }
  const f = curFrom(), r = await SS.spStart(f); G.spEntry = r;
  if (r.blocked) { departing = false; Snd.play('error'); banner(r.msg, '#ffb06a', 2600); paintGo(); return; }
  if (r.mode === 'practice') SS.markPractice(r.why, r.from);
  Snd.play('meteorCast', { force: true }); Snd.play('confirm'); $('fade').classList.add('on');
  go({ spire: r.from || f }, 500); }
