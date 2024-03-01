import { report } from '..'

const threshold = {
  time: 30,
}

class CustomRequest extends XMLHttpRequest {
  private _start = 0
  private _body: any
  open(...args: [method: string, url: string]) {
    const [method] = args

    super.addEventListener('loadend', () => {
      const duration = performance.now() - this._start
      if (duration > threshold.time) {
        console.log(this)
        const responseType = Object.prototype.toString.call(this.response)
        report('__BR_API__', {
          url: this.responseURL,
          method,
          duration,
          body: this._body,
          status: this.status,
          responseHeaders: this.getAllResponseHeaders(),
          response: typeof this.response === 'string' ? this.response : null,
          responseType: this.responseType || responseType,
        })
      }
    })
    super.addEventListener('error', () => {
      console.log(this.status, this.statusText)
      console.log(this.responseText, this.response)
    })
    super.addEventListener('timeout', () => {
      console.log(this.status, this.statusText)
      console.log(this.responseText, this.response)
    })
    super.open(...args)
  }

  send(body: Parameters<typeof XMLHttpRequest.prototype.send>[number]) {
    this._start = performance.now()
    this._body = body
    super.send(body)
  }
}

window.XMLHttpRequest = CustomRequest
console.log('replace')
