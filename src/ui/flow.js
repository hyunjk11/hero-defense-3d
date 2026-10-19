// ================= 화면 흐름: 인트로 → 로그인 → 메인 메뉴 → 마을 → 출정(기존 디펜스) → 마을 귀환 =================
import { Snd } from '../audio/audio.js';
import * as THREE from 'three';
import { $, QS } from '../core/util.js';
import { CLASSES } from '../data/heroes.js';
import { G } from '../core/state.js';
import { cam, camera, scene, renderer } from '../render/scene.js';
import { mk, toon, glow } from '../render/toon.js';
import { makeHeroModel, play } from '../render/characters.js';
import { showSelect, choose } from './select.js';
import * as Acc from '../account/account.js';
import * as P from '../account/progress.js';
import { labels as TL, buildTown as buildTownScene, updTown, townPass, LAKE, LR, PORTAL, tower } from '../world/town.js';
let smithNear = false, portalNear = false;
import { sun } from '../render/scene.js';
import * as E from '../account/equip.js';
import { initGear, openInv, closeInv, openSmith, closeSmith, smithOpen, refreshGear, reveal, revealing, doEnhance, lastEnh, bonusHtml, heroDots } from './gear.js';
import { banner } from './hud.js';
import { smith, SMITH } from '../world/town.js';
import { initStageSel, openStageSel, closeStageSel, stageOpen } from './stagesel.js';
import * as ST from '../data/stages.js';
import { STAGE } from '../core/grid.js';
import { initLab, openLab, closeLab, labOpen, renderLab } from './lab.js';
import { lab, LAB, labFront } from '../world/town.js';
let labNear = false;

const TOWN_Z = -150, TOWN = new THREE.Vector3(0, 0, TOWN_Z), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCREENS = ['intro', 'login', 'menu', 'town'];
let town = null, th = null, tKeys = {}, labels = [], portalPos = null, departing = false, toast = 0;
function show(id) { for (const s of SCREENS) $('scr_' + s).classList.toggle('hidden', s !== id); G.screen = id; G.screenMusic = id === 'intro' ? 'wave' : 'build'; }
function hideAll() { for (const s of SCREENS) $('scr_' + s).classList.add('hidden'); G.screen = null; G.screenMusic = null; }
const heroN = c => CLASSES[c].n;

// ---------- 스테이지 ----------
function departStage(id) { if (departing) return; departing = true; Snd.play('meteorCast', { force: true }); Snd.play('confirm'); $('fade').classList.add('on');
  const q = new URLSearchParams(location.search); q.delete('town'); q.set('stage', id); q.set('run', '1'); setTimeout(() => location.replace(location.pathname + '?' + q.toString()), 500); }
function startStageRun() {
  const s = Acc.load(); Acc.autoLogin().catch(() => {}); showSelect(); $('select').classList.add('hidden'); hideAll();
  G.perm = s.heroLv[s.hero]; G.equip = E.bonus(s, s.hero); G.legend = E.legendOf(s, s.hero); G.grow = true; G.research = s.research; G.runDrops = []; G.runStart = performance.now(); G.stage = STAGE; G.phase = 'select'; choose(s.hero); $('retreat').classList.remove('hidden');
  const C = ST.CHAPTERS.find(c => c.id === STAGE.ch); setTimeout(() => banner(`${STAGE.id} ${STAGE.n} · 웨이브 ${STAGE.waves} · ${C.propN}`, C.color, 3200), 500);
  const bt = Object.entries(G.equip).map(([k, v]) => `${E.STAT[k]} +${v}%`).join(' · '); if (bt) setTimeout(() => banner(`⚔ 장비 보너스: ${bt}`, '#ffe08a', 3000), 3900);
}
G.onStageClear = () => {
  if (G.runSaved) return; G.runSaved = true; G.phase = 'over'; const wave = G.wave, kills = sumKills(), stars = ST.starsFor(G.coreHp, G.coreMax); let got = 0, loot = [], info = null, best = false;
  Acc.update(d => { const [n, g, l] = P.applyRun(d, { wave, kills, drops: G.runDrops || [], hero: G.hero ? G.hero.cls : undefined, stage: true }); const [n2, inf] = P.applyStage(n, STAGE.id, stars, G.hero ? G.hero.cls : undefined); got = g; loot = [...l, ...inf.loot]; info = inf; return n2; }); Acc.flush();
  sessionStorage.setItem('hd3d_lastRun', JSON.stringify({ reason: 'clear', wave, kills, got: got + info.souls, best: false, loot, stage: STAGE.id, stars, first: info.first, unlocked: info.unlocked }));
  Snd.setMusic('none'); Snd.play('victory', { force: true, exact: true }); Snd.play('levelUp', { force: true, delay: .4 });
  const el = $('stageClear'); el.innerHTML = `<div class="scBox"><div class="scT">스테이지 클리어!</div><div class="scS">${STAGE.id} · ${STAGE.n}</div><div class="scStars">${[0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${.35 + i * .35}s">★</i>`).join('')}</div>
    <div class="scConds">${ST.STAR_D.map((d, i) => `<div class="${i < stars ? 'got' : ''}">${i < stars ? '★' : '☆'} ${d}</div>`).join('')}</div>
    <div class="scRw">영혼석 <b>+${got + info.souls}</b>${loot.length ? ` · 장비 <b>${loot.length}</b>개` : ''}${info.unlocked.length ? `<br>🔓 새 스테이지 해금: ${info.unlocked.join(', ')}` : ''}</div><button class="gbtn main" id="scTown">🏠 마을로 귀환</button></div>`;
  el.classList.remove('hidden'); [0, 1, 2].forEach(i => i < stars && setTimeout(() => Snd.play('coin', { force: true, rate: 1 + i * .2 }), 400 + i * 350)); $('scTown').onclick = () => { Snd.play('confirm'); goTown(); };
};
// ---------- 시작 ----------
export function startFlow() {
  const s = Acc.load(); if (s.settings.audio) { Object.assign(Snd.cfg, s.settings.audio); Snd.apply(); }
  const save0 = Snd.save.bind(Snd); Snd.save = () => { save0(); Acc.update(d => ({ ...d, settings: { ...d.settings, audio: { ...Snd.cfg } } })); };
  G.onRunEnd = onRunEnd; Acc.onChange(() => { refreshMenu(); refreshTown(); refreshLogin(); });
  bindUI();
  if (STAGE && QS.has('run')) { startStageRun(); return; } // 스테이지 출정 (원정 지도에서 새로고침으로 진입)
  if (QS.has('town')) { resume(); return; } // 출정 후 귀환: 바로 마을
  showSelect(); $('select').classList.add('hidden'); show('intro'); // 인트로: 세 영웅이 포즈를 취하는 3D 무대 재사용
}
async function resume() { showSelect(); $('select').classList.add('hidden'); const ok = await Acc.autoLogin(); if (!ok && Acc.A.mode !== 'guest') { show('login'); refreshLogin(); return; } if (!ok) Acc.playGuest(); enterTown(); }
async function afterIntro() {
  Snd.unlock(); Snd.play('confirm'); show('login'); refreshLogin(); $('lgMsg').textContent = '';
  if (Acc.hasSession()) { $('lgMsg').textContent = '자동 로그인 중…'; setBusy(true); const ok = await Acc.autoLogin(); setBusy(false); if (ok) { toMenu(); return; } $('lgMsg').textContent = Acc.A.msg || '세션이 만료되었습니다. 다시 로그인해 주세요.'; }
}
function setBusy(b) { document.querySelectorAll('#scr_login button').forEach(x => x.disabled = b); }
function refreshLogin() { const st = $('lgStatus'); if (st) st.textContent = Acc.A.user ? `로그인됨: ${Acc.A.user.email}` : ''; }
async function doAuth(kind) {
  const email = $('lgEmail').value.trim(), pw = $('lgPw').value; Snd.play('ui');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('lgMsg').textContent = '이메일을 정확히 입력해 주세요.'; return; }
  if (pw.length < 6) { $('lgMsg').textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
  setBusy(true); $('lgMsg').textContent = kind === 'up' ? '회원가입 중…' : '로그인 중…';
  try { await (kind === 'up' ? Acc.signUp(email, pw) : Acc.signIn(email, pw)); $('lgMsg').textContent = ''; Snd.play('confirm'); toMenu(); }
  catch (e) { $('lgMsg').textContent = e.message || String(e); Snd.play('error'); }
  setBusy(false);
}
function toMenu() { show('menu'); refreshMenu(); }
function refreshMenu() {
  if (G.screen !== 'menu') return; const s = Acc.load(), A = Acc.A;
  $('mnAcct').innerHTML = A.user ? `<b>${esc(A.user.email)}</b><br><span class="sync s_${A.sync}">${Acc.SYNC_TXT[A.sync] || ''}</span>` : `<b>게스트</b><br><span class="sync">이 기기에만 저장됩니다</span>`;
  if (document.activeElement !== $('mnNick')) $('mnNick').value = s.nick || '';
  $('mnCont').disabled = !(s.stats.runs > 0 || s.souls > 0); $('mnSummary').innerHTML = `영혼석 <b>${s.souls}</b> · 최고 웨이브 <b>${s.bestWave}</b> · 출정 ${s.stats.runs}회`;
  $('mnAuth').textContent = A.user ? '로그아웃' : '로그인 / 회원가입';
}

// ---------- 마을 ----------
function buildTown() {
  town = new THREE.Group(); town.position.copy(TOWN); scene.add(town); buildTownScene(town);
  portalPos = new THREE.Vector3(PORTAL.x, 0, TOWN_Z + PORTAL.y); labels = TL;
  const wrap = $('townLabels'); wrap.innerHTML = ''; for (const L of labels) { L.el = document.createElement('div'); L.el.className = 'tlabel ' + (L.cls || ''); L.el.innerHTML = L.html; wrap.appendChild(L.el); }
}
// 여신탑까지 경로: (호수 반대편이면 호수를 돌아) 다리 입구 → 섬
function routeToTower() { const V = (x, z) => new THREE.Vector3(x, 0, z), p = th.g.position, dl = Math.hypot(p.x - LAKE.x, p.z - LAKE.y), q = [];
  if (dl > LR + .5) { if (p.x > LAKE.x - LR && dl < 11.5) { const s = p.z < LAKE.y ? -1 : 1; if (p.x > LAKE.x - 2) q.push(V(LAKE.x, LAKE.y + s * 8.6)); q.push(V(LAKE.x - 6.2, LAKE.y + s * 6.2)); } q.push(V(LAKE.x - LR - 1.6, LAKE.y)); }
  q.push(V(LAKE.x - 2.45, 0 + LAKE.y)); th.goal = q.shift(); th.goals = q; }
// ---------- 여신의 축복 (여신탑 영구 강화 창) ----------
let blessOpen = false, blessNear = false;
function openBless() { if (G.screen !== 'town') return; if (!blessOpen) { Snd.play('confirm'); Snd.play('levelUp', { vol: .35 }); } blessOpen = true; closeSmith(true); closeInv(); closeStageSel(true); closeLab(true); $('twBless').classList.remove('hidden'); refreshTown(); }
function closeBless() { if (blessOpen) Snd.play('ui'); blessOpen = false; $('twBless').classList.add('hidden'); }
G.openBlessing = openBless; G.closeBlessing = closeBless;
G.townHero = () => th && { x: th.g.position.x, z: th.g.position.z };
G.townTeleport = (x, z) => { if (th) { th.g.position.set(x, 0, z); th.goal = null; } };
G.townGoal = (x, z) => { if (th) th.goal = new THREE.Vector3(x, 0, z); };
G.townLab = () => { const f = labFront(); return [LAB.x, LAB.y, f.x, f.z]; }; G.closeLab = closeLab;
G.townTower = () => [LAKE.x, LAKE.y]; G.townSmith = () => [SMITH.x, SMITH.y];
G.stageSel = { openStageSel, departStage, ST };
G.gear = { E, Acc, P, openInv, openSmith, closeSmith, doEnhance, lastEnh, reveal };
function spawnTownHero() {
  const s = Acc.load(); if (th) { town.remove(th.g); th.mixer.stopAllAction(); } th = makeHeroModel(s.hero); th.cls = s.hero; th.g.position.set(0, 0, 4); th.g.rotation.y = Math.PI; town.add(th.g); play(th, 'Idle'); th.goal = null;
}
export function enterTown() {
  hideAll(); $('select').classList.add('hidden'); if (!town) buildTown(); town.visible = true; spawnTownHero(); show('town'); G.phase = 'town'; departing = false; blessNear = false; closeBless(); smithNear = false; portalNear = false; labNear = false; closeLab(true); closeSmith(true); closeInv(); closeStageSel(true);
  cam.target.set(0, 1, TOWN_Z - 2); cam.r = 34; cam.phi = .78; cam.theta = 0; G.nightTarget = 0; refreshTown();
  const lr = sessionStorage.getItem('hd3d_lastRun'); if (lr) { sessionStorage.removeItem('hd3d_lastRun'); const r = JSON.parse(lr), show2 = () => popup(`<h3>${r.reason === 'clear' ? `스테이지 ${r.stage} 클리어! <span class="popStars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</span>` : r.reason === 'retreat' ? '무사히 귀환했습니다' : r.stage ? `스테이지 ${r.stage} 실패 · 코어가 파괴되었습니다` : '코어가 파괴되었습니다'}</h3>도달 웨이브 <b>${r.wave}</b> · 처치 <b>${r.kills}</b><br>획득 영혼석 <b class="soul">+${r.got}</b>${r.best ? '<br><span class="newbest">★ 최고 기록 갱신!</span>' : ''}${(r.loot || []).length ? `<br>획득 장비 <b>${r.loot.length}</b>개 <small>(🎒 가방 확인)</small>` : ''}`); if ((r.loot || []).length) setTimeout(() => reveal(r.loot, show2), 600); else show2(); }
}
function popup(html) { const p = $('townPop'); p.innerHTML = html + '<br><button id="popOk">확인</button>'; p.classList.remove('hidden'); $('popOk').onclick = () => { Snd.play('ui'); p.classList.add('hidden'); }; }
function doOpenLab() { closeBless(); closeSmith(true); closeInv(); closeStageSel(true); openLab(); }
function refreshTown() {
  renderLab();
  if (G.screen !== 'town') return; const s = Acc.load(), A = Acc.A, cls = s.hero, L = s.heroLv[cls];
  $('twSouls').textContent = s.souls; $('twSteel').textContent = s.mat.steel; $('twCrystal').textContent = s.mat.crystal; $('twBagN').textContent = `${s.inv.length}/${E.CAP}`; $('twBagN').classList.toggle('full', s.inv.length >= E.CAP);
  $('twBonus').innerHTML = `<div class="lbl">${heroN(cls)} 장비 보너스</div>` + bonusHtml(E.bonus(s, cls)); $('twBest').textContent = s.bestWave; $('twRuns').textContent = s.stats.runs; $('twKills').textContent = s.stats.kills;
  $('twAcct').innerHTML = A.user ? `${esc(s.nick || A.user.email)} · <span class="sync s_${A.sync}">${Acc.SYNC_TXT[A.sync] || ''}</span>` : `${esc(s.nick || '게스트')} · <span class="sync">게스트 (이 기기 저장)</span>`;
  const hh = P.HEROES.map(h => { const l = s.heroLv[h]; return `<button class="hcard ${h === cls ? 'sel' : ''}" data-h="${h}"><b>${heroN(h)}</b><small>체력 Lv.${l.hp} · 공격 Lv.${l.atk}</small><span class="dots">${heroDots(s, h)}</span></button>`; }).join(''); if ($('twHeroes')._h !== hh) { $('twHeroes')._h = hh; $('twHeroes').innerHTML = hh; }
  refreshGear();
  document.querySelectorAll('#twHeroes .hcard').forEach(b => b.onclick = () => { if (b.dataset.h === cls) return; Snd.play('select'); Acc.update(d => ({ ...d, hero: b.dataset.h })); spawnTownHero(); play(th, 'Cheer', { once: true }); th.cheerT = 1.6; });
  $('blessHero').textContent = heroN(cls);
  // 축복 버튼은 한 번만 만들고 내용/disabled만 갱신 (동기화 상태 변경 등으로 refreshTown이 자주 불려도 버튼이 교체되지 않아 클릭이 한 번에 들어감)
  const wrap = $('twPerm'); if (!wrap._built) { wrap._built = true; wrap.innerHTML = Object.keys(P.PERM).map(k => `<button class="perm" data-k="${k}"></button>`).join('');
    wrap.querySelectorAll('.perm').forEach(b => b.onclick = () => { const hero = Acc.load().hero; let ok = false; Acc.update(d => { const [n, o] = P.buyPerm(d, hero, b.dataset.k); ok = o; return n; }); if (ok) { Snd.play('upgrade'); Snd.play('levelUp', { vol: .5 }); if (th) { play(th, 'Cheer', { once: true }); th.cheerT = 1.6; } } else Snd.play('error'); refreshTown(); }); }
  wrap.querySelectorAll('.perm').forEach(b => { const k = b.dataset.k, D = P.PERM[k], lv = L[k], max = lv >= D.max, c = P.permCost(k, lv), h = `<span class="row"><span>${D.n} Lv.${lv}/${D.max}</span><small>${max ? 'MAX' : c + ' 영혼석'}</small></span><span class="desc">${D.d} (영구)</span>`;
    if (b._h !== h) { b._h = h; b.innerHTML = h; } const dis = max || s.souls < c; if (b.disabled !== dis) b.disabled = dis; });
}
export function depart() {
  if (departing || G.phase !== 'town') return; departing = true; const s = Acc.load(); Snd.play('meteorCast', { force: true }); Snd.play('confirm');
  $('fade').classList.add('on'); setTimeout(() => { hideAll(); closeBless(); closeLab(true); closeSmith(true); closeInv(); closeStageSel(true); town.visible = false; G.perm = s.heroLv[s.hero]; G.equip = E.bonus(s, s.hero); G.legend = E.legendOf(s, s.hero); G.grow = true; G.research = s.research; G.runDrops = []; G.runStart = performance.now(); G.phase = 'select'; choose(s.hero); $('retreat').classList.remove('hidden'); $('fade').classList.remove('on');
    const bt = Object.entries(G.equip).map(([k, v]) => `${E.STAT[k]} +${v}%`).join(' · '); if (bt) setTimeout(() => banner(`⚔ 장비 보너스: ${bt}`, '#ffe08a', 3200), 900); }, 650);
}
const sumKills = () => Object.values(G.stats.kills || {}).reduce((a, b) => a + b, 0);
// 판 종료(패배/귀환) → 보상 저장 후 마을로
function onRunEnd(reason) {
  if (G.runSaved) return; G.runSaved = true; const wave = G.wave, kills = sumKills(); let got = 0, best = false, loot = [];
  Acc.update(d => { best = !STAGE && wave > d.bestWave; const [n, g, l] = P.applyRun(d, { wave, kills, drops: G.runDrops || [], hero: G.hero ? G.hero.cls : undefined, stage: !!STAGE }); got = g; loot = l; return n; }); Acc.flush();
  sessionStorage.setItem('hd3d_lastRun', JSON.stringify({ reason, wave, kills, got, best, loot, stage: STAGE ? STAGE.id : undefined }));
  const btn = $('overTown'); if (btn) { btn.classList.remove('hidden'); $('overReward').innerHTML = `획득 영혼석 <b>+${got}</b>${loot.length ? ` · 장비 <b>${loot.length}</b>개` : ''}`; }
  if (reason === 'retreat') goTown();
}
export function goTown() { $('fade').classList.add('on'); const q = new URLSearchParams(location.search); q.set('town', '1'); q.delete('stage'); q.delete('run'); setTimeout(() => location.replace(location.pathname + '?' + q.toString()), 400); }

// ---------- UI 바인딩 ----------
function bindUI() {
  $('scr_intro').onclick = () => afterIntro(); addEventListener('keydown', e => { if (G.screen === 'intro' && !e.repeat) afterIntro(); });
  $('lgIn').onclick = () => doAuth('in'); $('lgUp').onclick = () => doAuth('up'); $('lgPw').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth('in'); });
  $('lgGuest').onclick = () => { Snd.play('confirm'); Acc.playGuest(); toMenu(); };
  $('mnCont').onclick = () => { Snd.play('confirm'); enterTown(); };
  $('mnNew').onclick = () => { const s = Acc.load(); if ((s.stats.runs > 0 || s.souls > 0) && !confirm('새로 시작하면 영혼석·영웅 강화·기록이 모두 초기화됩니다. 계속할까요?')) return;
    Snd.play('confirm'); Acc.store({ ...P.empty(), nick: s.nick, settings: s.settings }); enterTown(); };
  $('mnSet').onclick = () => { Snd.play('ui'); $('mnSettings').classList.toggle('hidden'); syncSet(); };
  for (const id of ['stBgm', 'stSfx', 'stBgmOn', 'stSfxOn']) $(id).addEventListener('input', () => { const C = Snd.cfg; C.bgm = $('stBgm').value / 100; C.sfx = $('stSfx').value / 100; C.bgmOn = $('stBgmOn').checked; C.sfxOn = $('stSfxOn').checked; Snd.apply(); Snd.save(); });
  $('mnNickSave').onclick = async () => { Snd.play('ui'); await Acc.saveNick($('mnNick').value); refreshMenu(); };
  $('mnAuth').onclick = async () => { Snd.play('ui'); if (Acc.A.user) { await Acc.signOut(); } else Acc.A.mode = ''; show('login'); refreshLogin(); };
  $('twGo').onclick = () => { closeBless(); closeLab(true); closeSmith(true); closeInv(); openStageSel(); };
  initStageSel({ challenge: () => depart(), start: id => departStage(id) }); $('twMenu').onclick = () => { Snd.play('ui'); closeBless(); closeLab(true); closeSmith(true); closeInv(); closeStageSel(true); if (th) { town.remove(th.g); th = null; } town.visible = false; G.phase = 'menu'; cam.target.set(0, 1.5, 22); cam.r = 13.5; cam.phi = 1.3; toMenu(); };
  $('retreat').onclick = () => { if (G.phase !== 'build') { Snd.play('error'); return; } if (!confirm('지금까지의 보상을 가지고 마을로 귀환할까요?')) return; onRunEnd('retreat'); };
  $('overTown').onclick = () => goTown();
  addEventListener('keydown', e => { if (G.screen === 'town') tKeys[e.key.toLowerCase()] = true; }); addEventListener('keyup', e => tKeys[e.key.toLowerCase()] = false);
  renderer.domElement.addEventListener('pointerdown', e => { if (G.screen !== 'town' || e.button !== 0 || !th) return; const m = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(m, camera);
    if (revealing()) return; if (lab && rc.intersectObject(lab, true).length > 0) { th.goals = null; th.goal = labFront(); if (Math.hypot(th.g.position.x - LAB.x, th.g.position.z - LAB.y) < 4.6) doOpenLab(); return; }
    const smithHit = smith && rc.intersectObject(smith, true).length > 0; if (smithHit) { th.goals = null; th.goal = new THREE.Vector3(SMITH.x + .6 * 3.4, 0, SMITH.y + .8 * 3.4); if (Math.hypot(th.g.position.x - SMITH.x, th.g.position.z - SMITH.y) < 4.1) openSmith(); return; }
    const towerHit = rc.intersectObject(tower, true).length > 0; // 여신탑 클릭 → 섬으로 걸어가서 축복 창
    const p = new THREE.Vector3(); if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return; p.sub(TOWN).setY(0);
    if (towerHit || Math.hypot(p.x - LAKE.x, p.z - LAKE.y) < LR + .3) { routeToTower(); if (Math.hypot(th.g.position.x - LAKE.x, th.g.position.z - LAKE.y) < 3.4) openBless(); }
    else { th.goal = p; th.goals = null; } });
  $('blessClose').onclick = () => closeBless(); $('twBag').onclick = () => { closeStageSel(true); closeLab(true); openInv(); };
  initLab({ onChange: () => refreshTown(), cheer: () => { if (th) { play(th, 'Cheer', { once: true }); th.cheerT = 1.6; } } });
  initGear({ onChange: () => refreshTown(), cheer: () => { if (th) { play(th, 'Cheer', { once: true }); th.cheerT = 1.6; } } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && blessOpen) closeBless(); });
}
function syncSet() { const C = Snd.cfg; $('stBgm').value = Math.round(C.bgm * 100); $('stSfx').value = Math.round(C.sfx * 100); $('stBgmOn').checked = C.bgmOn; $('stSfxOn').checked = C.sfxOn; }

// ---------- 매 프레임 ----------
const _v = new THREE.Vector3(), _zero = new THREE.Vector3(); let sunInTown = false;
export function updFlow(dt) {
  const inTown = !!(town && town.visible);
  if (inTown !== sunInTown) { sunInTown = inTown; const o = inTown ? TOWN : _zero; sun.position.set(-22 + o.x, 42, 26 + o.z); sun.target.position.copy(o); sun.target.updateMatrixWorld(); } // 마을에서도 그림자
  if (!inTown) return; updTown(G.t, dt);
  for (const L of labels) { L.obj.getWorldPosition(_v); _v.y += L.y; _v.project(camera); const vis = G.screen === 'town' && _v.z < 1; L.el.style.display = vis ? '' : 'none'; if (vis) L.el.style.transform = `translate(-50%,-100%) translate(${(_v.x + 1) / 2 * innerWidth}px,${(1 - _v.y) / 2 * innerHeight}px)`; }
  if (!th || G.screen !== 'town') return; th.mixer.update(dt);
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (tKeys.w || tKeys.arrowup) mv.add(fwd); if (tKeys.s || tKeys.arrowdown) mv.sub(fwd); if (tKeys.d || tKeys.arrowright) mv.add(right); if (tKeys.a || tKeys.arrowleft) mv.sub(right);
  const p = th.g.position; if (mv.lengthSq()) { th.goal = null; th.goals = null; } else if (th.goal) { mv.subVectors(th.goal, p); if (mv.length() < .2) { th.goal = th.goals && th.goals.length ? th.goals.shift() : null; if (!th.goal) mv.set(0, 0, 0); } }
  if (mv.lengthSq()) { const step = Math.min(6.5 * dt, th.goal ? mv.length() : 99); mv.normalize().multiplyScalar(step); let moved = false;
    if (townPass(p.x + mv.x, p.z)) { p.x += mv.x; moved = true; } if (townPass(p.x, p.z + mv.z)) { p.z += mv.z; moved = true; } if (!moved) th.goal = null;
    let d = Math.atan2(mv.x, mv.z) - th.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); th.g.rotation.y += d * Math.min(1, dt * 12); if (!th.cheerT) play(th, 'Running_A', { speed: 1.1 }); }
  else if (!th.cheerT) play(th, 'Idle', { fade: .25 });
  if (th.cheerT) { th.cheerT -= dt; if (th.cheerT <= 0) th.cheerT = 0; }
  th.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  cam.target.lerp(_v.set(p.x * .5, 1, TOWN_Z + p.z * .5 - 3), Math.min(1, dt * 3));
  const dl = Math.hypot(p.x - LAKE.x, p.z - LAKE.y); // 여신탑 접근 → 여신의 축복 창
  if (dl < 3.4 && !blessNear) { blessNear = true; openBless(); } else if (dl > 4.4 && blessNear) { blessNear = false; closeBless(); }
  const ds = Math.hypot(p.x - SMITH.x, p.z - SMITH.y); if (ds < 4.0 && !smithNear) { smithNear = true; closeStageSel(true); openSmith(); } else if (ds > 4.8 && smithNear) { smithNear = false; closeSmith(); }
  const dlab = Math.hypot(p.x - LAB.x, p.z - LAB.y); if (dlab < 4.6 && !labNear) { labNear = true; doOpenLab(); } else if (dlab > 5.4 && labNear) { labNear = false; closeLab(); }
  const nearPortal = Math.hypot(p.x - PORTAL.x, p.z - PORTAL.y + 1) < 2.2; $('twHint').classList.toggle('go', nearPortal); if (nearPortal && !portalNear && !departing) { portalNear = true; closeBless(); closeLab(true); closeSmith(true); closeInv(); openStageSel(); } else if (!nearPortal && portalNear && Math.hypot(p.x - PORTAL.x, p.z - PORTAL.y + 1) > 3.2) { portalNear = false; closeStageSel(); }
}
export { show as showScreen };
