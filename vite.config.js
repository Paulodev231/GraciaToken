import { defineConfig } from 'vite';

export default defineConfig({
  // Cloudflare Pages serves the build output from the site root.
  base: '/',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 2048,
    target: 'es2020',
  },
});
