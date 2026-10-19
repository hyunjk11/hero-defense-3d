#!/usr/bin/env python3
"""보스 처치 후 검은 화면 회귀 테스트.  python3 tests/bossblack.py [--quick]
원인: 보스 전리품 빛기둥 셰이더 pow(1-vU.y) — 실제 GPU MSAA에서 varying 외삽으로 vU.y>1 → NaN → 블룸 블러가 NaN을 화면 전체로 번짐.
검사: 도전 모드 보스 웨이브(영웅 3명 × 전설 무기 없음/발동형/사용형) + 챕터 보스 스테이지(1-6, 2-4 최종 웨이브)에서 보스 처치 →
 1·3·6초 후 캔버스 평균 밝기 정상, 화면 전체를 덮은 채 남은 오버레이 없음(#fade 투명), 장면 NaN 없음,
 NaN 주입(빛기둥 uniform)해도 화면이 검게 변하지 않음(블룸 입력 방어), 빛기둥 셰이더에 uv 1.05(외삽) 입력 시 출력 유한·알파 0..1, 콘솔 오류 0."""
import sys, os, io, pathlib
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
QUICK = '--quick' in sys.argv; srv, url = serve(); errs, res = [], {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
LEG = {'archer': ['multishot', 'pierce'], 'mage': ['frostorb', 'meteorstorm'], 'warrior': ['boomerang', 'quake']}
MIN_LUM = 45  # 정상 장면 ~90-140, 검은 화면 ~0-25
HIDE = "(on)=>{ for (const id of ['stageClear','hud','fx','banner']) { const e=document.getElementById(id); if (e) e.style.visibility = on ? 'hidden' : ''; } }"
def lum(pg):  # 캔버스(3D 장면)만의 평균 밝기: 결과 화면 등 DOM은 잠시 숨기고 2프레임 렌더 후 촬영
    J(pg, HIDE, True); pg.wait_for_timeout(120); png = pg.screenshot(); J(pg, HIDE, False)
    return round(ImageStat.Stat(Image.open(io.BytesIO(png)).convert('L')).mean[0], 1)
# 화면 전체를 덮고 보이는 DOM 요소 (정상: app/fx/hud, 스테이지면 stageClear)
OVER = "()=>[...document.querySelectorAll('body *')].filter(e=>{ const s=getComputedStyle(e), r=e.getBoundingClientRect(); return r.width>=innerWidth*.9&&r.height>=innerHeight*.9&&s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>.05&&e.tagName!=='CANVAS'; }).map(e=>e.id||e.className)"
NAN = r"""()=>{ const bad=[], fin=Number.isFinite; G.scene.traverse(o=>{ if(!o.matrixWorld.elements.every(fin)) bad.push('mw:'+o.type); if(o.isLight&&!fin(o.intensity)) bad.push('light');
  for (const m of (o.material ? [].concat(o.material) : [])) { if (m.uniforms) for (const k in m.uniforms) { const v=m.uniforms[k].value; if (typeof v==='number'&&!fin(v)) bad.push('u:'+k); }
    if (m.opacity!==undefined&&!fin(m.opacity)) bad.push('op'); } }); const c=G.cam.target; if(![c.x,c.y,c.z,G.cam.r,G.shake,G.night].every(fin)) bad.push('cam'); return [...new Set(bad)]; }"""
KILL = r"""(lsk)=>{ G.manual=true; G.perm=G.perm||1; G.forceDrop=true; G.legendForce=true; if (lsk) G.hero.lsk=lsk; G.runDrops=[];
  G.wave = G.stage ? G.stage.waves-1 : 4; G.startWave(); G.spawnQ = G.spawnQ.filter(t=>t==='boss'); let k=0; while (G.spawnQ.length && k++<200) G.sim(.1);
  const h=G.hero.g.position, bs=G.enemies.filter(e=>e.E.boss); bs.forEach((b,i)=>{ b.g.position.set(h.x+3+i,0,h.z+1); b.state='walk'; b.spawnT=0; });
  for (const e of G.enemies) if (!e.E.boss) G.hurt(e,1e9,'#fff',false);
  if (lsk) G.castLegend(); G.sim(.6); bs.forEach(b=>{ b.hp=Math.min(b.hp, b.max*.05); }); G.sim(1); for (const b of bs) if (!b.dead) G.hurt(b,1e9,'#fff',false); if (lsk) G.castLegend();
  return { bosses: bs.length, dead: bs.every(b=>b.dead), drops: (G.runDrops||[]).length }; }"""
def case(b, name, q, hero, lsk, stage):
    c = b.new_context(viewport={'width': 960, 'height': 600}); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(name + ': ' + m.text[:200])); pg.on('pageerror', lambda x: errs.append(name + ' PE ' + str(x)[:300]))
    pg.goto(url + q); pg.wait_for_function("()=>window.G&&G.ready&&(G.phase==='select'||G.phase==='build')", timeout=180000)
    if J(pg, "()=>G.phase") == 'select': J(pg, f"()=>G.choose('{hero}')")
    J(pg, "()=>{ G.manual=true; G.sim(.5); }"); l0 = lum(pg)
    r = J(pg, KILL, lsk or '')
    ok(f'{name}_boss_killed', r['dead'] and r['bosses'] >= (2 if stage else 1) and r['drops'] >= 1, r)
    worst, overs, nans = 999, set(), set()
    for t in (1, 2, 3):  # 보스 사망 후 약 1.6 / 3.6 / 6.6초 (전리품 빛기둥 수명 5.5초 포함)
        J(pg, f"()=>G.sim({t})"); worst = min(worst, lum(pg)); overs |= set(J(pg, OVER)); nans |= set(J(pg, NAN))
    allowed = {'app', 'fx', 'hud'} | ({'stageClear'} if stage else set())
    ok(f'{name}_not_black', worst > MIN_LUM, (l0, worst)); ok(f'{name}_no_stuck_overlay', overs <= allowed and J(pg, "()=>+getComputedStyle(document.getElementById('fade')).opacity") < .05, sorted(overs))
    ok(f'{name}_no_nan', not nans, sorted(nans))
    if stage: ok(f'{name}_clear_screen', J(pg, "()=>G.phase") == 'over' and '스테이지 클리어' in pg.inner_text('#stageClear'))
    else: ok(f'{name}_wave_cleared', J(pg, "()=>G.phase") == 'build')
    return pg, c
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # 1) 셰이더/블룸 방어 직접 검사 + NaN 주입
    pg, c = case(b, 'endless_archer', '?seed=12345&rng=777&test=1', 'archer', None, False)
    guard = J(pg, "async ()=>{ const S=await import('./src/render/scene.js'); return S.bloom.materialHighPassFilter.fragmentShader.includes('lessThan( abs( texel )'); }")
    ok('bloom_nan_guard_installed', guard)
    J(pg, "()=>{ const h=G.hero.g.position, e=G.spawnEnemy('boss',1); e.g.position.set(h.x+3,0,h.z); G.forceDrop=true; G.hurt(e,1e9,'#fff',false); G.sim(1); }")
    shader = J(pg, r"""()=>{ const T=G.THREE; let mat=null; G.scene.traverse(o=>{ if(o.material&&o.material.uniforms&&o.material.uniforms.uC) mat=o.material; }); if(!mat) return null;
      const geo=new T.PlaneGeometry(2,2), uv=geo.attributes.uv; const out={};
      const run=(m, v)=>{ for(let i=0;i<uv.count;i++) uv.setXY(i, .5, v); uv.needsUpdate=true; const q=new T.Mesh(geo,m), sc=new T.Scene(); sc.add(q); const cam=new T.OrthographicCamera(-1,1,1,-1,0,10); cam.position.z=1;
        const rt=new T.WebGLRenderTarget(4,4,{type:T.FloatType}); const R=G.renderer, prev=R.getRenderTarget(), ab=R.autoClear; R.setRenderTarget(rt); R.setClearColor(0,0); R.clear(); R.render(sc,cam); const px=new Float32Array(64); R.readRenderTargetPixels(rt,0,0,4,4,px); R.setRenderTarget(prev); rt.dispose(); return Array.from(px); };
      const blk=mat.clone(); blk.blending=T.NoBlending; blk.uniforms=T.UniformsUtils.clone(mat.uniforms); blk.uniforms.uT.value=.3;
      for (const v of [-.05, 0, .5, 1, 1.05]) { const px=run(blk, v); out[v]={fin:px.every(Number.isFinite), amin:Math.min(...px.filter((_,i)=>i%4===3)), amax:Math.max(...px.filter((_,i)=>i%4===3))}; }
      return out; }""")
    # 소프트웨어 GL은 pow(음수)를 |x|^y로 계산해 NaN이 안 나므로, uv 밖 입력이 경계값으로 clamp되는지(1.05 → 알파 0, -0.05 → uv 0과 동일)로 판정
    ok('loot_shader_uv_extrapolation_safe', shader and all(v['fin'] and -1e-6 <= v['amin'] and v['amax'] <= 1 + 1e-6 for v in shader.values())
       and shader['1.05']['amax'] == 0 and abs(shader['-0.05']['amin'] - shader['0']['amin']) < 1e-4, shader)
    J(pg, "()=>{ G.scene.traverse(o=>{ if(o.material&&o.material.uniforms&&o.material.uniforms.uC) o.material.uniforms.uT.value=NaN; }); }")  # GPU NaN 흉내 (빛기둥 픽셀 전부 NaN)
    ok('nan_injection_not_black', lum(pg) > MIN_LUM); c.close()
    # 2) 도전 모드 보스 웨이브: 영웅별 × 전설 스킬
    for hero in (['mage'] if QUICK else ['archer', 'mage', 'warrior']):
        for lsk in ([LEG[hero][1]] if QUICK else ([None] if hero != 'archer' else []) + LEG[hero]):
            pg, c = case(b, f'endless_{hero}_{lsk or "none"}', '?seed=12345&rng=777&test=1', hero, lsk, False); c.close()
    # 3) 챕터 보스 스테이지 최종 웨이브 (보스 2마리) → 결과 화면
    for st, hero, lsk in ([('1-6', 'warrior', 'quake')] if QUICK else [('1-6', 'warrior', 'quake'), ('1-6', 'archer', None), ('2-4', 'mage', 'meteorstorm')]):
        pg, c = case(b, f'stage{st}_{hero}', f'?seed=12345&rng=777&test=1&flow=1&stage={st}&run=1', hero, lsk, True); c.close()
    b.close()
ok('console_errors_0', not errs, errs[:5])
n = sum(res.values()); print(f'{n}/{len(res)} passed'); sys.exit(0 if n == len(res) else 1)
