import { PERF_INFO } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'

const ONE_SECOND = 1e3
const ONE_MINUTE = 60 * ONE_SECOND
const TIMING_MAXIMUM_DELAY = 10 * ONE_MINUTE
const MAX_FCP_REQUESTS = 200
const MAX_RESOURCE_URL_LENGTH = 1000

const firstHidden = { timestamp: Infinity }
try {
  if (document.visibilityState === 'hidden') {
    firstHidden.timestamp = 0
  } else {
    const cb = (evt: Event) => {
      firstHidden.timestamp = evt.timeStamp
      document.removeEventListener('pagehide', cb)
    }
    document.addEventListener('pagehide', cb)
  }
} catch {
  // 页面生命周期 API 不可用时仍保留 FCP 采集能力
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
  private ctx?: BuryReport
  private observer?: PerformanceObserver
  private finished = false

  init(ctx: BuryReport) {
    this.ctx = ctx
    try {
      document.addEventListener('pagehide', this.onPageHide)
    } catch (err) {
      warn(err)
    }

    try {
      if (supportPerformanceObject()) {
        this.handleEntry(performance)
      }
    } catch (err) {
      warn(err)
    }

    try {
      if (window.PerformanceObserver) {
        this.observer = new PerformanceObserver(list => {
          this.handleEntry(list)
        })
        this.observer.observe({ entryTypes: ['paint'] })
      }
    } catch (err) {
      warn(err)
    }
  }

  private onPageHide = () => {
    try {
      this.collect()
    } catch (err) {
      warn(err)
    }
  }

  private collect() {
    if (!this.finished && this.ctx && supportPerformanceObject()) {
      this.handleEntry(performance)
    }
  }

  handleEntry(entries: PerformanceObserverEntryList) {
    try {
      if (this.finished) return

      const fcpEntry = entries.getEntries().find(entry => {
        return entry.entryType === 'paint' && entry.name === 'first-contentful-paint'
      })

      if (!fcpEntry) return

      this.finished = true
      this.disconnectObserver()

      if (fcpEntry.startTime >= firstHidden.timestamp || fcpEntry.startTime >= TIMING_MAXIMUM_DELAY) {
        return
      }

      const threshold = normalizeFcpThreshold(this.ctx?.options.fcpThreshold)
      if (!isNumber(fcpEntry.startTime)) return

      const fcp = formatTime(fcpEntry.startTime)
      // FCP 每个会话都上报；只有慢 FCP 才继续采集请求时间轴。
      const resourceInfo = fcpEntry.startTime > threshold
        ? collectResourceTimings(fcpEntry.startTime)
        : { count: 0, resources: [] }
      this.ctx?.report?.(PERF_INFO, {
        fcp,
        if: isInIframe(),
        stamp: this.ctx?.options.stamp || '',
        ...(resourceInfo.resources.length
          ? {
              resourceCount: resourceInfo.count,
              resources: resourceInfo.resources,
            }
          : {}),
      })
    } catch (err) {
      warn(err)
    }
  }

  // 上报重试耗尽后不再观察性能条目
  destroy() {
    this.finished = true
    try {
      document.removeEventListener('pagehide', this.onPageHide)
      this.disconnectObserver()
    } catch (err) {
      warn(err)
    }
  }

  private disconnectObserver() {
    try {
      this.observer?.disconnect()
    } catch (err) {
      warn(err)
    } finally {
      this.observer = undefined
    }
  }
}

type ResourceTimingInfo = {
  url: string
  type: string
  startTime: number
  responseEnd: number
  responseTime: number
  duration: number
}

function normalizeFcpThreshold(value: unknown) {
  try {
    const threshold = Number(value)
    return Number.isFinite(threshold) && threshold > 0 ? threshold : 0
  } catch {
    return 0
  }
}

function collectResourceTimings(fcpStartTime: number) {
  const resources: ResourceTimingInfo[] = []
  let count = 0

  try {
    const entries = typeof performance.getEntriesByType === 'function'
      ? performance.getEntriesByType('resource')
      : performance.getEntries().filter(entry => entry.entryType === 'resource')
    for (const entry of entries) {
      try {
        const resource = toResourceTiming(entry as PerformanceResourceTiming, fcpStartTime)
        if (!resource) continue
        count++
        if (resources.length < MAX_FCP_REQUESTS) {
          resources.push(resource)
        }
      } catch {
        // 单条 Resource Timing 异常不影响其余资源和 FCP 上报
      }
    }
  } catch (err) {
    warn(err)
  }

  return { count, resources }
}

function toResourceTiming(
  entry: PerformanceResourceTiming,
  fcpStartTime: number,
): ResourceTimingInfo | undefined {
  const type = String(entry.initiatorType || '')

  const startTime = finiteNumber(entry.startTime, 0)
  const duration = finiteNumber(entry.duration, 0)
  const responseEnd = finiteNumber(entry.responseEnd, startTime + duration)
  if (responseEnd <= 0) return undefined
  if (responseEnd > fcpStartTime) return undefined

  const requestStart = finiteNumber(entry.requestStart, startTime)
  return {
    url: String(entry.name || '').slice(0, MAX_RESOURCE_URL_LENGTH),
    type: type || 'other',
    startTime: round(startTime, 0),
    responseEnd: round(responseEnd, 0),
    responseTime: Math.max(0, round(responseEnd - requestStart, 0)),
    duration: Math.max(0, round(duration || responseEnd - startTime, 0)),
  }
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback
}

function warn(err: unknown) {
  try {
    console.warn('[@sepveneto/report-core] collect performance failed: ' + err)
  } catch {
    // 宿主覆盖 console.warn 时同样不能影响业务
  }
}

function supportPerformanceObject() {
  try {
    return !!window.performance && typeof performance.getEntries === 'function'
  } catch {
    return false
  }
}

function isInIframe() {
  try {
    const isIframe = window.self !== window.top
    if (isIframe) {
      return document.referrer || location.ancestorOrigins
    } else {
      return false
    }
  } catch {
    return true
  }
}
