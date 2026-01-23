import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import { constants } from 'node:zlib';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    compression({
      threshold: 1024, // >1KB 才压（建议）
      algorithms: [
        defineAlgorithm('gzip', { level: 9 }),
        defineAlgorithm('brotliCompress', {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
          },
        }),
      ],
      // deleteOriginalAssets: false, // 默认就是 false，不建议删源文件
    }),
  ],
  define: {
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  base: '/atoms_viewer/',
  build: {
    outDir: 'atoms_viewer',
  },
});
