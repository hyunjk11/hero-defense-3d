#!/usr/bin/env python3
"""로즈 2차 전직 '장미 저격수'(소총, 키 thorn) 브라우저 검사 + 스크린샷 (shots/advance/rose_rifle_*.png).  python3 tests/rose_rifle.py [--shots] [--dps]
① 출정: 소총 모델(rose_rifle_meshy + rose_rifle_gun) 사용 · 결투가는 쌍권총 모델 그대로
② 소총 관통(일직선 3명 100/70/50%) · 치명 · 보스 +20% · 관통 저격(0.6초 조준 → 직선 전원 600%)
③ 소총이 두 손 사이에 있는지(손바닥-총열 거리) · 조준 시 총열이 목표 쪽(수평 오차) 
--dps: 결투가/저격수 단일·무리 실측 피해 비교 (20초)"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(__file__))
from regress import serve, ARGS
from playwright.sync_api import sync_playwright
import advance_helpers as H
SHOTS = '--shots' in sys.argv; DPS = '--dps' in sys.argv; OUT = 'shots/advance'; os.makedirs(OUT, exist_ok=True)
srv, url = serve(); H.url[0] = url; res = {}
def ok(name, cond, info=''): res[name] = bool(cond); print(('OK  ' if cond else 'FAIL'), name, info, flush=True)
J = H.J
RIFLE_GEO = """()=>{ const ch=G.hero.ch, st=ch.rifle; if(!st) return null; G.hero.g.updateMatrixWorld(true); const g=st.gun, inv=new THREE.Matrix4().copy(g.matrixWorld).invert();
  const pal=n=>{ const b=ch.root.getObjectByName(n); let best=null; b.children.forEach(o=>{ if(!o.isBone&&!o.isMesh) best=o; }); return best.getWorldPosition(new THREE.Vector3()); };
  const dl=p=>{ const q=p.clone().applyMatrix4(inv); const s=st.R.s; return Math.hypot(q.y/1, q.z/1); };  // 소총 로컬(축 = X) 에서 총열 축까지 거리 (게임 단위 · 소총 스케일 포함)
  const R=pal('RightHand'), L=pal('LeftHand'), mz=ch.muz[0].getWorldPosition(new THREE.Vector3()), h=G.hero.g.position, dir=mz.clone().sub(G.rifleBack=g.getWorldPosition(new THREE.Vector3()));
  return { right: +dl(R).toFixed(3), left: +dl(L).toFixed(3), hands: +R.distanceTo(L).toFixed(3), muzzleY: +mz.y.toFixed(2), yaw: Math.atan2(dir.x, dir.z), face: G.hero.g.rotation.y, clip: ch.cur && ch.cur.getClip().name, key: ch.key }; }"""
DMG = "()=>G.enemies.filter(e=>e.max>=1e6).reduce((a,e)=>a+(e.max-e.hp),0)"
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    # ---------- 저격수 ----------
    c, pg = H.run(b, 'gunner', 'thorn')
    J(pg, "()=>{ window.THREE = window.THREE || G.THREE; }")
    ok('rifle_model', J(pg, "()=>G.hero.ch.key==='rose_rifle_meshy' && !!G.hero.ch.rifle && G.hero.ch.muz.length===2"), J(pg, "()=>G.hero.ch.key"))
    ok('stats', J(pg, "()=>Math.abs(G.hero.C.rate-4.2*.45)<1e-6 && Math.abs(G.hero.C.dmg-13*2.5)<1e-6 && Math.abs(G.hero.C.range-8.5*1.4)<1e-6 && G.hero.C.skill==='관통 저격'"))
    J(pg, "()=>G.sim(.5)"); g0 = J(pg, RIFLE_GEO); ok('idle_two_hands', g0 and g0['clip'] == 'IdleR' and g0['right'] < .2 and g0['left'] < .2, g0)
    # 일직선 3명 → 관통
    J(pg, H.LINE, [3, 4]); J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); }"); J(pg, "()=>G.sim(1.2)")
    g1 = J(pg, RIFLE_GEO); n = J(pg, "()=>G.advN")
    ok('pierce', n.get('rifle', 0) >= 1 and n.get('pierceHit', 0) >= 2 * n.get('rifle', 0) - 1, n)
    ok('aim_two_hands', g1 and g1['clip'] in ('Aim', 'AimRun') and g1['right'] < .2 and g1['left'] < .25, g1)
    ok('aim_yaw', g1 and abs(math.atan2(math.sin(g1['yaw'] - g1['face']), math.cos(g1['yaw'] - g1['face']))) < .2, g1)  # 견착 조준 중 총열이 목표 방향
    hp = J(pg, "()=>G.enemies.filter(e=>!e.dead).map(e=>e.max-e.hp)")
    ok('pierce_falloff', len(hp) == 3 and hp[0] > 0 and hp[1] > 0 and hp[2] > 0 and hp[0] >= hp[1] >= hp[2], hp)
    if SHOTS:
        J(pg, "()=>{ const p=G.hero.g.position, m=G.mouseGround; G.cam.target.set((p.x+m.x)/2, 0, (p.z+m.z)/2); G.cam.r=17; G.cam.phi=.8; G.cam.theta=.3; G.sim(.05); }")
    J(pg, H.CLEAR)
    # 보스 +20%: 같은 적, 보스 표시만 다르게
    J(pg, H.LINE, [1, 4]); J(pg, "()=>{ const e=G.enemies.find(e=>!e.dead); e.E={...e.E, boss:true}; G.advN={}; G.boss0=e; G.mouseGround.set(G.__aim[0],0,G.__aim[1]); }"); J(pg, "()=>G.sim(1.1)")
    ok('boss_bonus', J(pg, "()=>G.advN.bossHit>0"), J(pg, "()=>[G.advN, G.boss0.max-G.boss0.hp]")); J(pg, H.CLEAR)
    # 관통 저격: 0.6초 동안 발사 없음 → 직선 위 적 전원 600%
    J(pg, H.LINE, [5, 4]); J(pg, "()=>{ G.advN={}; }"); H.cast(pg, .3, aim=False)
    ok('snipe_aim', J(pg, "()=>G.hero.snipeT>0 && !G.advN.pierceshot && G.advN.skill_pierceshot===1"), J(pg, "()=>[G.advN, G.hero.snipeT]"))
    J(pg, "()=>G.sim(.5)"); ok('snipe_fire', J(pg, "()=>G.advN.pierceshot===1 && G.advN.snipeN===5"), J(pg, "()=>G.advN"))
    J(pg, H.CLEAR)
    if SHOTS:  # 모델 턴어라운드(인게임 조명·외곽선, 주변 숨김): 대기 · 조준 각 4방향
        from PIL import Image
        J(pg, """async ()=>{ const T=await import('./lib/three.module.js'); G.hero.skillCd=99; const sc=G.hero.g.parent; G.__hid=[];
          for (const o of sc.children) if (o!==G.hero.g && !o.isLight && !(o.geometry && o.geometry.parameters && o.geometry.parameters.radius===400) && o.visible) { o.visible=false; G.__hid.push(o); }
          const p=G.hero.g.position, gd=new T.Mesh(new T.CircleGeometry(2.4,48), new T.MeshToonMaterial({color:0x8fcf6a})); gd.rotation.x=-Math.PI/2; gd.position.set(p.x,p.y+.01,p.z); gd.receiveShadow=true; sc.add(gd); G.__gd=gd; if (G.hero.hb && G.hero.hb.show) G.hero.hb.show(false); }""")
        J(pg, "()=>{ for (const el of document.querySelectorAll('.banner, #banner')) el.style.display='none'; }"); pg.wait_for_timeout(1500)
        tiles = []
        for mode in ('idle', 'aim'):
            if mode == 'aim': J(pg, H.LINE, [1, 7]); J(pg, "()=>{ const e=G.enemies.find(e=>!e.dead); e.g.visible=false; G.sim(1.5); }")
            else: J(pg, "()=>G.sim(1.5)")
            for k, th in enumerate((0, 1.5708, 3.1416, 4.7124)):
                J(pg, f"()=>{{ const p=G.hero.g.position; G.cam.target.set(p.x, p.y+1.35, p.z); G.cam.r=7.2; G.cam.phi=1.22; G.cam.theta=G.hero.g.rotation.y+{th}; for (const e of G.enemies) e.g.visible=false; G.sim(.02); }}")
                f = f'/tmp/rr_{mode}_{k}.png'; H.shot(pg, f, clip={'x': 640 - 210, 'y': 400 - 280, 'width': 420, 'height': 560}); tiles.append(f)
            J(pg, H.CLEAR)
        W, Hh = 420, 560; sheet = Image.new('RGB', (W * 4, Hh * 2), 'white')
        for i, f in enumerate(tiles): sheet.paste(Image.open(f).convert('RGB'), ((i % 4) * W, (i // 4) * Hh))
        sheet.save(f'{OUT}/rose_rifle_turnaround.png'); print('saved turnaround', flush=True)
    c.close()
    if SHOTS:  # 인게임 대기/공격/관통 저격 (1440x860, 1024x600)
        for vw, vh in ((1440, 860), (1024, 600)):
            c, pg = H.run(b, 'gunner', 'thorn', vw, vh); J(pg, "()=>{ G.hero.skillCd=99; const p=G.hero.g.position, f=G.hero.face; p.x+=Math.sin(f)*6; p.z+=Math.cos(f)*6; G.sim(1); }")  # 코어(성) 앞 빈 곳으로
            CAM = "()=>{ const p=G.hero.g.position, f=G.hero.face; G.cam.target.set(p.x+Math.sin(f)*1.8, 1.1, p.z+Math.cos(f)*1.8); G.cam.r=8.5; G.cam.phi=1.12; G.cam.theta=f+2.0; G.sim(.05); }"  # 견착 자세는 몸이 옆으로 → 앞옆에서
            J(pg, CAM.replace('f+2.0', 'f+.7').replace('*1.8', '*.6')); H.shot(pg, f'{OUT}/rose_rifle_idle_{vw}x{vh}.png')
            J(pg, H.LINE, [4, 5]); J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); G.sim(1.3); }"); J(pg, "()=>{ G.sim(Math.max(0.01, (G.hero.cd>0? G.hero.cd: 0)) - 0.02); }")
            J(pg, CAM.replace('G.sim(.05)', 'G.sim(.04)')); H.shot(pg, f'{OUT}/rose_rifle_attack_{vw}x{vh}.png')
            H.cast(pg, .62, aim=False); J(pg, CAM.replace('G.sim(.05)', 'G.sim(.01)')); H.shot(pg, f'{OUT}/rose_rifle_skill_{vw}x{vh}.png')
            c.close()
        # 전직 탭 카드 + 미리보기(마을 단상 영웅이 소총 모델로)
        for vw, vh in ((1440, 860), (1024, 600)):
            c, pg = H.town(b, 'gunner', 'duel', vw, vh)
            J(pg, "()=>{ G.openBlessing(); G.blessTab('adv'); }"); pg.wait_for_timeout(400)
            ok(f'town_pistols_{vw}', J(pg, "()=>G.townHero().key==='gunner_meshy'"))
            pg.click('#twAdv .advCard[data-b="thorn"] h4'); pg.wait_for_function("()=>G.townHero().key==='rose_rifle_meshy'", timeout=60000); pg.wait_for_timeout(600)
            ok(f'town_preview_rifle_{vw}', J(pg, "()=>G.townHero().key==='rose_rifle_meshy'"))
            J(pg, "()=>document.querySelector('#twAdv .advCard[data-b=\"thorn\"]').scrollIntoView()"); pg.wait_for_timeout(300)
            H.shot(pg, f'{OUT}/rose_rifle_tab_{vw}x{vh}.png')
            J(pg, "()=>G.closeBlessing()"); pg.wait_for_timeout(300); ok(f'town_preview_end_{vw}', J(pg, "()=>G.townHero().key==='gunner_meshy'")); c.close()
    # ---------- 저장 호환: 옛 가시 장미 포격수 저장 {b:'thorn', n:2} → 장미 저격수 (비용·손실 없음) ----------
    c, pg = H.town(b, 'gunner', 'thorn')
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.adv={gunner:{b:'thorn',n:2}}; d.souls=777; return d; }); }"); pg.wait_for_function("()=>G.townHero() && G.townHero().key==='rose_rifle_meshy'", timeout=60000)
    sv = J(pg, "()=>{ const s=G.gear.Acc.load(); return { adv: s.adv.gunner, souls: s.souls, key: G.townHero().key }; }")
    ok('old_thorn_save', sv['adv'] == {'b': 'thorn', 'n': 2} and sv['souls'] == 777 and sv['key'] == 'rose_rifle_meshy', sv)
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()"); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000)
    sv2 = J(pg, "()=>({ n: G.hero.adv && G.hero.adv.n, skill: G.hero.C.skill, key: G.hero.ch.key, souls: G.gear.Acc.load().souls, adv: G.gear.Acc.load().adv.gunner })")
    ok('old_thorn_run', sv2['n'] == '장미 저격수' and sv2['skill'] == '관통 저격' and sv2['key'] == 'rose_rifle_meshy' and sv2['souls'] == 777 and sv2['adv'] == {'b': 'thorn', 'n': 2}, sv2); c.close()
    # ---------- 소총 모델 로드 실패 → 쌍권총 모델로 출전 (판은 정상, 능력치·관통은 그대로) ----------
    ne = len(H.errs)
    c, pg = H.page(b, login=False); H.own_gunner(pg)
    pg.route('**/models/rose_rifle_*.glb', lambda r: r.fulfill(status=404, body='nope'))
    J(pg, "()=>{ G.gear.Acc.update(d=>{ d.souls=999; d.hero='gunner'; d.stats={runs:1,kills:1,waves:1,souls:1}; d.eq.gunner={}; d.adv={gunner:{b:'thorn',n:1}}; return d; }); }")
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town' && G.shop.Sh.heroOwned('gunner')", timeout=30000); pg.wait_for_timeout(1500)
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()"); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.manual=true; G.gold=0; G.advN={}; }"); J(pg, H.LINE, [3, 4]); J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); G.sim(1.2); }")
    fb = J(pg, "()=>({ key: G.hero.ch.key, rifle: !!G.hero.ch.rifle, fail: !!G.advModelFail, town: G.townHero && G.townHero() && G.townHero().key, n: G.advN, rate: G.hero.C.rate })")
    ok('fallback_pistols', fb['key'] == 'gunner_meshy' and not fb['rifle'] and fb['fail'] and fb['n'].get('rifle', 0) >= 1 and abs(fb['rate'] - 4.2 * .45) < 1e-6, fb)
    H.errs[ne:] = [e for e in H.errs[ne:] if '404' not in e and 'Failed to load resource' not in e]; c.close()
    # ---------- 결투가: 쌍권총 모델 그대로 ----------
    c, pg = H.run(b, 'gunner', 'duel')
    ok('duel_pistols', J(pg, "()=>G.hero.ch.key==='gunner_meshy' && !G.hero.ch.rifle && Math.abs(G.hero.C.rate-4.2*1.2)<1e-6"), J(pg, "()=>G.hero.ch.key")); c.close()
    if DPS:
        out = {}
        for br in ('duel', 'thorn'):
            c, pg = H.run(b, 'gunner', br)
            J(pg, H.LINE, [1, 5]); J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); }"); J(pg, "()=>G.sim(20)"); one = J(pg, DMG) / 20; J(pg, H.CLEAR)
            J(pg, H.PACK, [9, 5]); J(pg, H.AIM); J(pg, "()=>G.sim(20)"); sw = J(pg, DMG) / 20; J(pg, H.CLEAR)
            J(pg, H.LINE, [3, 4]); J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); }"); J(pg, "()=>G.sim(20)"); ln = J(pg, DMG) / 20
            out[br] = {'single': round(one, 1), 'pack9': round(sw, 1), 'line3': round(ln, 1)}; print(br, out[br], flush=True); c.close()
        json.dump(out, open('/tmp/rose_dps.json', 'w'))
    b.close()
srv.shutdown()
fails = [k for k, v in res.items() if not v]
print('console errors:', len(H.errs), H.errs[:5])
print('FAILED:' if fails or H.errs else 'ALL OK', fails); sys.exit(1 if fails or H.errs else 0)
