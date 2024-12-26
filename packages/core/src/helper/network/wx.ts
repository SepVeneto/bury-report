import { report } from '@/index'
import { getUtf8Size } from '../utils'
import { COLLECT_API } from '@/utils/constant'

export function __BR_API_INIT__(
  recordUrl: string,
  successReport: boolean,
  error: boolean,
  responseLimit: number,
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
        if (successReport) {
          const duration = Date.now() - start
          const info = collectInfo(options, 'success', {
            duration,
            status: res.statusCode,
            responseHeaders: res.header,
            response: normalizeResponse(res.data, responseLimit),
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
    options: WechatMiniprogram.RequestOption,
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

  wx.request = customRequest
  console.info('[@sepveneto/report-core] wx.request has been extended')
}

function normalizeResponse(response: any, limit: number) {
  const size = getUtf8Size(typeof response === 'object' ? JSON.stringify(response) : response)
  return size < limit * 1000 ? response : 'exceed size limit'
}
