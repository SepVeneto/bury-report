import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import type { Plugin } from 'vite'
import Unplugin from '@sepveneto/report-core/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), Unplugin({
    url: 'http://localhost:5174/record',
    appid: '65dff60ff2a68ca3dc989de4',
    collect: false,
    interval: 5,
    error: true,
    report: true,
    network: {
      enable: false,
      success: true,
      fail: true,
      responseLimit: 100,
    },
  },
  ) as Plugin],
})
