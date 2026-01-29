import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_ERROR } from '@/constant'

export class ErrorPlugin implements BuryReportPlugin {
  public name = 'errorPlugin'
  private ctx?: BuryReport

  public uncaughtErrorListener = (error: string | PromiseRejectionEvent) => {
    let err
    if (typeof error === 'string') {
      const [
        name = 'UnknownError',
        message = 'unknown message',
        stack,
      ] = error?.split('\n') || []
      err = new Error(message)
      err.name = name
      err.stack = stack
      err = normalizeError(err)
    } else if ('reason' in error) {
      // 微信小程序Promise.reject也会被onError收集
      err = normalizeError(error.reason)
    } else {
      err = normalizeError(error)
    }
    this.reportError({
      name: err.name || 'ErrorEvent',
      message: err.message,
      stack: err.stack,
      extra: '',
    })
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

  public reportError(error: { name: string, message: string, stack?: string, extra: any | null }) {
    const data = {
      ...error,
      page: getCurrentPages().map(page => page.route).join('->'),
    }
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
    const _error = normalizeError(error)
    this.reportError({
      name: _error.name || 'UnhandleRejection',
      message: _error.message,
      stack: _error.stack,
      extra: _error.extra,
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
      _tempError.apply(this, args)
    } catch (e) {
      console.warn(e)
    }
  }
  return _tempError
}

function normalizeError(reason: any) {
  if (reason instanceof Error) {
    let extra = null
    try {
      extra = JSON.stringify(reason)
    } catch {
      extra = '[object with circular structre]'
    }
    return {
      name: reason.name,
      message: reason.message || 'Unknown Error',
      stack: reason.stack || '',
      extra,
    }
  } else if (typeof reason === 'string') {
    return {
      message: reason,
      stack: '',
      extra: null,
    }
  } else if (reason == null) {
    return {
      message: 'null or undefined error',
      stack: '',
      extra: null,
    }
  } else if (typeof reason === 'object') {
    let json = ''
    try {
      json = JSON.stringify(reason)
    } catch {
      json = '[object with circular structre]'
    }

    return {
      message: reason.message || reason.msg || '(object error)',
      stack: reason.stack,
      extra: json,
    }
  } else {
    return {
      message: String(reason),
      stack: '',
      extra: null,
    }
  }
}

function normalizeConsoleError(args: any[]) {
  if (!args || args.length === 0) {
    return normalizeError('console.error with no arguments')
  }

  for (const a of args) {
    if (a instanceof Error) return normalizeError(a)
  }

  if (typeof args[0] === 'string') {
    const message = args[0]

    let extra = null
    if (args.length > 1) {
      try {
        extra = JSON.stringify(args.slice(1))
      } catch {
        extra = '[unserializable extra]'
      }
    }

    return {
      message,
      stack: '',
      extra,
    }
  }

  try {
    return normalizeError(args)
  } catch {
    return {
      message: 'console.error unknown structure',
      stack: '',
      extra: null,
    }
  }
}
