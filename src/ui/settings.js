// Q-11b 설정 한 곳으로 (2026-10-23): 메뉴 ⚙ 설정(#mnSettings)과 전투 ⚙ 설정(#sndPanel)의 칸을 이 표 하나로 만든다.
// id 는 테스트·기존 코드가 쓰는 이름 그대로 (메뉴 st*, 전투 bgmOn/bgmVol…) — 표에서 두 이름을 같이 관리하고, 한쪽을 바꾸면 다른 쪽 칸도 같은 값으로 맞춤.
// 다른 모듈(input.js sndUI · flow.js · speed.js · gfx.js)이 평가되기 전에 DOM 이 있어야 하므로 main.js 가 맨 먼저 import 한다.
const ROWS = [
  { n: '배경음악', chk: ['stBgmOn', 'bgmOn'], rng: ['stBgm', 'bgmVol'] },
  { n: '효과음', chk: ['stSfxOn', 'sfxOn'], rng: ['stSfx', 'sfxVol'] },
  { n: '백그라운드에서 음소거', chk: ['stBgMute', 'bgMute'] },
  { n: '×2 배속을 다음 판에도 유지', chk: ['stKeepSpd', 'sndKeepSpd'] },
  { n: '다음 웨이브 자동 시작 (건설 15초 뒤)', chk: ['stAutoWave', 'sndAutoWave'] }, // Q-13 (ui/autowave.js)
  { n: '⚡ 스킬 자동 사용 (AUTO · Z)', chk: ['stAutoSkill', 'sndAutoSkill'] }, // 2026-10-24 (heroes/autoskill.js)
];
export const SETTING_IDS = ROWS.flatMap(r => [r.chk, r.rng].filter(Boolean)); // [[메뉴 id, 전투 id], …]
export function settingsHtml(w) { // w = 0 메뉴, 1 전투
  return ROWS.map(r => `<label class="snd"><input type="checkbox" id="${r.chk[w]}"> ${r.n}${r.rng ? ` <input type="range" id="${r.rng[w]}" min="0" max="100">` : ''}</label>`).join('')
    + '<div class="gfxRow"><span>그래픽</span><div class="gfxSeg"><button data-gfx="auto">자동</button><button data-gfx="high">고품질</button><button data-gfx="perf">성능</button></div></div><div class="gfxNow"></div>'
    + '<div class="sndHint">M 키: 전체 음소거</div>';
}
function mount() {
  const mn = document.getElementById('mnSettings'), sp = document.getElementById('sndPanel'); if (!mn || !sp || sp.querySelector('#bgmOn')) return;
  mn.innerHTML = settingsHtml(0); sp.insertAdjacentHTML('beforeend', settingsHtml(1));
  for (const pair of SETTING_IDS) { const [a, b] = pair.map(id => document.getElementById(id));
    const copy = (src, dst) => () => { if (src.type === 'checkbox') dst.checked = src.checked; else dst.value = src.value; };
    a.addEventListener('input', copy(a, b)); a.addEventListener('change', copy(a, b)); b.addEventListener('input', copy(b, a)); b.addEventListener('change', copy(b, a)); }
}
if (typeof document !== 'undefined') mount();
