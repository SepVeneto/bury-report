import { defineConfig } from '@rsbuild/core'
import { pluginVue } from '@rsbuild/plugin-vue'
import { resolve } from 'path'
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx'
import { pluginSass } from '@rsbuild/plugin-sass'

// https://vitejs.dev/config/
export default defineConfig({
  html: {
    template: './index.html',
  },
  source: {
    entry: {
      index: './src/main.ts',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 8800,
    proxy: {
      '/api/server': {
        target: 'http://localhost:8878',
        changeOrigin: true,
        pathRewrite: (path) => path.replace(/^\/api\/server/, ''),
      },
      // '/api/report': {
      //   target: 'http://localhost:8870',
      //   changeOrigin: true,
      //   rewrite: (path) => path.replace(/^\/api\/report/, ''),
      // },
      // '/api/record/ws': {
      //   target: 'ws://localost:5454',
      //   secure: false,
      //   ws: true,
      // },
    },
  },
  plugins: [
    pluginSass(),
    pluginVue({
      vueLoaderOptions: {
        compilerOptions: {
          isCustomElement: tag => /^micro-app/.test(tag),
        },
      },
    }),
    pluginVueJsx(),
  ],
})
