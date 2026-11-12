// Repackages the single-file build (dist/index.html) as a body-only page for hosts that
// supply their own <html>/<head> wrapper: title, font link, styles, markup, then the script.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const styles = [...html.slice(0, html.indexOf('<body>')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').trim();
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)?.[0] ?? '';
if (!styles || !scripts.length || !body.includes('id="app"')) throw new Error('unexpected build output');

const out = `<title>frendsTD</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>${styles}</style>
${body}
${scripts.map((s) => `<script type="module">${s}</script>`).join('\n')}
`;
writeFileSync('dist/frendsTD.html', out);
console.log(`dist/frendsTD.html ${(out.length / 1024).toFixed(0)} KB`);
