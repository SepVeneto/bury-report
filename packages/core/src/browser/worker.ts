import { COLLECT_API, OPERATION_TRACK } from '@/constant'
import {
  MAX_KEEPALIVE_BYTES,
  estimateSize,
  normalizeMaxRetry,
  splitBySize,
} from '@/utils'
import pako from 'pako'
import {
  MAX_TRACK_SPOOL_BATCHES,
  MAX_TRACK_SPOOL_BYTES,
  appendTrackSpool,
  createSpoolNamespace,
  loadTrackSpool,
  removeTrackSpool,
} from './spool'
import type { TrackSpoolMeta } from './spool'

const RETRY_DELAY = 10 * 1000
const MAX_RETRY_DELAY = 5 * 60 * 1000
// 单条 track 消息（gzip 后）的目标上限。
const MAX_TRACK_MESSAGE_BYTES = 1 * 1024 * 1024
const TRACK_COMPRESS_RATIO = 8

type Batch = {
  id?: number
  spoolKey?: string
  appid: string
  url: string
  sessionid?: string
  deviceid?: string
  data: any[]
  keepalive: boolean
}

const queue: Batch[] = []
let active: Batch | undefined
let retryTimer: any
let failStreak = 0
let maxRetry = normalizeMaxRetry(undefined)
const stopped = false
let spoolSequence = 0
let spoolNamespace: string | undefined
let spoolReady: Promise<void> | undefined

/**
 * 把一批 track 记录按估算体积切成多条消息。
 * 单条记录自身超预算时仍会单独成组，交给服务端兜底拆分。
 */
export function packTrackPayloads(
  records: any[],
  maxBytes = MAX_TRACK_MESSAGE_BYTES,
): any[][] {
  if (!records.length) return []
  const budget = maxBytes * TRACK_COMPRESS_RATIO
  const chunks: any[][] = []
  let current: any[] = []
  let size = 0
  for (const record of records) {
    const itemSize = estimateSize(record)
    if (current.length && size + itemSize > budget) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(record)
    size += itemSize
  }
  if (current.length) chunks.push(current)
  return chunks
}

self.onmessage = (evt) => {
  handleMessage(evt.data).catch(err => {
    console.warn('[@sepveneto/report-core] enqueue report failed: ' + err)
  })
}

async function handleMessage(message: any) {
  if (message?.type === 'drain') {
    clearTimeout(retryTimer)
    retryTimer = undefined
    failStreak = 0
    drainQueue()
    return
  }
  if (message?.type !== 'report') {
    console.warn('[@sepveneto/report-core] invalid event type: ' + message?.type)
    return
  }
  if (message.maxRetry != null) maxRetry = normalizeMaxRetry(message.maxRetry)

  if (!Array.isArray(message.store)) {
    console.warn('[@sepveneto/report-core] malformed report payload')
    return
  }
  const records = message.store
  if (!records.length) return

  const batch: Batch = {
    id: message.id,
    appid: message.appid,
    url: message.url || '',
    sessionid: message.sessionid,
    deviceid: message.deviceid,
    data: records.slice().sort((a: any, b: any) => a.stamp - b.stamp),
    keepalive: !!message.keepalive,
  }
  await ensureSpool(batch)
  await enqueueBatch(batch)
}

async function ensureSpool(batch: Batch) {
  const namespace = createSpoolNamespace(batch.appid, batch.url)
  if (spoolNamespace && spoolNamespace !== namespace) {
    throw new Error('worker received data for a different app/url namespace')
  }
  if (spoolReady) {
    await spoolReady
    return
  }

  spoolNamespace = namespace
  spoolReady = restoreSpool()
  await spoolReady
}

async function restoreSpool() {
  if (!spoolNamespace) return
  const records = await loadTrackSpool(spoolNamespace)
  const restored: Batch[] = []
  records.forEach(record => {
    const meta = record.batch?.meta
    if (!meta || createSpoolNamespace(meta.appid, meta.url) !== spoolNamespace) return
    restored.push({
      spoolKey: record.key,
      appid: meta.appid,
      url: meta.url,
      sessionid: meta.sessionid,
      deviceid: meta.deviceid,
      data: record.batch.data,
      keepalive: false,
    })
  })
  queue.unshift(...restored)
  trimMemoryQueue()
  drainQueue()
}

async function enqueueBatch(batch: Batch) {
  if (!spoolNamespace) return
  const meta: TrackSpoolMeta = {
    appid: batch.appid,
    url: batch.url,
    sessionid: batch.sessionid,
    deviceid: batch.deviceid,
  }
  const chunks = splitBySize(batch.data, MAX_TRACK_SPOOL_BYTES)
  for (const data of chunks) {
    const spoolKey = `${Date.now()}-${++spoolSequence}-${Math.random().toString(36).slice(2)}`
    const result = await appendTrackSpool(spoolNamespace, spoolKey, { meta, data })
    if (!result.accepted) {
      postMessage({ type: 'rejected', id: batch.id })
      return
    }

    queue.push({
      ...batch,
      spoolKey,
      data,
    })
    if (result.dropped.length) {
      removeQueuedSpoolRecords(result.dropped)
    }
    trimMemoryQueue()
  }
  postMessage({ type: 'accepted', id: batch.id })
  drainQueue()
}

async function drainQueue() {
  if (stopped || active || retryTimer || !queue.length) return
  active = queue.shift()
  if (!active) return

  const batch = active
  const failed = await sendBatch(batch)
  if (active !== batch) return

  if (!failed.length) {
    active = undefined
    failStreak = 0
    if (batch.spoolKey && spoolNamespace) await removeTrackSpool(spoolNamespace, batch.spoolKey)
    acknowledge(batch)
    drainQueue()
    return
  }

  failStreak += 1
  active = undefined
  queue.unshift({
    ...batch,
    data: failed,
  })
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    drainQueue()
  }, retryDelay(failStreak))
}

async function sendBatch(batch: Batch) {
  const [other, api, tracks] = splitRecords(batch.data)
  const failed: any[] = []
  const common = [...other, ...api]

  if (common.length) {
    for (const chunk of splitBySize(common, MAX_KEEPALIVE_BYTES)) {
      try {
        await degradationReport({ appid: batch.appid, data: chunk }, batch.keepalive)
      } catch (err) {
        console.warn('[report-core] worker report failed: ' + err)
        failed.push(...chunk)
      }
    }
  }

  if (tracks.length) {
    for (const chunk of packTrackPayloads(tracks)) {
      const first = chunk[0]
      try {
        await degradationReport({
          sessionid: batch.sessionid || first?.session,
          deviceid: batch.deviceid || first?.uuid,
          appid: batch.appid,
          data: chunk,
        }, batch.keepalive, 'gzip')
      } catch (err) {
        console.warn('[report-core] worker track report failed: ' + err)
        failed.push(...chunk)
      }
    }
  }

  return failed
}

function acknowledge(batch: Batch) {
  if (batch.id == null) return
  try {
    postMessage({ type: 'sent', id: batch.id })
  } catch (err) {
    console.warn('[@sepveneto/report-core] post sent failed: ' + err)
  }
}

function postMessage(data: any) {
  try {
    self.postMessage(data)
  } catch (err) {
    console.warn('[@sepveneto/report-core] worker postMessage failed: ' + err)
  }
}

function trimMemoryQueue() {
  let bytes = active ? estimateSize(active.data) : 0
  queue.forEach(batch => {
    bytes += estimateSize(batch.data)
  })

  while (queue.length && (bytes > MAX_TRACK_SPOOL_BYTES || queue.length + (active ? 1 : 0) > MAX_TRACK_SPOOL_BATCHES)) {
    const dropped = queue.shift()
    if (!dropped) break
    bytes -= estimateSize(dropped.data)
    if (dropped.spoolKey) {
      if (spoolNamespace) {
        removeTrackSpool(spoolNamespace, dropped.spoolKey).catch(err => {
          console.warn('[@sepveneto/report-core] remove dropped spool failed: ' + err)
        })
      }
    }
    postMessage({ type: 'dropped' })
  }
}

function removeQueuedSpoolRecords(keys: string[]) {
  const keySet = new Set(keys)
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].spoolKey && keySet.has(queue[i].spoolKey!)) {
      queue.splice(i, 1)
      postMessage({ type: 'dropped' })
    }
  }
}

function retryDelay(streak: number) {
  const exponentCap = Number.isFinite(maxRetry) ? Math.max(0, Math.min(maxRetry, 6)) : 0
  const exponent = Math.min(Math.max(0, streak - 1), exponentCap)
  return Math.min(RETRY_DELAY * 2 ** exponent, MAX_RETRY_DELAY)
}

function splitRecords(data: any[]) {
  const tracks: any[] = []
  const api: any[] = []
  const other: any[] = []

  for (const item of data) {
    if (item.type === OPERATION_TRACK) tracks.push(item)
    else if (item.type === COLLECT_API) api.push(item)
    else other.push(item)
  }
  return [other, api, tracks] as const
}

function degradationReport(
  body: any,
  keepalive: boolean,
  type: 'json' | 'gzip' = 'json',
) {
  let out: string | Uint8Array
  if (type === 'gzip') {
    const { sessionid, data, appid } = body
    const gzipData = pako.gzip(JSON.stringify(data))
    const encoder = new TextEncoder()
    const protocol = encoder.encode(`${sessionid}:${appid}|`)
    out = new Uint8Array(gzipData.length + protocol.length + 1)
    out.set([0])
    out.set(protocol, 1)
    out.set(gzipData, protocol.length + 1)
  } else {
    out = JSON.stringify(body)
  }

  return Promise.resolve(self.fetch('BR_URL', {
    method: 'post',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    cache: 'no-store',
    credentials: 'omit',
    priority: 'low',
    keepalive,
    body: out,
  }))
}
