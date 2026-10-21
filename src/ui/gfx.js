// 그래픽 품질 토글 (메뉴 설정 + 게임 안 소리/설정 패널). 저장은 이 기기 localStorage (render/quality.js)
import { Q } from '../render/quality.js';
const WHY = { touch: '터치 기기 감지', weak: '저사양 기기 감지', fps: '프레임 저하 감지', 'fps-saved': '이전에 프레임 저하 감지', auto: '', setting: '', url: 'URL 지정' };
function sync() {
  document.querySelectorAll('.gfxSeg button').forEach(b => b.classList.toggle('on', b.dataset.gfx === Q.mode));
  const w = WHY[Q.why] || ''; document.querySelectorAll('.gfxNow').forEach(n => n.textContent = `지금: ${Q.perf ? '성능 모드 (외곽선·그림자 줄임)' : '고품질'}${w ? ' · ' + w : ''}`);
}
document.querySelectorAll('.gfxSeg button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); Q.set(b.dataset.gfx); sync(); }));
Q.onChange(sync); sync();
