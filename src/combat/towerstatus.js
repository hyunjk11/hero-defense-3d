// 타워 상태이상 (챕터 몬스터 디버프) — 순수 함수, 단일 기준 (node 테스트: tests/towerstatus.test.mjs)
//  정지(공격·조준 멈춤, 쿨타임도 멈춤): 속박 rootT · 용암 웅덩이 meltT · 저주/어둠의 파동 봉인 curseT
//  감속(쿨타임이 천천히 줄어듦): 빙결 frostT(×frostK) · 한기 chillT(G.t 기준 만료, ×chillK)
// 쿨타임은 '멈춤'이라 상태가 끝나도 몰아 쏘기 없음 (발사 시 cd = 1/rate 로 다시 채움)
export const towerDisabled = tw => tw.rootT > 0 || tw.meltT > 0 || tw.curseT > 0;
export function towerRateK(tw, t) { if (towerDisabled(tw)) return 0; let k = 1; if (tw.frostT > 0) k *= tw.frostK; if (tw.chillT > t) k *= tw.chillK; return k; }
// 매 프레임: 쿨타임 진행 → 이번 프레임에 조준·공격할 수 있으면 true
export function towerCdStep(tw, dt, t) { const k = towerRateK(tw, t); tw.cd -= k === 1 ? dt : dt * k; return !towerDisabled(tw); }
