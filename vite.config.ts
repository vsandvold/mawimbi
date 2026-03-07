import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    svgr(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/models': {
        target: 'https://essentia.upf.edu',
        changeOrigin: true,
      },
    },
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  assetsInclude: ['**/*.wasm', '**/*.onnx'],
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
