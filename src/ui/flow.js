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

const TOWN_Z = -150, TOWN = new THREE.Vector3(0, 0, TOWN_Z), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SCREENS = ['intro', 'login', 'menu', 'town'];
let town = null, th = null, tKeys = {}, labels = [], portalPos = null, departing = false, toast = 0;
function show(id) { for (const s of SCREENS) $('scr_' + s).classList.toggle('hidden', s !== id); G.screen = id; G.screenMusic = id === 'intro' ? 'wave' : 'build'; }
function hideAll() { for (const s of SCREENS) $('scr_' + s).classList.add('hidden'); G.screen = null; G.screenMusic = null; }
const heroN = c => CLASSES[c].n;

// ---------- 시작 ----------
export function startFlow() {
  const s = Acc.load(); if (s.settings.audio) { Object.assign(Snd.cfg, s.settings.audio); Snd.apply(); }
  const save0 = Snd.save.bind(Snd); Snd.save = () => { save0(); Acc.update(d => ({ ...d, settings: { ...d.settings, audio: { ...Snd.cfg } } })); };
  G.onRunEnd = onRunEnd; Acc.onChange(() => { refreshMenu(); refreshTown(); refreshLogin(); });
  bindUI();
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
  town = new THREE.Group(); town.position.copy(TOWN); scene.add(town);
  mk(new THREE.CylinderGeometry(19, 20, .6, 64), toon(0x7ab85a), 0, -.3, 0, town, .04);
  mk(new THREE.CylinderGeometry(7, 7, .12, 48), toon(0xc8bca8), 0, .06, 0, town, .02); // 광장
  for (let k = 0; k < 24; k++) { const a = k / 24 * 6.28; mk(new THREE.BoxGeometry(.9, .14, .6), toon(k % 2 ? 0xb0a490 : 0xd8ccb8), Math.cos(a) * 6.4, .1, Math.sin(a) * 6.4, town, 0).rotation.y = -a; }
  mk(new THREE.BoxGeometry(2.4, .1, 11), toon(0xc8bca8), 0, .07, -11, town, .02); // 포털로 가는 길
  // 분수
  mk(new THREE.CylinderGeometry(1.6, 1.8, .6, 24), toon(0xd8d0c0), 0, .3, 0, town, .03); mk(new THREE.CylinderGeometry(1.35, 1.35, .1, 24), glow(0x6ac8ff, .6), 0, .58, 0, town, 0);
  mk(new THREE.CylinderGeometry(.25, .35, 1.6, 12), toon(0xd8d0c0), 0, 1.1, 0, town, .02); const orb = mk(new THREE.IcosahedronGeometry(.4, 1), glow(0x9ae8ff, 1.6), 0, 2.1, 0, town, 0); town.userData.orb = orb;
  const house = (x, z, rot, wall, roof, name, extra) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; town.add(g);
    mk(new THREE.BoxGeometry(4.2, 3, 3.6), toon(wall), 0, 1.5, 0, g, .04); const r = mk(new THREE.ConeGeometry(3.4, 2.2, 4), toon(roof), 0, 4.1, 0, g, .04); r.rotation.y = Math.PI / 4; r.scale.set(1.05, 1, .9);
    mk(new THREE.BoxGeometry(1.1, 1.8, .2), toon(0x6a4422), 0, .9, 1.82, g, .02); for (const sx of [-1.3, 1.3]) mk(new THREE.BoxGeometry(.8, .7, .15), glow(0xffd27a, .8), sx, 1.9, 1.82, g, .015);
    if (extra) extra(g); labels.push({ obj: g, y: 6.2, html: `${name}<small>준비 중</small>` }); return g; };
  house(-10, -2, Math.PI / 2.6, 0x8a7a9a, 0x3a2a5a, '⚔ 던전', g => { mk(new THREE.CylinderGeometry(1, 1.2, 6, 10), toon(0x5a4a6a), 2.6, 3, -1, g, .04); mk(new THREE.ConeGeometry(1.4, 2, 10), toon(0x2a1a4a), 2.6, 7, -1, g, .04); });
  house(10, -2, -Math.PI / 2.6, 0xe8d8b0, 0xc04a3a, '💰 상점', g => { const aw = mk(new THREE.BoxGeometry(4.4, .15, 1.4), toon(0xff7a5a), 0, 2.6, 2.3, g, .02); aw.rotation.x = .35; });
  house(7, 9, -Math.PI * .8, 0xa89880, 0x4a4a5a, '🔨 대장간', g => { mk(new THREE.BoxGeometry(.8, 2.4, .8), toon(0x6a5a5a), 1.4, 5, -.8, g, .03); mk(new THREE.BoxGeometry(1, .7, .7), toon(0x3a3a44), -2.8, .35, 1.4, g, .02); });
  house(-7, 9, Math.PI * .8, 0xd8c8a0, 0x3a6a4a, '🍺 여관');
  // 출정 포털 (북쪽)
  const pg = new THREE.Group(); pg.position.set(0, 0, -15); town.add(pg); portalPos = new THREE.Vector3(0, 0, TOWN_Z - 15);
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; const b = mk(new THREE.BoxGeometry(.7, .6, .8), toon(0x8a8098), Math.cos(a) * 2.3, 2.4 + Math.sin(a) * 2.3, 0, pg, .03); b.rotation.z = a; }
  mk(new THREE.BoxGeometry(.8, 2.4, .9), toon(0x8a8098), -2.3, 1.2, 0, pg, .03); mk(new THREE.BoxGeometry(.8, 2.4, .9), toon(0x8a8098), 2.3, 1.2, 0, pg, .03);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(2.05, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb07aff).multiplyScalar(1.6), transparent: true, opacity: .85, side: THREE.DoubleSide, toneMapped: false })); disk.position.y = 2.4; pg.add(disk);
  const sw = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.9, 40, 1, 0, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })); sw.position.set(0, 2.4, .02); pg.add(sw);
  const pl = new THREE.PointLight(0xc07aff, 30, 14); pl.position.set(0, 2.5, 1.5); pg.add(pl); town.userData.swirl = sw; town.userData.disk = disk;
  labels.push({ obj: pg, y: 5.9, html: '🌀 출정의 문<small>들어가면 디펜스 시작</small>', cls: 'go' });
  // 나무·가로등
  for (let k = 0; k < 18; k++) { const a = k / 18 * 6.28 + .1, r = 16 + (k % 3); if (Math.abs(Math.sin(a) + 1) < .25 && Math.cos(a) * Math.cos(a) < .1) continue; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z < -12 && Math.abs(x) < 4) continue;
    mk(new THREE.CylinderGeometry(.22, .3, 1.4, 8), toon(0x7a5a3a), x, .7, z, town, .02); mk(new THREE.IcosahedronGeometry(1.3, 1), toon([0x5ab84a, 0x4aa85a, 0x7ac85a][k % 3]), x, 2.2, z, town, .04); }
  for (const [x, z] of [[-3, -8], [3, -8], [-6, 4], [6, 4]]) { mk(new THREE.CylinderGeometry(.08, .1, 2.6, 6), toon(0x2a2a34), x, 1.3, z, town, .015); mk(new THREE.SphereGeometry(.25, 10, 8), glow(0xffd27a, 2), x, 2.7, z, town, 0); }
  // 라벨 DOM
  const wrap = $('townLabels'); wrap.innerHTML = ''; for (const L of labels) { L.el = document.createElement('div'); L.el.className = 'tlabel ' + (L.cls || ''); L.el.innerHTML = L.html; wrap.appendChild(L.el); }
}
const BLOCKERS = [[-10, -2, 3.2], [10, -2, 3.2], [7, 9, 3.2], [-7, 9, 3.2], [0, 0, 2.1], [-2.3, -15, .7], [2.3, -15, .7]];
function townPass(x, z) { if (Math.hypot(x, z) > 17.5) return false; for (const [bx, bz, r] of BLOCKERS) if (Math.hypot(x - bx, z - bz) < r) return false; return true; }
function spawnTownHero() {
  const s = Acc.load(); if (th) { town.remove(th.g); th.mixer.stopAllAction(); } th = makeHeroModel(s.hero); th.cls = s.hero; th.g.position.set(0, 0, 4); th.g.rotation.y = Math.PI; town.add(th.g); play(th, 'Idle'); th.goal = null;
}
export function enterTown() {
  hideAll(); $('select').classList.add('hidden'); if (!town) buildTown(); town.visible = true; spawnTownHero(); show('town'); G.phase = 'town'; departing = false;
  cam.target.set(0, 1, TOWN_Z - 2); cam.r = 34; cam.phi = .78; cam.theta = 0; G.nightTarget = .15; refreshTown();
  const lr = sessionStorage.getItem('hd3d_lastRun'); if (lr) { sessionStorage.removeItem('hd3d_lastRun'); const r = JSON.parse(lr); popup(`<h3>${r.reason === 'retreat' ? '무사히 귀환했습니다' : '코어가 파괴되었습니다'}</h3>도달 웨이브 <b>${r.wave}</b> · 처치 <b>${r.kills}</b><br>획득 영혼석 <b class="soul">+${r.got}</b>${r.best ? '<br><span class="newbest">★ 최고 기록 갱신!</span>' : ''}`); }
}
function popup(html) { const p = $('townPop'); p.innerHTML = html + '<br><button id="popOk">확인</button>'; p.classList.remove('hidden'); $('popOk').onclick = () => { Snd.play('ui'); p.classList.add('hidden'); }; }
function refreshTown() {
  if (G.screen !== 'town') return; const s = Acc.load(), A = Acc.A, cls = s.hero, L = s.heroLv[cls];
  $('twSouls').textContent = s.souls; $('twBest').textContent = s.bestWave; $('twRuns').textContent = s.stats.runs; $('twKills').textContent = s.stats.kills;
  $('twAcct').innerHTML = A.user ? `${esc(s.nick || A.user.email)} · <span class="sync s_${A.sync}">${Acc.SYNC_TXT[A.sync] || ''}</span>` : `${esc(s.nick || '게스트')} · <span class="sync">게스트 (이 기기 저장)</span>`;
  $('twHeroes').innerHTML = P.HEROES.map(h => { const l = s.heroLv[h]; return `<button class="hcard ${h === cls ? 'sel' : ''}" data-h="${h}"><b>${heroN(h)}</b><small>체력 Lv.${l.hp} · 공격 Lv.${l.atk}</small></button>`; }).join('');
  document.querySelectorAll('#twHeroes .hcard').forEach(b => b.onclick = () => { if (b.dataset.h === cls) return; Snd.play('select'); Acc.update(d => ({ ...d, hero: b.dataset.h })); spawnTownHero(); play(th, 'Cheer', { once: true }); th.cheerT = 1.6; });
  $('twPerm').innerHTML = Object.entries(P.PERM).map(([k, D]) => { const lv = L[k], max = lv >= D.max, c = P.permCost(k, lv); return `<button class="perm" data-k="${k}" ${max || s.souls < c ? 'disabled' : ''}><span class="row"><span>${D.n} Lv.${lv}/${D.max}</span><small>${max ? 'MAX' : c + ' 영혼석'}</small></span><span class="desc">${D.d} (영구)</span></button>`; }).join('');
  document.querySelectorAll('#twPerm .perm').forEach(b => b.onclick = () => { let ok = false; Acc.update(d => { const [n, o] = P.buyPerm(d, cls, b.dataset.k); ok = o; return n; }); if (ok) { Snd.play('upgrade'); Snd.play('levelUp', { vol: .5 }); if (th) { play(th, 'Cheer', { once: true }); th.cheerT = 1.6; } } else Snd.play('error'); });
}
export function depart() {
  if (departing || G.phase !== 'town') return; departing = true; const s = Acc.load(); Snd.play('meteorCast', { force: true }); Snd.play('confirm');
  $('fade').classList.add('on'); setTimeout(() => { hideAll(); town.visible = false; G.perm = s.heroLv[s.hero]; G.runStart = performance.now(); G.phase = 'select'; choose(s.hero); $('retreat').classList.remove('hidden'); $('fade').classList.remove('on'); }, 650);
}
const sumKills = () => Object.values(G.stats.kills || {}).reduce((a, b) => a + b, 0);
// 판 종료(패배/귀환) → 보상 저장 후 마을로
function onRunEnd(reason) {
  if (G.runSaved) return; G.runSaved = true; const wave = G.wave, kills = sumKills(); let got = 0, best = false;
  Acc.update(d => { best = wave > d.bestWave; const [n, g] = P.applyRun(d, { wave, kills }); got = g; return n; }); Acc.flush();
  sessionStorage.setItem('hd3d_lastRun', JSON.stringify({ reason, wave, kills, got, best }));
  const btn = $('overTown'); if (btn) { btn.classList.remove('hidden'); $('overReward').innerHTML = `획득 영혼석 <b>+${got}</b>`; }
  if (reason === 'retreat') goTown();
}
export function goTown() { $('fade').classList.add('on'); const q = new URLSearchParams(location.search); q.set('town', '1'); setTimeout(() => location.replace(location.pathname + '?' + q.toString()), 400); }

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
  $('twGo').onclick = () => depart(); $('twMenu').onclick = () => { Snd.play('ui'); if (th) { town.remove(th.g); th = null; } town.visible = false; G.phase = 'menu'; cam.target.set(0, 1.5, 22); cam.r = 13.5; cam.phi = 1.3; toMenu(); };
  $('retreat').onclick = () => { if (G.phase !== 'build') { Snd.play('error'); return; } if (!confirm('지금까지의 보상을 가지고 마을로 귀환할까요?')) return; onRunEnd('retreat'); };
  $('overTown').onclick = () => goTown();
  addEventListener('keydown', e => { if (G.screen === 'town') tKeys[e.key.toLowerCase()] = true; }); addEventListener('keyup', e => tKeys[e.key.toLowerCase()] = false);
  renderer.domElement.addEventListener('pointerdown', e => { if (G.screen !== 'town' || e.button !== 0 || !th) return; const m = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(m, camera);
    const p = new THREE.Vector3(); if (rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) th.goal = p.sub(TOWN).setY(0); });
}
function syncSet() { const C = Snd.cfg; $('stBgm').value = Math.round(C.bgm * 100); $('stSfx').value = Math.round(C.sfx * 100); $('stBgmOn').checked = C.bgmOn; $('stSfxOn').checked = C.sfxOn; }

// ---------- 매 프레임 ----------
const _v = new THREE.Vector3();
export function updFlow(dt) {
  if (!town || !town.visible) return; const u = town.userData; u.swirl.rotation.z -= dt * 3; u.orb.rotation.y += dt; u.orb.position.y = 2.1 + Math.sin(G.t * 2) * .15; u.disk.material.opacity = .7 + Math.sin(G.t * 4) * .15;
  for (const L of labels) { L.obj.getWorldPosition(_v); _v.y += L.y; _v.project(camera); const vis = G.screen === 'town' && _v.z < 1; L.el.style.display = vis ? '' : 'none'; if (vis) L.el.style.transform = `translate(-50%,-100%) translate(${(_v.x + 1) / 2 * innerWidth}px,${(1 - _v.y) / 2 * innerHeight}px)`; }
  if (!th || G.screen !== 'town') return; th.mixer.update(dt);
  const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta)), right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (tKeys.w || tKeys.arrowup) mv.add(fwd); if (tKeys.s || tKeys.arrowdown) mv.sub(fwd); if (tKeys.d || tKeys.arrowright) mv.add(right); if (tKeys.a || tKeys.arrowleft) mv.sub(right);
  const p = th.g.position; if (mv.lengthSq()) th.goal = null; else if (th.goal) { mv.subVectors(th.goal, p); if (mv.length() < .2) { th.goal = null; mv.set(0, 0, 0); } }
  if (mv.lengthSq()) { const step = Math.min(6.5 * dt, th.goal ? mv.length() : 99); mv.normalize().multiplyScalar(step); let moved = false;
    if (townPass(p.x + mv.x, p.z)) { p.x += mv.x; moved = true; } if (townPass(p.x, p.z + mv.z)) { p.z += mv.z; moved = true; } if (!moved) th.goal = null;
    let d = Math.atan2(mv.x, mv.z) - th.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); th.g.rotation.y += d * Math.min(1, dt * 12); if (!th.cheerT) play(th, 'Running_A', { speed: 1.1 }); }
  else if (!th.cheerT) play(th, 'Idle', { fade: .25 });
  if (th.cheerT) { th.cheerT -= dt; if (th.cheerT <= 0) th.cheerT = 0; }
  th.ring.material.opacity = .5 + Math.sin(G.t * 4) * .2;
  cam.target.lerp(_v.set(p.x * .5, 1, TOWN_Z + p.z * .5 - 3), Math.min(1, dt * 3));
  const nearPortal = Math.hypot(p.x - 0, p.z + 14) < 2.2; $('twHint').classList.toggle('go', nearPortal); if (nearPortal && !departing) depart();
}
export { show as showScreen };
