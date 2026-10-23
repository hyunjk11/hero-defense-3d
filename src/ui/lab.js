// 타워 연구소 패널: 타워 종류별 공격력·사거리·공격속도 + 후반 '시작 성장'. 버튼은 한 번만 만들고 글자/비활성만 갱신 (클릭 씹힘 방지)
import { Snd } from '../audio/audio.js';
import { $, setH } from '../core/util.js';
import { definePanel } from './panel.js';
import { G } from '../core/state.js';
import { TOWERS } from '../data/towers.js';
import * as GR from '../data/growth.js';
import * as Acc from '../account/account.js';
import * as P from '../account/progress.js';
import * as SX from '../account/steel.js';
import * as AD from '../data/advance.js';
import * as Sh from '../account/shop.js';
import { labFx } from '../world/town.js';
let open = false, tab = 'arrow', built = null, hooks = { onChange() {}, cheer() {} };
const TC = { arrow: '#5a9aff', cannon: '#ff9a4a', magic: '#c07aff' };
const MATN = { steel: '⚙ 강철', crystal: '💎 마력석' };
export function initLab(h) { hooks = { ...hooks, ...h }; $('labClose').onclick = () => closeLab(); }
const LP = definePanel('lab', { id: 'labPanel', z: 40, isOpen: () => open, close: s => closeLab(s) });
export function openLab() { if (G.screen !== 'town') return; if (!open) { Snd.play('confirm'); Snd.play('magic', { vol: .4 }); } open = true; LP.show(); renderLab(); }
export function closeLab(silent) { if (open && !silent) Snd.play('ui'); open = false; LP.hide(); }
function build() {
  $('labTabs').innerHTML = GR.TTYPES.map(t => `<button class="ftab" data-t="${t}"><i style="color:${TC[t]};background:${TC[t]}"></i>${TOWERS[t].n}</button>`).join('');
  $('labTabs').querySelectorAll('.ftab').forEach(b => b.onclick = () => { if (tab === b.dataset.t) return; tab = b.dataset.t; Snd.play('ui'); renderLab(); });
  $('labBody').innerHTML = GR.RKEYS.map(k => `<div class="labRow ${GR.RES[k].need ? 'late' : ''}" data-k="${k}"><div class="lrTop"><span class="lrIco">${GR.RES[k].icon}</span><span>${GR.RES[k].n}</span><span class="lrLv"></span></div>
    <div class="lrPips">${'<i></i>'.repeat(GR.RES[k].max)}</div><div class="lrD"></div><button class="gbtn lrBtn"></button><div class="lrLock"></div></div>`).join('');
  $('labBody').querySelectorAll('.labRow').forEach(r => r.querySelector('.lrBtn').onclick = () => buy(r.dataset.k, r)); built = true;
  // 🧱 바리케이드 보강 (2026-10-24, 강철만 · 타워 탭과 무관한 공용 연구, account/steel.js)
  $('labBar').innerHTML = `<div class="lrTop"><span class="lrIco">🧱</span><span>바리케이드 보강</span><small class="lrTag">모든 타워 공용 · 강철 전용</small><span class="lrLv"></span></div><div class="lrPips">${'<i></i>'.repeat(SX.BAR.max)}</div><div class="lrD"></div><button class="gbtn lrBtn" id="labBarBtn"></button><div class="lrLock"></div>`;
  $('labBarBtn').onclick = () => buyBarLv();
}
function buy(k, row) { let ok = false; Acc.update(d => { const [n, o] = P.buyResearch(d, tab, k); ok = o; return n; });
  if (ok) { Snd.play('upgrade'); Snd.play('levelUp', { vol: .5 }); if (k === 'start') Snd.play('meteorCast', { vol: .4 }); labFx.t = 1.2; row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); hooks.cheer(); } else Snd.play('error');
  renderLab(); hooks.onChange(); }
function buyBarLv() { let ok = false; Acc.update(d => { const [n, o] = P.buyBar(d); ok = o; return n; }); const row = $('labBar');
  if (ok) { Snd.play('upgrade'); Snd.play('hitArmor', { vol: .5 }); labFx.t = 1.2; row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); hooks.cheer(); } else Snd.play('error'); renderLab(); hooks.onChange(); }
const pct = v => Math.round(v * 100);
export function renderLab() {
  if (!open) return; if (!built) build(); const s = Acc.load(), r = s.research[tab];
  setH($('labMats'), `<span>🔮 영혼석 <b>${s.souls}</b></span><span>${MATN.steel} <b>${s.mat.steel}</b></span><span>${MATN.crystal} <b>${s.mat.crystal}</b></span>`);
  $('labTabs').querySelectorAll('.ftab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const m = GR.resMods(s.research, tab);
  setH($('labSum'), `<b>${TOWERS[tab].n}</b> 현재 연구 효과: 피해 <b>+${pct(m.dmg - 1)}%</b> · 사거리 <b>+${pct(m.rng - 1)}%</b> · 공격속도 <b>+${pct(m.rate - 1)}%</b> · 시작 <b>${'★'.repeat(GR.starsFor(m.xp0))}</b>${m.xp0 ? ` (XP ${m.xp0})` : ''}`);
  { const h = Sh.usableHero(s.hero), A = AD.advOf(h, s.adv[h]), on = !!(A && A.tower && (A.tower[tab] || A.tower.bar)); $('labAdv').classList.toggle('hidden', !on); // 전직 보너스 (출정 영웅의 분기만, 연구와 곱)
    if (on) setH($('labAdv'), `⚜ 전직 보너스 · ${A.icon} ${A.n}: <b>${A.td}</b>`); }
  $('labBody').querySelectorAll('.labRow').forEach(row => { const k = row.dataset.k, R = GR.RES[k], lv = r[k], max = lv >= R.max, why = GR.resBlock(s, tab, k), c = GR.resCost(k, lv);
    setH(row.querySelector('.lrLv'), `Lv.${lv}/${R.max}`); row.querySelectorAll('.lrPips i').forEach((p, i) => p.classList.toggle('on', i < lv)); row.classList.toggle('max', max);
    setH(row.querySelector('.lrD'), max ? `<b>${R.d(lv)}</b> (최대)` : `${lv ? R.d(lv) : '효과 없음'} → <b>${R.d(lv + 1)}</b>`);
    const btn = row.querySelector('.lrBtn'); setH(btn, max ? '연구 완료' : `연구 <small>🔮 ${c.souls} · ${MATN[R.mat]} ${c[R.mat]}</small>`); const dis = !!why; if (btn.disabled !== dis) btn.disabled = dis;
    setH(row.querySelector('.lrLock'), !max && why && why !== '최대' ? '🔒 ' + why : ''); });
  { const row = $('labBar'), lv = SX.barLv(s), max = lv >= SX.BAR.max, why = SX.barBlock(s), d = l => `바리케이드 체력 +${Math.round(SX.BAR.per * l * 100)}%`;
    setH(row.querySelector('.lrLv'), `Lv.${lv}/${SX.BAR.max}`); row.querySelectorAll('.lrPips i').forEach((p, i) => p.classList.toggle('on', i < lv)); row.classList.toggle('max', max);
    setH(row.querySelector('.lrD'), max ? `<b>${d(lv)}</b> (최대)` : `${lv ? d(lv) : '효과 없음'} → <b>${d(lv + 1)}</b>`);
    const btn = row.querySelector('.lrBtn'); setH(btn, max ? '연구 완료' : `보강 <small>${MATN.steel} ${SX.barCost(lv)}</small>`); const dis = !!why; if (btn.disabled !== dis) btn.disabled = dis;
    setH(row.querySelector('.lrLock'), !max && why && why !== '최대' ? '🔒 ' + why : ''); }
}
G.openLab = openLab; G.labTab = t => { tab = t; renderLab(); };
