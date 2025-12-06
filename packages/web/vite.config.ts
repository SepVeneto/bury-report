import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import vueJsx from '@vitejs/plugin-vue-jsx'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/server': {
        target: 'https://scsj.jsrxjt.com',
        changeOrigin: true,
      },
      // '/api/server': {
      //   target: 'http://localhost:8878',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api\/server/, ''),
      // },
      // '/api/report': {
      //   target: 'http://localhost:8870',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api\/report/, ''),
      // },
      // '/api/record/ws': {
      //   // target: 'wss://scsj.jsrxjt.com',
      //   target: 'ws://localost:5454',
      //   secure: false,
      //   ws: true,
      // },
    },
  },
  plugins: [vue({
    template: {
      compilerOptions: {
        isCustomElement: tag => /^micro-app/.test(tag),
      },
    },
  }), vueJsx()],
})
