import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import type { Plugin } from 'vite'
import Unplugin from '@sepveneto/report-core/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), Unplugin({
    url: 'http://10.7.12.26:8878/record',
    appid: '6583a4017001c56e019f50d7',
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
