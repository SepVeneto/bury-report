import type { Options } from '@/type'
import { IS_UNI_WEIXIN } from '@/utils/env'

export function initError(config: Required<Options>) {
  if (!config.error) return ''

  if (IS_UNI_WEIXIN) {
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
