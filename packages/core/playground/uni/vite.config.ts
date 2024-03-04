import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import type { Plugin } from 'vite'
import Unplugin from '../../src/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni(), Unplugin({
    url: 'http://10.7.12.26:8878/record',
    appid: '6583a4017001c56e019f50d7',
    collect: false,
    report: true,
    network: {
      enable: true,
      slow: true,
      error: true,
      timeout: 30,
    },
  },
  ) as Plugin],
})
