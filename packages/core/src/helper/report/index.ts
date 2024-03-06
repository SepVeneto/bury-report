import type { Options } from '@/type'
import { isUniWeixin } from '@/utils'

export function initReport(config: Required<Options>) {
  if (isUniWeixin()) {
    return [
      'import { __BR_REPORT_INIT__ } from "@sepveneto/report-core/helper/report/wx"',
      `__BR_REPORT_INIT__("${config.appid}", "${config.url}")`,
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_REPORT_INIT__ } from "@sepveneto/report-core/helper/report/browser"',
      `__BR_REPORT_INIT__("${config.appid}", "${config.url}")`,
      '',
    ].join('\n')
  }
}
