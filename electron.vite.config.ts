import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    // transformers.js comes in through kokoro-js; keep it (and its native onnxruntime/sharp) out of the bundle.
    plugins: [externalizeDepsPlugin({ include: ['@huggingface/transformers'] })],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), 'neural-voice-worker': resolve('src/main/neural-voice-worker.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } },
  },
});
