import type { Options, RuntimeOptions } from '@/type'

export function initError(config: Required<Options>, options: RuntimeOptions) {
  if (!config.error) return ''

  if (options.uniPlatform === 'mp-weixin') {
    return [
      'import { __BR_ERROR_INIT__ } from "@sepveneto/report-core/helper/error/wx"',
      '__BR_ERROR_INIT__()',
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_ERROR_INIT__ } from "@sepveneto/report-core/helper/error/browser"',
      '__BR_ERROR_INIT__()',
      '',
    ].join('\n')
  }
}
