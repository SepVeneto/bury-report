import type { Options, RuntimeOptions } from '@/type'

export function initReport(config: Required<Options>, options: RuntimeOptions) {
  if (options.uniPlatform === 'mp-weixin') {
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
