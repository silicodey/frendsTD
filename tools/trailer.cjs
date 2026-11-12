#!/usr/bin/env node
// Captures the in-engine trailer to an MP4.
//
//   npm run dev                      (in another terminal)
//   node tools/trailer.cjs           → trailer-out/frendsTD-trailer.mp4  (1080×1920, 30 fps)
//
// Options: --w 540 --h 960 --dsf 2 --fps 30 --out trailer-out --url http://localhost:5173/
//          --from <shot name>   start at a shot (for drafts)     --secs <n>   stop after n seconds
//          --every <n>          keep every n-th frame (drafts)   --noencode   frames only
//
// The film runs on a virtual clock, so capture speed does not matter: every frame is rendered
// by the real game engine, screenshotted, and the soundtrack is rendered offline to match.
const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? (process.argv[i + 1] ?? true) : def; };
const flag = (name) => process.argv.includes('--' + name);
const W = +arg('w', 540), H = +arg('h', 960), DSF = +arg('dsf', 2), FPS = +arg('fps', 30), EVERY = +arg('every', 1);
const OUT = path.resolve(arg('out', 'trailer-out'));
const URL_ = arg('url', 'http://localhost:5173/');
const FROM = arg('from', ''), SECS = +arg('secs', 1e9);
// --stills 1.5,7,12.2  → render only these moments (seconds), skipping the draw for every other frame
const STILLS = arg('stills', '') ? String(arg('stills', '')).split(',').map((x) => Math.round(+x * FPS)) : null;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^f_\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e.stack || e).slice(0, 800)));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 300)); });
  await page.goto(`${URL_}?trailer=capture${FROM ? '&from=' + FROM : ''}`);
  await page.waitForTimeout(2500); // let a dev-server reload settle
  await page.waitForFunction(() => window.__trailer && window.__trailer.isReady(), null, { timeout: 120000 });
  const duration = await page.evaluate(() => window.__trailer.duration);
  console.log(`trailer: ${duration.toFixed(1)}s total, capturing ${W * DSF}x${H * DSF} @ ${FPS} fps${FROM ? ' from ' + FROM : ''}`);

  const t0 = Date.now();
  let frame = 0, kept = 0;
  for (;;) {
    const want = STILLS ? STILLS.includes(frame) : true;
    const done = await page.evaluate(([dt, r]) => window.__trailer.advance(dt, r), [1 / FPS, want]);
    if (done) break;
    if (STILLS && frame > Math.max(...STILLS)) break;
    if (STILLS ? want : frame % EVERY === 0) {
      await page.screenshot({ path: path.join(OUT, `f_${String(kept).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93, timeout: 120000 });
      kept++;
    }
    frame++;
    if (frame % 150 === 0) console.log(`  ${(frame / FPS).toFixed(0)}s filmed, ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed`);
    if (frame / FPS >= SECS) break;
  }
  console.log(`${frame} frames filmed, ${kept} kept`);

  let wav = '';
  if (!flag('noencode') && EVERY === 1 && !STILLS) {
    const b64 = await page.evaluate(() => window.__trailer.renderAudio());
    wav = path.join(OUT, 'soundtrack.wav');
    fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
    console.log('soundtrack rendered');
  }
  await browser.close();

  if (flag('noencode') || EVERY !== 1 || STILLS) return;
  const mp4 = path.join(OUT, 'frendsTD-trailer.mp4');
  const args = ['-y', '-framerate', String(FPS), '-i', path.join(OUT, 'f_%05d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', mp4];
  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) { console.error(String(r.stderr).slice(-1500)); process.exit(1); }
  console.log('wrote', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' MB');
})().catch((e) => { console.error(e); process.exit(1); });
