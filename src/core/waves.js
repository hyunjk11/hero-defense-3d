import { Snd } from '../audio/audio.js';
import { $, QS, rand } from './util.js';
import { ETYPES, NEW_TYPES, NEW_WEIGHT, newShare } from '../data/monsters.js';
import { G } from './state.js';
import { play } from '../render/characters.js';
import { computeDist } from '../world/pathfinding.js';
import { hero } from '../heroes/hero.js';
import { banner, setPhaseUI, showNote } from '../ui/hud.js';
import { select } from '../ui/input.js';
import { STAGE } from './grid.js';

function gameOver() { if (G.phase === 'over') return; G.phase = 'over'; if (G.onRunEnd) setTimeout(() => G.onRunEnd('defeat'), 0); Snd.setMusic('none'); Snd.play('gameOver', { force: true, exact: true }); Snd.play('breakRock', { force: true }); Snd.play('glass', { force: true }); $('over').classList.remove('hidden'); $('overTxt').textContent = STAGE ? `스테이지 ${STAGE.id} · 웨이브 ${G.wave}/${STAGE.waves}에서 코어가 파괴되었습니다` : `웨이브 ${G.wave}에서 코어가 파괴되었습니다 · 최고 기록 ${Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)}`; }

// ================= 웨이브 =================
function startWave() {
  if (G.phase !== 'build') return; G.wave++; G.phase = 'wave'; G.nightTarget = 1; select(null);
  const n = G.wave, boss = n % 5 === 0, hpMul = Math.pow(1.16, n - 1), q = [], count = 8 + n * 3;
  for (let i = 0; i < count; i++) { let t = 'grunt'; const r = rand(); if (r < .32) t = 'imp'; else if (n >= 3 && r > .86) t = 'golem'; else if (n >= 4 && r > .73 && r <= .86) t = 'bat'; q.push(t); }
  const intro = G.classic ? [] : mixNewTypes(q, n);
  if (STAGE) { // 챕터 특색: 숲 = 굴착병, 설원 = 돌격병 많이. 스테이지 마지막 웨이브 = 보스
    const bias = STAGE.ch === 1 ? ['digger', 2, .22] : STAGE.ch === 2 ? ['charger', 3, .2] : null;
    if (bias && n >= bias[1]) for (let i = 0; i < q.length; i++) if (q[i] === 'grunt' && rand() < bias[2]) q[i] = bias[0];
    if (n === STAGE.waves && !boss) q.splice(Math.floor(count / 2), 0, 'boss'); if (STAGE.boss && n === STAGE.waves) q.push('boss');
  }
  if (boss) q.splice(Math.floor(count / 2), 0, 'boss');
  G.spawnQ = q; G.spawnT = 1; G.hpMul = hpMul * (STAGE ? STAGE.hp : 1); Snd.horn(); Snd.duck(.4, 2.2); banner(STAGE && n === STAGE.waves ? `최종 웨이브 ${n}/${STAGE.waves} · ${STAGE.boss ? '챕터 보스 출현!' : '보스 웨이브!'}` : STAGE ? `웨이브 ${n}/${STAGE.waves}${boss ? ' · 보스 웨이브!' : ''}` : boss ? `웨이브 ${n} · 보스 웨이브!` : intro.length ? `웨이브 ${n} · 신규: ${intro.map(t => ETYPES[t].n).join(', ')}` : `웨이브 ${n}`, boss ? '#ff5a6a' : intro.length ? '#ffd27a' : '#ffffff', intro.length ? 2400 : undefined);
  if (intro.length) showNote(intro.map(t => ({ name: ETYPES[t].n, desc: ETYPES[t].desc, type: t }))); setPhaseUI();
}
// 신규 몬스터 섞기 (classic 모드에서는 호출하지 않음 → 기존 난수열/밸런스 그대로).
// 기존 추첨이 끝난 뒤 추가 난수만 사용. 처음 등장하는 웨이브에는 최소 2마리 보장.
function mixNewTypes(q, n) {
  const avail = NEW_TYPES.filter(t => n >= ETYPES[t].from); if (!avail.length) return [];
  const wsum = avail.reduce((a, t) => a + NEW_WEIGHT[t], 0), share = newShare(n);
  const pick = () => { let x = rand() * wsum; for (const t of avail) { x -= NEW_WEIGHT[t]; if (x <= 0) return t; } return avail[avail.length - 1]; };
  for (let i = 0; i < q.length; i++) if (q[i] !== 'bat' && rand() < share) q[i] = pick();
  const intro = avail.filter(t => ETYPES[t].from === n);
  for (const t of intro) { let have = q.filter(x => x === t).length; for (let i = 2; have < 2 && i < q.length; i += 3) if (q[i] === 'grunt' || q[i] === 'imp') { q[i] = t; have++; } }
  return intro;
}
function endWave() {
  G.phase = 'build'; G.nightTarget = 0; const bonus = 25 + G.wave * 6; G.gold += bonus; G.stats.goldEarned += bonus; Snd.play('waveClear', { force: true, exact: true }); Snd.play('coins', { delay: .3 }); Snd.duck(.4, 1.6); banner(`웨이브 ${G.wave} 클리어! +${bonus}G`, '#ffe066');
  if (hero && hero.dead <= 0) { hero.hp = hero.max; play(hero.ch, 'Cheer', { once: true }); hero.atkT = 1.5; } computeDist(); setPhaseUI();
  if (STAGE && G.wave >= STAGE.waves && G.onStageClear) { G.onStageClear(); return; }
  try { localStorage.setItem('hd3d_best', Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)); } catch (e) {}
}

export { gameOver, startWave, endWave };
