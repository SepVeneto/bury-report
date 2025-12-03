import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import Inspect from 'vite-plugin-inspect'
import Unplugin from '@sepveneto/report-core/vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7777',
        rewrite: (str) => str.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    Inspect(),
    Unplugin({
      url: 'http://127.0.0.1:5500/record',
      appid: '691022da9e50b4b5c2317af3',
      entry: 'main.ts',
      collect: true,
      report: true,
      interval: 5,
      network: {
        enable: true,
      },
    }) as Plugin,
  ],
})
