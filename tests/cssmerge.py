#!/usr/bin/env python3
"""U-3b (2026-10-23): 같은 셀렉터(정확히 같은 글자)가 반응형 섹션 앞에서 여러 번 정의된 것을 첫 정의 한 곳으로 합침.
안전 규칙: 뒤 정의의 속성을 앞으로 올릴 때, 그 사이 규칙(어떤 셀렉터든)이 같은 속성 계열(padding/padding-top 등)을 쓰면 옮기지 않고 제자리에 남김 → 캐스케이드 결과 불변.
  python3 tests/cssmerge.py style.css [--dry]"""
import sys, re
FAM = {'top':'inset','left':'inset','right':'inset','bottom':'inset','inset':'inset','line-height':'font','row-gap':'gap','column-gap':'gap','gap':'gap'}
def fam(p):
    p = p.lower()
    if p.startswith('-webkit-'): p = p[8:]
    return FAM.get(p, p.split('-')[0])
def spec1(sel):
    """대략적 명시도 (id, class, type). :not/:is/:where/:has 는 None(= 항상 충돌로 취급)"""
    if re.search(r':(not|is|where|has|nth-[a-z-]+)\(', sel): return None
    s = re.sub(r'\[[^\]]*\]', ' .a ', sel)
    ids = len(re.findall(r'#[\w-]+', s)); pe = len(re.findall(r'::[\w-]+', s)); s2 = re.sub(r'::[\w-]+', '', s)
    cls = len(re.findall(r'\.[\w-]+', s2)) + len(re.findall(r':[\w-]+', s2))
    s3 = re.sub(r'[#.:][\w-]+', '', s2); typ = len(re.findall(r'(?:^|[\s>+~])([a-zA-Z][\w-]*)', s3)) + pe
    return (ids, cls, typ)
def subj(sel):
    """마지막 복합 셀렉터의 (id, 태그, 가상요소) — 서로 다르면 같은 요소를 고를 수 없음"""
    last = re.split(r'[\s>+~]+', sel.strip())[-1]
    i = re.search(r'#([\w-]+)', last); t = re.match(r'([a-zA-Z][\w-]*)', last); pe = re.search(r'::?(before|after|placeholder|selection|-webkit-[\w-]+)', last)
    return (i and i.group(1), t and t.group(1).lower(), pe and pe.group(1))
def disjoint(a, b):
    A, B = subj(a), subj(b)
    if A[0] and B[0] and A[0] != B[0]: return True
    if A[1] and B[1] and A[1] != B[1]: return True
    return A[2] != B[2]
def specs(sel): return [spec1(x.strip()) for x in sel.split(',')]
def split_decls(body):
    out, cur, d, q = [], '', 0, None
    for ch in body:
        if q: cur += ch; q = None if ch == q else q; continue
        if ch in '"\'': q = ch; cur += ch; continue
        if ch == '(': d += 1
        if ch == ')': d -= 1
        if ch == ';' and d == 0: out.append(cur); cur = ''; continue
        cur += ch
    if cur.strip(): out.append(cur)
    R = []
    for x in out:
        x = x.strip()
        if not x: continue
        k, _, v = x.partition(':'); R.append((k.strip(), v.strip()))
    return R
def parse(s, end):
    """최상위 항목: ('c', a, b) 주석 · ('r', a, b, sel, body_a, body_b) 규칙 · ('at', a, b) @블록"""
    i, items = 0, []
    while i < end:
        if s.startswith('/*', i): j = s.index('*/', i) + 2; items.append(('c', i, j)); i = j; continue
        if s[i].isspace(): i += 1; continue
        j = i
        while s[j] != '{': j += 1
        sel = s[i:j]; d = 0; k = j
        while True:
            if s.startswith('/*', k): k = s.index('*/', k) + 2; continue
            if s[k] == '{': d += 1
            elif s[k] == '}':
                d -= 1
                if d == 0: break
            k += 1
        if sel.strip().startswith('@'): items.append(('at', i, k + 1))
        else: items.append(('r', i, k + 1, re.sub(r'\s+', ' ', sel.strip()), j + 1, k))
        i = k + 1
    return items
def main(path, dry):
    s = open(path, encoding='utf-8').read(); end = s.index('/* ===== 반응형')
    items = [x for x in parse(s, end) if x[0] == 'r']
    decls = [split_decls(s[x[4]:x[5]]) for x in items]
    new = [list(d) for d in decls]; first = {}; moved = kept = 0; merged_sel = {}
    for idx, x in enumerate(items):
        sel = x[3]
        if sel not in first: first[sel] = idx; continue
        t = first[sel]; stay = []
        mine = set(specs(sel)); unknown = None in mine
        famsBetween = set()
        for m in range(t + 1, idx):
            sp = specs(items[m][3])
            if all(disjoint(a, b) for a in sel.split(',') for b in items[m][3].split(',')): continue
            if unknown or None in sp or mine & set(sp): famsBetween |= set(fam(p) for p, _ in decls[m])
            famsBetween |= set(fam(p) for p, v in decls[m] if '!important' in v)  # 중요도 섞임은 보수적으로
        for p, v in new[idx]:
            if sel == ':root' or fam(p) in famsBetween or '!important' in v: stay.append((p, v)); kept += 1
            else:
                new[t] = [(a, b) for a, b in new[t] if a.lower() != p.lower()] + [(p, v)]; moved += 1
                merged_sel[sel] = merged_sel.get(sel, 0) + 1
        new[idx] = stay
    if dry: print('moved', moved, 'kept', kept, 'selectors', len(merged_sel), sorted(merged_sel.items(), key=lambda a: -a[1])[:15]); return
    out = s
    for idx in range(len(items) - 1, -1, -1):
        x = items[idx]
        if new[idx] == decls[idx]: continue
        if not new[idx]:
            a, b = x[1], x[2]
            out = out[:a] + out[b:]
        else:
            out = out[:x[4]] + ';'.join(f'{p}:{v}' for p, v in new[idx]) + out[x[5]:]
    out = re.sub(r'\n[ \t]*\n', '\n', out[:out.index('/* ===== 반응형')]) + out[out.index('/* ===== 반응형'):]
    open(path, 'w', encoding='utf-8').write(out); print('moved', moved, 'kept', kept, 'selectors', len(merged_sel))
if __name__ == '__main__': main(sys.argv[1], '--dry' in sys.argv)
