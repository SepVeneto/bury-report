import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { storageReport, writeMemory } from '@/utils'
import { normalizeConsoleError, normalizeError, normalizeResourceError } from '../error-utils'

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
    this.onUnhandleRejectionError()
  }

  public reportError(error: { name: string, message: string, stack?: string, extra: any | null }) {
    const data = { ...error, page: window.location.href }
    // 白屏检测没有上下文，需要先放到缓存中
    try {
      if (this.ctx) {
        this.ctx.report?.(COLLECT_ERROR, data)
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
    console.error = this.originErrorLog
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
      })
      return
    }

    let error
    if (evt.error) {
      error = normalizeError(evt.error)
    } else {
      error = normalizeError(evt.message || 'Unknown script error')
    }

    this.reportError({
      name: error.name || 'ErrorEvent',
      message: error.message,
      stack: error.stack,
      extra: {
        filename: evt.filename,
        lineno: evt.lineno,
        colno: evt.colno,
        rawMessage: evt.message,
        normalizedExtra: error.extra,
      },
    })
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
  console.error = function (...args) {
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
  return _tempError
}
