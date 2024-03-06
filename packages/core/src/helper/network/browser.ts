import { report } from '@/index'

export function __BR_API_INIT__(
  success: boolean,
  error: boolean,
) {
  class CustomRequest extends XMLHttpRequest {
    private _start = 0
    private _body: any
    private _method = 'GET'
    open(...args: [method: string, url: string]) {
      const [method] = args
      this._method = method

      success && super.addEventListener('loadend', () => {
        const duration = performance.now() - this._start
        if (this.status === 200) {
          const info = this._collectInfo('success', { duration })
          report('__BR_API__', info)
        } else {
          const info = this._collectInfo('fail', { duration })
          report('__BR_API__', info)
        }
      })
      error && super.addEventListener('abort', () => {
        const info = this._collectInfo('abort')
        report('__BR_API__', info)
      })

      error && super.addEventListener('error', () => {
        const info = this._collectInfo('error')
        report('__BR_API__', info)
      })
      error && super.addEventListener('timeout', () => {
        const info = this._collectInfo('timeout', { timeout: this.timeout })
        report('__BR_API__', info)
      })
      super.open(...args)
    }

    send(body: Parameters<typeof XMLHttpRequest.prototype.send>[number]) {
      if (success) {
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
        page: window.location.href,
        responseHeaders: this.getAllResponseHeaders(),
        response: typeof this.response === 'string' ? this.response : null,
        responseType: this.responseType || responseType,
        ...others,
      }
    }
  }

  window.XMLHttpRequest = CustomRequest
  console.warn('[@sepveneto/report-core] XMLHttpRequest has been extended')
}
