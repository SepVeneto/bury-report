import { PERF_INFO } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'

const ONE_SECOND = 1e3
const ONE_MINUTE = 60 * ONE_SECOND
const TIMING_MAXIMUM_DELAY = 10 * ONE_MINUTE

let firstHidden: { timestamp: number }
if (document.visibilityState === 'hidden') {
  firstHidden = { timestamp: 0 }
} else {
  firstHidden = { timestamp: Infinity }
  const cb = (evt: Event) => {
    firstHidden.timestamp = evt.timeStamp
    document.removeEventListener('pagehide', cb)
  }
  document.addEventListener('pagehide', cb)
}

function isNumber(value: any) {
  return typeof value === 'number'
}

function formatTime(time: any) {
  if (!isNumber(time)) {
    return time
  }
  return round(time * 1e3, 0)
}
function round(num: number, decimals: number) {
  return +num.toFixed(decimals)
}

export class PerfPlugin implements BuryReportPlugin {
  public name = 'paintPlugin'

  init(ctx: BuryReport) {
    if (supportPerformanceObject()) {
      const fcpEntry = window.performance.getEntries().find(entry => {
        return entry.entryType === 'paint' && entry.name === 'first-contentful-paint'
      })

      if (fcpEntry && fcpEntry.startTime < firstHidden.timestamp && fcpEntry.startTime < TIMING_MAXIMUM_DELAY) {
        ctx.report?.(PERF_INFO, { fcp: formatTime(fcpEntry.startTime) }, true)
      }
    }
  }
}

function supportPerformanceObject() {
  return window.performance && 'getEntries' in performance
}
