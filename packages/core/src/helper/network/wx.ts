import { report } from '@/index'
import { COLLECT_API } from '@/utils/constant'

export function __BR_API_INIT__(
  successReport: boolean,
  error: boolean,
) {
  console.log(successReport, error)
  const _request = wx.request

  function customRequest(this: any, options: WechatMiniprogram.RequestOption): ReturnType<typeof uni.request> {
    const { success, fail, complete } = options

    const start = Date.now()
    const _success = success
    const _fail = fail
    const _complete = complete

    _request({
      ...options,
      success: (res) => {
        if (successReport) {
          const duration = Date.now() - start
          const info = collectInfo(options, 'success', {
            duration,
            status: res.statusCode,
            responseHeaders: res.header,
            response: typeof res.data === 'string' ? res.data : null,
          })
          report(COLLECT_API, info)
        }
        _success?.(res)
      },
      fail: (res) => {
        if (error) {
          const info = collectInfo(options, 'fail', {
            timeout: options.timeout,
            err: res.errMsg,
          })
          report(COLLECT_API, info)
          console.log(info)
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
    options: WechatMiniprogram.RequestOption,
    type: string,
    others: Record<string, any> = {},
  ) {
    return {
      type,
      page: getCurrentPages().map(page => page.route),
      url: options.url,
      method: options.method,
      body: options.data,
      responseType: options.responseType,
      ...others,
    }
  }

  wx.request = customRequest
  console.warn('[@sepveneto/report-core] wx.request has been extended')
}
