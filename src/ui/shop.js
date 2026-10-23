// ================= 상점 · 우편함 · 관리자 UI =================
// 상점: 구매 신청(결제 연동 없음) → 관리자 승인 → 우편 발송 → 우편함 '받기'로 지급. 게스트는 구매 불가. 서버 테이블이 없으면 '서버 준비 중'.
import * as THREE from 'three';
import { Snd } from '../audio/audio.js';
import { $, esc } from '../core/util.js';
import { definePanel } from './panel.js';
import { G } from '../core/state.js';
import { CLASSES, heroLabel } from '../data/heroes.js';
import { ensureModels, heroAssets, makeHeroModel, modelsReady, play } from '../render/characters.js';
import * as Acc from '../account/account.js';
import * as Sh from '../account/shop.js';
import { SHOP, PAY_INFO } from '../config/shop.js';
import { openAdmin, closeAdmin, renderAdmin, initAdmin } from './admin.js';
export { openAdmin, closeAdmin };

const fmtD = s => { const d = new Date(s); return isNaN(d) ? '' : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ST_N = { pending: '승인 대기', approved: '승인됨', rejected: '거절됨' };
// 상품별 표시 정보 (상점 카드 · 미리보기 동작 · 색)
const PROD = {
  hero_gunner: { anim: 'Flourish', col: 0xff6aa8, icon: '🌹', stats: ['⚡ 공격 속도 <b>매우 빠름</b>', '🎯 사거리 <b>중간</b>', '❤ 체력 <b>{hp}</b>', '🔫 쌍권총 교차 연사'],
    sk: '회전하며 사방으로 탄환 난사 + 두 번의 피니시 폭발', lg: '<b>✦ 전설 쌍권총</b> 도탄 난사(튕기는 탄환) · 장미 탄막([E] 부채꼴 일제 사격)' },
  hero_mechanic: { anim: 'Idle', col: 0x7aff5a, icon: '🛠️', stats: ['❤ 체력 <b>{hp} (최고)</b>', '🛡 방어 <b>높음</b>', '🛠️ 근접 · 드릴/해머 교대', '💥 해머 넉백'],
    sk: '부품이 날아와 합체! 10초간 거대 로봇(보호막 · 넓은 범위 강펀치 · 드릴 돌진) → 로켓 펀치 피니시', lg: '<b>✦ 전설 건틀릿</b> 과부하 드릴(다단 갈기 · 둔화) · 기가 해머 낙하([E] 거대 해머 · 기절)' },
  hero_fighter: { anim: 'Combat', col: 0xff9a3a, icon: '👊', stats: ['⚡ 공격 속도 <b>빠름</b> · 3연타', '🐾 돌려차기 <b>넉백</b>', '❤ 체력 <b>{hp}</b>', '🔥 원거리·비행 적에게 <b>장풍</b>'],
    sk: '높이 뛰어올라 땅을 내려찍어 주변 400% 피해 + 1초 기절 · 땅이 갈라져요', lg: '<b>✦ 전설 손붕대</b> 냥냥 난타(발자국 6연타) · 맹호 돌진([E] 돌진 관통 · 밀쳐내기)' },
};
const PKEYS = Object.keys(SHOP.items).filter(Sh.onSale); // 숨긴 영웅 상품 제외 (data/heroes.js hidden)
let ui = { prod: 'hero_gunner', shop: false, mail: false, msg: '', msgOk: true, mailMsg: '', busy: false };
let hooks = { onChange: () => {}, closeOthers: () => {}, cheer: () => {} };

// ---------- 로즈 3D 미리보기 (별도 작은 렌더러, 상점이 열려 있을 때만 그림) ----------
let pv = null;
function preview() {
  if (pv !== null) return pv; pv = false;
  try {
    const cv = $('shopPv'), r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .1, 50); cam.position.set(0, 1.75, 6.4); cam.lookAt(0, 1.3, 0);
    sc.add(new THREE.HemisphereLight(0xfff0f6, 0x6a3a5a, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 5, 4); sc.add(d); const rim = new THREE.DirectionalLight(0xff6aa8, 2.2); rim.position.set(-3, 3, -4); sc.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ color: 0xff6aa8, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = .01; sc.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.68, 64), new THREE.MeshBasicMaterial({ color: 0xffd0e8, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .02; sc.add(ring);
    const pg = new THREE.BufferGeometry(), N = 60, pp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pp[i * 3] = (Math.random() - .5) * 3.4; pp[i * 3 + 1] = Math.random() * 3; pp[i * 3 + 2] = (Math.random() - .5) * 2; } pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffb0d8, size: .07, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false })); sc.add(pts);
    pv = { r, sc, cam, ch: null, chs: {}, pts, ring, disc, rim, t: 0, spin: 0 }; pvSet(ui.prod);
  } catch (e) { console.warn('shop preview', e); pv = false; }
  return pv;
}
// 미리보기 모델 교체 (상품마다 한 번만 생성)
function pvSet(k) { if (!pv) return; const I = SHOP.items[k], D = PROD[k] || PROD.hero_gunner; if (!I) return; pv.want = k;
  if (!pv.chs[k] && !modelsReady(heroAssets(I.hero))) { if (pv.ch) pv.ch.g.visible = false; ensureModels(heroAssets(I.hero)).then(() => { if (pv && pv.want === k) pvSet(k); }).catch(e => console.warn(e)); return; } // 지연 로딩: 모델이 오면 표시
  if (pv.ch) pv.ch.g.visible = false;
  let ch = pv.chs[k]; if (!ch) { ch = pv.chs[k] = makeHeroModel(I.hero); ch.ring.visible = false; pv.sc.add(ch.g); play(ch, D.anim) || play(ch, 'Idle'); ch.g.rotation.y = .35; }
  ch.g.visible = true; pv.ch = ch; pv.key = k; pv.disc.material.color.setHex(D.col); pv.rim.color.setHex(D.col); pv.pts.material.color.setHex(D.col).lerp(new THREE.Color(0xffffff), .45); pv.spin = 6.28; }
export function updShop(dt) {
  if (!ui.shop || !pv) return; const cv = $('shopPv'), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  if (pv.w !== w || pv.h !== h) { pv.w = w; pv.h = h; pv.r.setSize(w, h, false); pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix(); }
  pv.t += dt; if (!pv.ch) return; pv.ch.mixer.update(dt); pv.ch.g.rotation.y = .35 + Math.sin(pv.t * .45) * .7 + pv.spin; if (pv.spin > 0) pv.spin = Math.max(0, pv.spin - dt * 4);
  const a = pv.pts.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (.25 + (i % 5) * .08); if (y > 3.2) y = 0; a.setY(i, y); } a.needsUpdate = true; pv.ring.scale.setScalar(1 + Math.sin(pv.t * 3) * .04);
  pv.r.render(pv.sc, pv.cam);
}

// ---------- 상점 ----------
export function openShop(k) { if (!ui.shop) { Snd.play('coins'); Snd.play('confirm'); } if (PKEYS.includes(k)) ui.prod = k; hooks.closeOthers('shop'); ui.shop = true; SHP.show(); preview(); if (pv) { if (pv.key !== ui.prod) pvSet(ui.prod); pv.spin = 6.28; } render(); if (Acc.A.user) Sh.refresh().then(render); }
export function closeShop(silent) { if (ui.shop && !silent) Snd.play('ui'); ui.shop = false; SHP.hide(); }
const SHP = definePanel('shop', { id: 'shopPanel', z: 40, isOpen: () => ui.shop, close: s => closeShop(s) });
function itemState(k) {
  const A = Acc.A, st = Sh.S.status;
  if (!A.user) return { cls: 'guest', btn: '🔒 로그인 후 구매 가능', dis: true, note: '게스트는 구매할 수 없어요. 메뉴에서 로그인해 주세요.' };
  if (Sh.isBanned()) return { cls: 'soon', btn: '⛔ 계정 정지', dis: true, note: '계정이 정지되어 구매 신청을 할 수 없어요. 문의는 관리자에게 해 주세요.' };
  if (Sh.owns(k)) return { cls: 'own', btn: '✓ 보유 중', dis: true, note: '이미 보유한 영웅이에요. 마을 왼쪽 영웅 선택에서 고를 수 있어요.' };
  if (st === 'missing') return { cls: 'soon', btn: '서버 준비 중', dis: true, note: '상점 서버가 아직 준비되지 않았어요. 잠시 후 다시 와 주세요.' };
  if (st === 'error') return { cls: 'soon', btn: '서버 연결 실패', dis: true, note: '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' };
  if (st !== 'ok') return { cls: 'load', btn: '불러오는 중…', dis: true, note: '' };
  if (Sh.pendingOf(k)) return { cls: 'pend', btn: '⏳ 승인 대기 중', dis: true, note: '구매 신청이 접수되었어요. 관리자가 결제를 확인한 뒤 승인하면 우편함으로 지급됩니다.' };
  return { cls: 'buy', btn: '💳 구매 신청', dis: false, note: '' };
}
function render() {
  if (ui.shop) {
    const k = ui.prod, I = SHOP.items[k], C = CLASSES[I.hero], D = PROD[k] || PROD.hero_gunner, s = itemState(k);
    const body = $('shopBody'), bk = k + ':' + PKEYS.map(x => +Sh.owns(x)).join(''); if (body._built !== bk) { const cv = $('shopPv'); body._built = bk; // 상품 탭(2개 이상) + 선택한 상품 카드 (미리보기 캔버스는 재사용)
      const tabs = PKEYS.length > 1 ? `<div class="shopTabs" id="shopTabs">${PKEYS.map(x => { const X = SHOP.items[x], XC = CLASSES[X.hero], XD = PROD[x] || {}; return `<button class="shopTab ${x === k ? 'on' : ''} ${Sh.owns(x) ? 'own' : ''}" data-k="${x}" style="--pc:#${new THREE.Color(XD.col || 0xff6aa8).getHexString()}"><i>${XD.icon || '🎁'}</i><b>${esc(XC.nm)}</b><small>${esc(XC.n)} · ${esc(X.price)}</small>${Sh.owns(x) ? '<em>보유</em>' : ''}</button>`; }).join('')}</div>` : '';
      body.innerHTML = `${tabs}<div class="shopCard p_${esc(I.hero)}"><div class="pvWrap"><canvas id="shopPvSlot"></canvas><div class="pvTag">${esc(I.tag)}</div><div class="pvName">${esc(C.nm)}<small>${esc(C.n)}</small></div></div>
      <div class="shopInfo"><div class="shopTitle">${esc(I.n)}</div><div class="shopDesc">${esc(I.desc)}</div>
      <div class="shopStats">${D.stats.map(x => `<span>${x.replace('{hp}', C.hp)}</span>`).join('')}</div>
      <div class="shopSk"><b>Q · ${esc(C.skill)}</b> ${esc(D.sk)}</div><div class="shopSk lg">${D.lg}</div>
      <div class="shopBuy"><div class="price" id="shopPrice"></div><button class="gbtn main" id="shopBuyBtn"></button></div><div class="shopNote" id="shopNote"></div><div class="shopPay">${esc(PAY_INFO)}</div></div></div>
      <div class="shopFlow">구매 신청 → 관리자 결제 확인·승인 → <b>✉ 우편함</b>에서 받기</div><div id="shopMsg" class="shopMsg"></div>`;
      $('shopPvSlot').replaceWith(cv); $('shopBuyBtn').onclick = () => buy(k);
      body.querySelectorAll('.shopTab').forEach(b => b.onclick = () => { if (b.dataset.k === ui.prod) return; Snd.play('select'); ui.prod = b.dataset.k; ui.msg = ''; pvSet(ui.prod); render(); }); }
    $('shopPrice').textContent = I.price; const b = $('shopBuyBtn'); b.textContent = s.btn; b.disabled = s.dis || ui.busy; b.className = 'gbtn main st_' + s.cls; $('shopNote').textContent = s.note;
    $('shopMsg').innerHTML = ui.msg ? `<span class="${ui.msgOk ? 'ok' : 'bad'}">${ui.msg}</span>` : '';
  }
  renderMail(); renderAdmin(); badge();
}
async function buy(k) {
  if (ui.busy) return; ui.busy = true; Snd.play('ui'); render(); const r = await Sh.order(k); ui.busy = false;
  ui.msgOk = r.ok; ui.msg = r.ok ? `✅ ${esc(r.msg)}<br>관리자가 결제를 확인하고 승인하면 <b>우편함</b>으로 ${esc(heroLabel(SHOP.items[k].hero))} 영웅이 지급됩니다.<br><small>${esc(PAY_INFO)}</small>` : '⚠ ' + esc(r.msg);
  Snd.play(r.ok ? 'confirm' : 'error'); if (r.ok) Snd.play('coins'); render();
}

// ---------- 우편함 ----------
export function openMail() { if (!ui.mail) Snd.play('confirm'); hooks.closeOthers('mail'); ui.mail = true; MP.show(); renderMail(); if (Acc.A.user) Sh.refresh().then(render); }
export function closeMail(silent) { if (ui.mail && !silent) Snd.play('ui'); ui.mail = false; MP.hide(); }
const MP = definePanel('mail', { id: 'mailPanel', z: 42, isOpen: () => ui.mail, close: s => closeMail(s) });
function renderMail() {
  if (!ui.mail) return; const A = Acc.A, st = Sh.S.status, L = Sh.S.mail; let h = '';
  if (!A.user) h = '<div class="emptyMsg">로그인한 계정만 우편을 받을 수 있어요.</div>';
  else if (st === 'missing') h = '<div class="emptyMsg">서버 준비 중이에요.</div>';
  else if (st === 'error') h = '<div class="emptyMsg">서버에 연결할 수 없어요.</div>';
  else if (st !== 'ok' && !L.length) h = '<div class="emptyMsg">불러오는 중…</div>';
  else if (!L.length) h = '<div class="emptyMsg">받은 우편이 없어요.</div>';
  else h = L.map(m => { const rw = Sh.rewardText(m.reward), hero = m.reward && m.reward.hero;
    return `<div class="mailItem ${m.claimed || m.revoked ? 'done' : ''} ${!m.claimed && !m.revoked && (m.reward || !m.read) ? 'new' : ''}" data-id="${m.id}"><div class="mIco">${hero ? '🎁' : m.reward ? '💰' : '✉'}</div><div class="mMain"><div class="mT">${esc(m.title)}</div><div class="mB">${esc(m.body)}</div>${rw ? `<div class="mR">${hero ? `<i class="rose">${(PROD['hero_' + hero] || {}).icon || '🎁'}</i>` : ''}${esc(rw)}</div>` : ''}<div class="mD">${fmtD(m.created_at)}</div></div>
      <div class="mAct">${m.reward ? (m.claimed ? '<span class="got">받음 ✓</span>' : m.revoked ? '<span class="got revoked">회수됨</span>' : `<button class="gbtn main mClaim" data-id="${m.id}">받기</button>`) : ''}</div></div>`; }).join('');
  if ($('mailList')._h !== h) { $('mailList')._h = h; $('mailList').innerHTML = h;
    document.querySelectorAll('#mailList .mailItem').forEach(el => el.onclick = () => { const id = +el.dataset.id, m = Sh.S.mail.find(x => x.id === id); if (m && !m.read) { Sh.markRead(id); render(); } });
    document.querySelectorAll('#mailList .mClaim').forEach(b => b.onclick = async e => { e.stopPropagation(); b.disabled = true; const r = await Sh.claim(+b.dataset.id); ui.mailMsg = (r.ok ? '✅ ' : '⚠ ') + esc(r.msg);
      if (r.ok && !r.already) { Snd.play('levelUp'); Snd.play('coins'); if (r.reward && r.reward.hero) { ui.mailMsg = `${(PROD['hero_' + r.reward.hero] || {}).icon || '🎁'} <b>${esc(heroLabel(r.reward.hero))}</b> 해금! 영웅 선택에서 고를 수 있어요.`; hooks.cheer(); } } else Snd.play(r.ok ? 'ui' : 'error');
      hooks.onChange(); render(); }); }
  $('mailMsg').innerHTML = ui.mailMsg || (Sh.isBanned() ? '<span class="bad">⛔ 계정이 정지되어 우편을 받을 수 없어요.</span>' : '');
}
function badge() { const n = Acc.A.user ? Sh.unread() : 0, b = $('twMailN'); if (b) { b.textContent = n > 9 ? '9+' : n || ''; b.classList.toggle('hidden', !n); }
  const adm = Sh.isAdminUI(); for (const id of ['twAdmin', 'mnAdmin']) { const e = $(id); if (e) e.classList.toggle('hidden', !adm); } }

export function initShop(h) {
  hooks = { ...hooks, ...h };
  $('shopClose').onclick = () => closeShop(); $('mailClose').onclick = () => closeMail(); initAdmin({ closeOthers: k => hooks.closeOthers(k), onChange: () => hooks.onChange() });
  $('twMail').onclick = () => { if (ui.mail) closeMail(); else openMail(); }; $('twAdmin').onclick = () => openAdmin(); $('mnAdmin').onclick = () => openAdmin();
  Sh.onShop(() => render()); Acc.onChange(() => badge());
  badge();
}
G.shop = { Sh, openShop, closeShop, openMail, closeMail, openAdmin, closeAdmin, ui: () => ui, pvKey: () => (pv && pv.ch && pv.ch.g.visible ? pv.key : null) };
