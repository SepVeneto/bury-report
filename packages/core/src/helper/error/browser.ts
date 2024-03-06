import { COLLECT_ERROR } from '@/utils/constant'
import { initErrorProxy } from './error'
import { report } from '@/index'

function reportContent(error: { name: string, message: string, stack?: string }) {
  report(COLLECT_ERROR, { ...error, page: window.location.href })
}

export function __BR_ERROR_INIT__() {
  initErrorProxy(reportContent)
}
