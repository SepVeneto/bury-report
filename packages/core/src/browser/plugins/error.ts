import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { storageReport } from '@/utils'

type ResourceElemnt =
  HTMLScriptElement |
  HTMLLinkElement |
  HTMLImageElement |
  HTMLVideoElement |
  HTMLAudioElement |
  HTMLSourceElement

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
    if (this.ctx) {
      this.ctx.report?.(COLLECT_ERROR, data)
    } else {
      storageReport(COLLECT_ERROR, data)
    }
  }

  resetListener() {
    console.error = this.originErrorLog
    window.removeEventListener('error', this.uncaughtErrorListener)
    window.removeEventListener('unhandledrejection', this.unhandleRejectionErrorListener)
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
      name: 'ErrorEvent',
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
      name: 'UnhandleRejection',
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
      _tempError.apply(this, args)
    } catch (e) {
      console.warn(e)
    }
  }
  return _tempError
}

function normalizeResourceError(evt: Event) {
  const target = evt.target as ResourceElemnt || evt.srcElement

  if (!target) {
    return {
      message: 'Resource load error: unknown target',
      stack: '',
      extra: null,
    }
  }

  const tag = target.tagName.toLowerCase()
  let url = ''
  // @ts-expect-error: ignore
  if (target.src) url = target.src
  // @ts-expect-error: ignore
  if (target.href) url = target.href

  return {
    message: `Resource load error: <${tag}>${url || '(no url)'}`,
    stack: '',
    extra: {
      tag,
      url,
      outerHTML: target.outerHTML.slice(0, 500),
    },
  }
}

function normalizeError(reason: any) {
  if (reason instanceof Error) {
    return {
      message: reason.message || 'Unknown Error',
      stack: reason.stack || '',
      extra: null,
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
    console.log('foo')

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
