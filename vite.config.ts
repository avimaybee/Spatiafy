import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  // Transformers.js uses web workers and WASM
  optimizeDeps: {
    exclude: ['@huggingface/transformers']
  },
  build: {
    target: 'esnext', // Required for top-level await in Transformers.js
  }
});
