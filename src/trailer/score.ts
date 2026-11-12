/**
 * The trailer's own score, synthesized offline. It is deliberately unlike the in-game music:
 * 150 BPM action (driving kick, distorted pumping bass, saw stabs, risers and impacts), then a
 * dark, cinematic coda (sub drone, formant choir, taiko and braams) for the closing question.
 *
 * Every shot in the trailer is a whole number of beats long, so `at(shot)` always lands on the grid.
 */
export const BPM = 150;
const B = 60 / BPM; // one beat (0.4 s)
const S = B / 4; // a sixteenth

// E natural minor
const ROOT = [82.41, 65.41, 98.0, 73.42]; // E2 C2 G2 D2   (i – VI – III – VII)
const CHORD = [[164.81, 196.0, 246.94], [130.81, 164.81, 196.0], [196.0, 246.94, 293.66], [146.83, 185.0, 220.0]];
const HOOK = [
  [659.3, 0, 659.3, 784.0, 0, 880.0, 784.0, 659.3],
  [523.3, 0, 523.3, 659.3, 0, 784.0, 659.3, 523.3],
  [587.3, 0, 784.0, 880.0, 0, 987.8, 880.0, 784.0],
  [587.3, 0, 587.3, 740.0, 0, 880.0, 740.0, 587.3],
];

/**
 * `music: false` renders only the sound design (risers, impacts, taiko hits): used when the trailer
 * is scored with licensed tracks that are mixed in afterwards (tools/trailer.cjs).
 */
export function renderScore(ctx: BaseAudioContext, dest: AudioNode, at: (shot: string) => number, end: number, music = true) {
  // ---------------------------------------------------------------- buses
  const master = ctx.createGain(); master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.16;
  master.connect(comp); comp.connect(dest);
  const drums = ctx.createGain(); drums.gain.value = 1; drums.connect(master);
  const pump = ctx.createGain(); pump.gain.value = 1; pump.connect(master); // synths, ducked by the kick
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.8, 2.6);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55; verb.connect(verbOut); verbOut.connect(master);
  const send = (node: AudioNode, amount: number) => { const g = ctx.createGain(); g.gain.value = amount; node.connect(g); g.connect(verb); };

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const drive = ctx.createWaveShaper();
  { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 3.2); } drive.curve = c; }
  const bassFilter = ctx.createBiquadFilter(); bassFilter.type = 'lowpass'; bassFilter.frequency.value = 700; bassFilter.Q.value = 3;
  const bassGain = ctx.createGain(); bassGain.gain.value = 0.55;
  drive.connect(bassFilter); bassFilter.connect(bassGain); bassGain.connect(pump);

  // ---------------------------------------------------------------- voices
  const env = (g: GainNode, t: number, a: number, peak: number, d: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const osc = (type: OscillatorType, f0: number, f1: number, t: number, dur: number, out: AudioNode, a: number, peak: number, detune = 0) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, a, peak, dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + a + dur + 0.05);
    return g;
  };
  const noise = (t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1: number, q: number, out: AudioNode, a = 0.002) => {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a, peak, dur);
    n.connect(f); f.connect(g); g.connect(out);
    n.start(t, Math.random()); n.stop(t + a + dur + 0.05);
    return g;
  };
  const duck = (t: number, depth = 0.32) => {
    pump.gain.setValueAtTime(depth, t);
    pump.gain.linearRampToValueAtTime(1, t + B * 0.42);
  };

  const kick = (t: number, v = 1) => {
    osc('sine', 165, 42, t, 0.32, drums, 0.002, 0.95 * v);
    osc('triangle', 330, 60, t, 0.05, drums, 0.001, 0.25 * v);
    noise(t, 0.015, 0.2 * v, 'highpass', 4000, 4000, 0.7, drums);
    duck(t);
  };
  const snare = (t: number, v = 1) => {
    const g = noise(t, 0.2, 0.42 * v, 'bandpass', 1900, 1400, 0.6, drums);
    osc('triangle', 210, 160, t, 0.11, drums, 0.001, 0.3 * v);
    send(g, 0.25);
  };
  const clap = (t: number, v = 1) => { for (let i = 0; i < 3; i++) noise(t + i * 0.011, 0.07 + i * 0.04, 0.22 * v, 'bandpass', 1300, 1100, 1.4, drums); };
  const hat = (t: number, v = 1, open = false) => noise(t, open ? 0.2 : 0.035, 0.11 * v, 'highpass', 9000, 7500, 0.8, drums);
  const crash = (t: number, v = 1) => send(noise(t, 1.6, 0.16 * v, 'highpass', 6000, 3500, 0.5, drums), 0.4);
  const tom = (t: number, f: number, v = 1) => osc('sine', f * 1.6, f, t, 0.3, drums, 0.002, 0.5 * v);
  const bass = (t: number, f: number, dur: number, v = 1) => {
    for (const d of [-8, 8]) osc('sawtooth', f, f, t, dur, drive, 0.004, 0.32 * v, d);
    osc('sine', f / 2, f / 2, t, dur, pump, 0.004, 0.28 * v);
  };
  const stab = (t: number, notes: number[], dur: number, v = 1, wet = 0.35) => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    f.connect(pump); send(f, wet);
    for (const n of notes) for (const d of [-14, 0, 14]) { osc('sawtooth', n, n, t, dur, f, 0.004, 0.06 * v, d); osc('sawtooth', n * 2, n * 2, t, dur, f, 0.004, 0.025 * v, d); }
  };
  const pad = (t: number, notes: number[], dur: number, v = 1) => {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; f.connect(pump); send(f, 0.3);
    for (const n of notes) for (const d of [-18, -6, 6, 18]) osc('sawtooth', n * 2, n * 2, t, dur, f, 0.05, 0.022 * v, d);
  };
  const pluck = (t: number, f: number, v = 1) => { const g = osc('square', f, f, t, 0.12, pump, 0.002, 0.045 * v); send(g, 0.2); };
  const lead = (t: number, f: number, dur: number, v = 1) => {
    const g = osc('sawtooth', f, f, t, dur, pump, 0.006, 0.07 * v, 6);
    osc('square', f / 2, f / 2, t, dur, pump, 0.006, 0.03 * v);
    send(g, 0.35);
  };
  const riser = (t: number, dur: number, v = 1) => {
    const g = noise(t, dur, 0.001, 'bandpass', 300, 9000, 1.4, master, dur * 0.95);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * v, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    const o = osc('sawtooth', 110, 880, t, dur, pump, dur * 0.95, 0.001);
    o.gain.setValueAtTime(0.0001, t); o.gain.exponentialRampToValueAtTime(0.05 * v, t + dur); o.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    send(g, 0.3);
  };
  const impact = (t: number, v = 1) => {
    osc('sine', 72, 26, t, 1.6, master, 0.003, 0.9 * v);
    send(noise(t, 1.2, 0.5 * v, 'lowpass', 2600, 90, 0.6, master), 0.6);
    send(noise(t, 0.12, 0.3 * v, 'highpass', 2000, 2000, 0.7, master), 0.5);
  };
  const roll = (t0: number, dur: number) => {
    // a snare roll that doubles its speed every quarter of its length
    let t = t0, step = B / 2;
    while (t < t0 + dur - 1e-6) {
      const k = (t - t0) / dur;
      snare(t, 0.35 + 0.65 * k);
      if (k > 0.25 && step > B / 4) step = B / 4;
      if (k > 0.55 && step > B / 8) step = B / 8;
      if (k > 0.8 && step > B / 16) step = B / 16;
      t += step;
    }
  };
  // ---- cinematic voices for the coda
  const taiko = (t: number, f = 70, v = 1) => {
    osc('sine', f * 1.5, f * 0.7, t, 0.9, master, 0.003, 0.95 * v);
    send(noise(t, 0.25, 0.35 * v, 'lowpass', 600, 150, 0.8, master), 0.9);
  };
  const braam = (t: number, f: number, dur: number, v = 1) => {
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 4;
    flt.frequency.setValueAtTime(150, t); flt.frequency.exponentialRampToValueAtTime(1600, t + 0.35); flt.frequency.exponentialRampToValueAtTime(260, t + dur);
    const sh = ctx.createWaveShaper(); sh.curve = drive.curve;
    sh.connect(flt); flt.connect(master); send(flt, 0.7);
    for (const [m, d] of [[1, -12], [1, 12], [2, 0], [1.5, 5], [0.5, 0]] as [number, number][]) osc('sawtooth', f * m, f * m, t, dur, sh, 0.03, 0.11 * v, d);
  };
  const choir = (t: number, notes: number[], dur: number, v = 1, attack = 1.2) => {
    // sawtooth "voices" through three vowel formants ("ah")
    const mixG = ctx.createGain(); mixG.gain.value = 1; mixG.connect(master); send(mixG, 1.1);
    const formants: BiquadFilterNode[] = [[730, 1], [1090, 0.5], [2440, 0.25]].map(([fq, g]) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = 9;
      const gg = ctx.createGain(); gg.gain.value = g; bp.connect(gg); gg.connect(mixG); return bp;
    });
    for (const n of notes) for (const d of [-9, 0, 9]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = n; o.detune.value = d;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 4.6 + Math.random(); lg.gain.value = 7; lfo.connect(lg); lg.connect(o.detune);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + attack); g.gain.setValueAtTime(0.16 * v, t + dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); for (const f of formants) g.connect(f);
      o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
  };
  const drone = (t: number, f: number, dur: number, v = 1) => {
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 320; flt.connect(master); send(flt, 0.5);
    for (const d of [-7, 7]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14 * v, t + 1.0); g.gain.setValueAtTime(0.14 * v, t + dur - 1.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(flt); o.start(t); o.stop(t + dur + 0.05);
    }
    osc('sine', f / 2, f / 2, t, dur - 0.6, master, 0.8, 0.3 * v);
  };
  const bell = (t: number, f: number, v = 1) => {
    for (const [m, a] of [[1, 1], [2.76, 0.35], [5.4, 0.15]]) send(osc('sine', f * m, f * m, t, 2.6, master, 0.004, 0.05 * v * a), 1.2);
  };

  // ---------------------------------------------------------------- arrangement
  const beats = (t0: number, t1: number, fn: (t: number, i: number) => void) => { let i = 0; for (let t = t0; t < t1 - 1e-6; t += B, i++) fn(t, i); };
  /** The main driving groove. `level` 0..2 adds layers. */
  const groove = (t0: number, t1: number, level: number, bar0 = 0) => {
    beats(t0, t1, (t, i) => {
      const bar = bar0 + Math.floor(i / 4), c = bar % 4, inBar = i % 4;
      kick(t);
      if (inBar === 1 || inBar === 3) { snare(t, level >= 1 ? 1 : 0.8); if (level >= 2) clap(t, 0.8); }
      for (let s = 0; s < 4; s++) hat(t + s * S, s === 2 ? 1 : 0.55, s === 2 && level >= 2 && inBar === 3);
      // off-beat eighth bass, octave jump on the last eighth of the bar
      bass(t + B / 2, ROOT[c] * (inBar === 3 ? 2 : 1), B * 0.42, 1);
      if (level >= 2) bass(t, ROOT[c], B * 0.3, 0.6);
      if (inBar === 0 && level >= 1) stab(t, CHORD[c], level >= 2 ? B * 3.6 : B * 0.9, level >= 2 ? 0.9 : 0.8);
      if (level >= 1) for (let s = 0; s < 4; s++) pluck(t + s * S, CHORD[c][(i * 4 + s) % 3] * (s % 2 ? 4 : 2), 0.7);
      if (level >= 2) { const n = HOOK[c][(inBar * 2) % 8], n2 = HOOK[c][(inBar * 2 + 1) % 8]; if (n) lead(t, n, B * 0.45); if (n2) lead(t + B / 2, n2, B * 0.45); }
    });
  };
  /** Duel groove: half-time snare for weight, but a kick on every beat and a sixteenth ostinato for drive. */
  const duel = (t0: number, t1: number, bar0 = 0) => {
    beats(t0, t1, (t, i) => {
      const bar = bar0 + Math.floor(i / 4), c = [0, 0, 1, 3][bar % 4], inBar = i % 4;
      kick(t, inBar === 0 ? 1.1 : 0.8);
      if (inBar === 2) { snare(t, 1.15); clap(t, 1); }
      if (inBar === 3) snare(t + B * 0.75, 0.45);
      for (let s = 0; s < 4; s++) {
        hat(t + s * S, s === 2 ? 1 : 0.5);
        bass(t + s * S, ROOT[c] * (s === 0 && inBar === 0 ? 1 : s === 3 ? 2 : 1), S * 0.8, s === 0 ? 1 : 0.7);
      }
      for (let s = 0; s < 2; s++) pluck(t + s * B / 2, [329.6, 329.6, 392.0, 329.6, 493.9, 329.6, 440.0, 392.0][(i * 2 + s) % 8], 1);
      if (inBar === 0) stab(t, CHORD[c], B * 1.6, 0.75);
    });
  };

  const t = {
    fam: at('fam-gemini'), all48: at('all48'), props: at('prop-0'), farm: at('battle-farm'), latent: at('battle-latent'), sing: at('battle-sing'),
    vsA: at('vs-a'), vsOpus: at('vs-opus'), think: at('vs-think'), cursor: at('vs-cursor'), gg: at('vs-gg'), boss: at('final-boss'), boom: at('final-boom'), names: at('names'),
  };

  if (!music) {
    // sound design only: the licensed score carries the music
    riser(0, 1.2, 0.6); impact(1.2, 0.7);
    riser(t.all48, t.props - t.all48, 0.7); impact(t.props, 0.6);
    taiko(t.vsA, 62, 0.9); taiko(t.vsA + 2 * B, 56, 0.9); impact(t.vsA + 4 * B, 0.8);
    beats(t.think, t.cursor, (tt) => { for (let s = 0; s < 2; s++) osc('square', 2400, 2400, tt + s * B / 2, 0.02, master, 0.001, 0.05); });
    riser(t.boss, t.boom - t.boss, 1.1);
    impact(t.boom, 1.5); crash(t.boom, 1.4);
    stab(t.boom + 2 * B, [164.81, 207.65, 246.94, 329.6], B * 3, 1.0, 0.7); choir(t.boom + 2 * B, [164.81, 246.94, 329.6], 1.6, 0.6, 0.05);
    [0, 2, 4, 6].forEach((b, k) => taiko(t.names + b * B, 68 - k * 4, 0.7));
    for (let k = 0; k < 8; k++) taiko(t.names + 8 * B + k * (B / 4), 80 + k * 6, 0.16 + k * 0.03);
    riser(t.names + 8 * B, 2 * B, 0.5);
    impact(t.names + 10 * B, 1.0); taiko(t.names + 10 * B, 46, 1.0);
    master.gain.setValueAtTime(0.85, end - 1.2); master.gain.linearRampToValueAtTime(0.0001, end + 0.4);
    return;
  }

  // intro: riser into the logo slam (beat 3), then the pulse starts
  riser(0, 1.2);
  impact(1.2, 0.9); crash(1.2);
  beats(1.2, t.fam, (tt, i) => { kick(tt, 0.9); hat(tt + B / 2, 0.8); bass(tt + B / 2, ROOT[0], B * 0.42, 0.8); if (i >= 3) for (let s = 0; s < 4; s++) hat(tt + s * S, 0.4); });
  riser(t.fam - B * 2, B * 2, 0.6);

  // the four families: groove, a hit on every cut
  groove(t.fam, t.all48, 1);
  for (let k = 0; k < 4; k++) { const tc = t.fam + k * B * 8; crash(tc, 0.8); stab(tc, CHORD[0], B * 0.9, 1.1); }

  // 48 towers: build-up
  beats(t.all48, t.props - B, (tt) => { kick(tt); bass(tt + B / 2, ROOT[3], B * 0.42, 0.9); });
  roll(t.all48, t.props - t.all48 - B * 0.25);
  riser(t.all48, t.props - t.all48, 1.2);
  bassFilter.frequency.setValueAtTime(700, t.all48); bassFilter.frequency.exponentialRampToValueAtTime(2600, t.props - 0.02); bassFilter.frequency.setValueAtTime(900, t.props);

  // drop: tower properties + the three battles
  impact(t.props, 1); crash(t.props, 1.2);
  groove(t.props, t.vsA, 2);
  for (const tc of [t.farm, t.latent, t.sing]) { crash(tc, 1); impact(tc, 0.5); }
  for (const tc of [t.latent, t.sing, t.vsA]) { tom(tc - B, 140, 0.7); tom(tc - B * 0.75, 120, 0.7); tom(tc - B * 0.5, 100, 0.8); tom(tc - B * 0.25, 80, 0.9); }

  // the duel: three name cards, then a heavy half-time groove
  [0, 2, 4].forEach((b, k) => { const tc = t.vsA + b * B; taiko(tc, 62 - k * 6, 1); braam(tc, [41.2, 49.0, 55.0][k], B * 1.9, 0.9); });
  impact(t.vsA + 4 * B, 0.8);
  duel(t.vsOpus, t.think, 0);
  // Opus is thinking: drums drop out, a clock ticks
  beats(t.think, t.cursor, (tt) => { for (let s = 0; s < 2; s++) osc('square', 2400, 2400, tt + s * B / 2, 0.02, master, 0.001, 0.05); });
  drone(t.think, 82.41, t.cursor - t.think + 0.4, 0.8);
  riser(t.cursor - B * 2, B * 2, 0.6);
  duel(t.cursor, t.gg, 2);
  impact(t.cursor + 3 * B, 0.7); stab(t.cursor + 3 * B, CHORD[2], B * 1.5, 1.2); // the click
  stab(t.gg, [196.0, 246.94, 293.66, 392.0], B * 1.9, 1.3); crash(t.gg); // GG: a major stinger

  // the final boss: everything rises to the killing blow
  beats(t.boss, t.boom, (tt, i) => { kick(tt, 1); bass(tt + B / 2, ROOT[0] * Math.pow(2, Math.floor(i / 2) / 12), B * 0.42, 1); hat(tt + B / 2, 1); });
  roll(t.boss + B * 2, t.boom - t.boss - B * 2 - 0.05);
  riser(t.boss, t.boom - t.boss, 1.4);
  pad(t.boss, CHORD[0], t.boom - t.boss, 0.9);

  // the explosion, silence, a victory chord
  impact(t.boom, 1.5); crash(t.boom, 1.5); braam(t.boom, 41.2, 2.2, 1.1);
  stab(t.boom + 2 * B, [164.81, 207.65, 246.94, 329.6], B * 3.5, 1.1, 0.7); choir(t.boom + 2 * B, [164.81, 246.94, 329.6], 2.2, 0.8, 0.05);

  // coda: four names, faster flips, the question
  drone(t.names, 41.2, end - t.names, 0.55);
  choir(t.names, [164.81, 196.0, 246.94], 4.2, 0.42, 1.4);
  [0, 2, 4, 6].forEach((b, k) => { const tc = t.names + b * B; taiko(tc, 68 - k * 4, 0.75); taiko(tc + B, 52, 0.3); braam(tc, [41.2, 49.0, 36.7, 55.0][k], B * 1.8, 0.38); });
  // the spin: taiko sixteenths accelerating into the question
  for (let k = 0; k < 8; k++) taiko(t.names + 8 * B + k * (B / 4), 80 + k * 6, 0.18 + k * 0.035);
  riser(t.names + 8 * B, 2 * B, 0.7);
  const q = t.names + 10 * B;
  impact(q, 1.2); taiko(q, 46, 1.2); braam(q, 41.2, 3.4, 1);
  choir(q, [82.41, 123.47, 164.81, 196.0, 246.94], end - q, 0.42, 1.6);
  [987.8, 783.99, 659.26, 493.88, 587.33, 493.88].forEach((f, k) => bell(q + 0.5 + k * B * 1.5, f, 0.7));
  master.gain.setValueAtTime(0.85, end - 1.2); master.gain.linearRampToValueAtTime(0.0001, end + 0.4);
}

/** A stereo reverb impulse: decaying noise, slightly different per channel. */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}
