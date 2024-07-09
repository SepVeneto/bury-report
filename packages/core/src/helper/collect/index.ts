import type { Options, RuntimeOptions } from '@/type'

export function initCollect(config: Required<Options>, options: RuntimeOptions) {
  if (!config.collect) return ''

  if (options.uniPlatform === 'mp-weixin') {
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
