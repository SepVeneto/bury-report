import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
// import { initReport } from './utils'
import type { Options } from './type'
import { addErrorReport, combineCode, genCode, isEntry, isUniapp } from './utils'
import MagicString from 'magic-string'

export const unpluginFactory: UnpluginFactory<Options> = options => {
  const reportContent = genCode(options)
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
    transformInclude(id) {
      return isEntry(id)
    },
    transform(code) {
      code = combineCode(code, reportContent + 'import { _brCollect, _brReport } from "@sepveneto/report-core"; _brCollect();\n')
      code = addErrorReport(code)
      return {
        code,
        map: new MagicString(code).generateMap(),
      }
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin
