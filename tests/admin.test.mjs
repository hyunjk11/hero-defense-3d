// node tests/admin.test.mjs — 관리자 순수 로직 (src/account/adminlogic.js)
import * as L from '../src/account/adminlogic.js';
let n = 0, f = 0; const ok = (name, c, info = '') => { n++; if (!c) { f++; console.log('FAIL', name, info); } else console.log('OK  ', name); };
ok('reward_build', JSON.stringify(L.buildReward({ souls: '500', steel: 0, crystal: 2e7, hero: 'gunner' })) === '{"souls":500,"crystal":1000000,"hero":"gunner"}');
ok('reward_build_neg_bad_hero', JSON.stringify(L.buildReward({ souls: -5, steel: 'x', hero: 'warrior' })) === '{}');
ok('reward_valid', L.validReward(null) && L.validReward({ souls: 1 }) && L.validReward({ hero: 'mechanic' }) && !L.validReward({ gold: 1 }) && !L.validReward({ souls: 1.5 }) && !L.validReward({ souls: 1000001 }) && !L.validReward([]) && !L.validReward({ hero: 'mage' }));
ok('reason', L.cleanReason('  환불  ') === '환불' && L.cleanReason('   ') === null && L.cleanReason('x'.repeat(201)) === null && L.cleanReason(null) === null && L.cleanReason('x'.repeat(200)).length === 200);
ok('email', L.validEmail('a@b.kr') && !L.validEmail('a@b') && !L.validEmail(' ') && !L.validEmail('a b@c.kr'));
ok('reason_msg', L.reasonMsg('self').includes('자기') && L.reasonMsg('zzz').includes('zzz'));
ok('errs', L.isMissingErr({ code: 'PGRST202' }) && !L.isMissingErr({ code: '42501' }) && L.isForbiddenErr({ code: '42501' }) && L.isBannedErr({ code: '42501', hint: 'banned' }) && L.isBannedErr({ message: 'banned' }) && !L.isBannedErr({ message: 'forbidden' }));
let p = L.pageInfo(45, 20, 20); ok('page_mid', p.page === 2 && p.pages === 3 && p.prev === 0 && p.next === 40, p);
p = L.pageInfo(0, 0, 20); ok('page_empty', p.page === 1 && p.pages === 1 && p.prev === null && p.next === null, p);
p = L.pageInfo(40, 20, 20); ok('page_last', p.page === 2 && p.next === null, p);
const sp = L.summaryParts({ stars: 12, hstars: 3, souls: 12345, crystal: 7, essence: 1, bestWave: 30, runs: 9, adv: { gunner: 'thorn' } }, h => h.toUpperCase(), (h, b) => b + '!');
ok('summary', sp[0] === '★ 12 · 하드 ★ 3' && sp[1].includes('12,345') && sp[3] === '전직: GUNNER→thorn!', sp);
ok('summary_none', L.summaryParts(null)[0] === '저장 없음' && L.summaryParts({ adv: {} })[3] === '전직: 없음');
const now = Date.parse('2026-10-22T12:00:00Z');
const NS = [{ id: 1, title: 'a', active: true, created_at: '2026-10-20T00:00:00Z' }, { id: 2, title: 'b', active: true, created_at: '2026-10-21T00:00:00Z' }, { id: 3, title: 'off', active: false, created_at: '2026-10-21T00:00:00Z' },
  { id: 4, title: 'future', active: true, starts_at: '2026-10-23T00:00:00Z', created_at: '2026-10-21T00:00:00Z' }, { id: 5, title: 'ended', active: true, ends_at: '2026-10-22T11:00:00Z', created_at: '2026-10-21T00:00:00Z' }];
ok('notices_active', L.activeNotices(NS, now).map(x => x.id).join() === '2,1');
ok('notices_pending', L.pendingNotices(NS, ['2'], now).map(x => x.id).join() === '1' && L.pendingNotices(NS, [1, 2], now).length === 0 && L.pendingNotices(null, null, now).length === 0);
let ds = []; for (let i = 0; i < 250; i++) ds = L.dismissNotice(ds, i); ok('dismiss_cap', ds.length === L.NOTICE_KEEP && ds.at(-1) === '249' && L.dismissNotice(['1'], 1).length === 1);
ok('notice_state', L.noticeState(NS[0], now) === 'on' && L.noticeState(NS[2], now) === 'off' && L.noticeState(NS[3], now) === 'wait' && L.noticeState(NS[4], now) === 'ended');
ok('local_iso', L.localToIso('') === null && L.localToIso('zz') === null && L.isoToLocal(L.localToIso('2026-10-22T09:30')) === '2026-10-22T09:30' && L.isoToLocal(null) === '');
ok('log_detail', L.logDetail({ detail: { item: 'hero_gunner', reason: '오지급' } }) === '로즈 · 사유: 오지급' && L.logDetail({ detail: { title: 't', recipients: 3, reward: { souls: 1 } } }, () => '영혼석 1') === '「t」 · 영혼석 1 · 3명' && L.logDetail({}) === '');
ok('action_names', ['order_approve', 'order_reject', 'order_refund', 'mail_send', 'broadcast', 'hero_grant', 'hero_revoke', 'ban', 'unban', 'notice_create', 'notice_update', 'notice_deactivate', 'admin_add', 'admin_remove'].every(k => L.ACTION_N[k]));
ok('broadcast_text', L.broadcastConfirmText(12, '영혼석 300').includes('12명') && L.broadcastConfirmText(3, '').indexOf('보상') < 0);
console.log(`${n - f}/${n}`, f ? 'FAIL' : 'ALL OK'); process.exit(f ? 1 : 0);
