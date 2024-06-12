import type { Options } from '@/type'
import { IS_UNI_WEIXIN } from '@/utils/env'

export function initReport(config: Required<Options>) {
  if (IS_UNI_WEIXIN()) {
    return [
      'import { __BR_REPORT_INIT__ } from "@sepveneto/report-core/helper/report/wx"',
      `__BR_REPORT_INIT__("${config.appid}", "${config.url}", ${config.interval})`,
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_REPORT_INIT__ } from "@sepveneto/report-core/helper/report/browser"',
      `__BR_REPORT_INIT__("${config.appid}", "${config.url}", ${config.interval})`,
      '',
    ].join('\n')
  }
}
