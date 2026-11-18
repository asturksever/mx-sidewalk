import { defineConfig } from 'vite';

// www.opensidewalks.org serves the site at /mx/; the deploy build sets BASE=/mx/.
export default defineConfig({
  base: process.env.BASE ?? '/',
});
