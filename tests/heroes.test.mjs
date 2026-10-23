// 영웅 표 완전성 (순수 로직): node tests/heroes.test.mjs
// 영웅 키(data/heroes.js CLASSES)가 모든 영웅별 표(장비 이름·전설 스킬 풀·아이콘·모델·별칭·상점·서버 스키마)에 빠짐없이 있는지 검사.
// (예전 '총사 아이콘 undefined' 버그는 ICON 표에 gunner 가 빠져서 생김 → 이제 icon 은 CLASSES 안에 두고 여기서 검사)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLASSES, HERO_KEYS, HIDDEN_HEROES, VISIBLE_HEROES, DEFAULT_HERO, isHidden, heroLabel } from '../src/data/heroes.js';
import * as P from '../src/account/progress.js';
import * as E from '../src/account/equip.js';
import { SHOP } from '../src/config/shop.js';
const R = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

assert.deepEqual([...HERO_KEYS], ['archer', 'mage', 'warrior', 'gunner', 'mechanic', 'fighter']);
assert.equal(P.HEROES, HERO_KEYS, 'progress.HEROES = data/heroes.js 단일 기준');
const chars = R('src/render/characters.js'), ASSETS = JSON.parse(chars.match(/const ALL_ASSETS = (\[[^\]]*\])/)[1].replace(/'/g, '"')); // 숨긴 영웅 모델도 목록에는 남김 (실제 로딩에서만 제외)
let seed = 3; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const h of HERO_KEYS) {
  const C = CLASSES[h];
  for (const f of ['n', 'nm', 'icon', 'model', 'skill', 'atk']) assert.ok(typeof C[f] === 'string' && C[f].length, `${h}.${f}`);
  for (const f of ['hp', 'dmg', 'rate', 'range', 'speed', 'armor', 'cd', 'atkSpd', 'color']) assert.ok(Number.isFinite(C[f]), `${h}.${f}`);
  assert.ok(!/undefined/.test(heroLabel(h)), `${h} label`);
  // 모델: 로딩 목록에 있고 파일이 존재
  assert.ok(ASSETS.includes(C.model), `${h}: ${C.model} not in characters.js ASSETS`);
  assert.ok(fs.existsSync(new URL(`../models/${C.model}.glb`, import.meta.url)), `${h}: models/${C.model}.glb missing`);
  // 장비: 모든 등급의 무기 이름(빈 이름·undefined 없음), 전설 스킬 풀 2개(해당 영웅 전용)
  for (let g = 0; g < 5; g++) { const it = E.makeItem('weapon', h, g, r); assert.ok(it.n && !/undefined/.test(it.n), `${h} g${g} weapon name`); assert.equal(it.h, h); }
  assert.equal((E.LPOOL[h] || []).length, 2, `${h} LPOOL`); for (const k of E.LPOOL[h]) assert.equal(E.LSK[k] && E.LSK[k].h, h, `${h} LSK ${k}`);
  assert.equal(E.heroKey(h), h); assert.equal(E.heroKey(C.n), h, `${h}: 한국어 직업 별칭`);
  // 세이브 기본값/정리: 영웅별 레벨·장비 칸
  const s = P.empty(); assert.ok(s.heroLv[h] && s.eq[h], `${h} empty save`); const c = P.clean({}); assert.ok(c.heroLv[h] && c.eq[h], `${h} clean save`);
}
for (const v of Object.values(E.HERO_ALIAS)) assert.ok(HERO_KEYS.includes(v), `alias → ${v}`);
for (const L of Object.values(E.LSK)) assert.ok(HERO_KEYS.includes(L.h));
// 유료 영웅 ↔ 상점 상품 ↔ 서버 스키마 (hd3d_item_reward / owned·orders check / valid_reward)
const paid = HERO_KEYS.filter(h => CLASSES[h].paid), sql = R('supabase/schema.sql');
assert.deepEqual(Object.values(SHOP.items).map(i => i.hero).sort(), [...paid].sort(), '상점 상품 = 유료 영웅');
for (const h of paid) { assert.equal(SHOP.items['hero_' + h].hero, h); assert.ok(sql.includes(`when 'hero_${h}' then '{"hero":"${h}"}'`), `schema reward ${h}`);
  assert.ok((sql.match(new RegExp(`'hero_${h}'`, 'g')) || []).length >= 6, `schema item checks hero_${h}`); assert.ok(new RegExp(`r ->> 'hero' in \\([^)]*'${h}'`).test(sql), `schema valid_reward ${h}`); }
// UI 아이콘 표는 CLASSES.icon 에서 생성 (gear.js 에 영웅 이모지 하드코딩 금지)
const gear = R('src/ui/itemview.js'); assert.ok(/HERO_KEYS\.map\(k => \[k, CLASSES\[k\]\.icon\]\)/.test(gear), 'gear ICON from CLASSES');
// ---------- 숨긴 영웅 (CLASSES[k].hidden) ----------  플래그 하나로: 선택 줄·마을 카드·상점·모델 로딩·새 드롭·저장 영웅 이전
assert.deepEqual([...HIDDEN_HEROES], HERO_KEYS.filter(k => CLASSES[k].hidden)); assert.deepEqual(VISIBLE_HEROES, HERO_KEYS.filter(k => !CLASSES[k].hidden));
assert.ok(VISIBLE_HEROES.length >= 1 && !isHidden(DEFAULT_HERO) && !CLASSES[DEFAULT_HERO].paid, 'DEFAULT_HERO = 보이는 무료 영웅');
const sel = R('src/ui/select.js'), flow = R('src/ui/flow.js'), shopUi = R('src/ui/shop.js'), mainJs = R('src/main.js');
assert.ok(/const L = VISIBLE_HEROES/.test(sel), '영웅 단상 = VISIBLE_HEROES'); assert.ok(/classList\.toggle\('hidden', isHidden\(c\.dataset\.cls\)\)/.test(sel), '선택 카드 숨김');
assert.ok(/if \(isHidden\(cls\) \|\| !CLASSES\[cls\]\) cls = DEFAULT_HERO/.test(sel), 'choose(숨긴 영웅) → 기본 영웅');
assert.ok(/VISIBLE_HEROES\.map\(h =>/.test(flow) && !/P\.HEROES\.map\(h =>/.test(flow), '마을 영웅 카드 = VISIBLE_HEROES');
assert.ok(/PKEYS = Object\.keys\(SHOP\.items\)\.filter\(Sh\.onSale\)/.test(shopUi), '상점 목록 = 판매 중');
assert.ok(!/HERO_KEYS/.test(mainJs.split('function bootPlan')[1].split('\n}')[0]), 'bootPlan 은 VISIBLE_HEROES 만');
assert.ok(/const ASSETS = ALL_ASSETS\.filter\(k => !HIDDEN_ASSETS\.includes\(k\)\)/.test(chars) && /HIDDEN_ASSETS\.includes\(k\)\) return Promise\.reject/.test(chars), '숨긴 영웅 모델 로딩 안 함');
{ // 브라우저 전역 최소 스텁 → account.js / account/shop.js 를 node 에서 실행
  const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  globalThis.addEventListener = () => {}; globalThis.document = { addEventListener() {}, visibilityState: 'visible' }; globalThis.location = { search: '', hostname: 'localhost', href: 'http://localhost/' };
  for (const h of HIDDEN_HEROES) {
    mem.hd3d_save = JSON.stringify({ hero: h, heroLv: { [h]: { hp: 3, atk: 2 } }, inv: [{ id: 'hx1', s: 'weapon', h, g: 2, n: 'x', m: ['atk', 9], sub: [], e: 0 }], eq: { [h]: { weapon: 'hx1' } } });
    const Acc = await import('../src/account/account.js'), Sh = await import('../src/account/shop.js');
    const s = Acc.load(); assert.equal(s.hero, DEFAULT_HERO, `저장 영웅 ${h} → ${DEFAULT_HERO}`); assert.equal(JSON.parse(mem.hd3d_save).hero, DEFAULT_HERO, '이전 결과 저장됨');
    assert.deepEqual(s.heroLv[h], { hp: 3, atk: 2 }, '숨긴 영웅 강화 유지'); assert.ok(s.inv.some(x => x.id === 'hx1') && s.eq[h].weapon === 'hx1', '숨긴 영웅 아이템·장착 유지');
    assert.equal(Sh.heroOwned(h), false, '선택 불가'); assert.equal(Sh.usableHero(h), DEFAULT_HERO);
    const item = Object.keys(SHOP.items).find(k => SHOP.items[k].hero === h); if (item) { assert.equal(Sh.onSale(item), false, '상점에 없음'); assert.equal((await Sh.order(item)).ok, false, '구매 신청 불가');
      assert.ok(sql.includes(`'${item}'`), 'schema 상품은 유지'); }
    for (let i = 0; i < 40; i++) { const it = E.randomItem(h, E.chestOdds(3), r, 'weapon'); assert.notEqual(it.h, h, '숨긴 영웅 무기 새 드롭 없음'); }
  }
  for (const h of VISIBLE_HEROES) if (CLASSES[h].paid) assert.equal((await import('../src/account/shop.js')).onSale('hero_' + h), true, `${h} 판매 중`);
}
// 챕터 세트 이름 표(data/items.js CHSET): 모든 영웅(숨김 포함)의 무기 이름 5등급 · 고유 무기는 보이는 영웅만
{ const { CHSET, UQ } = await import('../src/data/items.js'); for (const ch in CHSET) for (const h of HERO_KEYS) { assert.equal((CHSET[ch].names[h] || []).length, 5, `CHSET ${ch} ${h}`); for (let g = 0; g < 5; g++) { const it = E.makeItem('weapon', h, g, r, +ch); assert.equal(it.n, CHSET[ch].names[h][g]); assert.equal(it.c, +ch); } }
  for (const k in UQ) if (UQ[k].h) assert.ok(VISIBLE_HEROES.includes(UQ[k].h), `고유 무기 ${k}: 숨긴 영웅 전용 금지`); }
console.log('heroes.test OK', HERO_KEYS.length, 'heroes,', HIDDEN_HEROES.size, 'hidden');
