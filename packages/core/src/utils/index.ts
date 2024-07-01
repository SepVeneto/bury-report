import * as path from 'node:path'
import * as fs from 'node:fs'
import type { Options } from '../type'
import MagicString from 'magic-string'
import { getPackageInfoSync } from 'local-pkg'
import debug from 'debug'
// import { IS_UNIAPP } from './env'

const vue = getPackageInfoSync('vue')
const [, vueVersion] = vue?.packageJson.version?.match(/(\d+)\.(?:\d+)\.(?:.+)/) ?? []
export const isVue2 = vueVersion === '2'

export function combineCode(code: string, reportContent: string) {
  const s = new MagicString(code)
  s.prepend(reportContent)
  return s.toString()
}
export function isEntry(id: string, entryFile: string) {
  // 不能使用env内的环境变量，会导致值被提前确定
  if (process.env.UNI_PLATFORM) {
    // 抹平webpack和vite对于windows平台路径分隔符的差异
    return path.resolve(id) === path.resolve(process.env.UNI_INPUT_DIR!, getMainEntry())
  } else {
    return path.resolve(id) === path.resolve(process.cwd(), entryFile)
  }
}
export function getMainEntry() {
  if (!process.env.UNI_INPUT_DIR) {
    throw new Error('UNI_INPUT_DIR not specified')
  }
  const mainEntry = fs.existsSync(path.resolve(process.env.UNI_INPUT_DIR, 'main.ts')) ? 'main.ts' : 'main.js'
  return mainEntry
}

function detectEntryFile(config: Options) {
  if (config.entry) return config.entry

  return fs.existsSync(path.resolve(process.cwd(), 'src/main.ts')) ? 'src/main.ts' : 'src/main.js'
}

export function mergeConfig(defaultConfig: Required<Omit<Options, 'url' | 'appid' | 'entry'>>, config: Options): Required<Options> {
  const res: Record<string, any> = {}

  combine(defaultConfig)
  combine(config)
  combine({ entry: detectEntryFile(config) })

  return res as unknown as Required<Options>
  function combine(obj: Record<string, any>) {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue

      // eslint-disable-next-line eqeqeq
      if (obj[key] == undefined) continue

      if (Object.prototype.toString.call(obj[key]) === '[object Object]') {
        res[key] = mergeConfig(res[key], obj[key])
      } else {
        res[key] = obj[key]
      }
    }
  }
}

export function createDebug(namespace: string) {
  const _debug = debug(`report-core:${namespace}`)
  return (...args: Parameters<typeof debug>) => _debug(...args)
}
