/**
 * 回放的拼接、合并与去重。
 *
 * 会话数据（rrweb 录屏事件、小程序页面轨迹）按分片写入 COS，而客户端是 fire-and-forget：
 * 同一条记录失败后会被重新投递；上报服务在 payload 超过单条 Kafka 上限时还会把一条记录
 * 按 `part` 拆开；worker 的过期补偿也存在重复上传的可能。于是同一段数据会出现在多个文件、
 * 同一条记录会在一份文件里出现多次。
 *
 * 浏览器直接读 COS 时只能按文件顺序拼接，处理的还是重复数据；因此拼接与去重统一放在
 * server：这里读出所有分片 → 记录按内容去重 → 录屏事件跨记录去重并按时间排序 →
 * 返回给前端（播放器、时间轴、导出视频）的就是干净且有序的数据。
 *
 * 注意：记录里的 `create_time` / `update_time` / `_id` 是服务端写入时间，重试投递时会变化，
 * 不能参与去重，否则副本识别不出来。
 */
import type { eventWithTime } from '@rrweb/types'

export type ReplayRecord = {
  type?: string
  uuid?: string
  session?: string
  stamp?: number
  part?: number
  device_time?: string
  time?: string
  data?: {
    events?: eventWithTime[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type MergedReplay = {
  /** 合并后的记录：录屏记录按 uuid 合成一条，页面轨迹记录去重后按时间排序 */
  records: ReplayRecord[]
  /** 录屏事件：已去重、按时间升序，播放器可直接消费 */
  events: eventWithTime[]
}

/**
 * 服务端写入、每次投递都会变化的字段，不参与去重：
 * - `_id` / `id`：Mongo 文档主键（读出来时 `_id` 会被改名成 `id`）
 * - `create_time` / `update_time`：入库时间，重试投递时会变
 */
const VOLATILE_KEYS = ['_id', 'id', 'create_time', 'update_time']

/**
 * 读取会话的所有分片。单个文件失败不影响其余分片（否则一个坏文件会让整个回放打不开）。
 */
export async function loadReplayPayloads(urls: string[]): Promise<ReplayRecord[]> {
  const payloads = await Promise.all(urls.map(async url => {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      return Array.isArray(data) ? data as ReplayRecord[] : []
    } catch (err) {
      console.error('[replay] 读取录屏分片失败', url, err)
      return []
    }
  }))

  return payloads.flat()
}

/** 合并全部得分片：记录去重 → 录屏事件合并去重 → 按时间排序 */
export function mergeReplayPayloads(payloads: unknown[]): MergedReplay {
  const records = payloads
    // 兼容两种入参：单个分片的记录数组，或已经展开的记录列表
    .flatMap(item => (Array.isArray(item) ? item : [item]))
    .filter((item): item is ReplayRecord => !!item && typeof item === 'object')

  const seenRecords = new Set<string>()
  const seenEvents = new Set<string>()
  const tracks = new Map<string, { shell: ReplayRecord, events: eventWithTime[] }>()
  const others: ReplayRecord[] = []

  for (const record of records) {
    const key = recordKey(record)
    if (seenRecords.has(key)) continue
    seenRecords.add(key)

    const events = record.data?.events
    if (!Array.isArray(events)) {
      others.push(record)
      continue
    }

    // 同一设备的事件可能因为重试/二次拆分散落在多条记录里，合并到一条记录上，
    // 保证播放器顺序消费时是全局有序的
    const uuid = String(record.uuid ?? '')
    const group = tracks.get(uuid)
    if (group) {
      group.events.push(...events)
    } else {
      tracks.set(uuid, { shell: record, events: [...events] })
    }
  }

  const mergedTracks = [...tracks.values()]
    .map(group => ({
      shell: group.shell,
      events: group.events
        .filter(event => {
          const key = stableStringify(event)
          if (seenEvents.has(key)) return false
          seenEvents.add(key)
          return true
        })
        .sort((a, b) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0)),
    }))
    .filter(group => group.events.length > 0)
    .sort((a, b) => (a.events[0]?.timestamp ?? 0) - (b.events[0]?.timestamp ?? 0))

  others.sort((a, b) => recordTime(a) - recordTime(b))

  const mergedRecords = mergedTracks.map(({ shell, events }) => {
    // 合并后 `part` 已经失去意义
    const record: ReplayRecord = { ...shell, data: { ...shell.data, events } }
    delete record.part
    return record
  })

  return {
    records: [...mergedRecords, ...others],
    events: mergedTracks.flatMap(group => group.events),
  }
}

/** 按记录内容去重，保留首次出现的顺序（会话详情里的日志/网络/错误列表也用它） */
export function dedupeReplayRecords<T>(records: T[]): T[] {
  const seen = new Set<string>()
  const list: T[] = []
  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    const key = recordKey(record as ReplayRecord)
    if (seen.has(key)) continue
    seen.add(key)
    list.push(record)
  }
  return list
}

/** 记录的去重 key：剔除服务端写入的易变字段，其余按内容计算 */
function recordKey(record: ReplayRecord): string {
  const stable = { ...record }
  VOLATILE_KEYS.forEach(key => {
    delete stable[key]
  })
  return stableStringify(stable)
}

/** 稳定序列化：对象 key 排序，保证同一份数据无论 key 顺序如何都是同一个字符串 */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/** 记录的上报时间：优先 stamp，其次 device_time / time */
function recordTime(record: ReplayRecord): number {
  const stamp = Number(record?.stamp)
  if (!isNaN(stamp) && stamp > 0) return stamp

  for (const value of [record?.device_time, record?.time]) {
    const num = Number(value)
    if (!isNaN(num) && num > 0) return num
    if (typeof value === 'string') {
      // "2026-01-01 00:00:00" 这类格式在部分环境下无法直接解析
      const parsed = Date.parse(value.replace(' ', 'T'))
      if (!isNaN(parsed)) return parsed
    }
  }

  return 0
}
