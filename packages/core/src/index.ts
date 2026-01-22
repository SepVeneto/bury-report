import { COLLECT_API, REPORT_REQUEST } from './constant'
import type { ReportFn } from './type'
import { storageReport } from './utils'
// @ts-expect-error: ignore
import globalThis from 'core-js/internals/global-this.js'

export function report(...args: any[]) {
  const fn: ReportFn | undefined = globalThis[REPORT_REQUEST]
  const [type, data, immediate] = args || []

  if (typeof type !== 'string') {
    console.warn('[@sepveneto/report-core] the first argument must be a string')
    return
  }

  if (!fn) {
    console.warn('[@sepveneto/report-core] cannot find report function')
    storageReport(type, data)
    return
  }
  if (typeof fn !== 'function') {
    console.warn('[@sepveneto/report-core] the report function is not a function')
    storageReport(type, data)
    return
  }
  fn(type, data, immediate)
}

export function reportNetwork(data: object, immediate?: boolean) {
  const fn: ReportFn | undefined = globalThis[REPORT_REQUEST]

  if (!fn) {
    console.warn('[@sepveneto/report-core] cannot find report function')
    storageReport(COLLECT_API, data)
    return
  }
  if (typeof fn !== 'function') {
    console.warn('[@sepveneto/report-core] the report function is not a function')
    storageReport(COLLECT_API, data)
    return
  }
  fn(COLLECT_API, data, { immediate })
}
