"""advance.py 와 같은 출정 도우미 (tests/rose_rifle.py 용). url[0] 은 serve() 결과로 채움"""
import pathlib
MOCK = (pathlib.Path(__file__).parent / 'sbmock.js').read_text(encoding='utf-8')
url = ['']; errs = []
J = lambda pg, js, a=None: pg.evaluate(js, a) if a is not None else pg.evaluate(js)
PACK = """([n, d]) => { const h=G.hero.g.position, a0=G.hero.face; for (let i=0;i<n;i++){ const e=G.spawnEnemy(i%3?'grunt':'imp', 40); const a=a0+(i-n/2)*.18, r=d+(i%3)*1.2;
  const x=h.x+Math.sin(a)*r, z=h.z+Math.cos(a)*r; e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; e.E={...e.E, spd:0}; } return G.enemies.length; }"""
AIM = "()=>{ const L=G.enemies.filter(e=>!e.dead); if(!L.length) return null; let x=0,z=0; for(const e of L){x+=e.g.position.x;z+=e.g.position.z;} x/=L.length; z/=L.length; G.mouseGround.set(x,0,z); const h=G.hero.g.position; G.hero.face=Math.atan2(x-h.x,z-h.z); return [x,z]; }"
LINE = """([n, d]) => { const h=G.hero.g.position, a=G.hero.face; let x, z; for (let i=0;i<n;i++){ const e=G.spawnEnemy('grunt', 40); x=h.x+Math.sin(a)*(d+i*1.6); z=h.z+Math.cos(a)*(d+i*1.6);
  e.g.position.set(x,0,z); e.tile=G.toTile(x,z); e.state='walk'; e.spawnT=0; e.next=null; e.max=e.hp=1e6; e.E={...e.E, spd:0}; } G.__aim=[x,z]; }"""
CLEAR = "()=>{ for (const e of G.enemies) if(!e.dead) G.hurt(e, 1e9, '#fff'); G.sim(2); }"
def page(b, vw=1280, vh=800, login=True):
    c = b.new_context(viewport={'width': vw, 'height': vh}, has_touch=True); c.add_init_script(MOCK); pg = c.new_page()
    pg.on('dialog', lambda d: d.accept()); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text[:200])); pg.on('pageerror', lambda x: errs.append('PE ' + str(x)[:300]))
    pg.goto(url[0] + '?seed=12345&rng=777&flow=1'); pg.wait_for_function('()=>window.G&&G.ready&&G.screen', timeout=180000)
    pg.mouse.click(vw // 2, vh // 2); pg.wait_for_timeout(300)
    if login: pg.click('#lgGuest'); pg.wait_for_timeout(300)
    return c, pg
NUSER = [0]
def own_gunner(pg):
    NUSER[0] += 1; pg.fill('#lgEmail', f'rr{NUSER[0]}@test.kr'); pg.fill('#lgPw', 'secret12'); pg.click('#lgUp'); pg.wait_for_function("()=>G.screen==='menu'", timeout=15000); pg.wait_for_timeout(300)
    J(pg, "()=>{ const d=JSON.parse(localStorage.getItem('__mockdb')); const u=Object.values(d.users).slice(-1)[0].id; d.hd3d_owned={[u+':hero_gunner']:{user_id:u,item:'hero_gunner'}}; localStorage.setItem('__mockdb', JSON.stringify(d)); }")
def town(b, hero, br, vw=1280, vh=800):
    c, pg = page(b, vw, vh, login=hero != 'gunner')
    if hero == 'gunner': own_gunner(pg)
    J(pg, """([hero, br]) => { const {Acc}=G.gear; Acc.update(d=>{ d.souls=999; d.hero=hero; d.stats={runs:1,kills:1,waves:1,souls:1}; d.eq[hero]={}; d.adv = br ? {[hero]:{b:br,n:1}} : {}; return d; }); }""", [hero, br])
    pg.click('#mnCont'); pg.wait_for_function("()=>G.screen==='town'" + (" && G.shop.Sh.heroOwned('gunner')" if hero == 'gunner' else ''), timeout=30000); pg.wait_for_timeout(800)
    return c, pg
def run(b, hero, br, vw=1280, vh=800):
    c, pg = town(b, hero, br, vw, vh)
    pg.click('#twGo'); pg.wait_for_timeout(300); pg.click('.chtab[data-c="0"]'); J(pg, "()=>document.getElementById('stChalGo').click()"); pg.wait_for_function("()=>G.phase==='build'&&G.hero", timeout=60000); pg.wait_for_timeout(400)
    J(pg, "()=>{ G.manual=true; G.gold=0; G.hero.hp=G.hero.max; G.advN={}; G.advDmg=0; }")
    return c, pg
def cast(pg, mid, aim=True):
    pg.mouse.move(5, 5); J(pg, AIM) if aim else J(pg, "()=>{ G.mouseGround.set(G.__aim[0],0,G.__aim[1]); }"); J(pg, "()=>{ G.hero.skillCd=0; G.hero.atkT=0; }"); pg.keyboard.press('q'); J(pg, f"()=>G.sim({mid})")
RAF = "()=>new Promise(r=>{ G.pauseRender=false; requestAnimationFrame(()=>requestAnimationFrame(()=>{ G.pauseRender=true; r(); })); })"
def shot(pg, path, clip=None):
    J(pg, RAF); pg.screenshot(path=path, timeout=180000, clip=clip); J(pg, "()=>{ G.pauseRender=false }")
