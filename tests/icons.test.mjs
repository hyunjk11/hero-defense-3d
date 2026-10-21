// 아이콘 글리프 안전성: node tests/icons.test.mjs
// 규칙 (Windows 10 Segoe UI Emoji 에서 두부 ▯ / 두 글자로 갈라지는 문제 방지 — 2026-10-21 🪄 글라시아 아이콘 버그):
//  1) 게임 UI 소스(src/**/*.js · index.html · style.css)의 모든 글자는 Unicode 11.0 이하 — 이모지·기호 블록(U+2000–2BFF, U+1F000–1FAFF)에서
//     Unicode 12.0 이후 추가된 코드 포인트(BANNED_RANGES, DerivedAge.txt 에서 생성)는 금지. (Windows 10 1809 = Emoji 11 까지)
//  2) ZWJ(U+200D) 결합·피부색(U+1F3FB–1F3FF)·머리 구성요소(U+1F9B0–1F9B3)·국기(지역 표시 U+1F1E6–1F1FF)·태그(U+E0020–E007F)·키캡(U+20E3) 금지
//     — Windows 는 🐻‍❄️ 를 🐻❄️ 두 글자로, 🇰🇷 를 'KR' 글자로 그림
//  3) 아이콘 데이터(영웅·고유·챕터 배지·몬스터·전직 분기)는 글자 1개(+ 선택 U+FE0F) = 그래핌 1개
//  4) 고유 아이템 아이콘끼리, 영웅 무기 아이콘끼리 서로 달라야 함 (같은 칸에 나란히 보일 때 구분)
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLASSES, HERO_KEYS } from '../src/data/heroes.js';
import { UQ, UQ_KEYS, CHSET } from '../src/data/items.js';
import { ETYPES } from '../src/data/monsters.js';
import { ADV } from '../src/data/advance.js';

const BANNED_RANGES = [[0x208F, 0x208F], [0x209D, 0x209F], [0x20C0, 0x20C4], [0x2427, 0x2429], [0x2B96, 0x2B97], [0x2BC9, 0x2BC9], [0x2BFF, 0x2BFF],
  [0x1F10D, 0x1F10F], [0x1F16C, 0x1F16F], [0x1F1AD, 0x1F1AE], [0x1F6D5, 0x1F6D9], [0x1F6DC, 0x1F6DF], [0x1F6FA, 0x1F6FC], [0x1F774, 0x1F77F], [0x1F7D9, 0x1F7DB],
  [0x1F7E0, 0x1F7EB], [0x1F7F0, 0x1F7FF], [0x1F8B0, 0x1F8BB], [0x1F8C0, 0x1F8C1], [0x1F8D0, 0x1F8D8], [0x1F90C, 0x1F90F], [0x1F93F, 0x1F93F], [0x1F971, 0x1F972],
  [0x1F977, 0x1F979], [0x1F97B, 0x1F97B], [0x1F9A3, 0x1F9AF], [0x1F9BA, 0x1F9BF], [0x1F9C3, 0x1F9CF], [0x1FA00, 0x1FAFF], // ← Unicode 12.0+ (🪄🪶🪨🩸🦾🟢🧊 …)
  [0x200D, 0x200D], [0x20E3, 0x20E3], [0x1F3FB, 0x1F3FF], [0x1F9B0, 0x1F9B3], [0x1F1E6, 0x1F1FF], [0xE0020, 0xE007F]]; // ← 결합 시퀀스 재료
const banned = cp => BANNED_RANGES.some(([a, b]) => cp >= a && cp <= b);
const hex = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

// 1·2) 소스 전체 스캔
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const files = [...walk('src'), 'index.html', 'style.css'], bad = [];
for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
  for (const ch of line) { const cp = ch.codePointAt(0); if (banned(cp)) bad.push(`${f}:${i + 1} ${hex(cp)} ${JSON.stringify(ch)}`); }
  for (const m of line.matchAll(/\\u\{?([0-9a-fA-F]{4,6})\}?|&#x([0-9a-fA-F]+);|&#(\d+);/g)) { const cp = m[1] ? parseInt(m[1], 16) : m[2] ? parseInt(m[2], 16) : +m[3]; if (banned(cp)) bad.push(`${f}:${i + 1} escape ${hex(cp)}`); }
});
assert.deepEqual(bad, [], 'Windows 10 에서 깨지는 글리프:\n' + bad.join('\n'));
assert.ok(files.length > 30, '소스 파일을 찾음');

// 3) 아이콘 데이터 = 그래핌 1개
const seg = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const icons = [
  ...HERO_KEYS.map(h => [`hero ${h}`, CLASSES[h].icon]),
  ...UQ_KEYS.filter(k => UQ[k].ic).map(k => [`uq ${k}`, UQ[k].ic]),
  ...Object.keys(CHSET).map(c => [`chset ${c}`, CHSET[c].badge]),
  ...Object.keys(ETYPES).filter(t => ETYPES[t].icon).map(t => [`mon ${t}`, ETYPES[t].icon]),
  ...Object.keys(ADV).flatMap(h => Object.keys(ADV[h]).map(b => [`adv ${h}.${b}`, ADV[h][b].icon])),
];
assert.ok(icons.length >= 40, '아이콘 데이터 수집 ' + icons.length);
for (const [k, ic] of icons) {
  assert.ok(typeof ic === 'string' && ic.length > 0, k + ' 아이콘 없음');
  const cps = [...ic].map(c => c.codePointAt(0));
  assert.equal([...seg.segment(ic)].length, 1, `${k} ${ic} 그래핌 1개`);
  assert.ok(cps.length === 1 || (cps.length === 2 && cps[1] === 0xFE0F), `${k} ${ic} = 글자 1개(+FE0F) — ${cps.map(hex).join(' ')}`);
  assert.ok(!banned(cps[0]), `${k} ${ic} ${hex(cps[0])} 금지 범위`);
}
// 4) 구분
const base = s => s.replace(/\uFE0F/g, '');
const uqIc = UQ_KEYS.filter(k => UQ[k].ic).map(k => base(UQ[k].ic)), heroIc = HERO_KEYS.map(h => base(CLASSES[h].icon));
assert.equal(new Set(uqIc).size, uqIc.length, '고유 아이콘 중복 ' + uqIc.join(' '));
assert.equal(new Set(heroIc).size, heroIc.length, '영웅 무기 아이콘 중복 ' + heroIc.join(' '));
for (const i of uqIc) assert.ok(!heroIc.includes(i) && !['🛡', '💍'].includes(i), `고유 아이콘 ${i} 이 일반 슬롯 아이콘과 같음`);
// 회귀 고정: 이번에 바꾼 아이콘
assert.equal(CLASSES.mage.icon, '🧙', '마법사 무기 아이콘 (🪄 U+1FA84 = Unicode 13 → Windows 10 두부)');
assert.notEqual(UQ.s_arm.ic, '🐻‍❄️');
console.log(`icons.test OK — ${files.length} files, ${icons.length} icons`);
