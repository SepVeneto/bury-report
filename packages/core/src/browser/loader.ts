import type { Options } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { isSyntaxError, normalizeConsoleError, normalizeError, normalizeResourceError } from './error-utils'
import { shouldIgnoreError } from './event-filter'
import { reviveOptions } from './options'

type EarlyErrorData = {
  name?: string
  message: string
  stack?: string
  extra?: any
  page?: string
}

type LoaderState = {
  active: boolean
  errors: EarlyErrorData[]
  bytes: number
}

const LOADER_KEY = '__BR_LOADER__'
const MAX_EARLY_ERRORS = 100
const MAX_EARLY_ERROR_BYTES = 128 * 1024
const scope = window as any

function getErrorData(data: Omit<EarlyErrorData, 'page'>): EarlyErrorData {
  return {
    ...data,
    page: window.location.href,
  }
}

function pushEarlyError(state: LoaderState, error: EarlyErrorData) {
  const size = (error.message?.length || 0) + (error.stack?.length || 0) + String(error.extra || '').length
  state.errors.push(error)
  state.bytes += size

  while (state.errors.length > MAX_EARLY_ERRORS || state.bytes > MAX_EARLY_ERROR_BYTES) {
    const dropped = state.errors.shift()
    if (!dropped) break
    state.bytes -= (dropped.message?.length || 0) + (dropped.stack?.length || 0) + String(dropped.extra || '').length
  }
}

function initOptions(options: Options) {
  // loader 与 SDK 解耦：在 SDK 加载前只做轻量错误缓存，SDK 到达后统一回放。
  if (scope[LOADER_KEY]) return
  const state: LoaderState = {
    active: true,
    errors: [],
    bytes: 0,
  }
  scope[LOADER_KEY] = state

  const originalConsoleError = console.error
  const previousOnError = window.onerror

  const onError = (evt: ErrorEvent) => {
    if (!state.active) return

    if (evt.target && evt.target !== window) {
      const resource = normalizeResourceError(evt)
      const error = getErrorData({
        name: 'ResourceError',
        ...resource,
      })
      if (!shouldIgnoreError(error, options, resource.url)) pushEarlyError(state, error)
    }
  }

  const onWindowError = function (
    this: any,
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    errorValue?: Error,
  ) {
    if (!state.active) return false
    const error = normalizeError(errorValue || message || 'Unknown script error')
    const data = getErrorData({
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
    })
    if (!shouldIgnoreError(data, options, source)) pushEarlyError(state, data)
    if (typeof previousOnError === 'function') {
      return previousOnError.call(this, message, source, lineno, colno, errorValue)
    }
    return false
  }

  const onUnhandledRejection = (evt: PromiseRejectionEvent) => {
    if (!state.active) return
    const error = normalizeError(evt.reason)
    const data = getErrorData({
      name: error.name || 'UnhandleRejection',
      message: error.message,
      stack: error.stack,
      extra: error.extra,
    })
    if (!shouldIgnoreError(data, options)) pushEarlyError(state, data)
  }

  const onConsoleError = function (this: any, ...args: any[]) {
    if (state.active) {
      try {
        const data = getErrorData({
          name: 'CustomError',
          ...normalizeConsoleError(args),
        })
        if (!shouldIgnoreError(data, options)) pushEarlyError(state, data)
      } catch (error) {
        console.warn('[@sepveneto/report-core] loader normalize error failed: ' + error)
      }
    }

    try {
      originalConsoleError.apply(this, args)
    } catch (error) {
      console.warn(error)
    }
  }

  window.addEventListener('error', onError, true)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  console.error = onConsoleError
  window.onerror = onWindowError

  const stopEarlyCapture = () => {
    if (!state.active) return
    state.active = false
    window.removeEventListener('error', onError, true)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    if (window.onerror === onWindowError) {
      window.onerror = previousOnError
    }
    if (console.error === onConsoleError) {
      console.error = originalConsoleError
    }
  }

  try {
    loadScript(options.url).then(() => {
      // 在 SDK 初始化前恢复早捕获，避免 ErrorPlugin 包装 loader 的代理形成双重上报。
      stopEarlyCapture()

      if (!('BuryReport' in window)) {
        console.warn('[@sepveneto/report-core] cannot find BuryReport in window, maybe the core script is not loaded correctly')
        return
      }

      let sdk: any
      try {
        sdk = new window.BuryReport(options)
      } catch (error) {
        console.warn('[@sepveneto/report-core] init failed with error', error)
        return
      }

      const report = sdk?.report || window.__BR_REPORT__
      if (typeof report === 'function') {
        state.errors.splice(0).forEach(error => {
          try {
            if (isSyntaxError(error)) {
              report(COLLECT_ERROR, error, { immediate: true, flush: true })
            } else {
              report(COLLECT_ERROR, error)
            }
          } catch (reportError) {
            console.warn('[@sepveneto/report-core] replay loader error failed: ' + reportError)
          }
        })
      }
    }).catch((error) => {
      // 服务器关闭 / 404：SDK 不可用，但宿主不受影响。
      stopEarlyCapture()
      console.warn('[@sepveneto/report-core] core sdk load failed: ' + error)
    })

    if (options.operationRecord?.enable) {
      loadScript(options.url, 'plugins/operationRecord.global.js').then(() => {
        if ('BuryReport' in window && 'OperationRecordPlugin' in window) {
          window.BuryReport.registerPlugin(new window.OperationRecordPlugin())
        }
      }).catch((error) => {
        console.warn('[@sepveneto/report-core] operation record plugin load failed: ' + error)
      })
    }
  } catch (error) {
    stopEarlyCapture()
    console.warn('[@sepveneto/report-core] init failed with error', error)
  }
}

const version = process.env.DEFINE_VERSION

function mountScript(script: HTMLScriptElement) {
  const firstScript = document.scripts?.[0]
  const parent = firstScript?.parentNode || document.head || document.body || document.documentElement
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript)
  } else {
    parent.appendChild(script)
  }
}

function loadScript(reportUrl: string, entry = 'index.global.js') {
  const script = document.createElement('script')
  const [major, minor] = version?.split('.') || []
  const versionPefix = `${major}.${minor}`
  const url = new URL(reportUrl)
  const coreUrl = `${url.origin}/sdk/${versionPefix}/${entry}?v=${version}`
  script.src = process.env.LOG_DEBUG ? `/public/${entry}` : coreUrl
  script.crossOrigin = 'anonymous'
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = globalThis.setTimeout(() => finish(new Error('script load timeout')), 15 * 1000)
    // Node 测试环境允许 unref；浏览器中的 timer 是 number，不受影响
    ;(timeout as any)?.unref?.()

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      script.onload = null
      script.onerror = null
      if (error) reject(error)
      else resolve(undefined)
    }
    script.onload = () => finish()
    script.onerror = () => finish(new Error('script load failed'))
    mountScript(script)
  })
}

// @ts-expect-error: replaced by the build plugin
initOptions(reviveOptions(SDK_OPTIONS))
