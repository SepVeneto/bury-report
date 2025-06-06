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
            const info = this._collectInfo('success', { duration })
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
