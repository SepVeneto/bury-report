import { Router } from '@oak/oak'
import { RecordApi, RecordError, RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";

const router = new Router()

router.get('/record/logs', async (ctx) => {
  const record = new RecordLog(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, data, type, session, start_time, end_time } = query

  const filter = new Filter()
  filter.equal('session', session)
  filter.equal('uuid', uuid)
  filter.like('type', type)
  filter.like('data', data)
  filter.rangeTime('create_time', start_time, end_time)
  filter.custom('type', { $nin: ["__BR_COLLECT_INFO__", "__BR_TRACK_EVENT__"] })

  // if (data) {
  //   filter.model.$and?.push({
  //     data: { $regex: data }
  //   })
  // }

  const res = await record.pagination(
    Number(page),
    Number(size),
    { filter, count: false },
  )
  res.list.forEach(item => {
    if (item.type === '__BR_PERF_INFO__' && item.data) {
      item.data = {
        fcp: item.data.fcp,
        fcpMs: item.data.fcpMs,
      }
    }
  })
  ctx.resBody = res
})

router.get('/record/errors', async (ctx) => {
  const record = new RecordError(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { start_time, end_time, uuid, session, fingerprint } = query
  const filter = new Filter()
  filter.equal('fingerprint', fingerprint)
  filter.equal('uuid', uuid)
  filter.rangeTime('create_time', start_time, end_time)
  filter.equal('session', session)
  const res = await record.pagination(
    Number(page),
    Number(size),
    { filter, count: false }
  )
  ctx.resBody = res
})

router.get('/record/networks', async (ctx) => {
  const record = new RecordApi(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const {
    uuid,
    start_time,
    end_time,
    payload,
    response,
    send_page,
    status,
    url,
    session,
    start_stamp,
    end_stamp,
    full,
  } = query
  const filter = new Filter()
  filter.equal('uuid', uuid)
  filter.like('data.body', payload)
  filter.like('data.url', url)
  filter.like('data.response', response)
  filter.like('data.page', send_page)
  filter.equal('data.status', Number(status))
  filter.rangeTime('create_time', start_time, end_time)
  filter.rangeNumber('stamp', start_stamp, end_stamp)
  filter.equal('session', session)

  const res = await record.pagination(
    Number(page),
    Number(size),
    { filter, count: false },
  )
  if (!full) {
    res.list.forEach(item => {
      // @ts-expect-error: ignore
      delete item.data.response
      // @ts-expect-error: ignore
      delete item.data.body
      // @ts-expect-error: ignore
      delete item.data.responseHeaders
      // @ts-expect-error: ignore
      delete item.data.profile
    })
  }
  ctx.resBody = res
})

router.get('/record/networks/:id', async (ctx) => {
  const record = new RecordApi(ctx.db)
  const id = ctx.params.id
  const res = await record.findById(id)
  ctx.resBody = res
})

router.get('/record/fcp/:id', async (ctx) => {
  const record = new RecordLog(ctx.db)
  const res = await record.findById(ctx.params.id)
  if (!res || res.type !== '__BR_PERF_INFO__' || res.is_delete === true) {
    ctx.resCode = 1
    ctx.resMsg = 'PERF_INFO 不存在'
    return
  }
  const sample = toFcpSample(res as FcpAnalysisDocument)
  if (!sample) {
    ctx.resCode = 1
    ctx.resMsg = 'PERF_INFO 数据无效'
    return
  }
  ctx.resBody = toTimelineSample(sample)
})

router.get('/record/fcp-analysis', async (ctx) => {
  const { start_time, end_time, threshold } = ctx.request.query
  const now = Date.now()
  const start = parseDate(start_time, new Date(now - 7 * 24 * 60 * 60 * 1000))
  const end = parseDate(end_time, new Date(now))
  const slowThreshold = normalizeNumber(threshold, 2500)
  const match = {
    type: '__BR_PERF_INFO__',
    is_delete: { $ne: true },
    create_time: {
      $gte: start,
      $lte: end,
    },
  }
  const logs = ctx.db.collection('records_log')
  const [docs, totalInWindow] = await Promise.all([
    logs.find(match, {
      projection: {
        _id: 1,
        create_time: 1,
        uuid: 1,
        session: 1,
        data: 1,
      },
    })
      .sort({ create_time: -1 })
      .limit(MAX_FCP_ANALYSIS_RECORDS)
      .toArray(),
    logs.countDocuments(match),
  ])

  ctx.resBody = buildFcpAnalysis(docs as FcpAnalysisDocument[], {
    slowThreshold,
    totalInWindow,
    start,
    end,
  })
})

const MAX_FCP_ANALYSIS_RECORDS = 5000
const FCP_DISTRIBUTION = [
  { label: '< 1s', min: 0, max: 1000 },
  { label: '1 - 2s', min: 1000, max: 2000 },
  { label: '2 - 3s', min: 2000, max: 3000 },
  { label: '3 - 5s', min: 3000, max: 5000 },
  { label: '≥ 5s', min: 5000, max: Infinity },
]

type FcpResourceSample = {
  url: string
  type: string
  startTime: number
  responseEnd: number
  responseTime: number
  duration: number
}

type FcpSample = {
  id: string
  create_time: string
  uuid?: string
  session?: string
  fcp: number
  resourceCount: number
  resources: FcpResourceSample[]
}

type FcpAnalysisOptions = {
  slowThreshold: number
  totalInWindow: number
  start: Date
  end: Date
}

type FcpAnalysisDocument = {
  _id?: unknown
  create_time?: unknown
  uuid?: string
  session?: string
  data?: {
    fcp?: unknown
    fcpMs?: unknown
    resourceCount?: unknown
    resources?: unknown
  }
}

export function buildFcpAnalysis(docs: FcpAnalysisDocument[], options: FcpAnalysisOptions) {
  const samples = docs
    .map(toFcpSample)
    .filter((item): item is FcpSample => !!item)
    .sort((a, b) => b.fcp - a.fcp)
  const fcpValues = samples.map(item => item.fcp).sort((a, b) => a - b)
  const slowSamples = samples.filter(item => item.fcp > options.slowThreshold)
  const resourceMap = new Map<string, {
    url: string
    type: string
    count: number
    responseTimeSum: number
    durationSum: number
    maxDuration: number
    fcpSum: number
    slowCount: number
  }>()

  let samplesWithResources = 0
  samples.forEach(sample => {
    if (!sample.resources.length) return
    samplesWithResources++
    sample.resources.forEach(resource => {
      const url = normalizeResourceUrl(resource.url)
      if (!url) return
      const key = `${resource.type}|${url}`
      const item = resourceMap.get(key) || {
        url,
        type: resource.type || 'other',
        count: 0,
        responseTimeSum: 0,
        durationSum: 0,
        maxDuration: 0,
        fcpSum: 0,
        slowCount: 0,
      }
      item.count++
      item.responseTimeSum += resource.responseTime
      item.durationSum += resource.duration
      item.maxDuration = Math.max(item.maxDuration, resource.duration)
      item.fcpSum += sample.fcp
      if (sample.fcp > options.slowThreshold) item.slowCount++
      resourceMap.set(key, item)
    })
  })

  const resources = [...resourceMap.values()]
    .map(item => ({
      url: item.url,
      type: item.type,
      count: item.count,
      averageResponseTime: round(item.responseTimeSum / item.count),
      averageDuration: round(item.durationSum / item.count),
      maxDuration: round(item.maxDuration),
      averageFcp: round(item.fcpSum / item.count),
      slowCount: item.slowCount,
      slowRate: percent(item.slowCount, item.count),
    }))
    .sort((a, b) => b.averageDuration - a.averageDuration || b.count - a.count)
    .slice(0, 30)

  const trendMap = new Map<string, number[]>()
  samples.forEach(item => {
    const date = formatAnalysisDate(item.create_time)
    const values = trendMap.get(date) || []
    values.push(item.fcp)
    trendMap.set(date, values)
  })
  const trend = [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      count: values.length,
      average: round(average(values)),
      p75: round(percentile(values, 0.75)),
      slowRate: percent(values.filter(value => value > options.slowThreshold).length, values.length),
    }))

  const distribution = FCP_DISTRIBUTION.map(bucket => ({
    label: bucket.label,
    count: fcpValues.filter(value => value >= bucket.min && value < bucket.max).length,
  }))

  return {
    range: {
      start: options.start.toISOString(),
      end: options.end.toISOString(),
    },
    sampleLimit: MAX_FCP_ANALYSIS_RECORDS,
    sampled: options.totalInWindow > MAX_FCP_ANALYSIS_RECORDS,
    summary: {
      total: samples.length,
      totalInWindow: options.totalInWindow,
      average: round(average(fcpValues)),
      p50: round(percentile(fcpValues, 0.5)),
      p75: round(percentile(fcpValues, 0.75)),
      p90: round(percentile(fcpValues, 0.9)),
      p95: round(percentile(fcpValues, 0.95)),
      max: round(fcpValues.at(-1) || 0),
      slowThreshold: options.slowThreshold,
      slowCount: slowSamples.length,
      slowRate: percent(slowSamples.length, samples.length),
      resourceCoverage: percent(samplesWithResources, samples.length),
    },
    trend,
    distribution,
    resources,
    recentSamples: samples.slice(0, 20).map(toTimelineSample),
    recentSlow: slowSamples.slice(0, 20).map(toTimelineSample),
  }
}

function toTimelineSample(item: FcpSample) {
  return {
    id: item.id,
    create_time: item.create_time,
    uuid: item.uuid,
    session: item.session,
    fcp: round(item.fcp),
    resourceCount: item.resourceCount,
    requests: [...item.resources].sort((a, b) => a.startTime - b.startTime),
    topResources: [...item.resources]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3),
  }
}

function toFcpSample(doc: FcpAnalysisDocument): FcpSample | undefined {
  const data = doc?.data
  if (!data || typeof data !== 'object') return
  const fcpMs = Number(data.fcpMs)
  const legacyFcp = Number(data.fcp)
  // 旧版 SDK 将 PerformanceEntry.startTime（毫秒）再次乘以 1000 后上报。
  const fcp = Number.isFinite(fcpMs) && fcpMs > 0
    ? fcpMs
    : Number.isFinite(legacyFcp) && legacyFcp > 0
      ? legacyFcp / 1000
      : 0
  if (!fcp) return

  const resources = Array.isArray(data.resources)
    ? data.resources
      .map((item: unknown) => {
        const resource = item && typeof item === 'object'
          ? item as Record<string, unknown>
          : {}
        const startTime = normalizeNumber(resource.startTime, 0)
        const duration = normalizeNumber(resource.duration, 0)
        return {
          url: String(resource.url || ''),
          type: String(resource.type || 'other'),
          startTime,
          responseEnd: normalizeNumber(resource.responseEnd, startTime + duration),
          responseTime: normalizeNumber(resource.responseTime, 0),
          duration,
        }
      })
      // 线上历史数据可能包含后来扩展的全量请求，这里统一收紧为 FCP 前完成。
      .filter(item => !!item.url && item.responseEnd <= fcp)
    : []

  return {
    id: String(doc._id || ''),
    create_time: normalizeDateValue(doc.create_time),
    uuid: doc.uuid,
    session: doc.session,
    fcp,
    resourceCount: resources.length,
    resources,
  }
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percent(value: number, total: number) {
  return total ? round(value / total * 100) : 0
}

function round(value: number, digits = 1) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function normalizeNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function parseDate(value: unknown, fallback: Date) {
  if (typeof value !== 'string' || !value) return fallback
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function normalizeDateValue(value: unknown) {
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function formatAnalysisDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function normalizeResourceUrl(value: string) {
  try {
    const url = new URL(value, 'http://local')
    return `${url.origin === 'http://local' ? '' : url.origin}${url.pathname}`
  } catch {
    return value.split('#')[0].split('?')[0]
  }
}

export default router
