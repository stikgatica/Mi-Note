import { defineConfig } from 'vite';
export default defineConfig({
  root: 'stage',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022'
  }
});
