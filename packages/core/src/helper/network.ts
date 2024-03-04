import { isUniWeixin } from '../utils'
import type { Options } from '../type'

export function initNetwork(config: Required<Options>) {
  if (!config.network.enable) return ''

  const { slow, error, timeout } = config.network
  if (isUniWeixin()) {
    return [
      'import { __BR_API_INIT__ } from "@sepveneto/report-core/helper/wx"',
      `__BR_API_INIT__(${slow}, ${error}, ${timeout})`,
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_API_INIT__ } from "@sepveneto/report-core/helper/XMLHttpRequest"',
      `__BR_API_INIT__(${slow}, ${error}, ${timeout})`,
      '',
    ].join('\n')
  }
}
