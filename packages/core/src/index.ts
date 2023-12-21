import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
// import { initReport } from './utils'
import type { Options } from './type'
import * as path from 'node:path'
import * as fs from 'node:fs'
import MagicString from 'magic-string'

export const unpluginFactory: UnpluginFactory<Options> = options => {
  let request
  if (isUniapp()) {
    request = `uni.request({
      url: '${options.url}',
      method: 'POST',
      data: JSON.stringify({ type: type, data: data, appid: '${options.appid}'})
    })`
  } else {
    request = `window.navigator.sendBeacon('${options.url}', JSON.stringify({ type, data: data, appid: '${options.appid}'}))`
  }
  const reportContent = `global.__BR_REPORT__ = function(type, data) {
    ${request}
  }`
  return {
    name: 'plugin-bury-report',
    enforce: 'pre',
    transformIndexHtml(html: string) {
      return isUniapp()
        ? html
        : {
            html,
            tags: [
              {
                tag: 'script',
                children: reportContent,
              },
            ],
          }
    },
    transform(code, id) {
      if (isUniapp() && id === path.resolve(process.env.UNI_INPUT_DIR!, getMainEntry())) {
        const s = new MagicString(code)
        s.prepend(reportContent)
        return s.toString()
      }
      return code
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin

function getMainEntry() {
  if (!process.env.UNI_INPUT_DIR) {
    throw new Error('UNI_INPUT_DIR not specified')
  }
  const mainEntry = fs.existsSync(path.resolve(process.env.UNI_INPUT_DIR, 'main.ts')) ? 'main.ts' : 'main.js'
  return mainEntry
}

function isUniapp() {
  return process.env.UNI_PLATFORM
}
