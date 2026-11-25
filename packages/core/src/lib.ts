import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
import type { Options } from './type'
import sdkInjector from './browser/loader?raw'
import path from 'node:path'
import fs from 'node:fs'
import { withDefault } from './utils'
import MagicString from 'magic-string'
import { serializeOptions } from './browser/options'
import { createModuleMetadataSnippet } from './browser/module-metadata'

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

function getStamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const sec = now.getSeconds()

  const addZero = (val: number) => val > 9 ? val : `0${val}`

  return `${year}${addZero(month)}${addZero(day)}${addZero(hour)}${addZero(minute)}${addZero(sec)}`
}

export const unpluginFactory: UnpluginFactory<Options> = options => {
  const platform = process.env.UNI_PLATFORM
  const isH5 = !platform || platform.toUpperCase() === 'H5'
  const config = withDefault(options)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { entry, ...client } = config
  const stamp = getStamp()
  const metadataSnippet = isH5 && config.applicationKey
    ? createModuleMetadataSnippet(config.applicationKey)
    : ''
  // @ts-expect-error: allow
  const sdk = sdkInjector.replace('SDK_OPTIONS', serializeOptions({ stamp, ...client }))
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
      generateBundle(_options: any, bundle: any) {
        if (!metadataSnippet) return
        for (const chunk of Object.values(bundle) as any[]) {
          if (chunk?.type === 'chunk') {
            chunk.code = metadataSnippet + chunk.code
          }
        }
      },
      transformIndexHtml(html: any) {
        if (isH5) {
          return {
            html,
            tags: [
              { tag: 'script', children: sdk, injectTo: 'head-prepend' },
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
        if (metadataSnippet) {
          compilation.hooks?.processAssets?.tap({
            name: 'plugin-bury-report-metadata',
            stage: (compiler as any).webpack?.Compilation?.PROCESS_ASSETS_STAGE_ADDITIONS ?? 0,
          }, () => {
            for (const asset of compilation.getAssets()) {
              if (!/\.(?:m?js|cjs)$/i.test(asset.name)) continue
              const source = asset.source.source().toString()
              compilation.updateAsset(
                asset.name,
                new (compiler as any).webpack.sources.RawSource(metadataSnippet + source),
              )
            }
          })
        }
        HtmlWebpackPlugin.getHooks(compilation).alterAssetTagGroups.tapAsync(
          'plugin-bury-report', (data: any, callback: any) => {
            data.headTags.unshift({
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
            const source = asset.source.source().toString()

            if (/\.(?:m?js|cjs)$/i.test(filename)) {
              if (metadataSnippet) {
                compilation.updateAsset(
                  filename,
                  new compiler.webpack.sources.RawSource(metadataSnippet + source),
                )
              }
              continue
            }

            if (!filename.endsWith('.html')) continue

            const tag = `<script>${sdk}</script>`
            let next = source.replace(/<head([^>]*)>/i, (_match: string, attrs: string) => {
              return `<head${attrs}>${tag}`
            })
            if (next === source) {
              next = source.replace(/<body([^>]*)>/i, (_match: string, attrs: string) => {
                return `<body${attrs}>${tag}`
              })
            }
            if (next === source) {
              next = tag + source
            }

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
