import { REPORT_REQUEST } from "./constant";
import { ReportFn } from "./type";
import { storageReport } from "./utils";

export function report(...args: any[]) {
  const fn: ReportFn | undefined  = globalThis[REPORT_REQUEST]
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
