import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under a GitHub Pages sub-path (Plan 4).
  base: './',
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
