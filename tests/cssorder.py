#!/usr/bin/env python3
"""U-3 검증 보조 (2026-10-23): @media 블록을 파일 끝으로 옮겼을 때 캐스케이드 결과가 바뀔 수 있는 쌍 찾기.
  python3 tests/cssorder.py OLD.css   # OLD 의 @media 안 규칙 R 뒤에 오던 일반 규칙 Q 가 같은 명시도 · 같은 속성 계열 · 같은 요소를 고를 수 있으면 출력
(옮긴 뒤엔 R 이 Q 보다 뒤 → 이전엔 Q 가 이겼는데 이제 R 이 이김). 서로 다른 질의 블록끼리 순서 바뀐 것도 같은 방식으로 (질의 이름 출력)."""
import sys, re
sys.path.insert(0, __import__('os').path.dirname(__file__))
from cssmerge import split_decls, fam, specs, disjoint
def walk(s, a, b, media, out):
    i = a
    while i < b:
        if s.startswith('/*', i): i = s.index('*/', i) + 2; continue
        if s[i].isspace(): i += 1; continue
        j = s.index('{', i); sel = re.sub(r'\s+', ' ', s[i:j].strip()); d = 0; k = j
        while True:
            if s.startswith('/*', k): k = s.index('*/', k) + 2; continue
            if s[k] == '{': d += 1
            elif s[k] == '}':
                d -= 1
                if d == 0: break
            k += 1
        if sel.startswith('@media'): walk(s, j + 1, k, re.sub(r'\s+', '', sel[6:]), out)
        elif not sel.startswith('@'): out.append((media, sel, split_decls(s[j + 1:k])))
        i = k + 1
    return out
import pathlib, itertools
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / 'index.html').read_text(encoding='utf-8') + ''.join(f.read_text(encoding='utf-8') for f in (ROOT / 'src').rglob('*.js'))
W = set(re.findall(r"classList\.(?:add|toggle|remove|replace)\(\s*['\"]([\w-]+)", SRC)) | {'hidden', 'on', 'sel', 'off', 'show', 'open', 'active', 'dis', 'lock', 'new'}
SETS, IDS = [], {}
for m in re.finditer(r"class(?:Name)?\s*=\s*([\"'`])(.*?)\1", SRC):
    v = m.group(2); W |= set(re.findall(r"['\"]([\w-]+)['\"]", ' '.join(re.findall(r'\$\{([^}]*)\}', v))))
    toks = set(t for t in re.sub(r'\$\{[^}]*\}', ' ', v).split() if re.match(r'^[\w-]+$', t)); SETS.append(toks)
    pre = SRC[max(0, m.start() - 300):m.end() + 300]
for m in re.finditer(r'<[a-zA-Z]+[^>]*\bid="([\w-]+)"[^>]*>', SRC):
    c = re.search(r'class="([^"]*)"', m.group(0)); IDS[m.group(1)] = set(c.group(1).split()) if c else set()
def comp(sel):
    last = re.split(r'[\s>+~]+', sel.strip())[-1]; last = re.sub(r':[\w-]+(\([^)]*\))?', '', last)
    return set(re.findall(r'\.([\w-]+)', last)), (re.findall(r'#([\w-]+)', last) or [None])[0]
def comatch(x, y):
    (ca, ia), (cb, ib) = comp(x), comp(y)
    if ia and ib and ia != ib: return False
    need = (ca | cb) - W; i = ia or ib
    if i is not None and i in IDS: return need <= IDS[i]
    if not need: return True
    return any(need <= e for e in SETS)
s = open(sys.argv[1], encoding='utf-8').read(); R = walk(s, 0, len(s), None, [])
def conflict(a, b):
    if all(disjoint(x, y) or not comatch(x, y) for x in a[1].split(',') for y in b[1].split(',')): return None
    sa, sb = set(specs(a[1])), set(specs(b[1]))
    if not (None in sa or None in sb or sa & sb): return None
    fa = {fam(p) for p, v in a[2]}; fb = {fam(p) for p, v in b[2]}; c = fa & fb
    return c or None
n = 0
for i, r in enumerate(R):
    if r[0] is None: continue
    for q in R[i + 1:]:
        if q[0] == r[0]: continue  # 같은 질의 블록끼리는 원래 순서 유지
        c = conflict(r, q)
        if c and q[0] is None: n += 1; print(f'BASE-AFTER  @{r[0]} {r[1][:60]!r} <- {q[1][:60]!r} {sorted(c)}')
        elif c: n += 1; print(f'MEDIA-ORDER @{r[0]} {r[1][:50]!r} vs @{q[0]} {q[1][:50]!r} {sorted(c)}')
print('CANDIDATES', n)
