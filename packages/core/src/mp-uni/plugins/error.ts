import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_ERROR } from '@/constant'

export class ErrorPlugin implements BuryReportPlugin {
  public name = 'errorPlugin'
  private ctx?: BuryReport

  public uncaughtErrorListener = (error: string | PromiseRejectionEvent) => {
    if (typeof error === 'string') {
      const errMsg = error?.split('\n') || []
      this.reportError({
        name: errMsg[0] || 'UnknownError',
        message: errMsg[1] || 'unknown message',
        stack: error,
      })
    } else if ('reason' in error) {
      // 微信小程序Promise.reject也会被onError收集
      this.unhandleRejectionErrorListener(error)
    } else {
      this.reportError({
        name: 'UnknownError',
        message: 'unknown message',
        stack: error,
      })
    }
  }

  constructor() {
    this.uncaughtErrorListener = this.uncaughtErrorListener.bind(this)
    this.unhandleRejectionErrorListener = this.unhandleRejectionErrorListener.bind(this)
  }

  init(ctx: BuryReport) {
    this.ctx = ctx
    initErrorProxy((data) => this.reportError(data))
    this.onUncaughtError()
    this.onUnhandleRejectionError()
  }

  public reportError(error: { name: string, message: string, stack?: string }) {
    const data = { ...error, page: getCurrentPages().map(page => page.route).join('->') }
    this.ctx?.report?.(COLLECT_ERROR, data)
  }

  public onUncaughtError() {
    if (uni.canIUse('onError')) {
      uni.onError(this.uncaughtErrorListener as any)
    }
  }

  public onUnhandleRejectionError() {
    if (uni.canIUse('onUnhandledRejection')) {
      uni.onUnhandledRejection(this.uncaughtErrorListener as any)
    }
  }

  public unhandleRejectionErrorListener = (evt: PromiseRejectionEvent) => {
    const error = evt.reason
    const mockError = new Error(typeof error === 'string' ? error : JSON.stringify(error))

    this.reportError({
      name: 'UnhandleRejection',
      message: mockError.message,
      stack: mockError.stack,
    })
  }
}

function initErrorProxy(reportFn: (...args: any[]) => void) {
  const _tempError = console.error
  console.error = function (...args) {
    const [arg, err] = args
    if (err instanceof TypeError) {
      const error = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
      reportFn(error)
    } else if (typeof arg === 'string') {
      const error = {
        name: 'CustomError',
        message: arg,
        stack: '',
      }
      reportFn(error)
    } else if (arg instanceof Error) {
      const error = {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      }
      reportFn(error)
    } else if (globalThis.PromiseRejectionEvent && arg instanceof PromiseRejectionEvent && arg.reason) {
      const error = {
        name: arg.reason.name,
        message: arg.reason.message,
        stack: arg.reason.stack,
      }
      reportFn(error)
    } else {
      console.warn(args)
      console.warn(arg, typeof arg, Object.prototype.toString.call(arg))
    }
    _tempError.apply(this, args)
  }
  return _tempError
}
