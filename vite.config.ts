import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgr()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    clearMocks: true,
    exclude: ['**/node_modules/**', 'e2e/**'],
    server: {
      deps: {
        inline: ['tone'],
      },
    },
  },
});
