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
      url: 'http://localhost:8870/record',
      appid: '65dff60ff2a68ca3dc989de4',
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
