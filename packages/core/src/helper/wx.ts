import { report } from '..'

export function __BR_API_INIT__(
  slow: boolean,
  error: boolean,
  timeout: number,
) {
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
        if (slow) {
          const duration = Date.now() - start
          if (duration > timeout!) {
            const info = collectInfo(options, 'success', {
              duration: Date.now() - start,
              status: res.statusCode,
              responseHeaders: res.header,
              response: typeof res.data === 'string' ? res.data : null,
            })
            report('__BR_API__', info)
          }
        }
        _success?.(res)
      },
      fail: (res) => {
        if (error) {
          const info = collectInfo(options, 'fail', {
            timeout: options.timeout,
            err: res.errMsg,
          })
          report('__BR_API__', info)
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
