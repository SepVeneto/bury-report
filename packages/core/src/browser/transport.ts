import type { Options, ReportFn, ReportOptions } from '@/type'
import { OPERATION_TRACK } from '@/constant'
import {
  MAX_CACHE_BYTES,
  MAX_CACHE_COUNT,
  MAX_KEEPALIVE_BYTES,
  MAX_KEEPALIVE_TOTAL_BYTES,
  estimateRecordSize,
  flushMemoryToStorage,
  getSessionId,
  getUuid,
  normalizeInterval,
  normalizeMaxRetry,
  pickWithinBudget,
  readQueue,
  removeSentRecords,
  splitBySize,
  storageReport,
  writeMemory,
  writeQueue,
} from '@/utils'
// @ts-expect-error: ignore
import globalThis from 'core-js/internals/global-this.js'

const MAX_RETRY_DELAY = 5 * 60 * 1000
const MAX_PENDING_WORKER_BATCHES = 20

type CacheState = {
  get: () => any[]
  set: (items: any[]) => void
}

export type BrowserTransport = {
  report: ReportFn
  flush: () => Promise<boolean>
  stop: () => void
  handleWorkerMessage: (data: any) => void
}

export function createBrowserTransport(
  options: Options,
  cache: CacheState,
): BrowserTransport {
  const { appid } = options
  const sendInterval = normalizeInterval(options.interval)
  const maxRetry = normalizeMaxRetry(options.maxRetry)
  let sendTimer: number | undefined
  let sending = false
  let failStreak = 0
  let stopped = false
  let pendingImmediate = false
  let pendingSend = false
  let workerBatchSeq = 0
  const pendingWorkerBatches = new Map<number, any[]>()

  const clearSendTimer = () => {
    clearTimeout(sendTimer)
    sendTimer = undefined
  }

  const scheduleSend = (delay = sendInterval, replace = false) => {
    if (stopped) return
    if (sendTimer !== undefined) {
      if (!replace) return
      clearSendTimer()
    }
    sendTimer = globalThis.setTimeout(() => {
      sendTimer = undefined
      sendRequest()
    }, delay) as unknown as number
  }

  const stop = () => {
    stopped = true
    clearSendTimer()
    pendingImmediate = false
    pendingSend = false
    pendingWorkerBatches.clear()
    window.removeEventListener('online', onOnline)
  }

  const onOnline = () => {
    if (stopped) return
    failStreak = 0
    clearSendTimer()
    try {
      window.__BR_WORKER__?.postMessage({ type: 'drain' })
    } catch {}
    sendRequest()
  }
  window.addEventListener('online', onOnline)

  const dropRefs = (list: any[], sent: any[]) => {
    if (!sent.length) return list
    const sentSet = new Set(sent)
    return list.filter(item => !sentSet.has(item))
  }

  const pendingWorkerRecords = () => {
    const records: any[] = []
    pendingWorkerBatches.forEach(batch => records.push(...batch))
    return records
  }

  const postWorkerBatch = (records: any[], keepalive: boolean) => {
    const activeWorker = window.__BR_WORKER__
    if (!activeWorker || !records.length) return
    const pendingBytes = pendingWorkerRecords().reduce((sum, item) => sum + estimateRecordSize(item), 0)
    const incomingBytes = records.reduce((sum, item) => sum + estimateRecordSize(item), 0)
    if (
      pendingWorkerBatches.size >= MAX_PENDING_WORKER_BATCHES ||
      pendingBytes + incomingBytes > MAX_CACHE_BYTES
    ) {
      // worker 长时间无响应时停止继续转交，避免主线程句柄和录屏对象无限增长。
      cache.set(dropRefs(cache.get(), records))
      return
    }

    const id = ++workerBatchSeq
    pendingWorkerBatches.set(id, records)
    try {
      activeWorker.postMessage({
        type: 'report',
        id,
        appid,
        url: options.url,
        sessionid: getSessionId(),
        deviceid: getUuid(),
        store: records,
        keepalive,
        maxRetry: Number.isFinite(maxRetry) ? maxRetry : 0,
      })
    } catch (err) {
      pendingWorkerBatches.delete(id)
      console.warn('[report-core] worker postMessage error: ' + err)
      window.__BR_WORKER__ = undefined
    }
  }

  const handleWorkerMessage = (data: any) => {
    if (!data || typeof data !== 'object') return

    if (data.type === 'accepted') {
      const records = pendingWorkerBatches.get(data.id) || []
      pendingWorkerBatches.delete(data.id)
      // 录屏所有权已交给 worker；主线程不再保留大对象。
      cache.set(dropRefs(cache.get(), records))
      return
    }

    if (data.type === 'sent') {
      pendingWorkerBatches.delete(data.id)
      return
    }

    if (data.type === 'rejected') {
      const records = pendingWorkerBatches.get(data.id) || []
      pendingWorkerBatches.delete(data.id)
      cache.set(dropRefs(cache.get(), records))
      return
    }

    if (data.type === 'failed' || data.type === 'exception') {
      pendingWorkerBatches.clear()
      if (data.type === 'exception') window.__BR_WORKER__ = undefined
      failStreak += 1
      scheduleSend(retryDelay(failStreak))
    }
  }

  const retryDelay = (streak: number) => {
    const exponentCap = Number.isFinite(maxRetry) ? Math.max(0, Math.min(maxRetry, 6)) : 0
    const exponent = Math.min(Math.max(0, streak - 1), exponentCap)
    return Math.min(sendInterval * 2 ** exponent, MAX_RETRY_DELAY)
  }

  const sendRequestToServer = async (body: string, keepalive: boolean) => {
    return fetch(options.url, {
      method: 'post',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
      keepalive,
      cache: 'no-store',
      credentials: 'omit',
      priority: 'low',
      body,
    })
  }

  const sendRequest = async (keepalive = false, immediate = false): Promise<boolean> => {
    if (stopped) return false
    if (sending && !keepalive) {
      pendingSend = true
      if (immediate) pendingImmediate = true
      return false
    }

    const overlapsNormalSend = keepalive && sending
    if (!keepalive) {
      clearSendTimer()
      pendingSend = false
      pendingImmediate = false
    }
    if (!overlapsNormalSend) sending = true

    let failed = false
    try {
      flushMemoryToStorage()

      const list = readQueue()
      const activeWorker = window.__BR_WORKER__
      const reservedTracks = pendingWorkerRecords()
      const reservedTrackSet = new Set(reservedTracks)
      const cacheSnapshot = cache.get().slice()
      const workerTracks = activeWorker
        ? cacheSnapshot.filter(item => item.type === OPERATION_TRACK && !reservedTrackSet.has(item))
        : []
      const mainCache = activeWorker
        ? cacheSnapshot.filter(item => item.type !== OPERATION_TRACK)
        : cacheSnapshot
      const queuePayload = list.map(item => ({ appid, ...item }))
      const cachePayload = mainCache.map(item => ({ appid, ...item }))

      if (keepalive) {
        let sentQueue = list.length
        const sentQueueRecords: any[] = []
        const sentMainCacheRecords: any[] = []

        if (queuePayload.length || cachePayload.length) {
          const queuePart = pickWithinBudget(queuePayload, MAX_KEEPALIVE_TOTAL_BYTES)
          const cachePart = pickWithinBudget(cachePayload, MAX_KEEPALIVE_TOTAL_BYTES - queuePart.used)
          sentQueue = queuePart.sent.length
          const chunks = splitBySize([...queuePart.sent, ...cachePart.sent], MAX_KEEPALIVE_BYTES)
          const requests = chunks.map(chunk => sendRequestToServer(
            JSON.stringify({ appid, data: chunk }),
            true,
          ).catch((err) => {
            console.warn('[report-core] fetch error: ' + err)
            throw err
          }))

          const results = await Promise.allSettled(requests)
          let offset = 0
          results.forEach((result, index) => {
            const chunk = chunks[index]
            if (result.status === 'fulfilled') {
              chunk.forEach((_item, itemIndex) => {
                const sentIndex = offset + itemIndex
                if (sentIndex < sentQueue) sentQueueRecords.push(list[sentIndex])
                else sentMainCacheRecords.push(mainCache[sentIndex - sentQueue])
              })
            }
            offset += chunk.length
          })
          if (results.some(result => result.status === 'rejected')) failed = true
        }

        postWorkerBatch(workerTracks, true)
        writeQueue(removeSentRecords(readQueue(), sentQueueRecords))
        cache.set(dropRefs(cache.get(), sentMainCacheRecords))
      } else {
        if (queuePayload.length || cachePayload.length) {
          try {
            await sendRequestToServer(
              JSON.stringify({ appid, data: [...queuePayload, ...cachePayload] }),
              false,
            )
            writeQueue(removeSentRecords(readQueue(), list))
            cache.set(dropRefs(cache.get(), mainCache))
          } catch (err) {
            console.warn('[report-core] fetch error: ' + err)
            failed = true
          }
        }

        postWorkerBatch(workerTracks, false)
      }
    } catch (err) {
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
      failed = true
    } finally {
      if (!overlapsNormalSend) sending = false
      if (!stopped && !keepalive) {
        const needsFollowUp = pendingSend || pendingImmediate
        pendingSend = false
        pendingImmediate = false

        if (failed) {
          failStreak += 1
          scheduleSend(retryDelay(failStreak), true)
        } else {
          failStreak = 0
          if (needsFollowUp) sendRequest()
        }
      }
    }

    return !failed
  }

  const report = (
    type: string,
    data: Record<string, any>,
    reportOptions: ReportOptions = {},
  ) => {
    try {
      if (stopped) return

      const record = storageReport(type, data, Date.now())
      const {
        store = true,
        flush = false,
        immediate = false,
        keepalive = false,
      } = reportOptions || {}

      if (store) {
        writeMemory(record, flush)
      } else {
        const items = cache.get()
        items.push(record)
        if (items.length > MAX_CACHE_COUNT) {
          items.splice(0, items.length - MAX_CACHE_COUNT)
        }
        let bytes = items.reduce((sum, item) => sum + estimateRecordSize(item), 0)
        while (items.length > 1 && bytes > MAX_CACHE_BYTES) {
          bytes -= estimateRecordSize(items.shift())
        }
        cache.set(items)
      }

      if (sending) pendingSend = true
      if (immediate) sendRequest(keepalive, true)
      scheduleSend()
    } catch (err) {
      console.warn('[@sepveneto/report-core] report failed: ' + err)
    }
  }

  return {
    report,
    flush: () => sendRequest(),
    stop,
    handleWorkerMessage,
  }
}
