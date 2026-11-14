import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build: the whole game (code, styles, shaders) ships as one index.html,
// so it can be hosted anywhere or dropped on a phone.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 100000000 },
  // `npm run dev` + `npm run server`: online duels reach the local server through the dev server
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
