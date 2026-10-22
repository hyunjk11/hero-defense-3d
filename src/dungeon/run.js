// ================= 던전 원정 (파티 던전) 판 진행: 출정 · 층/웨이브 · 역할 AI · 초상화 바 · 결과 =================
// 진입: 마을 던전 건물 → ui/dungeon.js → ?dungeon=1&run=1 새로고침 → ui/flow.js startFlow → startDungeonRun
// 일반 스테이지·하드·도전 모드에서는 G.dungeon 이 없어 이 파일의 어떤 것도 동작하지 않음
import * as THREE from 'three';
import { Snd } from '../audio/audio.js';
import { $ } from '../core/util.js';
import { G } from '../core/state.js';
import { CORE, tileX, tileZ } from '../core/grid.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import { FLOORS, ROLE, DG_REWARD, dungeonParty, waveList } from '../data/dungeon.js';
import * as AD from '../data/advance.js';
import * as E from '../account/equip.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';
import { partyWiped } from '../core/party.js';
import { rolePlan } from './logic.js';
import { cam } from '../render/scene.js';
import { MON_ASSETS, ensureModels, heroAssets, loadModel } from '../render/characters.js';
import { core } from '../world/terrain.js';
import { spawnEnemy } from '../monsters/enemy.js';
import { pendingSpawns } from '../monsters/abilities.js';
import { heroGoTo, setControlled, spawnHero, stat } from '../heroes/hero.js';
import { castSkill } from '../heroes/skills.js';
import { choose, showSelect } from '../ui/select.js';
import { banner } from '../ui/hud.js';

const D = G.dg = { floor: 0, wave: -1, q: [], spawnT: 0, gapT: 2.5, over: false, kills: 0, t: 0, swap: false, party: [] };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 영웅별 출정 정보 (일반 출정 ui/flow.js startStageRun2 와 같은 계산)
export const loadoutOf = (s, c) => ({ perm: s.heroLv[c], equip: E.bonus(s, c), legend: E.legendOf(s, c), adv: AD.advOf(c, (s.adv || {})[c]), uq: E.uniquesOf(s, c) });

export async function startDungeonRun() {
  $('loadTxt').textContent = '파티 확인 중…'; $('loading').classList.remove('hidden');
  await Sh.verifyOwned(); // 로즈: 서버 소유 기록(hd3d_owned)만 믿음 — 저장 데이터의 영웅 값은 쓰지 않음
  const s = Acc.load(), party = dungeonParty(c => Sh.heroOwned(c)), L = Object.fromEntries(party.map(c => [c, loadoutOf(s, c)]));
  const need = [...MON_ASSETS, ...party.flatMap(c => heroAssets(c, true))], opt = party.flatMap(c => AD.advModels(L[c].adv));
  $('loadTxt').textContent = '모델 불러오는 중…'; await ensureModels(need); for (const k of opt) await loadModel(k).catch(e => { console.warn('adv model', k, e); G.advModelFail = true; });
  $('loading').classList.add('hidden');
  Object.assign(G, { dungeon: true, gold: 0, grow: false, research: null, runDrops: [], runBossKills: [], stage: null, hard: false, eliteKills: 0, runStart: performance.now() });
  document.body.classList.add('dungeonRun'); core.visible = false;
  showSelect(); $('select').classList.add('hidden'); Object.assign(G, L[party[0]]); choose(party[0]); // 첫 영웅(세라) = 조작 영웅
  for (const c of party.slice(1)) spawnHero(c, L[c], true);
  const off = [[0, 0], [-2.2, 1.8], [-2.2, -1.8], [-4, 0]]; G.heroes.forEach((h, i) => { h.g.position.set(tileX(CORE[0]) + off[i][0], 0, tileZ(CORE[1]) + off[i][1]); h.face = -Math.PI / 2; });
  setControlled(G.heroes[0]); D.party = party; G.partyAI = partyAI; G.onHeroDown = () => { D.swap = true; };
  G.phase = 'wave'; G.nightTarget = .55; G.wave = 0; cam.target.set(0, 0, 1); cam.r = 50; cam.phi = .95; cam.theta = 0;
  buildHud(); nextWave(); banner(`⚔ 던전 원정 · ${FLOORS[D.floor].n}`, '#c8a8ff', 2600);
}

// ---------- 층 진행 (main.js step 에서, 일시정지·배속 그대로) ----------
export function updDungeon(dt) {
  if (!G.dungeon || D.over) return; D.t += dt; const F = FLOORS[D.floor];
  if (D.swap) { D.swap = false; if (G.hero.dead > 0) { const n = G.heroes.find(h => h.dead <= 0); if (n) { setControlled(n); banner(`${CLASSES[n.cls].nm} 조작`, '#ffe066', 900); } } }
  if (partyWiped(G.heroes)) return finish(false);
  if (D.q.length) { D.spawnT -= dt; if (D.spawnT <= 0) { D.spawnT = F.every; spawnEnemy(D.q.shift(), F.hpMul); } }
  else if (!G.enemies.some(e => !e.dead) && !pendingSpawns()) { if (D.wave >= F.waves.length - 1) return finish(true); D.gapT -= dt; if (D.gapT <= 0) nextWave(); }
  D.hudT = (D.hudT || 0) - dt; if (D.hudT <= 0) { D.hudT = .15; refreshBar(); }
}
function nextWave() { const F = FLOORS[D.floor]; G.dgDmg = F.dmgMul || 1; D.wave++; G.wave = D.wave + 1; D.q = waveList(D.floor, D.wave); D.spawnT = .6; D.gapT = F.gap; Snd.horn(); if (D.wave > 0) banner(`웨이브 ${D.wave + 1} / ${F.waves.length}`, '#ffd27a', 1400); }

// ---------- 역할 AI (조작하지 않는 영웅, hero.js updParty 가 그 영웅 문맥으로 호출) ----------
const _v = new THREE.Vector3(), pos = o => ({ x: o.g.position.x, z: o.g.position.z });
function partyAI(h, dt) {
  h.aiT = (h.aiT || 0) - dt; if (h.aiT > 0) return; h.aiT = .3 + G.heroes.indexOf(h) * .04;
  const role = ROLE[h.cls] || 'ranged', En = G.enemies.filter(e => !e.dead && e.dying === undefined && !(e.immT > G.t) && e.state !== 'spawn');
  const tank = G.heroes.find(x => x !== h && x.dead <= 0 && ROLE[x.cls] === 'tank'), lead = G.hero !== h && G.hero.dead <= 0 ? pos(G.hero) : null;
  const busy = h.spinT > 0 || h.roseT > 0 || h.snipeT > 0 || h.leap || (h.mech && h.mech.busy > 0);
  const P = rolePlan(role, { ...pos(h), range: stat.range(), skillReady: h.skillCd <= 0 && !busy }, { lead, tank: tank ? pos(tank) : null, enemies: En.map(pos), backs: G.heroes.filter(x => x !== h && x.dead <= 0 && ROLE[x.cls] !== 'tank').map(pos) });
  h.aiTgt = P.focus !== null && P.focus !== undefined ? En[P.focus] : null;
  if (P.move) { const g0 = h.aiGoal; if (!g0 || Math.hypot(g0.x - P.move.x, g0.z - P.move.z) > 1.2 || !h.path.length) { heroGoTo(_v.set(P.move.x, 0, P.move.z)); h.aiGoal = P.move; } }
  else if (role !== 'tank' && En.length && h.path.length) { h.path = []; h.aiGoal = null; } // 사거리 안: 멈춰서 사격
  if (P.skill && !busy && h.skillCd <= 0) { castSkill(new THREE.Vector3(P.skill.x, 0, P.skill.z)); G.dgAiSkills = (G.dgAiSkills || 0) + 1; }
}

// ---------- HUD: 층 표시 + 초상화 바 ----------
function buildHud() {
  let top = $('dgTop'); if (!top) { top = document.createElement('div'); top.id = 'dgTop'; $('top').appendChild(top); }
  top.className = 'pill dgTop'; top.innerHTML = `<span class="lbl">⚔ 던전</span><b id="dgFloor"></b><button id="dgGiveUp" class="dgGiveUp" title="원정 포기">🏳 포기</button>`;
  $('dgGiveUp').onclick = e => { e.stopPropagation(); if (D.over) return; if (!confirm('원정을 포기하고 마을로 돌아갈까요? (보상 없음)')) return; D.over = true; goTownD(); };
  let bar = $('dgBar'); if (!bar) { bar = document.createElement('div'); bar.id = 'dgBar'; $('hud').appendChild(bar); }
  bar.innerHTML = G.heroes.map((h, i) => { const C = CLASSES[h.cls], A = h.adv; return `<button class="dgP" data-i="${i}" style="--hc:#${C.color.toString(16).padStart(6, '0')}" title="${esc(heroLabel(h.cls))} (${i + 1})"><span class="dgIc">${C.icon}</span><span class="dgNm">${esc(C.nm)}${A ? `<i style="color:${A.c}">${A.icon}</i>` : ''}</span><span class="dgHp"><u></u></span><span class="dgSk"></span><span class="dgKey">${i + 1}</span></button>`; }).join('');
  bar.querySelectorAll('.dgP').forEach(b => { b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); pick(+b.dataset.i); }; });
  refreshBar();
}
function pick(i) { const h = G.heroes[i]; if (!h || D.over || G.paused) return; if (h.dead > 0) { Snd.play('error'); banner(`${CLASSES[h.cls].nm} 쓰러짐 — 조작할 수 없어요`, '#ff8a9a', 900); return; }
  if (h === G.hero) return; Snd.play('ui'); setControlled(h); h.aiGoal = null; h.aiTgt = null; refreshBar(); }
G.dgPick = pick;
addEventListener('keydown', e => { if (!G.dungeon || G.paused || e.repeat || !(e.key >= '1' && e.key <= '4')) return; pick(+e.key - 1); });
function refreshBar() { const F = FLOORS[D.floor], fl = $('dgFloor'); if (fl) fl.textContent = `${F.n} · 웨이브 ${Math.max(1, D.wave + 1)}/${F.waves.length}`;
  document.querySelectorAll('#dgBar .dgP').forEach(b => { const h = G.heroes[+b.dataset.i]; if (!h) return; b.classList.toggle('ctl', h === G.hero); b.classList.toggle('down', h.dead > 0);
    const w = Math.max(0, h.hp / h.max) * 100 + '%', u = b.querySelector('.dgHp u'); if (u.style.width !== w) u.style.width = w; b.querySelector('.dgSk').classList.toggle('ready', h.skillCd <= 0 && h.dead <= 0); }); }

// ---------- 결과 ----------
function finish(win) { if (D.over) return; D.over = true; G.phase = 'over'; G.paused = false; let got = 0;
  if (win) { got = DG_REWARD.souls; Acc.update(d => ({ ...d, souls: (d.souls || 0) + got })); Acc.flush(); Snd.setMusic('none'); Snd.play('victory', { force: true, exact: true }); }
  else { Snd.setMusic('none'); Snd.play('error', { force: true }); }
  const sec = Math.round(D.t), el = $('stageClear'), alive = G.heroes.filter(h => h.dead <= 0).length;
  el.innerHTML = `<div class="scBox dgRes ${win ? 'win' : 'lose'}"><div class="scT">${win ? '⚔ 던전 1층 돌파!' : '💀 원정 실패'}</div><div class="scS">${esc(FLOORS[D.floor].n)} · ${win ? `생존 ${alive}/${G.heroes.length}` : '파티 전멸'} · ${Math.floor(sec / 60)}분 ${sec % 60}초</div>
    <div class="dgResParty">${G.heroes.map(h => `<span class="${h.dead > 0 ? 'down' : ''}">${CLASSES[h.cls].icon} ${esc(CLASSES[h.cls].nm)}</span>`).join('')}</div>
    <div class="scRw">${win ? `보상: 영혼석 <b>+${got}</b><br><small>던전 메달·던전 상점은 준비 중이에요 (임시 보상)</small>` : '다시 도전해 보세요! 세라가 앞에서 버티는 동안 뒤에서 공격하세요.'}</div><button class="gbtn main" id="dgTown">🏠 마을로 귀환</button></div>`;
  el.classList.remove('hidden'); $('dgTown').onclick = () => { Snd.play('confirm'); goTownD(); }; G.dgResult = { win, got, sec, alive };
}
function goTownD() { $('fade').classList.add('on'); const q = new URLSearchParams(location.search); q.set('town', '1'); q.delete('dungeon'); q.delete('run'); q.delete('stage'); q.delete('hard'); setTimeout(() => location.replace(location.pathname + '?' + q.toString()), 400); }
export { finish as dgFinish };
