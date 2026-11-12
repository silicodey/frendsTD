import './style.css';
import { LEVELS, THEMES } from './data/levels';
import { TOWERS } from './data/towers';
import { Engine } from './render/engine';
import { GameView } from './render/view';
import { Bot } from './sim/bot';
import { Thumbs } from './render/thumbs';
import { ENEMIES } from './data/enemies';
import { Sim } from './sim/sim';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const engine = new Engine(canvas);
const view = new GameView(engine, document.getElementById('fx-text'));
const q = new URLSearchParams(location.search);
const level = LEVELS[Number(q.get('level') ?? 1) - 1];
const sim = new Sim(level);
sim.demo = true; sim.tokens = Number(q.get('tokens') ?? 3000); sim.autoDelay = 2;
const tiers = (q.get('tiers') ?? '1,3,5,7,9,11').split(',').map(Number);
const bot = new Bot(sim, TOWERS.filter((t) => tiers.includes(t.tier) && t.kind !== 'income').map((t) => t.id));
view.load(sim, THEMES[level.world]);
function resize() { engine.resize(window.innerWidth, window.innerHeight); engine.setBounds(sim.cols, sim.rows, 70, 150); }
window.addEventListener('resize', resize); resize();
let last = performance.now();
const speed = Number(q.get('speed') ?? 1);
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (let i = 0; i < speed; i++) { bot.update(dt); sim.step(dt); }
  view.update(dt, dt * speed);
  engine.render(dt);
  if (!q.get('gallery')) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as any).__td = { engine, view, sim, bot };
if (q.get('gallery')) {
  const th = new Thumbs(engine);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#05070d;display:grid;grid-template-columns:repeat(' + (q.get('cols') ?? 6) + ',1fr);gap:6px;padding:6px;z-index:9';
  const list = q.get('gallery') === 'enemies' ? ENEMIES.map((e) => [th.enemy(e.id, 256), e.name]) : TOWERS.filter((t) => q.get('gallery') === 'all' || t.family === q.get('gallery')).map((t) => [th.tower(t, 320), t.tier + ' ' + t.name]);
  for (const [url, name] of list) { const c = document.createElement('div'); c.innerHTML = `<img src="${url}" style="width:100%;border-radius:10px;display:block"><div style="color:#fff;font:12px system-ui;text-align:center">${name}</div>`; div.appendChild(c); }
  document.body.appendChild(div);
}
