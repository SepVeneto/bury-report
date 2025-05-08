import type { Options } from '@/type'
import { COLLECT_ERROR, REPORT_QUEUE, UUID_KEY } from '@/constant'

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

export function setLocalStorage(key: string, value: string) {
  let IS_UNIAPP = false
  try {
    IS_UNIAPP = !!uni
  } catch { }

  try {
    if (IS_UNIAPP) {
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

  if (IS_UNIAPP) {
    return uni.getStorageSync(key)
  } else {
    return window.localStorage.getItem(key)
  }
}

export function storageReport(appid: string, data: Record<string, any>) {
  const uuid = getUuid()
  const type = COLLECT_ERROR

  const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]') as Array<any>
  if (list.length > 30) {
    list.shift()
  }
  list.push({ uuid, type, data, appid, time: new Date().toLocaleString() })
  setLocalStorage(REPORT_QUEUE, JSON.stringify(list))
}

export function tryJsonString(json: Record<string, any>) {
  try {
    return JSON.stringify(json)
  } catch (e) {
    return `failed to stringify with error: ${e}`
  }
}
