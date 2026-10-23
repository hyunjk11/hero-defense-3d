// 정적 점검 (경고만, 항상 exit 0): 죽은 export · 내부 전용 export · CSS 중복 셀렉터 · confirm( 사용 · esc 재정의
//   node tests/lint_unused.mjs          # 요약 + 죽은 코드 목록
//   node tests/lint_unused.mjs -v       # 내부 전용 / 테스트 전용 export 목록까지
// 죽은 export = 다른 파일(src·tests·html)에서 안 쓰고 같은 파일 안에서도 정의 한 번뿐.
import fs from 'fs'; import path from 'path'; import {execSync} from 'child_process'; import {fileURLToPath} from 'url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); process.chdir(root);
const V=process.argv.includes('-v');
const files=execSync('git ls-files src tests "*.html"').toString().trim().split('\n').filter(f=>/\.(js|mjs|html|py)$/.test(f)&&fs.existsSync(f)&&f!=='tests/lint_unused.mjs');
const txt=Object.fromEntries(files.map(f=>[f,fs.readFileSync(f,'utf8')]));
const dead=[],internal=[],testOnly=[];
for(const f of files.filter(f=>f.startsWith('src/'))){const t=txt[f];const names=new Set();
  for(const m of t.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g))names.add(m[1]);
  for(const m of t.matchAll(/export\s*\{([^}]*)\}/g))m[1].split(',').forEach(s=>{const n=s.trim().split(/\s+as\s+/).pop();if(n)names.add(n)});
  for(const n of names){const re=new RegExp('(?<![\\w$])'+n.replace(/\$/g,'\\$')+'(?![\\w$])','g');let ext=0,tst=0;
    for(const g of files){if(g===f)continue;const c=(txt[g].match(re)||[]).length;if(g.startsWith('tests/'))tst+=c;else ext+=c}
    const own=(t.match(re)||[]).length;
    if(ext)continue; if(tst)testOnly.push(`${f} ${n} (tests ${tst})`); else if(own>1)internal.push(`${f} ${n}`); else dead.push(`${f} ${n}`);}}
// CSS 같은 셀렉터 여러 번 (최상위 규칙만, @media 안은 따로 셈하지 않음)
let css=fs.existsSync('style.css')?fs.readFileSync('style.css','utf8').replace(/\/\*[\s\S]*?\*\//g,''):'';
const sel={};let depth=0,buf='',media=0;
for(const ch of css){if(ch==='{'){const s=buf.trim();if(depth===0&&!s.startsWith('@'))s.split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>sel[x]=(sel[x]||0)+1);if(depth===0&&s.startsWith('@media'))media++;depth++;buf='';}else if(ch==='}'){depth--;buf='';}else if(ch===';'&&depth===0)buf='';else buf+=ch;}
const dupSel=Object.entries(sel).filter(([,c])=>c>1).sort((a,b)=>b[1]-a[1]);
const grepSrc=re=>files.filter(f=>f.startsWith('src/')).flatMap(f=>txt[f].split('\n').map((l,i)=>re.test(l)?`${f}:${i+1}`:null).filter(Boolean));
const confirms=grepSrc(/(?<![\w$.])confirm\(/);
const escDefs=grepSrc(/(?:const|let|function)\s+esc\b/).filter(x=>!x.startsWith('src/core/util.js'));
console.log(`죽은 export ${dead.length} · 내부 전용 export ${internal.length} · 테스트 전용 export ${testOnly.length}`);
dead.forEach(x=>console.log('  DEAD',x));
if(V){internal.forEach(x=>console.log('  INTERNAL',x));testOnly.forEach(x=>console.log('  TESTONLY',x));}
console.log(`CSS 중복 셀렉터 ${dupSel.length} (상위: ${dupSel.slice(0,8).map(([s,c])=>s+'×'+c).join(' ')}) · 최상위 @media ${media}`);
console.log(`네이티브 confirm( ${confirms.length}${confirms.length?': '+confirms.join(' '):''}`);
console.log(`esc 재정의 (core/util.js 밖) ${escDefs.length}${escDefs.length?': '+escDefs.join(' '):''}`);
console.log('OK lint_unused (경고만)');
