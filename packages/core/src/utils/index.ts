import * as path from 'node:path'
import * as fs from 'node:fs'
import type { Options } from '../type'
import MagicString from 'magic-string'

export function isUniapp() {
  return process.env.UNI_PLATFORM
}

export function combineCode(code: string, reportContent: string) {
  const s = new MagicString(code)
  s.prepend(reportContent)
  return s.toString()
}
export function isEntry(id: string) {
  return isUniapp() && id === path.resolve(process.env.UNI_INPUT_DIR!, getMainEntry())
}
export function genCode(options: Options) {
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
  return `global.__BR_REPORT__ = function(type, data) {
    ${request}
}\nimport { collect } from "@sepveneto/report-core"; collect();\n`
}
export function getMainEntry() {
  if (!process.env.UNI_INPUT_DIR) {
    throw new Error('UNI_INPUT_DIR not specified')
  }
  const mainEntry = fs.existsSync(path.resolve(process.env.UNI_INPUT_DIR, 'main.ts')) ? 'main.ts' : 'main.js'
  return mainEntry
}
