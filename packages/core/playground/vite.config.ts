import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import Inspect from 'vite-plugin-inspect'
import Unplugin from '../src/vite'

export default defineConfig({
  plugins: [
    Inspect(),
    Unplugin({
      url: 'http://10.7.12.26:8878/record',
      appid: '6583a4017001c56e019f50d7',
    }) as Plugin,
  ],
})
