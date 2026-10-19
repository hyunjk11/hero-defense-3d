#!/usr/bin/env python3
"""버들 모델 검증: 클립별 정면/측면 콘택트 시트 + '늘어남' 측정.
python3 tests/budeul_sheet.py [--key mechanic_meshy|mech_robot_meshy] [--clips Idle,Walk,...] [--frames 8] [--out shots/budeul/sheet] [--json m.json] [--max 0.12]
측정 (클립마다 프레임 48개):
  strain  = 스킨 메시의 모든 삼각형 변 길이 / 바인드 포즈 길이. 늘어남이 없으면 1 근처 → p99|strain-1|, max, 25% 이상 늘어난 변 비율
  bone    = 부모-자식 뼈 거리 변화 최대(%)  (위치/스케일 트랙이 없으면 0)
  bbox    = 몸 경계상자 높이·폭 변화(키 대비 %)  /  rigid = 로봇 팔(강체 장비) 메시 수  (강체 = 변형 없음)"""
import sys, os, io, json
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
KEY = arg('--key', 'budeul_meshy'); N = int(arg('--frames', '8')); OUT = arg('--out', f'shots/budeul/sheet_{KEY}'); LIM = float(arg('--max', '6'))  # 표면(변 길이 합)의 6% 이상이 25% 넘게 변형되면 FAIL (참고: 이전 버들 6~13%, 로즈 8~12%)
DEF = 'Idle,Walk,Running_A,Drill,Hammer,Hit,Cheer,Death_A' if 'robot' not in KEY else 'Idle,Running_A,Drill,Hammer,Rocket,StompS,Hit'
CL = arg('--clips', DEF).split(',')
CW, CH = (176, 224) if '--big' not in sys.argv else (330, 420)
srv, url = serve(); F = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 20)
SETUP = """async (key)=>{ const {makeHeroModel}=await import('./src/render/characters.js'); const {cam,updateCam}=await import('./src/render/scene.js'); const THREE=G.THREE; G.manual=true; G.pauseRender=true;
  document.getElementById('select').classList.add('hidden'); const ch=makeHeroModel('mechanic', key==='budeul_meshy'?undefined:key); const X=14, Z=G.GH+5; ch.g.position.set(X,0,Z); G.scene.add(ch.g); window.__ch=ch;
  const H=key.includes('robot')?4.6:2.8; window.__view=(side)=>{ cam.target.set(X,H*.5,Z); cam.r=H*1.65; cam.phi=1.45; cam.theta=side===2?.75:side?Math.PI/2:0; updateCam(); };
  /* 스킨 메시 변(edge) 목록 + 바인드 길이 (메시 로컬, 스킨 전) */
  const sk=[], rigid=[]; ch.root.traverse(o=>{ if(o.isSkinnedMesh&&!o.userData.ol) sk.push(o); else if(o.isMesh&&!o.isSkinnedMesh&&!o.userData.ol) rigid.push(o); });
  window.__E=sk.map(m=>{ const g=m.geometry, P=g.attributes.position, I=g.index?g.index.array:null, n=I?I.length:P.count, E=[], L0=[], seen=new Set(), a=new THREE.Vector3(), b=new THREE.Vector3();
    for(let t=0;t<n;t+=3){ const v=[0,1,2].map(k=>I?I[t+k]:t+k); for(const [i,j] of [[v[0],v[1]],[v[1],v[2]],[v[2],v[0]]]){ const k=i<j?i*1e7+j:j*1e7+i; if(seen.has(k)) continue; seen.add(k); a.fromBufferAttribute(P,i); b.fromBufferAttribute(P,j); const l=a.distanceTo(b); if(l>1e-6){ E.push(i,j); L0.push(l); } } }
    return {m, E:new Uint32Array(E), L0:new Float32Array(L0)}; });
  /* 뼈 거리 기준 = 애니메이션 적용 전 기본 자세 */
  const pos=(m,i,t)=>m.getVertexPosition(i,t); window.__len=(e)=>{ const a=new THREE.Vector3(), b=new THREE.Vector3(), out=new Float32Array(e.L0.length); for(let k=0;k<e.L0.length;k++){ pos(e.m,e.E[2*k],a); pos(e.m,e.E[2*k+1],b); out[k]=a.distanceTo(b); } return out; };
  for(const e of window.__E){ const J=e.m.geometry.attributes.skinIndex, W=e.m.geometry.attributes.skinWeight; e.D=new Uint16Array(e.L0.length); for(let k=0;k<e.L0.length;k++){ const i=e.E[2*k]; let bw=-1,bi=0; for(let j=0;j<4;j++){ const w=W.getComponent(i,j); if(w>bw){ bw=w; bi=J.getComponent(i,j); } } e.D[k]=bi; } }
  for(const e of window.__E) e.B=e.L0; /* 바인드 포즈의 스킨 결과 = 원래 정점 좌표 → 원래 변 길이가 기준 */
  const bones=[]; ch.root.traverse(o=>{ if(o.isBone&&o.parent&&o.parent.isBone) bones.push(o); }); const wp=o=>o.getWorldPosition(new THREE.Vector3()); ch.root.updateMatrixWorld(true);
  window.__bones=bones; window.__bd0=bones.map(o=>wp(o).distanceTo(wp(o.parent)));
  return {skinned:sk.length, rigid:rigid.length, edges:window.__E.reduce((s,e)=>s+e.L0.length,0), tris:[...sk,...rigid].reduce((s,m)=>s+(m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count)/3,0), bones:bones.length}; }"""
POSE = """([n,f])=>{ const ch=window.__ch, a=ch.acts[n]; if(!a) return null; ch.mixer.stopAllAction(); const c=a.getClip(), x=ch.mixer.clipAction(c); x.reset(); x.setLoop(G.THREE.LoopRepeat,Infinity); x.play(); ch.cur=x; if(ch.gearOn) ch.gearOn(n,x); if(ch.aim) ch.yawT=ch.aim[c.name]||0; ch.root.rotation.y=ch.yawT||0;
  ch.mixer.setTime(c.duration*f); ch.g.updateMatrixWorld(true); return [c.name, +c.duration.toFixed(2)]; }"""
MEAS = """([n,M])=>{ const ch=window.__ch, a=ch.acts[n]; if(!a) return null; const THREE=G.THREE, c=a.getClip(); let all=[], bmax=0, hs=[], ws=[]; const RG={}, WL=[]; let TL=0, SL=0; const bb=new THREE.Box3(), v=new THREE.Vector3();
  for(let f=0;f<M;f++){ ch.mixer.stopAllAction(); const x=ch.mixer.clipAction(c); x.reset(); x.play(); ch.cur=x; if(ch.gearOn) ch.gearOn(n,x); ch.mixer.setTime(c.duration*f/M); ch.g.updateMatrixWorld(true);
    for(const e of window.__E){ const L=window.__len(e); if(!e.s){ const r=[]; for(let k=0;k<L.length;k+=5) r.push(L[k]/e.B[k]); r.sort((p,q)=>p-q); e.s=r[r.length>>1]; } /* 바인드 행렬의 균일 배율(중앙값)로 정규화 */
      for(let k=0;k<L.length;k+=2){ if(e.B[k]>1e-5){ const r=Math.abs(L[k]/e.B[k]/e.s-1); all.push(r); WL.push([r, e.B[k]]); TL+=e.B[k]; if(r>.25) SL+=e.B[k]; const b=e.m.skeleton.bones[e.D[k]].name; (RG[b]||(RG[b]=[])).push(r); } } }
    window.__bones.forEach((o,i)=>{ const d0=window.__bd0[i]; if(d0>1e-4){ const d=o.getWorldPosition(new THREE.Vector3()).distanceTo(o.parent.getWorldPosition(new THREE.Vector3())); bmax=Math.max(bmax,Math.abs(d/d0-1)); } });
    bb.makeEmpty(); for(const e of window.__E){ const P=e.m.geometry.attributes.position; for(let i=0;i<P.count;i+=7){ e.m.getVertexPosition(i,v); e.m.localToWorld(v); bb.expandByPoint(v); } } const s=bb.getSize(new THREE.Vector3()); hs.push(s.y); ws.push(Math.max(s.x,s.z)); }
  /* 진단: 마지막 프레임에서 25% 넘게 늘어난(+)/줄어든(-) 변의 주 영향 뼈 */
  const reg={}; for(const e of window.__E){ const L=window.__len(e), J=e.m.geometry.attributes.skinIndex, W=e.m.geometry.attributes.skinWeight, bn=e.m.skeleton.bones; for(let k=0;k<L.length;k+=3){ const r=L[k]/e.B[k]/e.s-1; if(Math.abs(r)<.25) continue; const i=e.E[2*k]; let bw=-1, bi=0; for(let j=0;j<4;j++){ const w=W.getComponent(i,j); if(w>bw){ bw=w; bi=J.getComponent(i,j); } } const key=bn[bi].name+(r>0?'+':'-'); reg[key]=(reg[key]||0)+1; } }
  /* 부위별(주 영향 뼈) 변 늘어남 90백분위 → 가장 나쁜 부위 = 눈에 보이는 '늘어남' 지표 (관절 주름의 작은 변 몇 개는 무시) */
  const rp=Object.entries(RG).filter(([,a])=>a.length>200).map(([b,a])=>{ a.sort((p,q)=>p-q); return [b, a[Math.floor(a.length*.9)]]; }).sort((x,y)=>y[1]-x[1]);
  WL.sort((p,q)=>p[0]-q[0]); let acc=0, wp95=0; for(const [r,l] of WL){ acc+=l; if(acc>=TL*.95){ wp95=r; break; } }
  all.sort((p,q)=>p-q); const H=window.__bd0.length?hs[0]:1, q=p=>all[Math.min(all.length-1,Math.floor(all.length*p))];
  return {clip:c.name, p50:+q(.5).toFixed(4), p99:+q(.99).toFixed(4), p999:+q(.999).toFixed(4), max:+all[all.length-1].toFixed(3), over25:+(all.filter(x=>x>.25).length/all.length*100).toFixed(3), bone:+(bmax*100).toFixed(2),
    wp95:+wp95.toFixed(3), len25:+(SL/TL*100).toFixed(2), worst:+rp[0][1].toFixed(3), worstBone:rp[0][0], regs:rp.slice(0,4).map(x=>x[0]+' '+x[1].toFixed(3)).join(', '), reg:Object.entries(reg).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x.join(':')).join(' '), hVar:+((Math.max(...hs)-Math.min(...hs))/hs[0]*100).toFixed(1), wVar:+((Math.max(...ws)-Math.min(...ws))/hs[0]*100).toFixed(1)}; }"""
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 440, 'height': 560}); errs = []; pg.on('pageerror', lambda x: errs.append(str(x)))
    pg.goto(url + '?seed=12345&rng=777&test=1&budeul=1'); pg.wait_for_function('()=>window.G&&G.ready', timeout=180000)
    info = pg.evaluate(SETUP, KEY); print('model', KEY, info, flush=True)
    met = {}; sheets = {}
    VIEWS = {'front': 0, 'side': 1, 'q34': 2}
    for vn in arg('--views', 'front,side').split(','):
        side = VIEWS[vn]
        pg.evaluate(f"()=>window.__view({side})"); rows = []
        for n in CL:
            row = []
            for i in range(N):
                r = pg.evaluate(POSE, [n, i / N])
                if r is None: break
                pg.evaluate(RAF); row.append(Image.open(io.BytesIO(pg.screenshot())).convert('RGB').resize((CW, CH)))
            if row: rows.append((n, r, row))
        S = Image.new('RGB', (150 + CW * N, CH * len(rows)), (20, 16, 30)); d = ImageDraw.Draw(S)
        for y, (n, r, row) in enumerate(rows):
            d.text((8, y * CH + 90), n, font=F, fill=(255, 230, 160)); d.text((8, y * CH + 118), f'{r[0]} {r[1]}s', font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 13), fill=(180, 180, 200))
            for x, im in enumerate(row): S.paste(im, (150 + x * CW, y * CH))
        p = f"{OUT}_{vn}.png"; os.makedirs(os.path.dirname(p), exist_ok=True); S.save(p); print('sheet', p, flush=True)
    for n in CL:
        m = pg.evaluate(MEAS, [n, 24])
        if m: met[n] = m; print(f"{n:10s} {m['clip']:>12s}  strain p50 {m['p50']:.3f} p99 {m['p99']:.3f} p99.9 {m['p999']:.3f} max {m['max']:.2f}  >25%: {m['over25']:.2f}%  bone {m['bone']:.2f}%  bboxH {m['hVar']}% W {m['wVar']}%\n           표면(길이 가중) 25%↑ {m['len25']:.2f}%  가중 p95 {m['wp95']:.3f} | 부위 p90 {m['regs']}  | 25%↑ 변: {m['reg']}", flush=True)
    b.close()
if arg('--json'): json.dump({'info': info, 'clips': met}, open(arg('--json'), 'w'), ensure_ascii=False, indent=1)
bad = [n for n, m in met.items() if m['len25'] > LIM or m['bone'] > 1]
print('errors', errs); print(('STRETCH FAIL: ' + ', '.join(bad)) if bad else 'NO STRETCH OK'); sys.exit(1 if bad or errs else 0)
