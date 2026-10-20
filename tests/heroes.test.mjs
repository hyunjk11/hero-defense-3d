// 영웅 표 완전성 (순수 로직): node tests/heroes.test.mjs
// 영웅 키(data/heroes.js CLASSES)가 모든 영웅별 표(장비 이름·전설 스킬 풀·아이콘·모델·별칭·상점·서버 스키마)에 빠짐없이 있는지 검사.
// (예전 '총사 아이콘 undefined' 버그는 ICON 표에 gunner 가 빠져서 생김 → 이제 icon 은 CLASSES 안에 두고 여기서 검사)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLASSES, HERO_KEYS, heroLabel } from '../src/data/heroes.js';
import * as P from '../src/account/progress.js';
import * as E from '../src/account/equip.js';
import { SHOP } from '../src/config/shop.js';
const R = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

assert.deepEqual([...HERO_KEYS], ['archer', 'mage', 'warrior', 'gunner', 'mechanic']);
assert.equal(P.HEROES, HERO_KEYS, 'progress.HEROES = data/heroes.js 단일 기준');
const chars = R('src/render/characters.js'), ASSETS = JSON.parse(chars.match(/const ASSETS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
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
const gear = R('src/ui/gear.js'); assert.ok(/HERO_KEYS\.map\(k => \[k, CLASSES\[k\]\.icon\]\)/.test(gear), 'gear ICON from CLASSES');
console.log('heroes.test OK', HERO_KEYS.length, 'heroes');
