import type { Options } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { normalizeConsoleError, normalizeError, normalizeResourceError } from './error-utils'

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
}

const LOADER_KEY = '__BR_LOADER__'
const scope = window as any

function getErrorData(data: Omit<EarlyErrorData, 'page'>): EarlyErrorData {
  return {
    ...data,
    page: window.location.href,
  }
}

function initOptions(options: Options) {
  // loader 与 SDK 解耦：在 SDK 加载前只做轻量错误缓存，SDK 到达后统一回放。
  if (scope[LOADER_KEY]) return
  const state: LoaderState = {
    active: true,
    errors: [],
  }
  scope[LOADER_KEY] = state

  const originalConsoleError = console.error

  const onError = (evt: ErrorEvent) => {
    if (!state.active) return

    if (evt.target && evt.target !== window) {
      state.errors.push(getErrorData({
        name: 'ResourceError',
        ...normalizeResourceError(evt),
      }))
      return
    }

    const error = normalizeError(evt.error || evt.message || 'Unknown script error')
    state.errors.push(getErrorData({
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
    }))
  }

  const onUnhandledRejection = (evt: PromiseRejectionEvent) => {
    if (!state.active) return
    const error = normalizeError(evt.reason)
    state.errors.push(getErrorData({
      name: error.name || 'UnhandleRejection',
      message: error.message,
      stack: error.stack,
      extra: error.extra,
    }))
  }

  const onConsoleError = function (this: any, ...args: any[]) {
    if (state.active) {
      try {
        state.errors.push(getErrorData({
          name: 'CustomError',
          ...normalizeConsoleError(args),
        }))
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

  const stopEarlyCapture = () => {
    if (!state.active) return
    state.active = false
    window.removeEventListener('error', onError, true)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
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
            report(COLLECT_ERROR, error)
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
    script.onload = resolve
    script.onerror = reject
    mountScript(script)
  })
}

// @ts-expect-error: replaced by the build plugin
initOptions(SDK_OPTIONS)
