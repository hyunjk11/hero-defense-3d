#!/usr/bin/env python3
"""챕터 몬스터 라인업 (근접): python3 tests/roster_lineup.py  →  shots/monsters/lineup_forest.png, lineup_snow.png, lineup_bosses.png"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, Q
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots', 'monsters'); os.makedirs(OUT, exist_ok=True)
SETS = {'forest': (['goblin', 'wolf', 'slime', 'slime_s', 'mushroom', 'treant', 'digger'], '1장 숲 — 고블린 · 숲늑대 · 숲 슬라임(분열) · 꼬마 슬라임 · 버섯 주술사 · 고목 정령 · 굴착병', 0x7ac85a, 0x9ad4ff, 18),
        'snow': (['icewolf', 'icewolf', 'yeti', 'wisp', 'frostgolem', 'charger', 'shield'], '2장 설원 — 서리늑대(무리) · 설인 · 서리 정령(비행) · 서리 골렘 · 돌격병 · 방패병', 0x8aa8c8, 0x6a88a8, 18),
        'bosses': (['boss_forest', 'boss_snow', 'boss'], '챕터 보스 — 숲의 군주 · 빙결의 군주 · (도전 모드) 해골 군주', 0x9aa070, 0x8ab0d0, 22)}
JS = r"""([types, title, gc, bg, R])=>{
  G.heroShotMode(); const T=G.THREE, z0=300, X0=300; G.scene.fog.near=1e4; G.scene.fog.far=2e4; G.scene.background=new T.Color(bg);
  const gnd=new T.Mesh(new T.CircleGeometry(60,64), new T.MeshToonMaterial({color:gc})); gnd.rotation.x=-Math.PI/2; gnd.position.set(X0,0,z0); gnd.receiveShadow=true; G.scene.add(gnd);
  document.querySelectorAll('#hud,#cam,#tinfo,#toolbar,#bossHud,#banner,.hb,#note').forEach(e=>e&&(e.style.display='none'));
  const W = types.length > 3 ? 3.1 : 6.2;
  types.forEach((t,i)=>{ const m=G.makeEnemyModel(t); const x=(i-(types.length-1)/2)*W; m.g.position.set(X0+x,0,z0); m.g.rotation.y=.5; G.scene.add(m.g);
    if(m.acts) G.play(m, 'Idle_Combat'); if(m.mixer) m.mixer.update(.6);
    if(m.anim){ const e={g:m.g,E:G.ETYPES[t],bob:i,packOn:t==='icewolf',digging:false}; for(let k=0;k<8;k++) m.anim(e,.05); }
    if(m.inner && G.ETYPES[t].fly) m.inner.position.y=2.6; });
  G.cam.target.set(X0,1.6,z0); G.cam.r=R; G.cam.phi=1.33; G.cam.theta=0; G.sim(.05);
  const lab=document.createElement('div'); lab.style.cssText='position:fixed;left:0;right:0;bottom:36px;display:flex;justify-content:space-around;padding:0 60px;font:bold 17px sans-serif;color:#fff;text-shadow:0 2px 4px #000;z-index:99';
  lab.innerHTML=types.map(t=>`<span style="width:150px;text-align:center">${G.ETYPES[t].icon||''} ${G.ETYPES[t].n}</span>`).join(''); document.body.appendChild(lab);
  const ttl=document.createElement('div'); ttl.style.cssText='position:fixed;left:0;right:0;top:22px;text-align:center;font:bold 26px sans-serif;color:#fff;text-shadow:0 2px 6px #000;z-index:99'; ttl.textContent=title; document.body.appendChild(ttl);
  return types.length; }"""
srv, url = serve(); errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for k, (types, title, gc, bg, R) in SETS.items():
        pg = b.new_page(viewport={'width': 1600, 'height': 760})
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
        pg.goto(url + Q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000)
        pg.evaluate(JS, [types, title, gc, bg, R]); pg.wait_for_timeout(1200); pg.screenshot(path=os.path.join(OUT, f'lineup_{k}.png')); pg.close()
    print('errors', errs); b.close()
sys.exit(1 if errs else 0)
