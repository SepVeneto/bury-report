import type { Options } from '@/type'
import { IS_UNI_WEIXIN } from '@/utils/env'

export function initCollect(config: Required<Options>) {
  if (!config.collect) return ''

  if (IS_UNI_WEIXIN) {
    return [
      'import { __BR_COLLECT_INIT__ } from "@sepveneto/report-core/helper/collect/wx"',
      '__BR_COLLECT_INIT__()',
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_COLLECT_INIT__ } from "@sepveneto/report-core/helper/collect/browser"',
      '__BR_COLLECT_INIT__()',
      '',
    ].join('\n')
  }
}
