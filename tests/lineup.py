#!/usr/bin/env python3
"""몬스터 라인업 이미지: python3 tests/lineup.py monsters.png"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS, Q
from playwright.sync_api import sync_playwright
out = sys.argv[1] if len(sys.argv) > 1 else 'monsters.png'
JS = r"""()=>{
  G.heroShotMode(); const types=['imp','grunt','golem','bat','digger','charger','shield','bomber','siege','boss'];
  const z0=300, X0=300, list=[]; G.scene.fog.near=1e4; G.scene.fog.far=2e4; G.scene.background=new G.THREE.Color(0x9ad4ff);
  const gnd=new G.THREE.Mesh(new G.THREE.CircleGeometry(60,64), new G.THREE.MeshToonMaterial({color:0x7ac85a})); gnd.rotation.x=-Math.PI/2; gnd.position.set(X0,0,z0); gnd.receiveShadow=true; G.scene.add(gnd); document.querySelectorAll('#hud,#cam,#tinfo,#toolbar,#bossHud,#banner,.hb').forEach(e=>e&&(e.style.display='none'));
  types.forEach((t,i)=>{ const m=G.makeEnemyModel(t); const x=(i-(types.length-1)/2)*2.7; m.g.position.set(X0+x,0,z0); m.g.rotation.y=t==='bomber'?2.4:.45; G.scene.add(m.g);
    if(m.acts) G.play(m, t==='bomber'?'Taunt':'Idle_Combat');
    if(m.mixer) m.mixer.update(.6); list.push([t,x]); });
  G.cam.target.set(X0,1.5,z0); G.cam.r=23; G.cam.phi=1.36; G.cam.theta=0; G.sim(.05);
  const lab=document.createElement('div'); lab.style.cssText='position:fixed;left:0;right:0;bottom:40px;display:flex;justify-content:space-around;padding:0 70px;font:bold 17px sans-serif;color:#fff;text-shadow:0 2px 4px #000;z-index:99';
  lab.innerHTML=types.map(t=>`<span style="width:120px;text-align:center">${G.ETYPES[t].n}</span>`).join(''); document.body.appendChild(lab);
  const ttl=document.createElement('div'); ttl.style.cssText='position:fixed;left:0;right:0;top:24px;text-align:center;font:bold 30px sans-serif;color:#fff;text-shadow:0 2px 6px #000;z-index:99'; ttl.textContent='몬스터 라인업 — 기존 5종 + 신규 5종 (굴착병·돌격병·방패병·자폭병·공성병)'; document.body.appendChild(ttl);
  return list.length; }"""
srv, url = serve(); errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1600, 'height': 760})
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url + Q); pg.wait_for_function('()=>window.G&&G.ready', timeout=120000)
    r = pg.evaluate(JS); pg.wait_for_timeout(1200); pg.screenshot(path=out)
    print('result', r, 'errors', errs)
