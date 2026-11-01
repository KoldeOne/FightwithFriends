import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at any path (e.g. GitHub Pages /FightwithFriends/).
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
