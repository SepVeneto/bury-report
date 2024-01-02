import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
// import { initReport } from './utils'
import type { Options } from './type'
import { addErrorReport, combineCode, genCode, isEntry, mergeConfig } from './utils'
import MagicString from 'magic-string'

const defaultConfig = {
  collect: true,
  error: true,
  report: process.env.NODE_ENV === 'production',
}

export const unpluginFactory: UnpluginFactory<Options> = options => {
  const config = mergeConfig(options, defaultConfig)
  const reportContent = genCode(config)
  return {
    name: 'plugin-bury-report',
    enforce: 'pre',
    transformInclude(id) {
      return isEntry(id)
    },
    transform(code) {
      const insertCode = reportContent +
        'import { _brCollect, _brReport } from "@sepveneto/report-core";\n' +
        (config.collect ? '_brCollect();\n' : '')
      code = combineCode(code, insertCode)
      if (config.error) {
        code = addErrorReport(code)
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
