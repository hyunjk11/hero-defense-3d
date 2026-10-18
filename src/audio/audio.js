// 사운드: Kenney CC0 효과음 + OpenGameArt CC0 BGM, 일부(뿔나팔/보스 포효/번개)는 WebAudio 합성
const SFX_FILES = {
  arrow: ['pluck_001', 'pluck_002'], bolt: ['pluck_002'], cannon: ['explosionCrunch_000'], boom: ['explosionCrunch_001', 'lowFrequency_explosion_001'],
  magic: ['laserSmall_000', 'laserRetro_001'], zap: ['laserLarge_000'], sword: ['knifeSlice', 'knifeSlice2'], draw: ['drawKnife1', 'drawKnife2'],
  hit: ['impactPunch_medium_000', 'impactPunch_medium_001', 'impactPunch_medium_002'], hitArmor: ['impactPlate_medium_000', 'impactPlate_medium_001'], heroHurt: ['impactPunch_heavy_000'],
  bones: ['impactWood_light_000', 'impactWood_light_001', 'impactWood_light_002'], poof: ['impactGeneric_light_000'],
  dig: ['impactMining_000', 'impactMining_001', 'impactMining_002', 'impactMining_003'], digSoft: ['impactSoft_heavy_000', 'impactSoft_heavy_001'], digWood: ['impactWood_medium_000', 'impactWood_medium_001'],
  breakDirt: ['impactSoft_heavy_001'], breakWood: ['impactWood_heavy_000', 'impactWood_heavy_001'], breakRock: ['explosionCrunch_001'],
  coin: ['handleCoins2'], coins: ['handleCoins'], build: ['impactPlank_medium_000'], upgrade: ['maximize_006'], sell: ['handleCoins'], ui: ['click_002'], select: ['select_002'], error: ['error_004'], place: ['drop_002'],
  coreHit: ['impactBell_heavy_000'], glass: ['impactGlass_heavy_000'], meteorCast: ['forceField_000'], meteor: ['lowFrequency_explosion_000'], stomp: ['footstep_concrete_000'],
  ram: ['chop', 'impactWood_heavy_001'], towerHit: ['impactPlate_medium_001'], towerBreak: ['lowFrequency_explosion_001'], repair: ['minimize_003'], block: ['impactPlate_medium_000'],
  waveClear: ['jingles_STEEL02'], gameOver: ['jingles_STEEL01'], victory: ['jingles_PIZZI02'], levelUp: ['jingles_NES09'], confirm: ['confirmation_001'],
};
const VOL = { arrow: .35, bolt: .4, cannon: .7, boom: .8, magic: .35, zap: .45, sword: .6, draw: .5, hit: .32, hitArmor: .35, heroHurt: .5, bones: .5, poof: .3, dig: .32, digSoft: .4, digWood: .4,
  breakDirt: .7, breakWood: .75, breakRock: .8, coin: .45, coins: .7, build: .8, upgrade: .7, sell: .7, ui: .5, select: .5, error: .5, place: .6, coreHit: .9, glass: .5, meteorCast: .6, meteor: 1,
  stomp: .9, ram: .8, towerHit: .45, towerBreak: .9, repair: .7, block: .4, waveClear: .7, gameOver: .8, victory: .8, levelUp: .5, confirm: .6 };
const GAP = { arrow: .05, hit: .04, hitArmor: .05, dig: .07, digSoft: .07, digWood: .07, coin: .06, bones: .06, magic: .06, zap: .08, cannon: .06, sword: .05, towerHit: .08, block: .06, ram: .1 };
const BGM = { build: 'audio/bgm/town.mp3', wave: 'audio/bgm/battle.mp3', boss: 'audio/bgm/boss.mp3' }, BGMV = { build: .55, wave: .5, boss: .55 };

const store = (() => { try { return Object.assign({ bgm: .6, sfx: .8, bgmOn: true, sfxOn: true }, JSON.parse(localStorage.getItem('hd3d_audio') || '{}')); } catch (e) { return { bgm: .6, sfx: .8, bgmOn: true, sfxOn: true }; } })();
const raw = {}; // 미리 받아둔 ArrayBuffer (AudioContext는 첫 입력 때 생성)
for (const k in SFX_FILES) for (const f of SFX_FILES[k]) if (!raw[f]) raw[f] = fetch(`audio/sfx/${f}.mp3`).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);

export const Snd = {
  ctx: null, buf: {}, last: {}, voices: 0, music: null, want: 'build', tracks: {}, listener: { x: 0, z: 0 }, project: null, cfg: store,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx; this.master = c.createDynamicsCompressor(); this.master.threshold.value = -10; this.master.ratio.value = 4; this.master.connect(c.destination);
    this.sfxG = c.createGain(); this.bgmG = c.createGain(); this.sfxG.connect(this.master); this.bgmG.connect(this.master); this.apply();
    const len = c.sampleRate; this.noise = c.createBuffer(1, len, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    for (const f in raw) raw[f].then(ab => ab && c.decodeAudioData(ab.slice(0)).then(b => this.buf[f] = b).catch(() => {}));
    for (const k in BGM) { const a = new Audio(BGM[k]); a.loop = true; a.preload = 'auto'; const src = c.createMediaElementSource(a), g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.bgmG); this.tracks[k] = { a, g, on: false }; }
    this.setMusic(this.want, true);
  },
  save() { try { localStorage.setItem('hd3d_audio', JSON.stringify(this.cfg)); } catch (e) {} },
  apply() { if (!this.ctx) return; const t = this.ctx.currentTime; this.sfxG.gain.setTargetAtTime(this.cfg.sfxOn ? this.cfg.sfx : 0, t, .05); this.bgmG.gain.setTargetAtTime(this.cfg.bgmOn ? this.cfg.bgm * .8 : 0, t, .1); },
  setMusic(k, force) {
    if (this.want === k && !force) return; this.want = k; if (!this.ctx) return; const t = this.ctx.currentTime;
    for (const n in this.tracks) { const tr = this.tracks[n], on = n === k;
      if (on) { if (!tr.on) { if (n !== 'build' || tr.a.ended) tr.a.currentTime = 0; const p = tr.a.play(); if (p) p.catch(() => {}); } tr.g.gain.cancelScheduledValues(t); tr.g.gain.setTargetAtTime(BGMV[n], t, k === 'boss' ? .3 : .9); }
      else if (tr.on) { tr.g.gain.cancelScheduledValues(t); tr.g.gain.setTargetAtTime(0, t, .5); const a = tr.a; setTimeout(() => { if (this.want !== n) a.pause(); }, 2600); }
      tr.on = on; }
  },
  duck(amount = .35, dur = 1.6) { if (!this.ctx) return; const t = this.ctx.currentTime, g = this.bgmG.gain, base = this.cfg.bgmOn ? this.cfg.bgm * .8 : 0; g.cancelScheduledValues(t); g.setValueAtTime(base * amount, t); g.setTargetAtTime(base, t + dur, .4); },
  out(pos, vol) { // 거리 감쇠 + 화면 좌우 패닝
    const c = this.ctx, g = c.createGain(); let v = vol, node = g;
    if (pos) { const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, d = Math.hypot(dx, dz); v *= 1 / (1 + (d / 22) ** 2);
      if (c.createStereoPanner && this.project) { const p = c.createStereoPanner(); p.pan.value = Math.max(-.8, Math.min(.8, this.project(pos))); g.connect(p); node = p; } }
    g.gain.value = v; node.connect(this.sfxG); return g;
  },
  play(name, o = {}) {
    if (!this.ctx || !this.cfg.sfxOn || this.voices > 30) return; const now = this.ctx.currentTime;
    if (!o.force && this.last[name] && now - this.last[name] < (GAP[name] || .03)) return; this.last[name] = now;
    const list = SFX_FILES[name]; if (!list) return; const b = this.buf[list[Math.floor(Math.random() * list.length)]]; if (!b) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = (o.rate || 1) * (o.exact ? 1 : .93 + Math.random() * .14);
    s.connect(this.out(o.pos, (VOL[name] || .5) * (o.vol ?? 1))); this.voices++; s.onended = () => this.voices--; s.start(now + (o.delay || 0));
  },
  // ---- 합성음 ----
  osc(type, f, t0, dur, v, dest, f2) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + Math.min(.08, dur * .2)); g.gain.setTargetAtTime(0, t0 + dur * .7, dur * .15); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + .3); },
  noiseHit(t0, dur, v, dest, freq, q = 1, type = 'bandpass') { const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * .5); s.stop(t0 + dur + .05); return f; },
  horn() { // 웨이브 시작 뿔나팔 (금관 느낌: 디튠된 톱니파 + 저역통과 필터 스윕)
    if (!this.ctx || !this.cfg.sfxOn) return; const c = this.ctx, t = c.currentTime + .02, out = this.out(null, .5), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.connect(out);
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1700, t + .35); lp.frequency.setValueAtTime(1700, t + 1.3); lp.frequency.linearRampToValueAtTime(500, t + 2);
    const notes = [[146.8, 0, .55], [146.8, .6, .25], [220, .9, 1.25]];
    for (const [f, d, l] of notes) for (const det of [-6, 0, 7]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.frequency.setValueAtTime(f * .94, t + d); o.frequency.linearRampToValueAtTime(f, t + d + .09); g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(.16, t + d + .07); g.gain.setValueAtTime(.16, t + d + l - .1); g.gain.linearRampToValueAtTime(0, t + d + l + .12);
      o.connect(g); g.connect(lp); o.start(t + d); o.stop(t + d + l + .2); }
    this.osc('sine', 73.4, t + .9, 1.3, .18, out);
  },
  roar(pos) { // 보스 포효: 낮게 떨어지는 톱니파 + 웨이브셰이퍼 왜곡 + 거친 노이즈
    if (!this.ctx || !this.cfg.sfxOn) return; const c = this.ctx, t = c.currentTime + .02, out = this.out(pos ? { x: this.listener.x, z: this.listener.z } : null, .75), ws = c.createWaveShaper(), lp = c.createBiquadFilter();
    const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 4); } ws.curve = cv; lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(300, t + 1.8); ws.connect(lp); lp.connect(out);
    for (const [f, det] of [[95, 0], [97, 12], [47, 0]]) { const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f * .6, t + 1.9); o.detune.value = det;
      lfo.frequency.value = 23; lg.gain.value = f * .08; lfo.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + .18); g.gain.setTargetAtTime(0, t + 1.3, .3); o.connect(g); g.connect(ws); o.start(t); lfo.start(t); o.stop(t + 2.4); lfo.stop(t + 2.4); }
    this.noiseHit(t, 1.8, .5, out, 600, .7); this.duck(.3, 1.8);
  },
  crackle(pos) { // 번개 지직
    if (!this.ctx || !this.cfg.sfxOn) return; const now = this.ctx.currentTime; if (this.last.crk && now - this.last.crk < .07) return; this.last.crk = now;
    const out = this.out(pos, .55), t = now + .01; for (let k = 0; k < 5; k++) this.noiseHit(t + k * .028 + Math.random() * .015, .05 + Math.random() * .05, .6, out, 2500 + Math.random() * 3000, 1.5, 'highpass');
    this.osc('square', 1800, t, .12, .06, out, 300); this.play('zap', { pos, vol: .7 });
  },
  fuse(pos) { // 자폭병 심지 타는 소리 (치익 + 짧은 경고음)
    if (!this.ctx || !this.cfg.sfxOn) return; const t = this.ctx.currentTime, out = this.out(pos, .5); this.noiseHit(t, .7, .5, out, 5500, 1.2, 'highpass'); for (let k = 0; k < 3; k++) this.osc('square', 1400, t + k * .22, .06, .05, out, 0);
  },
  whoosh(pos, dur = .35, f0 = 500, f1 = 2500, v = .45) { if (!this.ctx || !this.cfg.sfxOn) return; const t = this.ctx.currentTime, out = this.out(pos, v), f = this.noiseHit(t, dur, .9, out, f0, 2.5); f.frequency.exponentialRampToValueAtTime(f1, t + dur * .6); },
  beep(f, d = .08, type = 'square', v = .03, slide = 0) { if (!this.ctx || !this.cfg.sfxOn) return; const t = this.ctx.currentTime; this.osc(type, f, t, d, v * 4, this.out(null, 1), slide ? Math.max(30, f + slide) : 0); },
};
// 첫 사용자 입력 때 오디오 시작 (브라우저 자동재생 정책)
const first = () => { Snd.unlock(); }; for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, first, { capture: true });
