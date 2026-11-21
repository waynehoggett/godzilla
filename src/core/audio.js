// Sound effects and voices are generated clips (public/audio); every effect also has a synthesized
// fallback, and the score is fully synthesized.
const SAMPLES = ['roar_godzilla', 'roar_godzilla_short', 'roar_rodan', 'roar_kong', 'roar_mecha', 'roar_ghidorah', 'impact_heavy', 'impact_claw', 'footstep', 'beam_charge', 'beam_fire', 'explosion', 'collapse', 'gun', 'plane', 'boat', 'splash', 'mine', 'whoosh', 'crowd', 'block'];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Step-sequenced score. drum: 16 steps/bar ('x' hit, 'o' soft). bass: 8 notes/bar (MIDI, 0 = rest).
// pad: one chord per bar. All original material.
const MOODS = {
  menu: { bpm: 60, vol: 0.55, drum: ['x.........o.....', 'x.......x.......'], bass: [[26, 0, 0, 0, 0, 0, 0, 0], [27, 0, 0, 0, 26, 0, 0, 0]], pad: [[50, 53, 57], [51, 55, 58], [50, 53, 57], [48, 53, 56]] },
  dread: { bpm: 76, vol: 0.7, drum: ['x.....x.x.......', 'x.....x.x...o.o.'], bass: [[26, 0, 26, 0, 27, 0, 0, 0], [26, 0, 26, 0, 29, 0, 27, 0]], pad: [[50, 53, 56], [50, 53, 57], [51, 54, 58], [50, 53, 57]] },
  battle: { bpm: 140, vol: 0.8, drum: ['x..ox.o.x..ox.oo', 'x..ox.o.x.x.xxoo'], bass: [[26, 26, 29, 26, 31, 26, 29, 28], [26, 26, 29, 26, 33, 31, 29, 28], [24, 24, 27, 24, 29, 24, 27, 26], [26, 26, 29, 26, 31, 33, 34, 33]], pad: [[50, 57, 62], [50, 57, 62], [48, 55, 60], [50, 57, 65]] },
  hope: { bpm: 58, vol: 0.6, drum: ['................'], bass: [[26, 0, 0, 0, 0, 0, 0, 0], [31, 0, 0, 0, 0, 0, 0, 0], [33, 0, 0, 0, 0, 0, 0, 0], [26, 0, 0, 0, 0, 0, 0, 0]], pad: [[62, 66, 69], [62, 67, 71], [61, 64, 69], [62, 66, 69, 74]] },
};

export class AudioSys {
  constructor() {
    this.ctx = null; this.muted = false; this.mood = null; this.seq = 0; this.nextT = 0; this.eng = null;
    const kick = () => { this.init(); if (this.ctx.state === 'suspended') this.ctx.resume(); };
    addEventListener('pointerdown', kick); addEventListener('keydown', kick);
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.ctx = { state: 'none' }; this.dead = true; return; }
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.5; this.mus.connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
    this.curve = curve;
    setInterval(() => this.tick(), 80);
    this.buf = {}; this.loops = {}; this.vo = {}; this.voBuf = {};
    this.voice = c.createGain(); this.voice.gain.value = 1.15; this.voice.connect(this.master);
    fetch('/audio/vo/manifest.json').then((r) => (r.ok ? r.json() : {})).then((m) => { this.vo = m; }).catch(() => {});
    for (const n of SAMPLES) fetch(`/audio/sfx/${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => c.decodeAudioData(b)).then((b) => { this.buf[n] = b; }).catch(() => {});
  }

  // Play a loaded clip; returns false when it is not available so the caller can synthesize instead.
  play(name, vol = 1, rate = 1, o = {}) {
    if (!this.ok || !this.buf || !this.buf[name]) return false;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), t = c.currentTime;
    s.buffer = this.buf[name]; s.playbackRate.value = rate * (o.jitter ? 1 + (Math.random() - 0.5) * o.jitter : 1); s.loop = !!o.loop;
    g.gain.setValueAtTime(vol, t);
    if (o.dur) { g.gain.setValueAtTime(vol, t + Math.max(0.01, o.dur - 0.25)); g.gain.linearRampToValueAtTime(0.0001, t + o.dur); s.stop(t + o.dur + 0.05); }
    s.connect(g); g.connect(o.out || this.sfx); s.start(t);
    return { s, g };
  }
  // Speak a recorded dialogue line if one exists for this speaker and text. Returns its length in seconds (0 if none).
  say(who, text) {
    const v = this.vo && this.vo[who + '|' + text];
    if (!this.ok || !v) return 0;
    const go = (b) => { const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.voice); s.start(); const t = this.ctx.currentTime; this.mus.gain.setTargetAtTime(0.28, t, 0.1); this.mus.gain.setTargetAtTime(0.5, t + b.duration, 0.4); };
    if (this.voBuf[v.f]) go(this.voBuf[v.f]);
    else fetch('/audio/vo/' + v.f).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((b) => { this.voBuf[v.f] = b; go(b); }).catch(() => {});
    return v.d;
  }
  // Start or stop a named looping bed (crowd, boat).
  loop(name, vol = 0.5) {
    if (!this.ok) return;
    if (vol <= 0) { const l = this.loops[name]; if (l) { l.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3); setTimeout(() => { try { l.s.stop(); } catch { /* already stopped */ } }, 1200); delete this.loops[name]; } return; }
    if (this.loops[name]) { this.loops[name].g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3); return; }
    const l = this.play(name, 0.0001, 1, { loop: true }); if (l) { l.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.4); this.loops[name] = l; }
  }
  stopLoops() { for (const n of Object.keys(this.loops || {})) this.loop(n, 0); }

  get ok() { return this.ctx && !this.dead; }
  setMuted(m) { this.muted = m; if (this.ok) this.master.gain.value = m ? 0 : 0.9; }

  // --- primitives ---
  tone(type, f0, f1, dur, vol, when = 0, out) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(dur, vol, f0, f1, type = 'lowpass', when = 0, q = 0.8, out) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out || this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // --- effects ---
  click() { this.tone('square', 660, 440, 0.06, 0.08); }
  gun() { if (this.play('gun', 0.5, 1, { jitter: 0.12 })) return; this.noise(0.09, 0.35, 3200, 600, 'bandpass'); this.tone('square', 190, 70, 0.07, 0.18); }
  hit(v = 1) { this.noise(0.22, 0.5 * v, 900, 90); this.tone('sine', 140, 40, 0.25, 0.6 * v); }
  step(v = 1) { if (this.play('footstep', Math.min(1, v * 1.6), 1, { jitter: 0.15 })) return; this.tone('sine', 70, 28, 0.45, 0.8 * v); this.noise(0.35, 0.3 * v, 300, 40); }
  boom(size = 1) {
    if (this.play('explosion', Math.min(1, 0.45 * size + 0.15), 1.25 - Math.min(0.4, size * 0.15), { jitter: 0.1 })) return;
    const d = 0.8 + size * 0.9;
    this.noise(d, Math.min(1, 0.6 * size), 1400, 30); this.tone('sine', 95, 22, d, Math.min(1, 0.9 * size));
    this.noise(0.12, 0.4 * size, 5000, 800, 'highpass');
  }
  // A blow landing: body thud, low boom and a sharp crack, scaled by power 1..4.
  collapse(v = 0.6) { if (!this.play('collapse', v, 1, { jitter: 0.2 })) this.boom(0.55); }
  impact(power = 1) {
    if (this.play(power >= 2.5 ? 'impact_heavy' : 'impact_claw', Math.min(1, 0.5 + power * 0.15), 1, { jitter: 0.14 })) { if (power >= 2.5) this.tone('sine', 70, 22, 0.7, 0.6); return; }
    const v = Math.min(1, 0.45 + power * 0.18);
    this.tone('sine', 150, 34, 0.3 + power * 0.06, v); this.noise(0.25, v * 0.6, 1200, 80);
    this.noise(0.07, v * 0.55, 6000, 1800, 'highpass'); this.tone('triangle', 420, 90, 0.12, v * 0.35);
    if (power >= 2.5) this.tone('sine', 70, 22, 0.8, 0.8);
  }
  block() { if (this.play('block', 0.7, 1, { jitter: 0.1 })) return; this.tone('triangle', 900, 420, 0.12, 0.3); this.noise(0.08, 0.3, 5000, 2500, 'bandpass', 0, 4); }
  splash(v = 1) { if (this.play('splash', Math.min(1, v * 0.5), 1, { jitter: 0.2 })) return; this.noise(0.7, 0.35 * v, 2600, 500, 'bandpass', 0, 0.5); }
  heartbeat() { this.tone('sine', 62, 38, 0.18, 0.9); this.tone('sine', 55, 34, 0.2, 0.7, 0.24); }
  alarm() { this.tone('square', 880, 880, 0.12, 0.1); this.tone('square', 660, 660, 0.12, 0.1, 0.16); }
  whoosh(v = 1) { if (this.play('whoosh', Math.min(1, v * 0.6), 1, { jitter: 0.25 })) return; this.noise(0.5, 0.35 * v, 400, 2400, 'bandpass', 0, 1.5); }

  // The big one: detuned saws swept up then down, amplitude-growled and overdriven.
  // who: 'rodan' | 'kong' | 'mecha' | 'ghidorah'; omitted = Godzilla.
  roar(vol = 1, pitch = 1, dur = 2.1, who) {
    if (!this.ok) return;
    const clip = who ? 'roar_' + who : dur < 1.5 ? 'roar_godzilla_short' : 'roar_godzilla';
    if (this.play(clip, Math.min(1, vol), who ? 1 : Math.pow(pitch, 0.3))) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain(), sh = c.createWaveShaper(), bp = c.createBiquadFilter();
    sh.curve = this.curve; bp.type = 'bandpass'; bp.frequency.value = 780 * pitch; bp.Q.value = 0.9;
    const lfo = c.createOscillator(), lg = c.createGain(), am = c.createGain();
    lfo.frequency.setValueAtTime(34, t); lfo.frequency.linearRampToValueAtTime(19, t + dur); lg.gain.value = 0.45; am.gain.value = 0.6;
    lfo.connect(lg); lg.connect(am.gain);
    for (const det of [1, 1.012, 0.502, 1.498]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(300 * pitch * det, t);
      o.frequency.exponentialRampToValueAtTime(560 * pitch * det, t + dur * 0.22);
      o.frequency.exponentialRampToValueAtTime(410 * pitch * det, t + dur * 0.6);
      o.frequency.exponentialRampToValueAtTime(120 * pitch * det, t + dur);
      o.connect(am); o.start(t); o.stop(t + dur + 0.1);
    }
    am.connect(sh); sh.connect(bp); bp.connect(g);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.12);
    g.gain.setValueAtTime(0.5 * vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.sfx); lfo.start(t); lfo.stop(t + dur + 0.1);
    this.noise(dur, 0.2 * vol, 1800 * pitch, 400, 'bandpass', 0, 0.6);
    this.tone('sawtooth', 70 * pitch, 40, dur, 0.3 * vol);
  }
  charge(dur = 2) { if (this.play('beam_charge', 0.6, 2.4 / Math.max(0.8, dur), { dur })) return; this.tone('sawtooth', 90, 900, dur, 0.16); this.tone('sine', 300, 2400, dur, 0.12); this.noise(dur, 0.12, 400, 6000, 'bandpass', 0, 3); }
  beam(dur = 1.2) { if (this.play('beam_fire', 0.8, 1, { dur })) { this.tone('sine', 60, 30, dur, 0.6); return; } this.noise(dur, 0.7, 5200, 900, 'bandpass', 0, 0.4); this.tone('sawtooth', 1400, 180, dur, 0.22); this.tone('sine', 60, 30, dur, 0.8); }
  zap(dur = 0.6) { this.tone('sawtooth', 1800, 300, dur, 0.18); this.noise(dur, 0.3, 6000, 2000, 'highpass'); }

  // Continuous engine drone (planes, boats).
  engine(on, type = 'sawtooth') {
    if (!this.ok) return;
    if (!on) { if (this.eng) { const e = this.eng; e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); setTimeout(() => { e.o.stop(); e.o2.stop(); }, 900); this.eng = null; } return; }
    if (this.eng) return;
    const sample = this.play(type === 'boat' ? 'boat' : 'plane', 0.0001, 1, { loop: true });
    if (sample) { this.eng = { sample, o: { stop() { try { sample.s.stop(); } catch { /* stopped */ } } }, o2: { stop() {} }, g: sample.g, f: null }; return; }
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o2.type = 'square'; o.frequency.value = 80; o2.frequency.value = 40.5; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o.start(); o2.start();
    this.eng = { o, o2, f, g };
  }
  engineSet(pitch, vol) {
    if (!this.eng) return;
    const t = this.ctx.currentTime;
    if (this.eng.sample) { this.eng.sample.s.playbackRate.setTargetAtTime(0.85 + (pitch - 0.9) * 0.6, t, 0.15); this.eng.g.gain.setTargetAtTime(vol * 2.2, t, 0.15); return; }
    this.eng.o.frequency.setTargetAtTime(80 * pitch, t, 0.1); this.eng.o2.frequency.setTargetAtTime(40.5 * pitch, t, 0.1);
    this.eng.f.frequency.setTargetAtTime(400 + 500 * pitch, t, 0.1); this.eng.g.gain.setTargetAtTime(vol, t, 0.15);
  }

  // --- music ---
  music(mood) {
    if (this.mood === mood) return;
    this.mood = mood; this.seq = 0;
    if (this.ok) this.nextT = this.ctx.currentTime + 0.1;
  }
  tick() {
    if (!this.ok || this.ctx.state !== 'running') return;
    const m = MOODS[this.mood];
    if (!m) return;
    const c = this.ctx, dt = 60 / m.bpm / 4;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.25) {
      const when = this.nextT - c.currentTime, s = this.seq % 16, bar = Math.floor(this.seq / 16);
      const d = m.drum[bar % m.drum.length][s];
      if (d === 'x' || d === 'o') {
        const v = (d === 'x' ? 0.9 : 0.4) * m.vol;
        this.tone('sine', 105, 42, 0.32, v, when, this.mus); this.noise(0.1, v * 0.35, 900, 120, 'lowpass', when, 0.8, this.mus);
      }
      if (s % 2 === 0) {
        const n = m.bass[bar % m.bass.length][s / 2];
        if (n) {
          const len = m.bpm > 100 ? dt * 1.8 : dt * 7;
          this.tone('sawtooth', midi(n + 12), midi(n + 12), len, 0.16 * m.vol, when, this.musLP());
          this.tone('sine', midi(n), midi(n), len, 0.5 * m.vol, when, this.mus);
        }
      }
      if (s === 0) {
        const ch = m.pad[bar % m.pad.length], len = dt * 16;
        for (const n of ch) this.padNote(midi(n), len, 0.05 * m.vol, when);
      }
      this.seq++; this.nextT += dt;
    }
  }
  musLP() {
    if (!this.lp) { this.lp = this.ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 520; this.lp.connect(this.mus); }
    return this.lp;
  }
  padNote(f, dur, vol, when) {
    const c = this.ctx, t = c.currentTime + when, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.1);
    g.connect(this.musLP());
    for (const det of [0.996, 1.004]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * det; o.connect(g); o.start(t); o.stop(t + dur * 1.15); }
  }
}
