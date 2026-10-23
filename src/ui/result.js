// ================= 판 결과: 스테이지 클리어 화면 · 패배/귀환 보상 저장 · 마을 귀환 (C-9, ui/flow.js 에서 이동 — 동작 불변) =================
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { go } from '../core/nav.js';
import { G } from '../core/state.js';
import * as Acc from '../account/account.js';
import * as P from '../account/progress.js';
import * as E from '../account/equip.js';
import * as ST from '../data/stages.js';
import { STAGE } from '../core/grid.js';
// 재도전·다음 스테이지 출정은 flow.js 의 departStage (출정 중복 방지 상태 공유) — initResult 로 받음
let H = { departStage: () => {} };
export function initResult(h) { H = h; }
// 출정 시 장비 보너스 배너: 큰 값 3개만 + '외 N개' (전부 나열하면 화면 밖으로 넘쳤음)
export function equipLine(eq) { const e = Object.entries(eq || {}).sort((a, b) => b[1] - a[1]); if (!e.length) return ''; return '⚔ 장비 · ' + e.slice(0, 3).map(([k, v]) => `${E.STAT[k]} +${v}%`).join(' · ') + (e.length > 3 ? ` 외 ${e.length - 3}개` : ''); }
G.onStageClear = () => {
  if (G.runSaved) return; G.runSaved = true; G.phase = 'over'; const wave = G.wave, kills = sumKills(), stars = ST.starsFor(G.coreHp, G.coreMax); let got = 0, loot = [], info = null, best = false;
  Acc.update(d => { const hard = !!G.hard, [n, g, l] = P.applyRun(d, { wave, kills, drops: G.runDrops || [], hero: G.hero ? G.hero.cls : undefined, stage: true, ch: STAGE.ch, bossKills: G.runBossKills || [], hard }); let [n2, inf] = P.applyStage(n, STAGE.id, stars, G.hero ? G.hero.cls : undefined, Math.random, hard, G.eliteKills || 0); if (!inf) [n2, inf] = P.applyStage(n, STAGE.id, stars, G.hero ? G.hero.cls : undefined); /* 하드가 (다른 탭 등으로) 잠겨 있으면 노말 기록으로 */ got = g; loot = [...l, ...inf.loot]; info = inf; return n2; }); Acc.flush();
  sessionStorage.setItem('hd3d_lastRun', JSON.stringify({ reason: 'clear', wave, kills, got: got + info.souls, best: false, loot, stage: STAGE.id, stars, first: info.first, unlocked: info.unlocked, hard: !!G.hard, hardOpen: info.hardOpen || 0 }));
  Snd.setMusic('none'); Snd.play('victory', { force: true, exact: true }); Snd.play('levelUp', { force: true, delay: .4 });
  const sv = Acc.load(), nx = ST.nextStage(sv, STAGE.id, !!G.hard); // Q-6: 다음 스테이지 (하드 판이면 하드 다음 칸)
  const el = $('stageClear'); el.innerHTML = `<div class="scBox"><div class="scT">${G.hard ? '<span class="hardTag">하드</span> ' : ''}스테이지 클리어!</div><div class="scS">${STAGE.no} · ${STAGE.n}</div><div class="scStars">${[0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${.35 + i * .35}s">★</i>`).join('')}</div>
    <div class="scConds">${ST.STAR_D.map((d, i) => `<div class="${i < stars ? 'got' : ''}">${i < stars ? '★' : '☆'} ${d}</div>`).join('')}</div>
    <div class="scRw">영혼석 <b>+${got + info.souls}</b>${loot.filter(x => x.chest).length ? ` · 장비 <b>${loot.filter(x => x.chest).length}</b>개` : ''}${lootLines(loot.filter(x => x.it && x.it.uq || x.src === 'essence'))}${info.eliteSouls ? `<br><span class="hardTxt">정예 처치 보너스 영혼석 +${info.eliteSouls}</span>` : ''}${info.unlocked.length ? `<br>🔓 새 ${info.hard ? '하드 ' : ''}스테이지 해금: ${info.unlocked.map(ST.stageNo).join(', ')}` : ''}${info.hardOpen ? `<br><span class="hardTxt">🔥 ${ST.CHAPTERS.find(c => c.id === info.hardOpen).short} 하드 모드가 열렸어요!</span>` : ''}</div><div class="scBtns"><button class="gbtn" id="scRetry" title="같은 스테이지 다시">🔁 재도전</button>${nx ? `<button class="gbtn" id="scNext" title="${ST.stageNo(nx)} ${ST.STAGES[nx].n}">▶ 다음 스테이지</button>` : ''}<button class="gbtn main" id="scTown">🏠 마을로 귀환</button></div></div>`;
  el.classList.remove('hidden'); [0, 1, 2].forEach(i => i < stars && setTimeout(() => Snd.play('coin', { force: true, rate: 1 + i * .2 }), 400 + i * 350)); $('scTown').onclick = () => { Snd.play('confirm'); goTown(); };
  $('scRetry').onclick = () => H.departStage(STAGE.id, !!G.hard); if (nx) $('scNext').onclick = () => H.departStage(nx, !!G.hard);
  if (G.endStatsShow) G.endStatsShow('clear'); // 📊 통계 버튼 (ui/endstats.js)
};
export function lootLines(L) { const ch = L.filter(x => x.chest), uq = L.filter(x => x.it && x.it.uq && !x.dup), dup = L.filter(x => x.dup), ess = L.reduce((a, x) => a + (x.src === 'essence' ? x.essence : 0), 0);
  return (ch.length ? `<br>획득 보상 상자 <b>${ch.length}</b>개 <small>(🎁 상자 보관함)</small>` : '') + uq.map(x => `<br><span class="uqTxt">◆ 고유 획득: ${x.it.n}</span>`).join('')
    + dup.map(x => `<br><span class="uqTxt dup">◆ ${x.it.n} — 이미 보유 → 고유 정수 ×${x.y.essence} · 마력석 ${x.y.crystal} · 영혼석 ${x.y.souls}</span>`).join('') + (ess ? `<br><span class="uqTxt">◆ 고유 정수 +${ess}</span>` : ''); }
const sumKills = () => Object.values(G.stats.kills || {}).reduce((a, b) => a + b, 0);
// 판 종료(패배/귀환) → 보상 저장 후 마을로
export function onRunEnd(reason) {
  if (G.runSaved) return; G.runSaved = true; const wave = G.wave, kills = sumKills(); let got = 0, best = false, loot = [];
  Acc.update(d => { best = !STAGE && wave > d.bestWave; const [n, g, l] = P.applyRun(d, { wave, kills, drops: G.runDrops || [], hero: G.hero ? G.hero.cls : undefined, stage: !!STAGE, ch: STAGE ? STAGE.ch : 'open', bossKills: G.runBossKills || [], hard: !!(STAGE && G.hard) }); got = g; loot = l; return n; }); Acc.flush();
  sessionStorage.setItem('hd3d_lastRun', JSON.stringify({ reason, wave, kills, got, best, loot, stage: STAGE ? STAGE.id : undefined, hard: !!(STAGE && G.hard) }));
  const btn = $('overTown'); if (btn) { btn.classList.remove('hidden'); $('overReward').innerHTML = `획득 영혼석 <b>+${got}</b>${loot.filter(x => x.chest).length ? ` · 장비 <b>${loot.filter(x => x.chest).length}</b>개` : ''}${lootLines(loot.filter(x => x.it && x.it.uq || x.src === 'essence'))}`; }
  if (reason === 'retreat') goTown();
}
export function goTown() { $('fade').classList.add('on'); go({ town: 1 }, 400); }
