import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import Inspect from 'vite-plugin-inspect'
import Unplugin from '@sepveneto/report-core/vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8878',
        rewrite: (str) => str.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    Inspect(),
    Unplugin({
      url: 'http://10.7.12.26:8878/record',
      appid: '6583a4017001c56e019f50d7',
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
