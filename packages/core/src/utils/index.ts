import * as path from 'node:path'
import * as fs from 'node:fs'
import type { Options } from '../type'
import MagicString from 'magic-string'
import { getPackageInfoSync } from 'local-pkg'
import { proxyConsoleError } from './transform'
import { isUniapp } from './env'
import { REPORT_REQUEST } from './constant'

export * from './env'
export * from './constant'

const vue = getPackageInfoSync('vue')
const [, vueVersion] = vue?.packageJson.version?.match(/(\d+)\.(?:\d+)\.(?:.+)/) ?? []
export const isVue2 = vueVersion === '2'

export function combineCode(code: string, reportContent: string) {
  const s = new MagicString(code)
  s.prepend(reportContent)
  return s.toString()
}
export function addErrorReport(code: string) {
//   const res = insertCodeByVue(code)
//   const s = new MagicString(code)
//   s.prepend(`
// var _tempError = console.error
// console.error = function(...args) {
//   _tempError.apply(this, args)
//   ${REPORT_REQUEST}()
// }
// `)
  // return s.toString()
  return proxyConsoleError(code)
}
export function isEntry(id: string) {
  // 抹平webpack和vite对于windows平台路径分隔符的差异
  return isUniapp() && path.resolve(id) === path.resolve(process.env.UNI_INPUT_DIR!, getMainEntry())
}
export function genCode(options: Required<Options>) {
  let request
  if (isUniapp() && process.env.UNI_PLATFORM !== 'h5') {
    request = `uni.request({
      url: '${options.url}',
      method: 'POST',
      data: JSON.stringify({ uuid: uuid, type: type, data: data, appid: '${options.appid}'})
    })`
  } else {
    request = `
const json = { uuid: uuid, type, data: data, appid: '${options.appid}'}
const blob = new Blob([JSON.stringify(json)], { type: 'application/json' })
window.navigator.sendBeacon('${options.url}', blob)
`
  }
  return `globalThis.${REPORT_REQUEST} = function(uuid, type, data) {
    if (${!options.report}) return false
    ${request}
}\n`
}
export function getMainEntry() {
  if (!process.env.UNI_INPUT_DIR) {
    throw new Error('UNI_INPUT_DIR not specified')
  }
  const mainEntry = fs.existsSync(path.resolve(process.env.UNI_INPUT_DIR, 'main.ts')) ? 'main.ts' : 'main.js'
  return mainEntry
}

export function mergeConfig(config: Options, defaultConfig: Required<Omit<Options, 'url' | 'appid'>>) {
  return {
    ...defaultConfig,
    ...config,
  }
}
