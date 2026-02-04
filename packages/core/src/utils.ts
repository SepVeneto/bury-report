import type { Options } from '@/type'
import { REPORT_QUEUE, SESSIONID_KEY, UUID_KEY } from '@/constant'

const DEFAULT_CONFIG = {
  collect: true,
  error: true,
  report: true,
  interval: 10,
  network: {
    enable: false,
    success: true,
    error: true,
    responseLimit: 100,
  },
  operationRecord: {
    enable: false,
  },
}

export function withDefault(config: Options) {
  return mergeConfig(config, DEFAULT_CONFIG)
}

export function mergeConfig(
  config: Options,
  defaultConfig: Required<Omit<Options, 'url' | 'appid' | 'entry'>>,
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
  const size = getUtf8Size(response)
  return size < limit * 1000 ? response : 'exceed size limit'
}

// 单位B
export function getUtf8Size(str: string) {
  let size = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
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

export function getUuid() {
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
  return uuid
}

// 仅小程序需要手动重置
export function resetSessionId() {
  try {
    removeLocalStorage(SESSIONID_KEY)
  } catch {}
}
// web端依赖browser session
// 小程序端依赖localStorage手动实现
export function getSessionId() {
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
  return sessionId
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
  } catch (err) {
    console.warn('[@sepveneto/report-core] set storage queue failed: ' + err)
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
    setLocalStorage(REPORT_QUEUE, JSON.stringify(list))
  } catch (err) {
    console.warn(err)
  }
}

let memoryBuffer: any[] = []
let flushTimer: number | undefined

export function writeMemory(record: any, immediate = false) {
  memoryBuffer.push(record)

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

  const list = readQueue()
  list.push(...memoryBuffer)

  if (list.length > MAX_PERSIST_COUNT) {
    list.splice(0, list.length - MAX_PERSIST_COUNT)
  }

  writeQueue(list)

  memoryBuffer = []
  clearTimeout(flushTimer)
  flushTimer = undefined
}
