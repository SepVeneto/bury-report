import { COLLECT_API, OPERATION_TRACK } from '@/constant'
import { MAX_KEEPALIVE_BYTES, splitBySize } from '@/utils'
import pako from 'pako'

// 失败后的重试间隔，仅存在于 worker 内部，不影响主线程
const RETRY_DELAY = 10 * 1000
// 重试缓冲上限，避免 worker 内存无限增长
const MAX_RETRY_COUNT = 100

let retryBuffer: any[] = []
let retryTimer: any

self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report': {
      void handleReport(evt.data)
      break
    }
    default:
      console.warn('[@sepveneto/report-core] invalid event type: ' + evt.data.type)
  }
}

async function handleReport({ store, appid, sessionid, deviceid, keepalive }: any) {
  const incoming = (store || []).map((item: any) => ({ ...item, appid })).sort((a: any, b: any) => a.stamp - b.stamp)
  const data = [...retryBuffer, ...incoming]
  retryBuffer = []
  if (!data.length) return

  const [other, api, tracks] = sliceDataForKeepalive(data)

  if (keepalive) {
    // 页面关闭：按大小分片尽力发送，不做重试
    for (const chunk of splitBySize([...other, ...api], MAX_KEEPALIVE_BYTES)) {
      degradationReport({ appid, data: chunk }, true).catch((err) => console.warn(err))
    }
    for (const chunk of splitBySize(tracks, MAX_KEEPALIVE_BYTES)) {
      degradationReport({ sessionid, deviceid, appid, data: chunk }, true, 'gzip').catch((err) => console.warn(err))
    }
    return
  }

  // 普通发送：失败的数据留在 worker 内自动重试，不打扰主线程
  const failed = await sendWithRetry(data)
  if (failed.length) {
    retryBuffer = [...failed, ...retryBuffer].slice(0, MAX_RETRY_COUNT)
    scheduleRetry()
  } else {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
}

async function sendWithRetry(data: any[]) {
  const [other, api, tracks] = sliceDataForKeepalive(data)
  const failed: any[] = []
  const common = [...other, ...api]
  const appid = data[0]?.appid

  if (common.length) {
    try {
      await degradationReport({ appid, data: common }, false)
    } catch (err) {
      console.warn(err)
      failed.push(...common)
    }
  }
  if (tracks.length) {
    try {
      const first = tracks[0]
      await degradationReport({ sessionid: first.session, deviceid: first.uuid, appid, data: tracks }, false, 'gzip')
    } catch (err) {
      console.warn(err)
      failed.push(...tracks)
    }
  }
  return failed
}

function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setTimeout(async () => {
    retryTimer = undefined
    if (!retryBuffer.length) return
    const data = retryBuffer
    retryBuffer = []
    const failed = await sendWithRetry(data)
    if (failed.length) {
      retryBuffer = [...failed, ...retryBuffer].slice(0, MAX_RETRY_COUNT)
      scheduleRetry()
    }
  }, RETRY_DELAY)
}

function sliceDataForKeepalive(data: any[]) {
  const trackSlices = []
  const apiSlices = []
  const otherSlices = []

  for (const item of data) {
    switch (item.type) {
      case OPERATION_TRACK:
        trackSlices.push(item)
        break
      case COLLECT_API:
        apiSlices.push(item)
        break
      default:
        otherSlices.push(item)
        break
    }
  }
  return [otherSlices, apiSlices, trackSlices]
}

function degradationReport(body: any, keepalive: boolean, type: 'json' | 'gzip' = 'json') {
  let out: any
  switch (type) {
    case 'json': {
      // fetch 的 body 必须是字符串/二进制等类型，直接传对象会抛 TypeError
      out = JSON.stringify(body)
      break
    }
    case 'gzip': {
      // 按sessionid + | + rrweb 进行数据组装
      const { sessionid, data, appid } = body
      const gzipData = pako.gzip(JSON.stringify(data))
      const encoder = new TextEncoder()
      const str = `${sessionid}:${appid}|`
      const protocolBytes = encoder.encode(str)
      out = new Uint8Array(gzipData.length + protocolBytes.length + 1)
      out.set([0])
      out.set(protocolBytes, 1)
      out.set(gzipData, protocolBytes.length + 1)
      break
    }
  }

  return self.fetch('BR_URL', {
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
  })
}
