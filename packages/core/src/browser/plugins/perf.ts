import { PERF_INFO } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import type { Metric } from 'web-vitals'

const PERF_SCHEMA_VERSION = 2
const TIMING_MAXIMUM_DELAY = 10 * 60 * 1000
const MAX_PERF_RESOURCES = 200
const MAX_RESOURCES_PER_PHASE = MAX_PERF_RESOURCES / 2
const MAX_RESOURCE_URL_LENGTH = 1000

type PerfMetricName = 'fcp' | 'lcp' | 'inp' | 'ttfb'
type ResourcePhase = 'before-fcp' | 'after-fcp' | 'unknown'

type CapturedMetric = {
  value: number
  rating: Metric['rating']
  id: string
  navigationType: Metric['navigationType']
}

export class PerfPlugin implements BuryReportPlugin {
  public name = 'paintPlugin'
  private ctx?: BuryReport
  private observer?: PerformanceObserver
  private reported = false
  private collectResources = false
  private metrics: Partial<Record<PerfMetricName, CapturedMetric>> = {}
  private resourceEntries = new Map<string, PerformanceResourceTiming>()

  init(ctx: BuryReport) {
    this.ctx = ctx
    this.observeResources()
    this.observeWebVitals()

    try {
      document.addEventListener('visibilitychange', this.onVisibilityChange)
      document.addEventListener('pagehide', this.onPageHide)
    } catch (err) {
      warn(err)
    }
  }

  private onVisibilityChange = () => {
    try {
      if (document.visibilityState === 'hidden') {
        this.report()
      }
    } catch (err) {
      warn(err)
    }
  }

  private onPageHide = () => {
    try {
      this.report()
    } catch (err) {
      warn(err)
    }
  }

  private observeWebVitals() {
    observeMetric(onFCP, metric => this.rememberMetric('fcp', metric))
    observeMetric(onLCP, metric => this.rememberMetric('lcp', metric))
    observeMetric(onINP, metric => this.rememberMetric('inp', metric))
    observeMetric(onTTFB, metric => this.rememberMetric('ttfb', metric))
  }

  private observeResources() {
    try {
      if (!supportPerformanceObject()) return
      this.rememberResourceEntries(performance.getEntries())
    } catch (err) {
      warn(err)
    }

    try {
      if (!window.PerformanceObserver) return
      this.observer = new PerformanceObserver(list => {
        try {
          this.rememberResourceEntries(list.getEntries())
        } catch (err) {
          warn(err)
        }
      })
      try {
        this.observer.observe({ type: 'resource', buffered: true })
      } catch {
        this.observer.observe({ entryTypes: ['resource'] })
      }
    } catch (err) {
      warn(err)
    }
  }

  private rememberMetric(name: PerfMetricName, metric: Metric) {
    if (this.reported || !isNumber(metric.value) || metric.value < 0) return
    if (name === 'fcp' && (metric.value === 0 || metric.value >= TIMING_MAXIMUM_DELAY)) return
    if (name === 'fcp') {
      const threshold = normalizeFcpThreshold(this.ctx?.options.fcpThreshold)
      this.collectResources = metric.value > threshold
      if (!this.collectResources) {
        this.resourceEntries.clear()
        this.disconnectObserver()
      }
    }
    this.metrics[name] = {
      value: round(metric.value, 1),
      rating: metric.rating,
      id: String(metric.id || ''),
      navigationType: metric.navigationType,
    }
  }

  private report() {
    if (this.reported || !this.ctx) return
    this.reported = true
    this.disconnectObserver()

    const fcp = this.metrics.fcp?.value
    const resourceInfo = this.collectResources && fcp !== undefined
      ? collectResourceTimings(fcp, this.resourceEntries)
      : { count: 0, resources: [] } as any
    const ratings: Record<string, Metric['rating']> = {}
    const metricIds: Record<string, string> = {}
    for (const [name, metric] of Object.entries(this.metrics)) {
      if (!metric) continue
      ratings[name] = metric.rating
      metricIds[name] = metric.id
    }
    const navigationType = this.metrics.fcp?.navigationType ||
      this.metrics.lcp?.navigationType ||
      this.metrics.inp?.navigationType ||
      this.metrics.ttfb?.navigationType

    this.ctx.report?.(PERF_INFO, {
      perfVersion: PERF_SCHEMA_VERSION,
      fcp: this.metrics.fcp?.value ?? null,
      lcp: this.metrics.lcp?.value ?? null,
      inp: this.metrics.inp?.value ?? null,
      ttfb: this.metrics.ttfb?.value ?? null,
      ratings,
      metricIds,
      ...(navigationType ? { navigationType } : {}),
      if: isInIframe(),
      stamp: this.ctx.options.stamp || '',
      ...(resourceInfo.resources.length
        ? {
            resourceCount: resourceInfo.count,
            resourcesBeforeFcp: resourceInfo.beforeFcpCount,
            resourcesAfterFcp: resourceInfo.afterFcpCount,
            resourcesCompletedBeforeFcp: resourceInfo.completedBeforeFcpCount,
            resourcesCompletedAfterFcp: resourceInfo.completedAfterFcpCount,
            resources: resourceInfo.resources,
          }
        : {}),
    }, {
      immediate: true,
      flush: true,
      keepalive: true,
    })
  }

  // 上报重试耗尽后不再观察性能条目
  destroy() {
    this.reported = true
    try {
      document.removeEventListener('visibilitychange', this.onVisibilityChange)
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

  private rememberResourceEntries(entries: PerformanceEntry[]) {
    for (const entry of entries) {
      if (entry.entryType !== 'resource') continue
      const resource = entry as PerformanceResourceTiming
      this.resourceEntries.set(resourceEntryKey(resource), resource)
    }
  }
}

type ResourceTimingInfo = {
  url: string
  type: string
  phase: ResourcePhase
  responsePhase: ResourcePhase
  startTime: number
  responseEnd: number
  responseTime: number | null
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

function collectResourceTimings(
  fcpStartTime: number | undefined,
  rememberedEntries: Map<string, PerformanceResourceTiming>,
) {
  const resourceEntries = new Map(rememberedEntries)
  let beforeFcpCount = 0
  let afterFcpCount = 0
  let completedBeforeFcpCount = 0
  let completedAfterFcpCount = 0

  try {
    const entries = typeof performance.getEntriesByType === 'function'
      ? performance.getEntriesByType('resource')
      : performance.getEntries().filter(entry => entry.entryType === 'resource')
    for (const entry of entries as PerformanceResourceTiming[]) {
      resourceEntries.set(resourceEntryKey(entry), entry)
    }
  } catch (err) {
    warn(err)
  }

  const resources: ResourceTimingInfo[] = []
  for (const entry of resourceEntries.values()) {
    try {
      const resource = toResourceTiming(entry, fcpStartTime)
      if (!resource) continue
      resources.push(resource)
      if (resource.phase === 'before-fcp') beforeFcpCount++
      if (resource.phase === 'after-fcp') afterFcpCount++
      if (resource.responsePhase === 'before-fcp') completedBeforeFcpCount++
      if (resource.responsePhase === 'after-fcp') completedAfterFcpCount++
    } catch {
      // 单条 Resource Timing 异常不影响其余指标和资源上报
    }
  }

  resources.sort((a, b) => a.startTime - b.startTime)
  return {
    count: resources.length,
    beforeFcpCount,
    afterFcpCount,
    completedBeforeFcpCount,
    completedAfterFcpCount,
    resources: limitResources(resources),
  }
}

function limitResources(resources: ResourceTimingInfo[]) {
  if (resources.length <= MAX_PERF_RESOURCES) return resources

  const beforeFcp = resources.filter(item => item.phase === 'before-fcp')
    .slice(-MAX_RESOURCES_PER_PHASE)
  const afterFcp = resources.filter(item => item.phase === 'after-fcp')
    .slice(0, MAX_RESOURCES_PER_PHASE)
  const selected = beforeFcp.length || afterFcp.length
    ? [...beforeFcp, ...afterFcp]
    : resources.slice(0, MAX_PERF_RESOURCES)
  return selected.sort((a, b) => a.startTime - b.startTime)
}

function resourceEntryKey(entry: PerformanceResourceTiming) {
  return [
    String(entry.name || ''),
    finiteNumber(entry.startTime, 0),
    finiteNumber(entry.responseEnd, 0),
  ].join('|')
}

function toResourceTiming(
  entry: PerformanceResourceTiming,
  fcpStartTime: number | undefined,
): ResourceTimingInfo | undefined {
  const type = String(entry.initiatorType || '')
  const startTime = finiteNumber(entry.startTime, finiteNumber(entry.fetchStart, 0))
  const duration = finiteNumber(entry.duration, 0)
  const responseEnd = finiteNumber(entry.responseEnd, 0) || startTime + duration
  const requestStart = finiteNumber(entry.requestStart, 0)
  const phase: ResourcePhase = fcpStartTime === undefined
    ? 'unknown'
    : startTime <= fcpStartTime
      ? 'before-fcp'
      : 'after-fcp'
  const responsePhase: ResourcePhase = fcpStartTime === undefined
    ? 'unknown'
    : responseEnd <= fcpStartTime
      ? 'before-fcp'
      : 'after-fcp'

  return {
    url: String(entry.name || '').slice(0, MAX_RESOURCE_URL_LENGTH),
    type: type || 'other',
    phase,
    responsePhase,
    startTime: round(startTime, 0),
    responseEnd: round(responseEnd, 0),

    // 跨域且没有 TAO 授权时，计时细节会被浏览器归零，无法准确计算。
    responseTime: requestStart > 0
      ? Math.max(0, round(responseEnd - requestStart, 0))
      : null,

    duration: Math.max(
      0,
      round(duration || responseEnd - startTime, 0),
    ),
  }
}

function observeMetric(
  register: (callback: (metric: Metric) => void) => void,
  callback: (metric: Metric) => void,
) {
  try {
    register(callback)
  } catch (err) {
    warn(err)
  }
}

function isNumber(value: any) {
  return typeof value === 'number' && Number.isFinite(value)
}

function round(num: number, decimals: number) {
  return +num.toFixed(decimals)
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
