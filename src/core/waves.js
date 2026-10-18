import { Snd } from '../audio/audio.js';
import { $, rand } from './util.js';
import { G } from './state.js';
import { play } from '../render/characters.js';
import { computeDist } from '../world/pathfinding.js';
import { hero } from '../heroes/hero.js';
import { banner, setPhaseUI } from '../ui/hud.js';
import { select } from '../ui/input.js';

function gameOver() { if (G.phase === 'over') return; G.phase = 'over'; Snd.setMusic('none'); Snd.play('gameOver', { force: true, exact: true }); Snd.play('breakRock', { force: true }); Snd.play('glass', { force: true }); $('over').classList.remove('hidden'); $('overTxt').textContent = `웨이브 ${G.wave}에서 코어가 파괴되었습니다 · 최고 기록 ${Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)}`; }

// ================= 웨이브 =================
function startWave() {
  if (G.phase !== 'build') return; G.wave++; G.phase = 'wave'; G.nightTarget = 1; select(null);
  const n = G.wave, boss = n % 5 === 0, hpMul = Math.pow(1.16, n - 1), q = [], count = 8 + n * 3;
  for (let i = 0; i < count; i++) { let t = 'grunt'; const r = rand(); if (r < .32) t = 'imp'; else if (n >= 3 && r > .86) t = 'golem'; else if (n >= 4 && r > .73 && r <= .86) t = 'bat'; q.push(t); }
  if (boss) q.splice(Math.floor(count / 2), 0, 'boss');
  G.spawnQ = q; G.spawnT = 1; G.hpMul = hpMul; Snd.horn(); Snd.duck(.4, 2.2); banner(boss ? `웨이브 ${n} · 보스 웨이브!` : `웨이브 ${n}`, boss ? '#ff5a6a' : '#ffffff'); setPhaseUI();
}
function endWave() {
  G.phase = 'build'; G.nightTarget = 0; const bonus = 25 + G.wave * 6; G.gold += bonus; G.stats.goldEarned += bonus; Snd.play('waveClear', { force: true, exact: true }); Snd.play('coins', { delay: .3 }); Snd.duck(.4, 1.6); banner(`웨이브 ${G.wave} 클리어! +${bonus}G`, '#ffe066');
  if (hero && hero.dead <= 0) { hero.hp = hero.max; play(hero.ch, 'Cheer', { once: true }); hero.atkT = 1.5; } computeDist(); setPhaseUI();
  try { localStorage.setItem('hd3d_best', Math.max(G.wave, +localStorage.getItem('hd3d_best') || 0)); } catch (e) {}
}

export { gameOver, startWave, endWave };
