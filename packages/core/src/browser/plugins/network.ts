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
    } = withDefault(ctx.options)

    const report = ctx.report

    class CustomRequest extends XMLHttpRequest {
      private _start = 0
      private _body: any
      private _method = 'GET'
      private triggerPage = ''
      open(...args: [method: string, url: string]) {
        const [method] = args
        this._method = method
        // 存在请求触发生重定向导致上报时的路由与实际不符的情况
        // 所以需要在触发时缓存当前路由
        this.triggerPage = window.location.href

        network.success && super.addEventListener('loadend', () => {
          const duration = performance.now() - this._start
          if (this.status === 200) {
            const info = this._collectInfo('success', {
              duration,
              profile: getNetworkProfile(this.responseURL),
            })
            report?.(COLLECT_API, info)
          } else {
            const info = this._collectInfo('fail', { duration })
            report?.(COLLECT_API, info)
          }
        })
        error && super.addEventListener('abort', () => {
          const info = this._collectInfo('abort')
          report?.(COLLECT_API, info)
        })

        error && super.addEventListener('error', () => {
          const info = this._collectInfo('error')
          report?.(COLLECT_API, info)
        })
        error && super.addEventListener('timeout', () => {
          const info = this._collectInfo('timeout', { timeout: this.timeout })
          report?.(COLLECT_API, info)
        })
        super.open(...args)
      }

      send(body: Parameters<typeof XMLHttpRequest.prototype.send>[number]) {
        if (network.success) {
          this._start = performance.now()
          this._body = body
        }
        super.send(body)
      }

      _collectInfo(type: string, others: Record<string, any> = {}) {
        const responseType = Object.prototype.toString.call(this.response)
        return {
          type,
          url: this.responseURL,
          method: this._method,
          body: this._body,
          status: this.status,
          page: this.triggerPage || window.location.href,
          responseHeaders: this.getAllResponseHeaders(),
          response: typeof this.response === 'string'
            ? normalizeResponse(this.response, network.responseLimit)
            : null,
          responseType: this.responseType || responseType,
          ...others,
        }
      }
    }

    window.XMLHttpRequest = CustomRequest
    console.info('[@sepveneto/report-core] XMLHttpRequest has been extended')
  }
}

function getNetworkProfile(url: string) {
  const entry = window.performance.getEntriesByName(url)[0] as PerformanceResourceTiming
  if (!entry) {
    return
  }
  return {
    // 调用接口的时间
    invokeStart: entry.startTime,
    // 准备好使用 HTTP 请求抓取资源的时间，这发生在检查本地缓存之前
    fetchStart: entry.fetchStart,
    // 第一个 HTTP 重定向发生时的时间。有跳转且是同域名内的重定向才算，否则值为 0
    redirectStart: entry.redirectStart,
    // 最后一个 HTTP 重定向完成时的时间。有跳转且是同域名内部的重定向才算，否则值为 0
    redirectEnd: entry.redirectEnd,
    // Local DNS 域名查询开始的时间，如果使用了本地缓存（即无 DNS 查询）或持久连接，则与 fetchStart 值相等
    domainLookUpStart: entry.domainLookupStart,
    // Local DNS 域名查询完成的时间，如果使用了本地缓存（即无 DNS 查询）或持久连接，则与 fetchStart 值相等
    domainLookUpEnd: entry.domainLookupEnd,
    // HTTP（TCP） 开始建立连接的时间，如果是持久连接，则与 fetchStart 值相等。注意如果在传输层发生了错误且重新建立连接，则这里显示的是新建立的连接开始的时间
    connectStart: entry.connectStart,
    // HTTP（TCP） 完成建立连接的时间（完成握手），如果是持久连接，则与 fetchStart 值相等。注意如果在传输层发生了错误且重新建立连接，则这里显示的是新建立的连接完成的时间。注意这里握手结束，包括安全连接建立完成、SOCKS 授权通过
    connectEnd: entry.connectEnd,
    // SSL建立连接的时间,如果不是安全连接,则值为 0
    SSLConnectionStart: entry.secureConnectionStart || 0,
    // SSL建立完成的时间,如果不是安全连接,则值为 0
    SSLConnectionEnd: entry.secureConnectionStart ? entry.connectEnd : 0,
    // HTTP请求读取真实文档开始的时间（完成建立连接），包括从本地读取缓存。连接错误重连时，这里显示的也是新建立连接的时间
    requestStart: entry.requestStart,
    // HTTP请求读取真实文档结束的时间
    requestEnd: entry.responseStart,
    // HTTP 开始接收响应的时间（获取到第一个字节），包括从本地读取缓存
    responseStart: entry.responseStart,
    // HTTP 响应全部接收完成的时间（获取到最后一个字节），包括从本地读取缓存
    responseEnd: entry.responseEnd,

    // 开始排队的时间。达到并行上限时才需要排队。
    queueStart: entry.startTime,
    // 结束排队的时间。达到并行上限时才需要排队。如果未发生排队，则该字段和 queueStart 字段值相同
    queueEnd: entry.fetchStart,

    // 使用协议类型，有效值：http1.1, h2, quic, unknown
    protocol: entry.nextHopProtocol,
    // 是否复用连接
    socketReused: entry.connectStart === entry.fetchStart,
    // 发送的字节数
    sendBytesCount: entry.encodedBodySize || 0,
    // 收到字节数
    receivedBytedCount: entry.transferSize || 0,
  }
}
