import { COLLECT_ERROR } from '@/utils/constant'
import { initErrorProxy } from './error'
import { report } from '@/index'

function reportContent(error: { name: string, message: string, stack?: string }) {
  report(COLLECT_ERROR, { ...error, page: window.location.href }, true)
}

export function __BR_ERROR_INIT__() {
  initErrorProxy(reportContent)

  window.addEventListener('error', (evt?: ErrorEvent) => {
    if (!evt) return

    if (evt.target instanceof HTMLElement) {
      if (evt.target instanceof HTMLScriptElement) {
        reportContent({
          name: 'JsLoadFail',
          message: evt.target.src,
          stack: evt.target.baseURI,
        })
      }
      if (evt.target instanceof HTMLLinkElement) {
        reportContent({
          name: 'CssLoadFail',
          message: evt.target.href,
          stack: evt.target.baseURI,
        })
      }
    } else {
      reportContent({
        name: evt.error?.name || 'unknown',
        message: evt.error?.message || evt.message,
        stack: evt.error?.stack || `${evt.filename}:${evt.lineno},${evt.colno}`,
      })
    }
  }, true)
}
