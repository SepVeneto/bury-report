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
      url: 'http://127.0.0.1:8870/record',
      appid: '69119314cc2f061317f91078',
      entry: 'main.ts',
      collect: true,
      report: true,
      interval: 5,
      operationRecord: {
        enable: false,
      },
      network: {
        enable: true,
      },
    }) as Plugin,
  ],
})
