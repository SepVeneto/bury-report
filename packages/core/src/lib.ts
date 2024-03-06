import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
import type { Options } from './type'
import { combineCode, createDebug, isEntry, mergeConfig } from './utils'
import MagicString from 'magic-string'
import { initCollect, initError, initNetwork, initReport } from './helper'

const debug = createDebug('config')

const defaultConfig = {
  collect: true,
  error: true,
  report: process.env.NODE_ENV === 'production',
  network: {
    enable: false,
    success: true,
    error: true,
  },
}

export const unpluginFactory: UnpluginFactory<Options> = options => {
  const config = mergeConfig(defaultConfig, options)
  debug(JSON.stringify(config, null, 2))
  return {
    name: 'plugin-bury-report',
    enforce: 'pre',
    transformInclude(id) {
      return isEntry(id, config.entry)
    },
    transform(code) {
      if (config.report) {
        const insertCode = [
          initReport(config),
          initCollect(config),
          initNetwork(config),
          initError(config),
        ].join('\n')
        code = combineCode(code, insertCode)
      }
      return {
        code,
        map: new MagicString(code).generateMap(),
      }
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin
