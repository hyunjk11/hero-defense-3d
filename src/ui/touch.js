// 태블릿/터치: 게임 화면 안에서 브라우저 확대·스크롤·길게 누르기 메뉴·텍스트 선택을 막는다 (게임 조작은 그대로)
const editable = t => t && t.closest && t.closest('input,textarea,[contenteditable]');
// iOS Safari는 user-scalable=no 를 무시하므로 핀치/제스처 확대를 직접 막음
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); else if (!e.target.closest || !e.target.closest('.bigPanel,.twLeft,#build,#ups,#tinfo,#twBless,.fcard,#townPop,.smGrid,.smList,#invDetail,.settings,#sndPanel,input,.stMap')) e.preventDefault(); }, { passive: false });
// 빠른 두 번 탭 확대는 CSS touch-action: manipulation 으로 막고, 남은 dblclick 기본 동작도 차단
document.addEventListener('dblclick', e => { if (!editable(e.target)) e.preventDefault(); }, { passive: false });
// 길게 누르기: 컨텍스트 메뉴·선택 막기
document.addEventListener('contextmenu', e => { if (!editable(e.target)) e.preventDefault(); });
document.addEventListener('selectstart', e => { if (!editable(e.target)) e.preventDefault(); });
