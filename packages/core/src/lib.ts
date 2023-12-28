import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
// import { initReport } from './utils'
import type { Options } from './type'
import { combineCode, genCode, isEntry, isUniapp } from './utils'

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
      return combineCode(code, reportContent)
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin
