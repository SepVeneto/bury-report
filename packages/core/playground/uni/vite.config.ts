import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import type { Plugin } from 'vite'
import Unplugin from '@sepveneto/report-core/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), Unplugin({
    url: 'http://localhost:8870/record',
    appid: '65dff60ff2a68ca3dc989de4',
    collect: true,
    interval: 5,
    error: true,
    report: true,
    network: {
      enable: true,
      success: true,
      fail: true,
    },
  },
  ) as Plugin],
})
