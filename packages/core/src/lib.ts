import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
import type { Options } from './type'
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
  const platform = process.env.UNI_PLATFORM
  const isH5 = !platform || platform.toUpperCase() === 'H5'
  const config = withDefault(options)
  const sdk = sdkInjector.replace('SDK_OPTIONS', JSON.stringify(config))
  return {
    name: 'plugin-bury-report',
    enforce: 'pre',
    transformInclude(id) {
      if (id.includes('/node_modules/')) return false

      const entry = Array.isArray(config.entry) ? config.entry : [config.entry]
      const res = entry.some(item => isEntry(id, item))
      return res
    },
    transform(code) {
      if (isH5) return code

      const plugins = []
      if (config.collect) {
        plugins.push('BuryReport.registerPlugin(new CollectPlugin())')
      }
      if (config.error) {
        plugins.push('BuryReport.registerPlugin(new ErrorPlugin())')
      }
      if (config.network?.enable) {
        plugins.push('BuryReport.registerPlugin(new NetworkPlugin())')
      }

      const insertCode = `
import { BuryReport, ErrorPlugin, NetworkPlugin, CollectPlugin } from '@sepveneto/report-core/mp'
${plugins.join('\n')}
try {
  new BuryReport(${JSON.stringify(config)})\n
} catch (error) {
  console.warn('[@sepveneto/report-core] init failed with error', error)
}\n
        `
      code = combineCode(code, insertCode)
      return {
        code,
        map: new MagicString(code).generateMap(),
      }
    },
    vite: {
      transformIndexHtml(html: any) {
        if (isH5) {
          return {
            html,
            tags: [
              { tag: 'script', children: sdk, injectTo: 'body-prepend' },
            ],
          }
        } else {
          return html
        }
      },
    },
    webpack(compiler) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const HtmlWebpackPlugin: any = require('html-webpack-plugin')
      compiler.hooks.thisCompilation.tap('plugin-bury-report', (compilation) => {
        HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tapAsync(
          'plugin-bury-report', (data: any, callback: any) => {
            data.bodyTags.unshift({
              tagName: 'script',
              voidTag: false,
              meta: { plugin: 'plugin-bury-report' },
              innerHTML: sdk,
            })
            callback(null, data)
          },
        )
      })
    },
    rspack(compiler) {
      compiler.hooks.thisCompilation.tap('plugin-bury-report', (compilation) => {
        compilation.hooks.processAssets.tap({
          name: 'plugin-bury-report',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
        },
        () => {
          const assets = compilation.getAssets()
          for (const asset of assets) {
            const filename = asset.name

            if (!filename.endsWith('.html')) continue

            const source = asset.source.source().toString()
            const next = source.replace(/<body([^>]*)>/, `<body$1><script>${sdk}</script>`)

            compilation.updateAsset(
              filename,
              new compiler.webpack.sources.RawSource(next),
            )
          }
        },
        )
      })
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin
