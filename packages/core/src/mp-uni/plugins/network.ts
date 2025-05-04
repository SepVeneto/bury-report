import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_API } from '@/constant'
import { normalizeResponse, withDefault } from '@/utils'

export class NetworkPlugin implements BuryReportPlugin {
  public name = 'NetworkPlugin'
  public reportRequest: any

  init(ctx: BuryReport) {
    const {
      network,
      error,
      url: recordUrl,
    } = withDefault(ctx.options)

    const report = ctx.report
    const _request = uni.request

    function customRequest(this: any, options: UniNamespace.RequestOptions): ReturnType<typeof uni.request> {
      const { success, fail, complete } = options

      const start = Date.now()
      const _success = success
      const _fail = fail
      const _complete = complete

      _request({
        ...options,
        success: (res) => {
          if (network.success) {
            const duration = Date.now() - start
            const response = typeof res.data === 'string' ? res.data : 'data object'
            const info = collectInfo(options, 'success', {
              duration,
              status: res.statusCode,
              responseHeaders: res.header,
              response: normalizeResponse(response, network.responseLimit),
            })
            recordUrl !== info.url && report(COLLECT_API, info)
          }
          _success?.(res)
        },
        fail: (res) => {
          if (error) {
            const info = collectInfo(options, 'fail', {
              timeout: options.timeout,
              err: res.errMsg,
            })
            recordUrl !== info.url && report(COLLECT_API, info)
          }
          _fail?.(res)
        },
        complete: (res) => {
          _complete?.(res)
        },
      },
      )
    }

    function collectInfo(
      options: UniNamespace.RequestOptions,
      type: string,
      others: Record<string, any> = {},
    ) {
      return {
        type,
        page: getCurrentPages().map(page => page.route).slice(-1)[0],
        url: options.url,
        method: options.method,
        body: options.data,
        responseType: options.responseType,
        ...others,
      }
    }

    uni.request = customRequest

    console.info('[@sepveneto/report-core] XMLHttpRequest has been extended')
  }
}
