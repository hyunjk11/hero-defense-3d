#!/usr/bin/env python3
"""shots/budeul/final_sheet.png = 컨셉(버들/로봇) + 콘택트 시트(정면/측면) 한 장. 먼저 budeul_sheet.py (몸, 로봇 --key mech_robot_meshy) 실행."""
import json, os
from PIL import Image, ImageDraw, ImageFont
D = 'shots/budeul/sheets'; CON = os.environ.get('CONCEPT_DIR', '/workspace/mechanic3d'); COLW = 1200; PAD = 16
F = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 26); f2 = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 20)
fit = lambda im, w: im.resize((w, round(im.height * w / im.width)))
cols = []
for name, con, key in [('버들 (메카닉) — 컨셉 / 정면 / 측면', 'concept_budeul.jpg', 'budeul'), ('변신 로봇 — 컨셉 / 정면 / 측면', 'concept_robot.jpg', 'robot')]:
    parts = [fit(Image.open(f'{CON}/{con}').convert('RGB'), COLW) if os.path.exists(f'{CON}/{con}') else Image.new('RGB', (COLW, 10))]
    parts += [fit(Image.open(f'{D}/{key}_{v}.png').convert('RGB'), COLW) for v in ('front', 'side')]
    cols.append((name, parts))
H = max(48 + sum(p.height + PAD for p in ps) for _, ps in cols) + 60
S = Image.new('RGB', (COLW * 2 + PAD * 3, H), (20, 16, 30)); d = ImageDraw.Draw(S)
for i, (name, ps) in enumerate(cols):
    x = PAD + i * (COLW + PAD); d.text((x, 8), name, font=F, fill=(255, 230, 160)); y = 48
    for p in ps: S.paste(p, (x, y)); y += p.height + PAD
b = json.load(open(f'{D}/body.json'))['clips']; r = json.load(open(f'{D}/robot.json'))['clips']; hd = {}
txt = (f"뼈 길이 변화 {max(m['bone'] for m in b.values()):.2f}% · 로봇 팔/백팩 = 강체 메시(Spine02 고정, 변형 없음) · 몸 단일 뼈 변 최대 변형 {max(m['rigidMax'] for m in b.values()):.3f}% · "
       f"로봇 부품 내부 변 최대 변형 {max(m['rigidMax'] for m in r.values()):.3f}% (강체변 {list(r.values())[0]['hard']}%) · 로봇 뼈 길이 변화 {max(m['bone'] for m in r.values()):.2f}%")
d.text((PAD, H - 44), txt, font=f2, fill=(200, 200, 220)); S.save('shots/budeul/final_sheet.png'); print('final_sheet', S.size)
