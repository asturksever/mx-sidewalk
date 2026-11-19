import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// www.opensidewalks.org serves the site at /mx/; the deploy build sets BASE=/mx/.
// Two pages: the landing page at / and the map at /map/.
export default defineConfig({
  base: process.env.BASE ?? '/',
  build: {
    rollupOptions: {
      input: {
        landing: resolve(import.meta.dirname, 'index.html'),
        map: resolve(import.meta.dirname, 'map/index.html'),
      },
    },
  },
});
