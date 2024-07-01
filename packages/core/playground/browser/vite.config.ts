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
      url: 'http://127.0.0.1:7777/record',
      appid: '665fc9a76cc4322eb853df36',
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
