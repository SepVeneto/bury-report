import { isUniWeixin } from '@/utils'
import type { Options } from '@/type'

export function initNetwork(config: Required<Options>) {
  if (!config.network.enable) return ''

  const { success, fail } = config.network
  if (isUniWeixin()) {
    return [
      'import { __BR_API_INIT__ } from "@sepveneto/report-core/helper/network/wx"',
      `__BR_API_INIT__(${success}, ${fail})`,
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_API_INIT__ } from "@sepveneto/report-core/helper/network/browser"',
      `__BR_API_INIT__(${success}, ${fail})`,
      '',
    ].join('\n')
  }
}
