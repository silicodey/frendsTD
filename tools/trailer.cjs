#!/usr/bin/env node
// Captures the in-engine trailer to an MP4.
//
//   npm run dev                      (in another terminal)
//   node tools/trailer.cjs           → trailer-out/frendsTD-trailer.mp4  (1080×1920, 30 fps)
//
// The film runs on a virtual clock, so capture speed does not matter: every frame is rendered by
// the real game engine and screenshotted, and the soundtrack is rendered offline to match.
// Scenes are captured as independent chunks (in parallel, resumable): re-running the command
// only films what is missing, then assembles everything with ffmpeg.
//
// Options: --w 540 --h 960 --dsf 2 --fps 30 --out trailer-out --url http://localhost:5173/ --jobs 2
// Drafts:  --stills 1.5,7,12.2 [--from <shot>]   render only these moments (seconds from the start point)
//          --every 6 [--from <shot>] [--secs n]  keep every n-th frame, no encode
const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? (process.argv[i + 1] ?? true) : def; };
const W = +arg('w', 540), H = +arg('h', 960), DSF = +arg('dsf', 2), FPS = +arg('fps', 30), EVERY = +arg('every', 1), JOBS = +arg('jobs', 2);
const OUT = path.resolve(arg('out', 'trailer-out'));
const URL_ = arg('url', 'http://localhost:5173/');
const FROM = arg('from', ''), SECS = +arg('secs', 1e9);
const STILLS = arg('stills', '') ? String(arg('stills', '')).split(',').map((x) => Math.round(+x * FPS)) : null;
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// Licensed score (Coverr free stock music: free for videos and games, attribution appreciated but not
// required). The tracks are downloaded at render time into trailer-out/music and never committed.
// Analysed with librosa: "When All Hope Is Gone" is 144.00 BPM, so atempo 1.04164 puts its beats
// on the trailer's 150 BPM cut grid; trim starts it on a beat. "Disturbing Night" swells at 30.0 s,
// which is placed on the closing question.
const MUSIC = {
  action: { slug: 'coverr-when-all-hope-is-gone-7Pu0cn', title: 'When All Hope Is Gone', trim: 1.3244, tempo: 1.04164, gain: 0.7 },
  ending: { slug: '23-disturbing-night-99YEKG', title: 'Disturbing Night', swell: 30.0, gain: 1.5 },
};
async function musicFile(m) {
  const dir = path.join(OUT, 'music');
  fs.mkdirSync(dir, { recursive: true });
  for (const ext of ['wav', 'mp3']) { const f = path.join(dir, `${m.slug}.${ext}`); if (fs.existsSync(f) && fs.statSync(f).size > 100000) return f; }
  try {
    const r = await fetch(`https://cdn.coverr.co/audios/${m.slug}/preview.mp3`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const f = path.join(dir, `${m.slug}.mp3`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    console.log(`downloaded "${m.title}" from coverr.co`);
    return f;
  } catch (e) { console.log(`could not fetch "${m.title}" (${e.message}); using the synthesized score`); return null; }
}

/** Mix the licensed tracks under the rendered sound design + gameplay effects. */
function mixScore(designWav, actionFile, endingFile, marks, total, out) {
  const A = MUSIC.action, E = MUSIC.ending;
  const boom = marks['final-boom'], names = marks.names, think = marks['vs-think'], cursor = marks['vs-cursor'];
  const q = names + 4.0; // the question appears 10 beats into the closing shot
  const tail = total - names;
  const graph = [
    `[1:a]atrim=start=${A.trim},asetpts=PTS-STARTPTS,atempo=${A.tempo},atrim=end=${(boom + 0.15).toFixed(3)},afade=t=in:st=0:d=0.03,` +
      `volume='if(between(t,${think.toFixed(2)},${cursor.toFixed(2)}),0.22,1)':eval=frame,afade=t=out:st=${boom.toFixed(3)}:d=0.12,volume=${A.gain}[a]`,
    `[2:a]atrim=start=${(E.swell - (q - names)).toFixed(3)},asetpts=PTS-STARTPTS,atrim=end=${(tail + 0.4).toFixed(3)},afade=t=in:st=0:d=0.5,` +
      `afade=t=out:st=${(tail - 1.2).toFixed(3)}:d=1.2,volume=${E.gain},adelay=${Math.round(names * 1000)}:all=1[b]`,
    `[0:a]volume=0.85[c]`,
    `[c][a][b]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.89:level=false[out]`,
  ].join(';');
  const r = spawnSync('ffmpeg', ['-y', '-i', designWav, '-i', actionFile, '-i', endingFile, '-filter_complex', graph, '-map', '[out]', '-ar', '44100', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(String(r.stderr).slice(-1500)); process.exit(1); }
}

async function open(from) {
  const browser = await chromium.launch({ args: GL });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e.stack || e).slice(0, 800)));
  await page.goto(`${URL_}?trailer=capture${from ? '&from=' + from : ''}`);
  await page.waitForTimeout(2500); // let a dev-server reload settle
  await page.waitForFunction(() => window.__trailer && window.__trailer.isReady(), null, { timeout: 180000 });
  return { browser, page };
}
const shoot = (page, file) => page.screenshot({ path: file, type: 'jpeg', quality: 93, timeout: 180000 });

/** Draft modes: one pass, optional frame skipping. */
async function draft() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^f_\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const { browser, page } = await open(FROM);
  let frame = 0, kept = 0;
  for (;;) {
    const want = STILLS ? STILLS.includes(frame) : frame % EVERY === 0;
    const done = await page.evaluate(([dt, r]) => window.__trailer.advance(dt, r), [1 / FPS, want]);
    if (done || (STILLS && frame > Math.max(...STILLS))) break;
    if (want) await shoot(page, path.join(OUT, `f_${String(kept++).padStart(5, '0')}.jpg`));
    frame++;
    if (frame / FPS >= SECS) break;
  }
  console.log(`${frame} frames filmed, ${kept} kept`);
  await browser.close();
}

async function film() {
  fs.mkdirSync(path.join(OUT, 'chunks'), { recursive: true });
  // 1. ask the game for its shot list and group shots that share scene state
  const probe = await open('');
  const shots = await probe.page.evaluate(() => window.__trailer.shotList());
  await probe.browser.close();
  const chunks = [];
  for (const s of shots) {
    if (s.chain && chunks.length) { const c = chunks[chunks.length - 1]; c.dur += s.dur; c.names.push(s.name); }
    else chunks.push({ i: chunks.length, from: s.name, names: [s.name], dur: s.dur });
  }
  for (const c of chunks) { c.frames = Math.round(c.dur * FPS); c.dir = path.join(OUT, 'chunks', `${String(c.i).padStart(2, '0')}-${c.from}`); }
  const total = chunks.reduce((a, c) => a + c.frames, 0);
  console.log(`trailer: ${shots.length} shots in ${chunks.length} chunks, ${total} frames (${(total / FPS).toFixed(1)}s) at ${W * DSF}x${H * DSF}`);

  // 2. film the missing chunks
  let todo = chunks.filter((c) => {
    try { const d = JSON.parse(fs.readFileSync(path.join(c.dir, 'done.json'), 'utf8')); return !(d.frames === c.frames && d.w === W * DSF && d.h === H * DSF); } catch { return true; }
  });
  const audioOnly = process.argv.includes('--audio-only'); // re-render just the soundtrack
  if (audioOnly) todo = [];
  console.log(`${chunks.length - todo.length} chunks already filmed, ${todo.length} to go`);
  const t0 = Date.now();
  let filmed = 0;
  const worker = async () => {
    for (;;) {
      const c = todo.shift();
      if (!c) return;
      fs.rmSync(c.dir, { recursive: true, force: true });
      fs.mkdirSync(c.dir, { recursive: true });
      const { browser, page } = await open(c.i === 0 ? '' : c.from);
      for (let f = 0; f < c.frames; f++) {
        await page.evaluate((dt) => window.__trailer.advance(dt, true), 1 / FPS);
        await shoot(page, path.join(c.dir, `f_${String(f).padStart(5, '0')}.jpg`));
        filmed++;
      }
      const cues = await page.evaluate(() => window.__trailer.cues);
      await browser.close();
      fs.writeFileSync(path.join(c.dir, 'cues.json'), JSON.stringify(cues));
      fs.writeFileSync(path.join(c.dir, 'done.json'), JSON.stringify({ frames: c.frames, w: W * DSF, h: H * DSF }));
      console.log(`  filmed ${c.names.join('+')} (${c.frames} frames) — ${filmed} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, worker));

  // 3. soundtrack: gameplay sounds from every chunk's cues + sound design, then the licensed score
  const cues = chunks.flatMap((c) => { try { return JSON.parse(fs.readFileSync(path.join(c.dir, 'cues.json'), 'utf8')); } catch { return []; } });
  const actionFile = await musicFile(MUSIC.action), endingFile = actionFile && await musicFile(MUSIC.ending);
  const licensed = !!(actionFile && endingFile);
  const au = await open('');
  const b64 = await au.page.evaluate(([cs, synth]) => window.__trailer.renderAudio(cs, synth), [cues, !licensed]);
  await au.browser.close();
  let wav = path.join(OUT, 'soundtrack.wav');
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  if (licensed) {
    const marks = {}; let acc = 0;
    for (const sh of shots) { marks[sh.name] = acc; acc += sh.dur; }
    const mixed = path.join(OUT, 'soundtrack-mix.wav');
    mixScore(wav, actionFile, endingFile, marks, acc, mixed);
    wav = mixed;
    console.log(`soundtrack: "${MUSIC.action.title}" + "${MUSIC.ending.title}" (coverr.co) over ${cues.length} gameplay cues`);
  } else console.log(`soundtrack rendered with the synthesized score (${cues.length} cues)`);

  if (audioOnly) { console.log('wrote', wav); return; }

  // 4. assemble
  const list = path.join(OUT, 'frames.txt');
  fs.writeFileSync(list, chunks.flatMap((c) => Array.from({ length: c.frames }, (_, f) => `file '${path.join(c.dir, `f_${String(f).padStart(5, '0')}.jpg`)}'\nduration ${1 / FPS}`)).join('\n') + '\n');
  const mp4 = path.join(OUT, 'frendsTD-trailer.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav, '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', mp4], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(String(r.stderr).slice(-1500)); process.exit(1); }
  console.log('wrote', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' MB');
}

(STILLS || EVERY > 1 || FROM ? draft() : film()).catch((e) => { console.error(e); process.exit(1); });
