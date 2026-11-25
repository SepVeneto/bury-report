import type { BuryReportBase as BuryReport, BuryReportPlugin, Options } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { storageReport, writeMemory } from '@/utils'
import { isSyntaxError, normalizeConsoleError, normalizeError, normalizeResourceError } from '../error-utils'
import type { NormalizedError } from '../error-utils'
import { shouldIgnoreError } from '../event-filter'

export class ErrorPlugin implements BuryReportPlugin {
  public name = 'errorPlugin'
  private ctx?: BuryReport
  private appid?: string
  private originErrorLog?: any
  private originOnError?: OnErrorEventHandler
  private wrappedOnError?: OnErrorEventHandler
  private errorProxy?: any
  private options?: Partial<Options>

  init(ctx: BuryReport | string) {
    if (typeof ctx === 'string') {
      this.appid = ctx
    } else {
      this.ctx = ctx
      this.options = ctx.options
    }
    const proxy = initErrorProxy((data) => this.reportError(data))
    this.originErrorLog = proxy.original
    this.errorProxy = proxy.wrapped
    this.originOnError = window.onerror
    this.wrappedOnError = this.onWindowError
    window.onerror = this.onWindowError
    this.onUncaughtError()
    this.onUnhandleRejectionError()
  }

  public reportError(error: NormalizedError, sourceUrl?: string) {
    if (shouldIgnoreError(error, this.options, sourceUrl)) return
    const data = { ...error, page: window.location.href }
    // 白屏检测没有上下文，需要先放到缓存中
    try {
      if (this.ctx) {
        if (isSyntaxError(data)) {
          this.ctx.report?.(COLLECT_ERROR, data, { immediate: true, flush: true })
        } else {
          this.ctx.report?.(COLLECT_ERROR, data)
        }
      } else {
        const record = storageReport(COLLECT_ERROR, data, Date.now())
        writeMemory(record)
      }
    } catch (err) {
      // 错误上报失败不能影响宿主
      console.warn('[@sepveneto/report-core] report error failed: ' + err)
    }
  }

  resetListener() {
    if (console.error === this.errorProxy) {
      console.error = this.originErrorLog
    }
    if (window.onerror === this.wrappedOnError) {
      window.onerror = this.originOnError
    }
    window.removeEventListener('error', this.uncaughtErrorListener)
    window.removeEventListener('unhandledrejection', this.unhandleRejectionErrorListener)
  }

  // 上报重试耗尽后中止错误监听，恢复宿主原本的 console.error
  destroy() {
    this.resetListener()
  }

  public onUncaughtError() {
    window.addEventListener('error', this.uncaughtErrorListener, true)
  }

  public uncaughtErrorListener = (evt: ErrorEvent) => {
    if (evt.target && evt.target !== window) {
      const error = normalizeResourceError(evt)

      this.reportError({
        name: 'ResourceError',
        ...error,
      }, error.url)
    }
  }

  public onWindowError: OnErrorEventHandler = (
    message,
    source,
    lineno,
    colno,
    errorValue,
  ) => {
    let error
    if (errorValue) {
      error = normalizeError(errorValue)
    } else {
      error = normalizeError(message || 'Unknown script error')
    }

    this.reportError({
      name: error.name || 'ErrorEvent',
      message: error.message,
      stack: error.stack,
      extra: {
        filename: source,
        lineno,
        colno,
        rawMessage: typeof message === 'string' ? message : message?.type,
        normalizedExtra: error.extra,
      },
    }, source)

    if (typeof this.originOnError === 'function') {
      return this.originOnError.call(window, message, source, lineno, colno, errorValue)
    }
    return false
  }

  public onUnhandleRejectionError() {
    window.addEventListener('unhandledrejection', this.unhandleRejectionErrorListener)
  }

  public unhandleRejectionErrorListener = (evt: PromiseRejectionEvent) => {
    const error = normalizeError(evt.reason)

    this.reportError({
      name: error.name || 'UnhandleRejection',
      message: error.message,
      stack: error.stack,
      extra: error.extra,
    })
  }
}

function initErrorProxy(reportFn: (...args: any[]) => void) {
  const _tempError = console.error
  const wrapped = function (this: any, ...args: any[]) {
    try {
      const e = normalizeConsoleError(args)

      reportFn({
        name: 'CustomError',
        ...e,
      })
    } catch (e) {
      console.warn(e)
    }
    // 无论上报是否成功，都必须执行宿主原本的 console.error，不能吞掉业务日志；
    // 同时原函数自身的异常也不外泄，避免让业务感知到上报 SDK 的存在
    try {
      _tempError.apply(this, args)
    } catch (e) {
      console.warn(e)
    }
  }
  console.error = wrapped
  return {
    original: _tempError,
    wrapped,
  }
}
