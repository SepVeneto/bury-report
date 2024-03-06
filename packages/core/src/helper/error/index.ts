import { isUniWeixin } from '@/utils'
import type { Options } from '@/type'

export function initError(config: Required<Options>) {
  if (!config.error) return ''

  if (isUniWeixin()) {
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
