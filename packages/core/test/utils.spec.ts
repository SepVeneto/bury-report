import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushMemoryToStorage,
  getSessionId,
  getUuid,
  getUtf8Size,
  normalizeInterval,
  normalizeBody,
  normalizeResponse,
  readQueue,
  resetSessionId,
  resetStorageCache,
  splitBySize,
  storageReport,
  tryJsonString,
  withDefault,
  writeMemory,
  writeQueue,
} from '../src/utils'
import { REPORT_QUEUE } from '../src/constant'

// 用一个内存 storage 模拟 uni / localStorage
const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  resetStorageCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('uni', {
    setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('withDefault / 配置合并', () => {
  it('使用默认值补齐缺失配置', () => {
    const config = withDefault({ url: 'u', appid: 'a' })
    expect(config.report).toBe(true)
    expect(config.collect).toBe(true)
    expect(config.error).toBe(true)
    expect(config.interval).toBe(10)
    expect(config.network).toEqual({ enable: false, success: true, fail: true, responseLimit: 100 })
    expect(config.operationRecord).toEqual({
      enable: false,
      checkoutEveryNms: 5 * 1000,
      inlineStylesheet: false,
    })
  })

  it('用户配置覆盖默认值（含嵌套）', () => {
    const config = withDefault({ url: 'u', appid: 'a', interval: 5, network: { enable: true, fail: false } })
    expect(config.interval).toBe(5)
    expect(config.network.enable).toBe(true)
    expect(config.network.fail).toBe(false)
    // 未配置的字段保留默认值
    expect(config.network.success).toBe(true)
  })

  it('null/undefined 字段不覆盖默认值', () => {
    const config = withDefault({
      url: 'u',
      appid: 'a',
      interval: undefined as any,
      network: { enable: null as any },
    })
    expect(config.interval).toBe(10)
    expect(config.network.enable).toBe(false)
  })

  it('配置为 null/undefined 或字段类型错误时不抛错', () => {
    expect(() => withDefault(undefined as any)).not.toThrow()
    expect(() => withDefault(null as any)).not.toThrow()
    const config = withDefault({
      url: 'u',
      appid: 'a',
      network: 'bad' as any,
      operationRecord: 123 as any,
      interval: {} as any,
    })
    expect(config.network).toBe('bad')
    // 错误类型的配置访问属性时也返回 undefined 而不是抛错
    expect((config.network as any).enable).toBeUndefined()
  })
})

describe('uuid / session', () => {
  it('生成并持久化设备id', () => {
    const uuid = getUuid()
    expect(uuid).toBeTruthy()
    expect(getUuid()).toBe(uuid)
  })

  it('生成并持久化 session id，resetSessionId 后可重新生成', () => {
    const sid = getSessionId()
    expect(sid).toBeTruthy()
    expect(getSessionId()).toBe(sid)
    resetSessionId()
    expect(getSessionId()).not.toBe(sid)
  })

  it('存储不可用时也不抛错', () => {
    resetStorageCache()
    vi.stubGlobal('uni', undefined)
    expect(() => getUuid()).not.toThrow()
    expect(() => getSessionId()).not.toThrow()
    expect(() => resetSessionId()).not.toThrow()
  })

  it('首次读取后缓存，重复调用不再访问存储', () => {
    const getSpy = vi.fn((key: string) => storage.get(key))
    vi.stubGlobal('uni', {
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: getSpy,
      removeStorageSync: (key: string) => storage.delete(key),
    })

    getUuid()
    getUuid()
    getUuid()
    // 只有第一次读 uuid
    expect(getSpy.mock.calls.filter(call => call[0] === '__BR_UUID__')).toHaveLength(1)

    getSessionId()
    getSessionId()
    expect(getSpy.mock.calls.filter(call => call[0] === '__BR_SESSIONID__')).toHaveLength(1)
  })

  it('resetStorageCache 后重新读取', () => {
    const uuid = getUuid()
    storage.clear()
    expect(getUuid()).toBe(uuid) // 缓存命中
    resetStorageCache()
    expect(getUuid()).not.toBe(uuid)
  })
})

describe('storageReport', () => {
  it('生成标准记录结构', () => {
    const record = storageReport('custom', { a: 1 }, 123)
    expect(record).toMatchObject({
      type: 'custom',
      data: { a: 1 },
      stamp: 123,
      uuid: getUuid(),
      session: getSessionId(),
    })
    expect(typeof record.time).toBe('string')
  })
})

describe('normalizeResponse / getUtf8Size', () => {
  it('按字节数截断响应（默认100KB）', () => {
    expect(normalizeResponse('a'.repeat(100 * 1000), 100)).toBe('exceed size limit')
    expect(normalizeResponse('a'.repeat(100 * 1000 - 1), 100)).toBe('a'.repeat(100 * 1000 - 1))
    expect(normalizeResponse('小', 1)).toBe('小')
  })

  it('UTF-8 字节数计算正确', () => {
    expect(getUtf8Size('a')).toBe(1)
    expect(getUtf8Size('你')).toBe(3)
    expect(getUtf8Size('😀')).toBe(4)
  })
})

describe('normalizeBody', () => {
  it('null/undefined 返回 null', () => {
    expect(normalizeBody(null)).toBeNull()
    expect(normalizeBody(undefined)).toBeNull()
  })

  it('字符串按 100KB 截断', () => {
    expect(normalizeBody('ok')).toBe('ok')
    expect(normalizeBody('')).toBe('')
    expect(normalizeBody('x'.repeat(50 * 1000))).toBe('x'.repeat(50 * 1000))
    expect(normalizeBody('x'.repeat(100 * 1000 + 1))).toBe('exceed size limit')
  })

  it('失败请求场景（limit=Infinity）字符串保留完整', () => {
    const big = 'x'.repeat(200 * 1000)
    expect(normalizeBody(big, Infinity)).toBe(big)
    expect(normalizeBody(new Uint8Array(1024), Infinity)).toBe('[object Uint8Array]')
  })

  it('非字符串只保留类型描述，避免序列化爆炸', () => {
    expect(normalizeBody(new Uint8Array(1024))).toBe('[object Uint8Array]')
    expect(normalizeBody({ a: 1 })).toBe('[object Object]')
  })
})

describe('tryJsonString', () => {
  it('循环引用回退为错误信息', () => {
    const obj: any = {}
    obj.self = obj
    expect(tryJsonString(obj)).toContain('failed to stringify')
  })

  it('正常对象直接序列化', () => {
    expect(tryJsonString({ a: 1 })).toBe('{"a":1}')
  })
})

describe('队列缓存', () => {
  it('write/read 往返', () => {
    writeQueue([{ a: 1 }])
    expect(readQueue()).toEqual([{ a: 1 }])
  })

  it('队列数据损坏时读取为空且不抛错', () => {
    storage.set(REPORT_QUEUE, '{bad json')
    expect(readQueue()).toEqual([])
  })

  it('写入失败不抛错', () => {
    vi.stubGlobal('uni', undefined)
    expect(() => writeQueue([{ a: 1 }])).not.toThrow()
  })
})

describe('内存缓存 flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('内存数据 flush 到队列并清空内存，重复 flush 不产生重复数据', () => {
    writeMemory({ type: 'a', stamp: 1 })
    writeMemory({ type: 'b', stamp: 2 })
    flushMemoryToStorage()
    expect(readQueue()).toHaveLength(2)
    flushMemoryToStorage()
    expect(readQueue()).toHaveLength(2)
  })

  it('队列最多保留最新50条', () => {
    for (let i = 0; i < 60; i++) writeMemory({ type: 'a', stamp: i })
    flushMemoryToStorage()
    const list = readQueue()
    expect(list).toHaveLength(50)
    expect(list[0].stamp).toBe(10)
    expect(list[49].stamp).toBe(59)
  })

  it('队列超过字节上限时从最旧开始丢弃', () => {
    for (let i = 0; i < 40; i++) {
      writeMemory({ type: 'a', stamp: i, data: { blob: 'x'.repeat(20 * 1024) } })
    }
    flushMemoryToStorage()
    const list = readQueue()
    expect(list.length).toBeGreaterThan(0)
    expect(JSON.stringify(list).length).toBeLessThanOrEqual(256 * 1024)
    // 丢弃的是最旧的记录，最新记录保留
    expect(list[list.length - 1].stamp).toBe(39)
    expect(list[0].stamp).toBeGreaterThan(0)
  })

  it('flush 写入失败时保留内存数据，恢复后重试成功', () => {
    const setSpy = vi.fn()
    vi.stubGlobal('uni', {
      setStorageSync: setSpy,
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })

    // 第一次写入失败（如配额满）
    setSpy.mockImplementationOnce(() => {
      throw new Error('quota')
    })
    writeMemory({ type: 'a', stamp: 1 })
    flushMemoryToStorage()
    // 队列没有落盘，内存数据被保留
    expect(readQueue()).toEqual([])

    // 恢复后再次 flush 成功
    setSpy.mockImplementation((key: string, value: any) => storage.set(key, String(value)))
    flushMemoryToStorage()
    expect(readQueue()).toEqual([{ type: 'a', stamp: 1 }])
  })
})

describe('normalizeInterval', () => {
  it('非法或非正数回退默认10秒', () => {
    expect(normalizeInterval(5)).toBe(5000)
    expect(normalizeInterval('5' as any)).toBe(5000)
    expect(normalizeInterval('bad' as any)).toBe(10000)
    expect(normalizeInterval(0)).toBe(10000)
    expect(normalizeInterval(-1)).toBe(10000)
    expect(normalizeInterval(undefined)).toBe(10000)
  })
})

describe('splitBySize / 分片', () => {
  it('按估算体积分批，总量不丢失', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i, blob: 'x'.repeat(512) }))
    const chunks = splitBySize(items, 48 * 1024)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flat()).toHaveLength(100)
    for (const chunk of chunks) {
      expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(48 * 1024)
    }
  })

  it('单条记录超过上限时单独成批', () => {
    const items = [{ big: 'x'.repeat(60 * 1024) }, { small: 'y' }]
    const chunks = splitBySize(items, 48 * 1024)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(1)
  })

  it('空数组返回空', () => {
    expect(splitBySize([], 100)).toEqual([])
  })
})
