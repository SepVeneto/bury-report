import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushMemoryToStorage,
  getSessionId,
  getUuid,
  getUtf8Size,
  normalizeInterval,
  normalizeResponse,
  readQueue,
  resetSessionId,
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
    expect(config.operationRecord).toEqual({ enable: false })
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
    vi.stubGlobal('uni', undefined)
    expect(() => getUuid()).not.toThrow()
    expect(() => getSessionId()).not.toThrow()
    expect(() => resetSessionId()).not.toThrow()
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
