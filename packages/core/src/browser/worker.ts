import { COLLECT_API, OPERATION_TRACK } from '@/constant'
import { MAX_KEEPALIVE_BYTES, estimateSize, normalizeMaxRetry, splitBySize } from '@/utils'
import pako from 'pako'

// 失败后的重试间隔，仅存在于 worker 内部，不影响主线程
const RETRY_DELAY = 10 * 1000
// 重试缓冲上限，避免 worker 内存无限增长
const MAX_RETRY_COUNT = 100
// 单条 track 消息（gzip 后）的目标上限。服务端/broker 的单条上限通常是 1MB~10MB，
// 而这里会把多批事件合并投递（叠加重试缓冲后可能到十几 MB，直接被拒收），所以先按估算切分。
// 服务端还有一道兜底拆分，用于覆盖尚未升级的老版本客户端。
const MAX_TRACK_MESSAGE_BYTES = 1 * 1024 * 1024
// rrweb JSON 的压缩比经验值：用于在不额外压缩的前提下估算体积
const TRACK_COMPRESS_RATIO = 8

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

let retryBuffer: any[] = []
let retryTimer: any
// 连续失败次数：成功一次即清零；超过 maxRetry 判定服务不可用并停止重试
let failStreak = 0
let maxRetry = normalizeMaxRetry(undefined)
let exhausted = false

self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report': {
      // 主线程透传的重试上限；0/非正数表示不限制
      if (evt.data.maxRetry != null) maxRetry = normalizeMaxRetry(evt.data.maxRetry)
      // worker 内的异常不能变成未处理的 rejection
      handleReport(evt.data).catch(err => {
        console.warn('[@sepveneto/report-core] handle report failed: ' + err)
      })
      break
    }
    default:
      console.warn('[@sepveneto/report-core] invalid event type: ' + evt.data.type)
  }
}

async function handleReport({ store, appid, sessionid, deviceid, keepalive }: any) {
  // 重试已耗尽：忽略后续数据，等待主线程终止 worker
  if (exhausted) return

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
    // 录屏按估算体积分片投递：单条过大的 payload 会被 broker/服务端拒收，整段录屏丢失；
    // 分片后同 session 仍走同一个 Kafka key，顺序不变，回放端按时间戳合并即可
    for (const chunk of packTrackPayloads(tracks)) {
      degradationReport({ sessionid, deviceid, appid, data: chunk }, true, 'gzip').catch((err) => console.warn(err))
    }
    return
  }

  // 普通发送：失败的数据留在 worker 内自动重试，不打扰主线程
  const failed = await sendWithRetry(data)
  handleSendResult(failed)
}

// 统一处理一次发送结果：成功清零计数，失败累计并在超过上限时停止重试并通知主线程
function handleSendResult(failed: any[]) {
  if (!failed.length) {
    failStreak = 0
    clearTimeout(retryTimer)
    retryTimer = undefined
    return
  }

  retryBuffer = [...failed, ...retryBuffer].slice(0, MAX_RETRY_COUNT)
  failStreak += 1

  // 重试指定次数后仍然失败：通知主线程中止上报相关操作（含录屏）
  if (failStreak > maxRetry) {
    exhausted = true
    console.warn(`[@sepveneto/report-core] worker report disabled after ${failStreak - 1} retries`)
    retryBuffer = []
    clearTimeout(retryTimer)
    retryTimer = undefined
    try {
      self.postMessage({ type: 'exhausted' })
    } catch (err) {
      console.warn('[@sepveneto/report-core] post exhausted failed: ' + err)
    }
    return
  }

  scheduleRetry()
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
    for (const chunk of packTrackPayloads(tracks)) {
      try {
        const first = chunk[0]
        await degradationReport({ sessionid: first.session, deviceid: first.uuid, appid, data: chunk }, false, 'gzip')
      } catch (err) {
        console.warn(err)
        failed.push(...chunk)
      }
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
    handleSendResult(failed)
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
