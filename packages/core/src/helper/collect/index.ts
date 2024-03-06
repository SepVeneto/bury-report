import type { Options } from '@/type'
import { isUniWeixin } from '@/utils'

export function initCollect(config: Required<Options>) {
  if (!config.collect) return ''

  if (isUniWeixin()) {
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
