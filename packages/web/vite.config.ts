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
    proxy: {
      '/api': {
        // target: 'http://10.7.12.26:8080',
        target: 'http://localhost:8878',
        // target: 'https://scsj.jsrxjt.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/record/ws': {
        // target: 'wss://scsj.jsrxjt.com',
        target: 'ws://localost:5454',
        secure: false,
        ws: true,
      },
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
