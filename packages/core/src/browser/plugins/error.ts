import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { storageReport } from '@/utils'

export class ErrorPlugin implements BuryReportPlugin {
  public name = 'errorPlugin'
  private ctx?: BuryReport
  private appid?: string
  private originErrorLog?: any

  init(ctx: BuryReport | string) {
    if (typeof ctx === 'string') {
      this.appid = ctx
    } else {
      this.ctx = ctx
    }
    this.originErrorLog = initErrorProxy((data) => this.reportError(data))
    this.onUncaughtError()
    this.onResourceLoadError()
    this.onUnhandleRejectionError()
  }

  public reportError(error: { name: string, message: string, stack?: string }) {
    const data = { ...error, page: window.location.href }
    // 白屏检测没有上下文，需要先放到缓存中
    if (this.ctx) {
      this.ctx.report?.(COLLECT_ERROR, data)
    } else {
      storageReport(this.appid!, data)
    }
  }

  resetListener() {
    console.error = this.originErrorLog
    window.removeEventListener('error', this.uncaughtErrorListener)
    window.removeEventListener('error', this.resourceLoadErrorListener)
    window.removeEventListener('unhandledrejection', this.unhandleRejectionErrorListener)
  }

  public onUncaughtError() {
    window.addEventListener('error', this.uncaughtErrorListener)
  }

  public uncaughtErrorListener = (evt: ErrorEvent) => {
    if (!evt || !evt.error) return

    this.reportError({
      name: evt.error?.name || '[@sepveneto/report-core] unknown error',
      message: evt.error?.message || evt.message,
      stack: evt.error?.stack || `${evt.filename}:${evt.lineno},${evt.colno}`,
    })
  }

  public onResourceLoadError() {
    window.addEventListener('error', this.resourceLoadErrorListener)
  }

  public resourceLoadErrorListener = (evt: ErrorEvent) => {
    if (evt instanceof ErrorEvent) return

    const { target } = evt as any

    this.reportError({
      name: 'ResourceLoadFail',
      message: target.src || target.href,
      stack: target.baseURI,
    })
  }

  public onUnhandleRejectionError() {
    window.addEventListener('unhandledrejection', this.unhandleRejectionErrorListener)
  }

  public unhandleRejectionErrorListener = (evt: PromiseRejectionEvent) => {
    const error = evt.reason

    this.reportError({
      name: 'UnhandleRejection',
      message: error?.message,
      stack: error?.stack,
    })
  }
}

function initErrorProxy(reportFn: (...args: any[]) => void) {
  const _tempError = console.error
  console.error = function (...args) {
    for (const arg of args) {
      if (typeof arg === 'string') {
        const error = {
          name: 'CustomError',
          message: arg,
          stack: '',
        }
        reportFn(error)
        break
      }
      if (arg instanceof Error) {
        const error = {
          name: arg.name,
          message: arg.message,
          stack: arg.stack,
        }
        reportFn(error)
        break
      }
      if (globalThis.PromiseRejectionEvent && arg instanceof PromiseRejectionEvent && arg.reason) {
        const error = {
          name: arg.reason.name,
          message: arg.reason.message,
          stack: arg.reason.stack,
        }
        reportFn(error)
        break
      } else {
        console.warn(args)
        console.warn(arg, typeof arg, Object.prototype.toString.call(arg))
      }
    }
    _tempError.apply(this, args)
  }
  return _tempError
}
