// C-7 전역 G 레지스트리 스캐너 — src 에서 G 에 붙이는 속성 전부(초기 선언 · G.x = · Object.assign(G, {...}))를 모음
// 사용: node tests/gregistry.mjs --write  → docs/G_REGISTRY.md 의 자동 표를 다시 씀 (설명 칸은 사람이 고친 것을 유지)
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
const ROOT = new URL('..', import.meta.url).pathname, SRC = join(ROOT, 'src'), DOC = join(ROOT, 'docs/G_REGISTRY.md');
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'lib' ? [] : walk(p)) : p.endsWith('.js') ? [p] : []; });
export function scan() {
  const M = new Map(), add = (k, f) => { if (!M.has(k)) M.set(k, new Set()); M.get(k).add(f); };
  for (const p of walk(SRC)) { const f = relative(SRC, p), s = readFileSync(p, 'utf8');
    for (const m of s.matchAll(/\bG\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\?\?=|\|\|=|&&=|\+=|-=|\+\+|--)/g)) add(m[1], f);
    for (const m of s.matchAll(/Object\.assign\(G,\s*\{([^}]*)\}/g)) for (const k of m[1].split(',')) { const n = k.trim().split(/[:\s]/)[0]; if (/^[A-Za-z_$][\w$]*$/.test(n)) add(n, f); }
    if (f === 'core/state.js') { const b = s.match(/window\.G = \{([\s\S]*?)\n\};/); if (b) for (const m of b[1].matchAll(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:/gm)) add(m[1], f); }
  }
  // state.js 초기 객체 안쪽 중첩 키(ups.atk 등) 제외: 최상위 키만 — 중첩 객체 내용을 지우고 다시 읽음
  const s = readFileSync(join(SRC, 'core/state.js'), 'utf8').match(/window\.G = \{([\s\S]*?)\n\};/)[1];
  let flat = s, prev; do { prev = flat; flat = flat.replace(/\{[^{}]*\}/g, '0'); } while (flat !== prev);
  const top = new Set([...flat.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map(m => m[1]));
  for (const [k, fs] of M) if (fs.size === 1 && fs.has('core/state.js') && !top.has(k)) M.delete(k);
  return M;
}
export function documented() { if (!existsSync(DOC)) return new Set(); return new Set([...readFileSync(DOC, 'utf8').matchAll(/^\| `([A-Za-z_$][\w$]*)` \|/gm)].map(m => m[1])); }
if (process.argv.includes('--write')) {
  const M = scan(), old = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '', desc = new Map([...old.matchAll(/^\| `([\w$]+)` \|[^|]*\|[^|]*\| (.*) \|$/gm)].map(m => [m[1], m[2]]));
  const tests = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.py')).map(f => readFileSync(join(ROOT, 'tests', f), 'utf8')).join('\n');
  const guess = k => /^(open|close|town|on|set|pick|show|go|start|choose|cast|load|dg(Pick|TakeBless))[A-Z]/.test(k) || /^(withHero|heroGoTo|heroShot|tileXZ|build|buildReason|carve|damageTile|refreshTile)$/.test(k) ? '함수 훅 (다른 모듈·테스트가 호출)' : /N$|Kills$|Dmg|Hits$|Log$/.test(k) ? '계측/카운터 (테스트·통계용)' : /^dg/.test(k) ? '던전 상태' : /^(legend|lfx)/.test(k) ? '전설 스킬 상태' : /^uq/.test(k) ? '고유 장비 상태' : '';
  const rows = [...M.keys()].sort((a, b) => a.localeCompare(b)).map(k => { const n = (tests.match(new RegExp('\\bG\\.' + k.replace('$', '\\$') + '\\b', 'g')) || []).length;
    const fs = [...M.get(k)].sort(), g = guess(k) || (fs.includes('core/state.js') ? '기본 상태 (state.js 초기값)' : fs.join() === 'main.js' ? 'main.js 가 노출하는 값/함수' : '');
    return `| \`${k}\` | ${fs.join(' · ')} | ${n} | ${desc.get(k) || g} |`; });
  const head = old.split('\n<!-- AUTO -->')[0] || '';
  writeFileSync(DOC, head + '\n<!-- AUTO -->\n| 속성 | 설정하는 모듈 (src/) | 테스트 참조 수 | 설명 |\n|---|---|---:|---|\n' + rows.join('\n') + '\n');
  console.log('wrote', rows.length, 'rows');
}
