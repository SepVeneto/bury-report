import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
import type { Options } from './type'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import sdkInjector from './browser/injector?raw'
import path from 'node:path'
import fs from 'node:fs'
import { withDefault } from './utils'
import MagicString from 'magic-string'

function combineCode(code: string, reportContent: string) {
  const s = new MagicString(code)
  s.prepend(reportContent)
  return s.toString()
}

export function getMainEntry() {
  if (!process.env.UNI_INPUT_DIR) {
    throw new Error('UNI_INPUT_DIR not specified')
  }
  const mainEntry = fs.existsSync(path.resolve(process.env.UNI_INPUT_DIR, 'main.ts')) ? 'main.ts' : 'main.js'
  return mainEntry
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

export const unpluginFactory: UnpluginFactory<Options> = options => {
  const isH5 = process.env.UNI === 'H5' || !process.env.UNI
  const config = withDefault(options)
  return {
    name: 'plugin-bury-report',
    enforce: 'pre',
    transformInclude(id) {
      return isEntry(id, config.entry)
    },
    transform(code) {
      if (isH5) return code

      const insertCode = `
import ReportSDK from '@sepveneto/report-core/mp'
new ReportSDK(${JSON.stringify(options)})
        `
      code = combineCode(code, insertCode)
      return {
        code,
        map: new MagicString(code).generateMap(),
      }
    },
    vite: {
      transformIndexHtml(html) {
        if (isH5) {
          return {
            html,
            tags: [
              { tag: 'script', children: sdkInjector.replace('SDK_OPTIONS', JSON.stringify(options)), injectTo: 'head' },
            ],
          }
        } else {
          return html
        }
      },
    },
    webpack(compiler) {
      compiler.hooks.compilation.tap('HtmlWebpackInjectorPlugin', (compilation) => {
        HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tapAsync(
          'HtmlWebpackInjectorPlugin', (data, callback) => {
            callback(null, data)
          },
        )
      })
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin
