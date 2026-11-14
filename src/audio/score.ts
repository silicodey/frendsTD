/**
 * Cinematic soundtrack.
 *
 * Each track is composed in code for a small orchestra (strings, low brass, choir, war drums, string
 * ostinato, braams, risers, a convolution hall) and rendered ONCE, in the background, with an
 * OfflineAudioContext into a seamless loop with two stems:
 *   - base:   strings, choir, bass, atmosphere (always playing)
 *   - action: drums, ostinato, brass (faded in with combat intensity)
 * Playback is then two looping buffers and two gain nodes: almost no CPU while you play, which matters
 * on phones (live synthesis kept the audio thread busy all the time).
 */

export interface TrackInfo { id: string; name: string; mood: string }

const SR = 32000;
const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note → Hz

interface Ctx {
  ctx: OfflineAudioContext;
  base: AudioNode; action: AudioNode;
  noise: AudioBuffer;
  spb: number; // seconds per beat
}

// ---------------------------------------------------------------- instruments
function envGain(c: Ctx, dest: AudioNode, t: number, a: number, hold: number, r: number, peak: number) {
  const g = c.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.linearRampToValueAtTime(0, t + a + hold + r);
  g.connect(dest);
  return g;
}

function pan(c: Ctx, dest: AudioNode, p: number) {
  const n = c.ctx.createStereoPanner();
  n.pan.value = p;
  n.connect(dest);
  return n;
}

/** Bowed string section: detuned saws, soft lowpass, slow swell, gentle vibrato. */
function strings(c: Ctx, dest: AudioNode, t: number, dur: number, notes: number[], vol: number, bright = 1600) {
  const { ctx } = c;
  notes.forEach((n, k) => {
    const out = envGain(c, pan(c, dest, ((k % 3) - 1) * 0.45), t, 0.55, Math.max(0, dur - 0.55), 0.9, vol / notes.length);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bright; lp.Q.value = 0.4; lp.connect(out);
    const vib = ctx.createOscillator(); vib.frequency.value = 5 + k * 0.3;
    const vibG = ctx.createGain(); vibG.gain.value = 3.5; vib.connect(vibG);
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
      vibG.connect(o.detune); o.connect(lp); o.start(t); o.stop(t + dur + 1);
    }
    vib.start(t); vib.stop(t + dur + 1);
  });
}

/** Low brass swell: the filter opens as the note grows, like horns pushing. */
function brass(c: Ctx, dest: AudioNode, t: number, dur: number, n: number, vol: number) {
  const { ctx } = c;
  const out = envGain(c, dest, t, 0.18, Math.max(0, dur - 0.18), 0.5, vol);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(1900, t + Math.min(0.6, dur * 0.5)); lp.frequency.linearRampToValueAtTime(1100, t + dur);
  lp.connect(out);
  for (const [mul, type, det] of [[1, 'sawtooth', -6], [1, 'sawtooth', 6], [0.5, 'square', 0]] as const) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = NOTE(n) * mul; o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.6);
  }
}

/** Choir "aah": saws through vowel formants. */
function choir(c: Ctx, dest: AudioNode, t: number, dur: number, notes: number[], vol: number) {
  const { ctx } = c;
  const out = envGain(c, dest, t, 0.9, Math.max(0, dur - 0.9), 1.2, vol);
  const formants = [[730, 8, 1], [1090, 9, 0.5], [2440, 12, 0.25]];
  const sum = ctx.createGain(); sum.gain.value = 1;
  for (const [f, q, g] of formants) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const gg = ctx.createGain(); gg.gain.value = g * 3; bp.connect(gg); gg.connect(out); sum.connect(bp);
  }
  notes.forEach((n) => {
    for (const det of [-12, 0, 11]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
      o.connect(sum); o.start(t); o.stop(t + dur + 1.3);
    }
  });
}

/** Spiccato string ostinato note. */
function spiccato(c: Ctx, dest: AudioNode, t: number, n: number, vol: number, len = 0.16) {
  const { ctx } = c;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
  lp.connect(g); g.connect(dest);
  for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + len + 0.02);
  }
}

/** Sustained bass: a dark saw under everything. */
function bass(c: Ctx, dest: AudioNode, t: number, dur: number, n: number, vol: number) {
  const { ctx } = c;
  const out = envGain(c, dest, t, 0.08, Math.max(0, dur - 0.08), 0.4, vol);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(out);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.connect(lp); o.start(t); o.stop(t + dur + 0.5);
  const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = NOTE(n) / 2; s.connect(out); s.start(t); s.stop(t + dur + 0.5);
}

/** War drum / taiko: pitched body plus a skin slap. */
function taiko(c: Ctx, dest: AudioNode, t: number, vol: number, pitch = 1) {
  const { ctx } = c;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(110 * pitch, t); o.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.35);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.85);
  const n = ctx.createBufferSource(); n.buffer = c.noise;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(vol * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  n.connect(lp); lp.connect(ng); ng.connect(dest); n.start(t, Math.random()); n.stop(t + 0.25);
}

/** Orchestral snare / metal hit: bright noise crack. */
function snare(c: Ctx, dest: AudioNode, t: number, vol: number, freq = 1900, len = 0.18) {
  const { ctx } = c;
  const n = ctx.createBufferSource(); n.buffer = c.noise;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  n.connect(bp); bp.connect(g); g.connect(dest); n.start(t, Math.random()); n.stop(t + len + 0.02);
}

/** Braam: the low, tearing brass cluster of film trailers. */
function braam(c: Ctx, dest: AudioNode, t: number, dur: number, root: number, vol: number) {
  const { ctx } = c;
  const out = envGain(c, dest, t, 0.05, dur * 0.5, dur * 0.5, vol);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(120, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.35); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
  lp.connect(out);
  for (const [iv, det] of [[0, -10], [0, 10], [7, 0], [12, -5], [-12, 0]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(root + iv); o.detune.value = det;
    o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
  }
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(58, t); sub.frequency.exponentialRampToValueAtTime(34, t + dur);
  const sg = ctx.createGain(); sg.gain.setValueAtTime(vol * 1.6, t); sg.gain.exponentialRampToValueAtTime(0.001, t + dur);
  sub.connect(sg); sg.connect(dest); sub.start(t); sub.stop(t + dur + 0.1);
}

/** Rising noise swell into a downbeat. */
function riser(c: Ctx, dest: AudioNode, t: number, dur: number, vol: number) {
  const { ctx } = c;
  const n = ctx.createBufferSource(); n.buffer = c.noise; n.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.Q.value = 1.4;
  hp.frequency.setValueAtTime(300, t); hp.frequency.exponentialRampToValueAtTime(5000, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
  n.connect(hp); hp.connect(g); g.connect(dest); n.start(t); n.stop(t + dur + 0.1);
}

/** Muted mallet / clock tick (thriller tension). */
function tick(c: Ctx, dest: AudioNode, t: number, n: number, vol: number) {
  const { ctx } = c;
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(n);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.14);
}

/** Heartbeat sub pulse. */
function thump(c: Ctx, dest: AudioNode, t: number, vol: number) {
  const { ctx } = c;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
}

// ---------------------------------------------------------------- compositions
interface Track extends TrackInfo { bpm: number; bars: number; compose(c: Ctx): void }

/** Chord (MIDI notes) for a bar from a 2-bars-per-chord progression. */
const chordAt = (prog: number[][], bar: number) => prog[Math.floor(bar / 2) % prog.length];

const TRACKS: Track[] = [
  {
    id: 'siege', name: 'Siege', mood: 'Epic · war drums and strings', bpm: 112, bars: 16,
    compose(c) {
      const b = c.spb * 4;
      // Dm  Bb  F  C  Dm  Bb  Gm  A
      const prog = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
      for (let bar = 0; bar < 16; bar += 2) {
        const t = bar * b, ch = chordAt(prog, bar);
        strings(c, c.base, t, b * 2, [...ch, ch[0] + 12], 0.22);
        bass(c, c.base, t, b * 2, ch[0] - 12, 0.16);
        if (bar >= 8) choir(c, c.base, t, b * 2, [ch[0] + 12, ch[2] + 12], 0.06);
        if (bar >= 8) brass(c, c.action, t, b * 1.8, ch[0], 0.13);
      }
      braam(c, c.base, 0, 3.2, 38, 0.11);
      braam(c, c.base, 8 * b, 3.2, 38, 0.11);
      for (let bar = 0; bar < 16; bar++) {
        const t = bar * b, ch = chordAt(prog, bar);
        // taiko groove, busier in the second half
        const hits = bar >= 8 ? [0, 0.75, 1.5, 2, 2.75, 3, 3.5] : [0, 1.5, 2, 3];
        hits.forEach((h, k) => taiko(c, c.action, t + h * c.spb, k === 0 ? 0.55 : 0.32, k % 3 === 2 ? 1.3 : 1));
        if (bar >= 4) [1, 3].forEach((h) => snare(c, c.action, t + h * c.spb, 0.12));
        // spiccato ostinato in 16ths: root, fifth, octave, fifth
        const pat = [0, 7, 12, 7, 0, 7, 12, 14, 0, 7, 12, 7, 0, 7, 15, 12];
        pat.forEach((iv, k) => spiccato(c, c.action, t + k * c.spb / 4, ch[0] + iv, k % 4 === 0 ? 0.09 : 0.06));
      }
      riser(c, c.action, 6 * b, 2 * b, 0.12);
      riser(c, c.action, 14 * b, 2 * b, 0.14);
    },
  },
  {
    id: 'shadow', name: 'Shadow Protocol', mood: 'Thriller · ticking tension', bpm: 100, bars: 16,
    compose(c) {
      const b = c.spb * 4;
      // Cm Cm Ab Ab Fm Fm G G  (each 2 bars → 16 bars)
      const prog = [[48, 51, 55], [48, 51, 55], [44, 48, 51], [44, 48, 51], [41, 44, 48], [41, 44, 48], [43, 47, 50], [43, 47, 50]];
      for (let bar = 0; bar < 16; bar += 2) {
        const t = bar * b, ch = chordAt(prog, bar);
        bass(c, c.base, t, b * 2, ch[0] - 12, 0.18);
        strings(c, c.base, t, b * 2, [ch[0] + 12, ch[1] + 12, ch[2] + 12], 0.12, 1100);
        // high tension: a semitone rub in the upper strings
        strings(c, c.base, t + b, b, [ch[2] + 24, ch[2] + 25], 0.035, 2400);
      }
      braam(c, c.base, 0, 4, 36, 0.12);
      braam(c, c.base, 8 * b, 4, 32, 0.12);
      for (let bar = 0; bar < 16; bar++) {
        const t = bar * b, ch = chordAt(prog, bar);
        for (let k = 0; k < 8; k++) tick(c, c.base, t + k * c.spb / 2, k % 2 ? 96 : 91, k % 4 === 0 ? 0.05 : 0.025);
        thump(c, c.base, t, 0.32); thump(c, c.base, t + c.spb * 0.45, 0.2);
        // pulsing ostinato: root–root–octave–minor third…
        const pat = [0, 0, 12, 0, 3, 0, 7, 0, 0, 0, 12, 0, 3, 7, 10, 12];
        pat.forEach((iv, k) => spiccato(c, c.action, t + k * c.spb / 4, ch[0] + iv, k % 4 === 0 ? 0.085 : 0.05, 0.12));
        [0, 1.75, 2.5].forEach((h) => taiko(c, c.action, t + h * c.spb, h === 0 ? 0.5 : 0.3, 0.9));
        [1.5, 3.5].forEach((h) => snare(c, c.action, t + h * c.spb, 0.07, 4200, 0.12));
        if (bar % 4 === 3) brass(c, c.action, t + 2 * c.spb, c.spb * 2, ch[0], 0.12);
      }
      riser(c, c.action, 6 * b, 2 * b, 0.12);
      riser(c, c.action, 15 * b, b, 0.16);
    },
  },
  {
    id: 'ascension', name: 'Ascension', mood: 'Heroic · choir and brass', bpm: 84, bars: 16,
    compose(c) {
      const b = c.spb * 4;
      // Em C G D Em C Am B
      const prog = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57], [52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 51, 54]];
      const melody = [64, 67, 71, 69, 67, 66, 64, 62, 64, 67, 72, 71, 69, 67, 66, 63];
      for (let bar = 0; bar < 16; bar += 2) {
        const t = bar * b, ch = chordAt(prog, bar);
        strings(c, c.base, t, b * 2, [...ch, ch[0] + 12], 0.2, 1900);
        choir(c, c.base, t, b * 2, [ch[0] + 12, ch[1] + 12, ch[2] + 12], 0.07);
        bass(c, c.base, t, b * 2, ch[0] - 12, 0.15);
      }
      for (let bar = 0; bar < 16; bar++) {
        const t = bar * b, ch = chordAt(prog, bar);
        // heroic brass line, one note a bar
        brass(c, c.action, t, b * 0.95, melody[bar] - 12, 0.12);
        // gentle arpeggio keeps it moving
        for (let k = 0; k < 8; k++) tick(c, c.base, t + k * c.spb / 2, ch[k % 3] + 24, 0.03);
        // half-time war drums with a pickup
        taiko(c, c.action, t, 0.6, 0.85);
        taiko(c, c.action, t + 2 * c.spb, 0.45, 0.85);
        if (bar % 2 === 1) [3, 3.5, 3.75].forEach((h) => taiko(c, c.action, t + h * c.spb, 0.28, 1.2));
        snare(c, c.action, t + 2 * c.spb, 0.08);
      }
      braam(c, c.base, 0, 3, 40, 0.09);
      riser(c, c.action, 7 * b, b, 0.12);
      riser(c, c.action, 15 * b, b, 0.14);
    },
  },
];

export const SOUNDTRACKS: TrackInfo[] = TRACKS.map(({ id, name, mood }) => ({ id, name, mood }));

/** A stereo hall impulse response: decaying noise with a little pre-delay. */
function hall(ctx: BaseAudioContext, secs: number, decay: number) {
  const len = Math.floor(secs * ctx.sampleRate);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      d[i] = t < 0.015 ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - t / secs, decay) * 0.5;
    }
  }
  return ir;
}

/** Render a track to two looping stems. */
async function render(track: Track): Promise<{ base: AudioBuffer; action: AudioBuffer }> {
  const spb = 60 / track.bpm;
  const loop = track.bars * 4 * spb;
  const tail = 3.5;
  const len = Math.ceil((loop + tail) * SR);
  const ctx = new OfflineAudioContext(4, len, SR);
  const merger = ctx.createChannelMerger(4);
  merger.connect(ctx.destination);
  const stem = (ch0: number, wet: number) => {
    const input = ctx.createGain();
    const out = ctx.createChannelSplitter(2);
    const sum = ctx.createGain(); sum.gain.value = 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    const dry = ctx.createGain(); dry.gain.value = 0.85;
    const conv = ctx.createConvolver(); conv.buffer = hall(ctx, 2.8, 2.4);
    const wg = ctx.createGain(); wg.gain.value = wet;
    input.connect(dry); dry.connect(sum);
    input.connect(conv); conv.connect(wg); wg.connect(sum);
    sum.connect(comp); comp.connect(out);
    out.connect(merger, 0, ch0); out.connect(merger, 1, ch0 + 1);
    return input;
  };
  const noise = ctx.createBuffer(1, SR * 2, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const c: Ctx = { ctx, base: stem(0, 0.42), action: stem(2, 0.28), noise, spb };
  track.compose(c);
  const out = await ctx.startRendering();
  // fold the reverb tail onto the start so the loop is seamless
  const loopLen = Math.floor(loop * SR);
  const mk = (ch0: number) => {
    const buf = new AudioBuffer({ numberOfChannels: 2, length: loopLen, sampleRate: SR });
    for (let k = 0; k < 2; k++) {
      const src = out.getChannelData(ch0 + k), dst = buf.getChannelData(k);
      dst.set(src.subarray(0, loopLen));
      for (let i = loopLen; i < src.length; i++) dst[i - loopLen] += src[i];
    }
    return buf;
  };
  return { base: mk(0), action: mk(2) };
}

/** Plays the rendered tracks: one looping pair of stems at a time, crossfaded on change. */
export class ScorePlayer {
  private cache = new Map<number, Promise<{ base: AudioBuffer; action: AudioBuffer }>>();
  private playing: { i: number; base: AudioBufferSourceNode; action: AudioBufferSourceNode; bg: GainNode; ag: GainNode } | null = null;
  private want = 0;
  private intensity = 0;

  constructor(private ctx: AudioContext, private bus: AudioNode) {}

  private get(i: number) {
    let p = this.cache.get(i);
    if (!p) { p = render(TRACKS[i]); this.cache.set(i, p); }
    return p;
  }

  async play(i: number) {
    i = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    this.want = i;
    if (this.playing?.i === i) return;
    let stems;
    try { stems = await this.get(i); } catch { return; }
    if (this.want !== i || this.playing?.i === i) return;
    const now = this.ctx.currentTime;
    // fade the old one out
    if (this.playing) {
      const old = this.playing;
      old.bg.gain.setTargetAtTime(0, now, 0.5); old.ag.gain.setTargetAtTime(0, now, 0.5);
      setTimeout(() => { try { old.base.stop(); old.action.stop(); } catch { /* */ } old.bg.disconnect(); old.ag.disconnect(); }, 3000);
    }
    const mk = (buf: AudioBuffer, g: GainNode) => { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(g); return s; };
    const bg = this.ctx.createGain(), ag = this.ctx.createGain();
    bg.gain.value = 0; ag.gain.value = 0;
    bg.connect(this.bus); ag.connect(this.bus);
    const base = mk(stems.base, bg), action = mk(stems.action, ag);
    const t = now + 0.05;
    base.start(t); action.start(t);
    this.playing = { i, base, action, bg, ag };
    this.apply(1.2);
    // keep memory low on phones: only the playing track stays rendered
    for (const k of [...this.cache.keys()]) if (k !== i) this.cache.delete(k);
  }

  /** 0 = menus / calm, 1 = boss fight. */
  setIntensity(I: number) {
    if (Math.abs(I - this.intensity) < 0.02) return;
    this.intensity = I;
    this.apply(0.8);
  }

  private apply(tc: number) {
    const p = this.playing;
    if (!p) return;
    const now = this.ctx.currentTime, I = this.intensity;
    p.bg.gain.setTargetAtTime(0.95 - I * 0.2, now, tc);
    p.ag.gain.setTargetAtTime(0.18 + I * 0.82, now, tc);
  }

  stop() {
    const p = this.playing;
    this.playing = null;
    if (!p) return;
    try { p.base.stop(); p.action.stop(); } catch { /* */ }
  }
}
