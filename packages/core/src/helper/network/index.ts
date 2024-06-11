import type { Options } from '@/type'
import { IS_UNI_WEIXIN } from '@/utils/env'

export function initNetwork(config: Required<Options>) {
  if (!config.network.enable) return ''

  const { success, fail } = config.network
  if (IS_UNI_WEIXIN) {
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
