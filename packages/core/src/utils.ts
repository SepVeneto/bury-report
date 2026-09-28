import type { Options } from '@/type'
import { COLLECT_INFO, REPORT_QUEUE, SESSIONID_KEY, UUID_KEY } from '@/constant'
// @ts-expect-error: ignore
import globalThis from 'core-js/internals/global-this.js'

// 上报失败后默认的最大连续重试次数，超过后中止上报相关操作
export const DEFAULT_MAX_RETRY = 5

const DEFAULT_CONFIG = {
  collect: true,
  error: true,
  report: true,
  interval: 10,
  maxRetry: DEFAULT_MAX_RETRY,
  network: {
    enable: false,
    success: true,
    fail: true,
    responseLimit: 100,
  },
  operationRecord: {
    enable: false,
    checkoutEveryNms: 5 * 1000,
    inlineStylesheet: false,
  },
}

export function withDefault(config: Options) {
  return mergeConfig(config, DEFAULT_CONFIG)
}

// 上报周期统一做安全校验：非法或非正数时回退到默认10秒，避免出现0ms死循环
export function normalizeInterval(interval?: number) {
  const seconds = Number(interval)
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 10) * 1000
}

// 上报失败最大连续重试次数：未配置时用默认值，显式配成非正数表示不限制（Infinity）
export function normalizeMaxRetry(maxRetry?: number) {
  if (maxRetry == null) return DEFAULT_MAX_RETRY
  const times = Number(maxRetry)
  if (!Number.isFinite(times) || times <= 0) return Infinity
  return Math.floor(times)
}

export function mergeConfig(
  config: Options,
  defaultConfig: Required<Omit<Options, 'url' | 'appid' | 'entry' | 'stamp'>>,
) {
  const res: Record<string, any> = {}

  combine(defaultConfig)
  combine(config)

  return res as unknown as Required<Options> & { network: Required<Options['network']> }
  function combine(obj: Record<string, any>) {
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue

      // eslint-disable-next-line eqeqeq
      if (obj[key] == undefined) continue

      if (Object.prototype.toString.call(obj[key]) === '[object Object]') {
        res[key] = mergeConfig(obj[key], res[key])
      } else {
        res[key] = obj[key]
      }
    }
  }
}

export function normalizeResponse(response: string, limit: number) {
  if (typeof response !== 'string') return String(response ?? '')
  // 失败请求等场景 limit 为 Infinity，此时不做截断，直接返回，省掉一次全量扫描
  if (limit === Infinity) return response
  const max = limit * 1000
  // 计数达到上限即可判定超限，无需扫描完整字符串（大响应体下可省十几毫秒主线程耗时）
  return getUtf8Size(response, max) < max ? response : 'exceed size limit'
}

// 单位B；stopAt 用于体积判定，达到该值即可提前返回
export function getUtf8Size(str: string, stopAt = Infinity) {
  let size = 0
  for (let i = 0; i < str.length; i++) {
    if (size >= stopAt) break
    const code = str.charCodeAt(i)
    // 代理对（如 emoji）按 4 字节计算，避免被拆成两个 3 字节
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        size += 4
        i++
        continue
      }
    }
    if (code <= 0x7F) {
      size += 1 // ASCII字符占1字节
    } else if (code <= 0x7FF) {
      size += 2 // 2字节
    } else if (code <= 0xFFFF) {
      size += 3 // 3字节
    } else {
      size += 4 // 4字节（一般不常见）
    }
  }
  return size
}

let cachedUuid: string | undefined
let cachedSessionId: string | undefined

export function getUuid() {
  // 首次读取后缓存，避免每条日志都做同步存储读
  if (cachedUuid) return cachedUuid

  let uuid
  try {
    uuid = getLocalStorage(UUID_KEY)
  } catch {}

  if (!uuid) {
    uuid = `${Date.now()}${Math.floor(Math.random() * 1e7)}`
    try {
      setLocalStorage(UUID_KEY, uuid)
    } catch {}
  }
  cachedUuid = uuid
  return uuid
}

// 仅小程序需要手动重置
export function resetSessionId() {
  cachedSessionId = undefined
  try {
    removeLocalStorage(SESSIONID_KEY)
  } catch {}
}
// web端依赖browser session
// 小程序端依赖localStorage手动实现
export function getSessionId() {
  // 首次读取后缓存，避免每条日志都做同步存储读
  if (cachedSessionId) return cachedSessionId

  let sessionId
  try {
    sessionId = ('window' in globalThis && window.sessionStorage)
      ? window.sessionStorage.getItem(SESSIONID_KEY)
      : getLocalStorage(SESSIONID_KEY)
  } catch {}
  if (!sessionId) {
    sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
    try {
      ('window' in globalThis && window.sessionStorage)
        ? window.sessionStorage.setItem(SESSIONID_KEY, sessionId)
        : setLocalStorage(SESSIONID_KEY, sessionId)
    } catch {}
  }
  cachedSessionId = sessionId
  return sessionId
}

// 重置内部缓存（测试或需要强制重新读取时使用，不影响线上行为）
export function resetStorageCache() {
  cachedUuid = undefined
  cachedSessionId = undefined
}

export function setLocalStorage(key: string, value: string) {
  let IS_UNIAPP = false
  try {
    IS_UNIAPP = !!uni
  } catch { }

  try {
    if (IS_UNIAPP && uni.setStorageSync) {
      uni.setStorageSync(key, value)
    } else {
      window.localStorage.setItem(key, value)
    }
    return true
  } catch (err) {
    console.warn('[@sepveneto/report-core] set storage queue failed: ' + err)
    return false
  }
}
export function getLocalStorage(key: string) {
  let IS_UNIAPP = false
  try {
    IS_UNIAPP = !!uni
  } catch { }

  if (IS_UNIAPP && uni.getStorageSync) {
    return uni.getStorageSync(key)
  } else {
    return window.localStorage.getItem(key)
  }
}
export function removeLocalStorage(key: string) {
  let IS_UNIAPP = false
  try {
    IS_UNIAPP = !!uni
  } catch { }

  if (IS_UNIAPP && uni.removeStorageSync) {
    uni.removeStorageSync(key)
  } else {
    window.localStorage.removeItem(key)
  }
}

export function storageReport(
  type: string,
  data: Record<string, any>,
  stamp?: number,
) {
  const uuid = getUuid()
  const sessionId = getSessionId()
  const record = {
    session: sessionId,
    uuid,
    type,
    data,
    time: String(Date.now()),
    stamp,
  }

  return record
}

export function tryJsonString(json: Record<string, any>) {
  try {
    return JSON.stringify(json)
  } catch (e) {
    return `failed to stringify with error: ${e}`
  }
}

export const readQueue: () => any[] = () => {
  try {
    return JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
  } catch (err) {
    console.warn(err)
    return []
  }
}

export const writeQueue = (list: any[]) => {
  try {
    return setLocalStorage(REPORT_QUEUE, JSON.stringify(list))
  } catch (err) {
    console.warn(err)
    return false
  }
}

// keepalive 单请求大小上限（浏览器约64KB，留出余量）
export const MAX_KEEPALIVE_BYTES = 48 * 1024
// 浏览器对同一页面所有 keepalive 请求的总量同样有约 64KB 限制，超出部分会被直接丢弃
export const MAX_KEEPALIVE_TOTAL_BYTES = 60 * 1024
// 内存缓存（store:false）最多保留的条数，避免内存无限增长
export const MAX_CACHE_COUNT = 50
// mp 端内存缓存上限（小程序内存更敏感，取更小值）
export const MAX_MEMORY_COUNT = 20
// 本地队列字节上限：防止大记录写爆 localStorage，同时控制每秒全量序列化成本
export const MAX_QUEUE_BYTES = 256 * 1024
// 请求体/响应头等辅助字段的截断上限（单位KB，与 normalizeResponse 一致）
export const MAX_FIELD_KB = 100

// 请求体等非字符串类型只保留类型描述，避免 FormData/ArrayBuffer 序列化爆炸；
// 失败请求等需要完整内容的场景传入 Infinity，字符串不做截断
export function normalizeBody(body: any, limit = MAX_FIELD_KB) {
  if (body == null) return null
  if (typeof body === 'string') return normalizeResponse(body, limit)
  return Object.prototype.toString.call(body)
}

// 估算单条记录的体积（UTF-16 长度近似，用于分片，保留余量）
export function estimateSize(item: any) {
  try {
    return JSON.stringify(item).length
  } catch {
    return 1024
  }
}

// 按估算体积分批，用于 keepalive 等有单请求大小限制的场景
export function splitBySize(items: any[], maxBytes: number): any[][] {
  const chunks: any[][] = []
  let current: any[] = []
  let size = 0
  for (const item of items) {
    const itemSize = estimateSize(item)
    if (current.length && size + itemSize > maxBytes) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(item)
    size += itemSize
  }
  if (current.length) chunks.push(current)
  return chunks
}

// 在总量预算内挑选可以立即发送的记录，返回已选部分与需要保留的部分
export function pickWithinBudget(items: any[], budget: number) {
  const sent: any[] = []
  let used = 0
  for (const item of items) {
    const itemSize = estimateSize(item)
    if (sent.length && used + itemSize > budget) break
    sent.push(item)
    used += itemSize
    if (used >= budget) break
  }
  return { sent, used, rest: items.slice(sent.length) }
}

// 从当前队列里精确移除“本次实际发送”的那批记录，保留发送期间新进入的记录。
// 按序列化内容做多重集匹配：只删除确实出现在已发送批次里的记录，
// 请求期间新增（或已被上限裁剪掉）的记录不受影响，避免请求成功时整表清空造成丢数据。
export function removeSentRecords(current: any[], sent: any[]) {
  if (!sent.length) return current

  const pending = new Map<string, number>()
  for (const item of sent) {
    let key: string
    try {
      key = JSON.stringify(item)
    } catch {
      continue
    }
    pending.set(key, (pending.get(key) || 0) + 1)
  }

  const result: any[] = []
  for (const item of current) {
    let key: string
    try {
      key = JSON.stringify(item)
    } catch {
      result.push(item)
      continue
    }
    const count = pending.get(key)
    if (count) {
      pending.set(key, count - 1)
      continue
    }
    result.push(item)
  }
  return result
}

let memoryBuffer: any[] = []
let flushTimer: number | undefined

// 设备信息是会话最早入队的记录且体积很小，超限裁剪时受保护，
// 避免错误风暴把队首的设备信息挤掉导致“有错误无设备”
function isProtectedRecord(item: any) {
  return !!item && item.type === COLLECT_INFO
}

// 从最旧开始丢弃普通记录，设备信息不参与丢弃
function trimOldest(list: any[], maxCount: number) {
  if (list.length <= maxCount) return list

  const protectedList = list.filter(isProtectedRecord)
  const droppable = list.filter(item => !isProtectedRecord(item))
  const room = Math.max(0, maxCount - protectedList.length)
  return [...protectedList, ...droppable.slice(droppable.length - room)]
}

// 按字节从最旧开始丢弃普通记录，设备信息不参与丢弃
// totalBytes 由调用方传入，避免为了裁剪再重复做一次整表序列化
function trimByBytes(list: any[], maxBytes: number, totalBytes: number) {
  const protectedList = list.filter(isProtectedRecord)
  const droppable = list.filter(item => !isProtectedRecord(item))

  const sizes = droppable.map(item => estimateSize(item))
  let rest = totalBytes
  let drop = 0
  while (drop < droppable.length && rest > maxBytes) {
    rest -= sizes[drop]
    drop++
  }
  return [...protectedList, ...droppable.slice(drop)]
}

// 单条记录不可序列化（循环引用 / BigInt 等）时只丢弃问题记录，
// 避免整条队列被"毒丸"卡死、导致后续所有数据都无法落盘
function dropUnserializable(list: any[]) {
  const kept: any[] = []
  for (const item of list) {
    try {
      JSON.stringify(item)
      kept.push(item)
    } catch {
      console.warn('[@sepveneto/report-core] drop unserializable record')
    }
  }
  return kept
}

export function writeMemory(record: any, immediate = false) {
  memoryBuffer.push(record)
  // 存储不可用导致 flush 失败时，内存缓冲也需要有界
  if (memoryBuffer.length > MAX_PERSIST_COUNT) {
    memoryBuffer = trimOldest(memoryBuffer, MAX_PERSIST_COUNT)
  }

  if (immediate) {
    flushMemoryToStorage()
  }
  if (!flushTimer) {
    flushTimer = globalThis.setTimeout(
      flushMemoryToStorage,
      FLUSH_INTERVAL,
    ) as unknown as number
  }
}

// 1秒节流
const FLUSH_INTERVAL = 1000
// 最多缓存最新的50条
const MAX_PERSIST_COUNT = 50
export function flushMemoryToStorage() {
  if (!memoryBuffer.length) return

  // 落盘链路的任何异常都不能抛给宿主；不可序列化的记录直接丢弃，避免毒化整条队列
  try {
    const list = readQueue()
    list.push(...memoryBuffer)

    // 条数上限：设备信息受保护，优先丢其它旧记录
    const limited = trimOldest(list, MAX_PERSIST_COUNT)

    // 字节上限：从最旧开始丢弃，直到序列化体积达标
    let finalList = limited
    let totalBytes = 0
    try {
      totalBytes = JSON.stringify(limited).length
    } catch {
      // 整表序列化失败：定位并剔除问题记录后重试（只走异常路径）
      finalList = dropUnserializable(limited)
      totalBytes = JSON.stringify(finalList).length
    }

    if (totalBytes > MAX_QUEUE_BYTES) {
      finalList = trimByBytes(finalList, MAX_QUEUE_BYTES, totalBytes)
    }

    // 写入失败时保留内存数据，等下次 flush 重试，尽量不丢日志
    if (writeQueue(finalList)) {
      memoryBuffer = []
    }
  } catch (err) {
    // 兜底：未预期的异常同样不能影响宿主，内存数据留待下个周期重试
    console.warn('[@sepveneto/report-core] flush failed: ' + err)
  } finally {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
}
