#!/usr/bin/env python3
"""스크린샷 두 폴더 비교 (U-1/U-3 시각 변화 확인, 2026-10-23).
  python3 tests/shotdiff.py BASE_DIR NEW_DIR [OUT_DIR]   # 같은 이름 PNG 픽셀 차이 비율 · 차이 이미지(빨강) 저장
3D 장면(눈·연기·애니메이션)은 프레임마다 조금씩 달라 0 이 아닐 수 있음 → 차이 영역 상자(bbox)와 비율로 판단."""
import sys, pathlib
from PIL import Image, ImageChops
import numpy as np
a, b = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else None
if out: out.mkdir(parents=True, exist_ok=True)
for f in sorted(a.glob('*.png')):
    g = b / f.name
    if not g.exists(): print(f'{f.name:28s} MISSING'); continue
    A, B = Image.open(f).convert('RGB'), Image.open(g).convert('RGB')
    if A.size != B.size: print(f'{f.name:28s} SIZE {A.size} {B.size}'); continue
    d = np.asarray(ImageChops.difference(A, B)).max(axis=2); m = d > 24; frac = m.mean() * 100
    bbox = Image.fromarray((m * 255).astype('uint8')).getbbox()
    print(f'{f.name:28s} {frac:6.3f}%  bbox={bbox}')
    if out and frac > 0:
        o = np.asarray(B).copy() // 3; o[m] = [255, 40, 40]; Image.fromarray(o).save(out / f.name)
