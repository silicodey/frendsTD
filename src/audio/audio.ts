/** Fully synthesized audio: no samples, everything is generated with WebAudio. */
type Wave = OscillatorType;

export class AudioEngine {
  ctx: AudioContext | OfflineAudioContext | null = null;
  private master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  /** Offline rendering (trailer soundtrack): time comes from `clock` instead of the audio device. */
  private offline = false;
  clock = 0;
  bpmOverride = 0;
  private noiseBuf!: AudioBuffer;
  private last = new Map<string, number>();
  private musicTimer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private pad: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  sfxOn = true;
  musicOn = true;
  intensity = 0; // 0 calm (menus/build) .. 1 combat
  private curIntensity = 0;

  private now() { return this.offline ? this.clock : this.ctx!.currentTime; }

  private init(ctx: AudioContext | OfflineAudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxOn ? 0.75 : 0; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.5 : 0; this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (!this.offline && this.ctx.state === 'suspended') void (this.ctx as AudioContext).resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.init(new AC());
    this.startMusic();
  }

  /** Render into an OfflineAudioContext: set `clock`, then call the usual sound methods. */
  attachOffline(ctx: OfflineAudioContext) {
    this.offline = true; this.clock = 0; this.sfxOn = true; this.musicOn = true;
    this.init(ctx);
    this.last.clear();
  }

  setSfx(on: boolean) { this.sfxOn = on; if (this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.05); }
  setMusic(on: boolean) { this.musicOn = on; if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.2); }
  suspend(s: boolean) { if (!this.ctx || this.offline) return; const c = this.ctx as AudioContext; if (s) void c.suspend(); else void c.resume(); }

  private ok(key: string, gap: number) {
    if (!this.ctx || !this.sfxOn || (!this.offline && this.ctx.state !== 'running')) return false;
    const now = this.now();
    if (now - (this.last.get(key) ?? -9) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  tone(type: Wave, f0: number, f1: number, dur: number, vol: number, when = 0, bus: GainNode = this.sfxBus, attack = 0.004) {
    const ctx = this.ctx!;
    const t = this.now() + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur: number, vol: number, f0: number, f1: number, q = 1, when = 0, type: BiquadFilterType = 'bandpass', bus: GainNode = this.sfxBus) {
    const ctx = this.ctx!;
    const t = this.now() + when;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // ---------- sound effects ----------
  shot(family: string, heavy = false) {
    if (!this.ok('shot' + family, heavy ? 0.09 : 0.055)) return;
    const j = 0.94 + Math.random() * 0.12;
    switch (family) {
      case 'gemini': this.tone('sine', (heavy ? 1100 : 1700) * j, (heavy ? 500 : 900) * j, 0.09, 0.07); this.tone('triangle', 2600 * j, 1800, 0.05, 0.03); break;
      case 'claude': this.tone('triangle', (heavy ? 420 : 700) * j, (heavy ? 210 : 420) * j, heavy ? 0.16 : 0.09, 0.09); break;
      case 'codex': this.tone('square', (heavy ? 300 : 520) * j, (heavy ? 120 : 260) * j, 0.06, 0.04); this.noise(0.04, 0.05, 3000, 1500, 0.8); break;
      default: this.tone('sawtooth', (heavy ? 260 : 440) * j, 90, 0.1, 0.05); this.noise(0.05, 0.05, 5000, 1200, 0.7);
    }
  }
  zap() { if (!this.ok('zap', 0.07)) return; this.noise(0.12, 0.09, 6000, 900, 2.5); this.tone('sawtooth', 1400, 180, 0.1, 0.035); }
  beam(family: string) { if (!this.ok('beam' + family, 0.16)) return; const f = family === 'claude' ? 330 : 520; this.tone('sawtooth', f, f * 1.02, 0.17, 0.018); this.tone('sine', f * 2, f * 2.01, 0.17, 0.014); }
  rail() { if (!this.ok('rail', 0.1)) return; this.tone('sawtooth', 2200, 110, 0.35, 0.09); this.noise(0.3, 0.12, 8000, 300, 0.7); this.tone('sine', 90, 40, 0.3, 0.2); }
  sniper() { if (!this.ok('snipe', 0.08)) return; this.noise(0.14, 0.12, 4000, 600, 0.9); this.tone('triangle', 1500, 300, 0.12, 0.06); }
  explode(size = 1) {
    if (!this.ok('boom', 0.06)) return;
    this.noise(0.25 + size * 0.12, 0.16 + size * 0.05, 900, 80, 0.6, 0, 'lowpass');
    this.tone('sine', 130, 38, 0.24 + size * 0.1, 0.22);
  }
  nova() { if (!this.ok('nova', 0.1)) return; this.tone('sine', 200, 60, 0.45, 0.2); this.noise(0.4, 0.1, 400, 3000, 1.2); }
  pop(size = 1) { if (!this.ok('pop', 0.035)) return; const f = 520 / Math.max(0.5, size) * (0.9 + Math.random() * 0.3); this.tone('triangle', f, f * 0.45, 0.08, 0.06); this.noise(0.05, 0.035, 2500, 800, 1); }
  coin() { if (!this.ok('coin', 0.05)) return; this.tone('square', 1320, 1320, 0.05, 0.022); this.tone('square', 1760, 1760, 0.09, 0.022, 0.05); }
  build() { if (!this.ok('build', 0.05)) return; this.tone('triangle', 220, 440, 0.12, 0.12); this.tone('sine', 660, 880, 0.18, 0.07, 0.06); this.noise(0.1, 0.05, 800, 2500, 1); }
  upgrade() { if (!this.ok('up', 0.05)) return; [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.08, i * 0.06)); }
  sell() { if (!this.ok('sell', 0.05)) return; this.tone('triangle', 660, 330, 0.14, 0.08); this.coin(); }
  leak() { if (!this.ok('leak', 0.1)) return; this.tone('sawtooth', 220, 70, 0.4, 0.14); this.tone('square', 110, 55, 0.4, 0.1); this.noise(0.3, 0.1, 500, 100, 0.7, 0, 'lowpass'); }
  jam() { if (!this.ok('jam', 0.2)) return; for (let i = 0; i < 4; i++) this.tone('square', 300 + Math.random() * 900, 200 + Math.random() * 500, 0.05, 0.04, i * 0.05); }
  click() { if (!this.ok('click', 0.03)) return; this.tone('sine', 900, 1300, 0.05, 0.05); }
  deny() { if (!this.ok('deny', 0.1)) return; this.tone('square', 180, 140, 0.12, 0.05); }
  wave(boss = false) {
    if (!this.ok('wave', 0.3)) return;
    if (boss) { this.tone('sawtooth', 55, 52, 1.4, 0.2, 0, this.sfxBus, 0.2); this.tone('sawtooth', 82, 78, 1.4, 0.14, 0, this.sfxBus, 0.2); this.noise(1.2, 0.07, 200, 1200, 0.8); }
    else { this.tone('sawtooth', 196, 196, 0.22, 0.07); this.tone('sawtooth', 294, 294, 0.36, 0.07, 0.16); this.tone('sine', 588, 588, 0.4, 0.05, 0.16); }
  }
  win() { if (!this.ctx) return; [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this.tone('triangle', f, f, 0.5, 0.1, i * 0.11); this.tone('sine', f * 2, f * 2, 0.4, 0.04, i * 0.11); }); }
  lose() { if (!this.ctx) return; [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.6, 0.07, i * 0.22, this.sfxBus, 0.05)); }
  star(i: number) { if (!this.ctx) return; const f = [784, 988, 1319][i] ?? 1319; this.tone('triangle', f, f, 0.4, 0.12); this.tone('sine', f * 1.5, f * 1.5, 0.5, 0.06, 0.03); }

  // ---------- generative music ----------
  private startMusic() {
    const ctx = this.ctx!;
    const gain = ctx.createGain(); gain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 0.6;
    filter.connect(gain); gain.connect(this.musicBus);
    const osc: OscillatorNode[] = [];
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.detune.value = (i % 3 - 1) * 9;
      o.connect(filter); o.start(); osc.push(o);
    }
    this.pad = { osc, gain, filter };
    gain.gain.setTargetAtTime(0.045, this.now(), this.offline ? 0.4 : 1.5);
    this.nextBeat = this.now() + 0.1;
    if (!this.offline) this.musicTimer = window.setInterval(() => this.schedule(), 90);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.curIntensity += (this.intensity - this.curIntensity) * 0.08;
    const now = this.now();
    if (this.nextBeat < now - 0.5) this.nextBeat = now + 0.05;
    while (this.nextBeat < now + 0.25) this.playBeat(this.nextBeat - now, this.curIntensity);
  }

  /** Offline only: lay down the generative score from 0 to `until` seconds, with intensity as a function of time. */
  renderMusic(until: number, intensityAt: (t: number) => number, fadeOut = 0.6) {
    if (!this.offline) return;
    this.clock = 0;
    this.startMusic();
    this.nextBeat = 0;
    while (this.nextBeat < until) this.playBeat(this.nextBeat, intensityAt(this.nextBeat));
    this.pad?.gain.gain.setTargetAtTime(0, until, fadeOut / 3);
  }

  private playBeat(t: number, I: number) {
    const base = this.now();
    const bpm = this.bpmOverride || 96 + I * 26;
    const step = 60 / bpm / 2; // 8th notes
    // D minor-ish progression: i – VI – III – VII
    const chords = [[146.83, 174.61, 220.0], [116.54, 146.83, 174.61], [174.61, 220.0, 261.63], [130.81, 164.81, 196.0]];
    const scale = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99];
    const b = this.beat;
    const bar = Math.floor(b / 16) % 4;
    const ch = chords[bar];
    if (b % 16 === 0 && this.pad) {
      this.pad.osc.forEach((o, i) => o.frequency.setTargetAtTime(ch[i % 3] * (i >= 3 ? 2 : 1), base + t, 0.25));
      this.pad.filter.frequency.setTargetAtTime(500 + I * 900, base + t, 0.8);
    }
    // bass
    if (b % 4 === 0 || (I > 0.5 && b % 4 === 2)) this.tone('triangle', ch[0] / 2, ch[0] / 2, step * 1.8, 0.11 + I * 0.05, t, this.musicBus, 0.01);
    // arp
    const pat = [0, 2, 4, 2, 5, 4, 2, 7];
    const on = I > 0.15 ? true : b % 2 === 0;
    if (on && (b % 8 !== 7)) {
      const n = scale[(pat[b % 8] + bar * 2) % scale.length] * (b % 32 >= 16 && I > 0.4 ? 2 : 1);
      this.tone('sine', n, n, step * 1.5, 0.035 + I * 0.03, t, this.musicBus, 0.005);
      if (I > 0.3) this.tone('triangle', n * 2, n * 2, step * 0.6, 0.012 + I * 0.012, t + step * 0.5, this.musicBus, 0.005);
    }
    // drums fade in with combat
    if (I > 0.25) {
      if (b % 8 === 0 || b % 16 === 10) this.tone('sine', 120, 42, 0.16, 0.2 * I, t, this.musicBus, 0.002);
      if (b % 8 === 4) this.noise(0.11, 0.07 * I, 2200, 900, 0.8, t, 'bandpass', this.musicBus);
      if (b % 2 === 1 || I > 0.7) this.noise(0.03, 0.022 * I, 9000, 7000, 1, t, 'highpass', this.musicBus);
    }
    this.beat++;
    this.nextBeat += step;
  }
}
