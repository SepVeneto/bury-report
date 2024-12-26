import type { Options, RuntimeOptions } from '@/type'

export function initNetwork(config: Required<Options>, options: RuntimeOptions) {
  if (!config.network.enable) return ''

  const { success, fail, responseLimit } = config.network
  if (options.uniPlatform === 'mp-weixin') {
    return [
      'import { __BR_API_INIT__ } from "@sepveneto/report-core/helper/network/wx"',
      `__BR_API_INIT__("${config.url}", ${success}, ${fail}, ${responseLimit})`,
      '',
    ].join('\n')
  } else {
    return [
      'import { __BR_API_INIT__ } from "@sepveneto/report-core/helper/network/browser"',
      `__BR_API_INIT__("${config.url}", ${success}, ${fail}, ${responseLimit})`,
      '',
    ].join('\n')
  }
}
