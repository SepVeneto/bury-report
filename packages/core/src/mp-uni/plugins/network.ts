import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_API } from '@/constant'
import { MAX_FIELD_KB, normalizeBody, normalizeResponse, tryJsonString, withDefault } from '@/utils'

type NetWorkOptions = {
  condition?: (response: UniApp.RequestSuccessCallbackResult) => boolean
}
export class NetworkPlugin implements BuryReportPlugin {
  public name = 'NetworkPlugin'
  public reportRequest: any
  private options: NetWorkOptions

  constructor(options: NetWorkOptions) {
    this.options = options
  }

  init(ctx: BuryReport) {
    const {
      network,
      url: recordUrl,
    } = withDefault(ctx.options)

    // 关闭网络请求上报后，不再代理 uni.request
    if (!network.enable) return

    const report = ctx.report
    const _request = uni.request
    const condition = this.options?.condition

    function customRequest(this: any, options: UniNamespace.RequestOptions): ReturnType<typeof uni.request> {
      const { success, fail, complete } = options

      const start = Date.now()
      const _success = success
      const _fail = fail
      const _complete = complete

      let page: string | undefined
      try {
        page = getCurrentPages().map(item => item.route).slice(-1)[0]
      } catch {
        // 拿不到当前页面时不影响宿主请求
      }

      _request({
        ...options,
        success: (res) => {
          const ok = res.statusCode === 200
          // 非200的请求由 fail 决定是否上报
          if (ok ? (network.success || condition?.(res)) : network.fail) {
            const duration = Date.now() - start
            const response = typeof res.data === 'string' ? res.data : tryJsonString(res.data)
            // 失败请求保留完整内容便于排查，成功请求按上限截断
            const info = collectInfo(options, ok ? 'success' : 'fail', {
              page,
              duration,
              profile: res.profile,
              status: res.statusCode,
              responseHeaders: normalizeResponse(tryJsonString(res.header), ok ? MAX_FIELD_KB : Infinity),
              response: normalizeResponse(response, ok ? network.responseLimit : Infinity),
            })
            recordUrl !== info.url && report?.(COLLECT_API, info, { store: false })
          }
          _success?.(res)
        },
        fail: (res) => {
          // fail 决定是否上报失败的请求（请求失败/拒绝）
          if (network.fail) {
            const info = collectInfo(options, 'fail', {
              page,
              timeout: options.timeout,
              err: res.errMsg,
            })
            recordUrl !== info.url && report?.(COLLECT_API, info, { store: false })
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
      const isFail = type !== 'success'
      return {
        type,
        url: options.url,
        method: options.method,
        body: normalizeBody(options.data, isFail ? Infinity : undefined),
        responseType: options.responseType,
        ...others,
      }
    }

    uni.request = customRequest

    console.info('[@sepveneto/report-core] XMLHttpRequest has been extended')
  }
}
