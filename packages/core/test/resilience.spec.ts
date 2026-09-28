import { dom } from './helpers/dom-stub'
import { selfState } from './helpers/self-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuryReport } from '../src/browser/index'
import { BuryReport as MpBuryReport } from '../src/mp-uni/index'
import { NetworkPlugin } from '../src/browser/plugins/network'
import { NetworkPlugin as MpNetworkPlugin } from '../src/mp-uni/plugins/network'
import { report, reportNetwork } from '../src/index'
import { REPORT_REQUEST } from '../src/constant'
import {
  flushMemoryToStorage,
  getUtf8Size,
  normalizeResponse,
  pickWithinBudget,
  readQueue,
  resetStorageCache,
  writeQueue,
} from '../src/utils'

const URL = 'http://report.example/record'

function getReport() {
  return (globalThis as any)[REPORT_REQUEST]
}

beforeEach(() => {
  vi.useFakeTimers()
  dom.bus.clear()
  dom.localStorage.clear()
  dom.sessionStorage.clear()
  resetStorageCache()
  // utils 的内存缓冲是模块级状态：先落盘再清空，避免用例之间串扰
  flushMemoryToStorage()
  writeQueue([])
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  ;(BuryReport as any).cache = []
  ;(BuryReport as any).pluginsOrder = []
  ;(BuryReport as any).instance = undefined
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (globalThis as any)[REPORT_REQUEST]
})

describe('要求1：上报异常绝不影响业务调用方', () => {
  it('业务数据不可序列化时既不抛错，也不会毒化后续上报', () => {
    new BuryReport({ url: URL, appid: 'a', report: true })
    const reporter = getReport()

    const circular: any = {}
    circular.self = circular
    expect(() => reporter('custom', circular, { flush: true })).not.toThrow()

    // 毒丸记录不得阻塞后续正常数据的落盘
    expect(() => reporter('ok', { a: 1 }, { flush: true })).not.toThrow()
    const queue = readQueue()
    expect(queue.some((item: any) => item.type === 'ok')).toBe(true)
    expect(queue.some((item: any) => item.type === 'custom')).toBe(false)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('drop unserializable record'),
    )
  })

  it('延迟 flush 时不可序列化数据不会变成未捕获异常', () => {
    new BuryReport({ url: URL, appid: 'a', report: true })
    const circular: any = {}
    circular.self = circular

    expect(() => getReport()('custom', circular)).not.toThrow()
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
  })

  it('options 传 null 等非法值时不影响调用方', () => {
    new BuryReport({ url: URL, appid: 'a', report: true })
    const reporter = getReport()

    expect(() => reporter('custom', { a: 1 }, null as any)).not.toThrow()
    expect(() => reporter('custom', { a: 1 }, 1 as any)).not.toThrow()
  })

  it('REPORT_REQUEST 函数内部抛错时公共 API 不抛错', () => {
    ;(globalThis as any)[REPORT_REQUEST] = () => {
      throw new Error('sdk broken')
    }

    expect(() => report('custom', { a: 1 })).not.toThrow()
    expect(() => reportNetwork({ url: '/x' })).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('report failed'))
  })

  it('XHR 采集逻辑抛错不外泄，且宿主的 loadend 回调照常执行', () => {
    const c = {
      options: { url: URL, appid: 'a', network: { enable: true, success: true, fail: true } },
      report: vi.fn(),
    }
    new NetworkPlugin().init(c as any)
    const XHR: any = dom.window.XMLHttpRequest
    const hostListener = vi.fn()

    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.addEventListener('loadend', hostListener)
    xhr.status = 200
    xhr.response = '{}'
    xhr.getAllResponseHeaders = () => {
      throw new Error('headers unavailable')
    }

    expect(() => xhr.dispatchEvent(new Event('loadend'))).not.toThrow()
    expect(hostListener).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('collect xhr info failed'),
    )
  })

  it('小程序网络插件采集抛错时宿主回调仍然执行', () => {
    const requestMock = vi.fn()
    vi.stubGlobal('uni', {
      request: requestMock,
      canIUse: () => false,
      setStorageSync: () => {},
      getStorageSync: () => undefined,
      removeStorageSync: () => {},
    })
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true, success: true, fail: true } },
      report: vi.fn(() => {
        throw new Error('report broken')
      }),
    }
    new MpNetworkPlugin({}).init(c as any)

    const success = vi.fn()
    const fail = vi.fn()
    ;(uni.request as any)({ url: '/api', success, fail })
    const options = requestMock.mock.calls[0][0]

    expect(() => options.success({ statusCode: 200, data: '{}', header: {} })).not.toThrow()
    expect(success).toHaveBeenCalledTimes(1)
    expect(() => options.fail({ errMsg: 'fail' })).not.toThrow()
    expect(fail).toHaveBeenCalledTimes(1)
  })
})

describe('要求2：服务端失败不丢客户端数据', () => {
  it('小程序端 5xx 保留队列，2xx 才清空', () => {
    const storage = new Map<string, string>()
    const requestMock = vi.fn()
    vi.stubGlobal('uni', {
      request: requestMock,
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    resetStorageCache()
    writeQueue([])

    new MpBuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })
    getReport()('custom', { a: 1 }, { immediate: true })

    requestMock.mock.calls[0][0].success({ statusCode: 500 })
    expect(readQueue()).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(requestMock).toHaveBeenCalledTimes(2)
    requestMock.mock.calls[1][0].success({ statusCode: 200 })
    expect(readQueue()).toEqual([])
  })

  it('小程序端周期发送遇到 5xx 时重新排期重试', () => {
    const storage = new Map<string, string>()
    const requestMock = vi.fn()
    vi.stubGlobal('uni', {
      request: requestMock,
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    resetStorageCache()
    writeQueue([])

    new MpBuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })
    getReport()('custom', { a: 1 })
    vi.advanceTimersByTime(1000)
    expect(requestMock).toHaveBeenCalledTimes(1)

    requestMock.mock.calls[0][0].success({ statusCode: 503 })
    expect(readQueue()).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(requestMock).toHaveBeenCalledTimes(2)
  })

  it('worker 收到畸形数据只告警，不影响后续处理', async () => {
    vi.resetModules()
    await import('../src/browser/worker')
    selfState.fetch = vi.fn().mockResolvedValue({ ok: true })

    expect(() =>
      (globalThis as any).self.onmessage({
        data: { type: 'report', store: 'not-an-array', appid: 'a' },
      }),
    ).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('handle report failed'),
    )
  })

  it('keepalive 只在总量预算内发送，剩余数据保留到下次会话', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    new BuryReport({ url: URL, appid: 'a', report: true })
    const reporter = getReport()

    for (let i = 0; i < 60; i++) reporter('custom', { blob: 'x'.repeat(2048) }, { flush: true })
    const queuedBefore = readQueue().length
    expect(queuedBefore).toBeGreaterThan(20)

    fetchMock.mockClear()
    dom.window.dispatchEvent(new Event('pagehide'))

    const sent = fetchMock.mock.calls.reduce(
      (sum: number, call: any[]) => sum + JSON.parse(call[1].body).data.length,
      0,
    )
    const totalBytes = fetchMock.mock.calls.reduce(
      (sum: number, call: any[]) => sum + call[1].body.length,
      0,
    )

    // 总量受浏览器 keepalive 配额约束，不会把整条队列一次性发出去
    expect(totalBytes).toBeLessThanOrEqual(60 * 1024)
    expect(sent).toBeGreaterThan(0)
    expect(sent).toBeLessThan(queuedBefore)
    // 未发出的部分留在队列里，下次会话继续上报
    expect(readQueue().length).toBe(queuedBefore - sent)
  })

  it('小程序端未知状态码按失败处理，不清空队列', () => {
    const storage = new Map<string, string>()
    const requestMock = vi.fn()
    vi.stubGlobal('uni', {
      request: requestMock,
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    resetStorageCache()
    writeQueue([])

    new MpBuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })
    getReport()('custom', { a: 1 }, { immediate: true })

    // 缺少 statusCode 属于未知状态，不能当作成功清空队列
    requestMock.mock.calls[0][0].success({})
    expect(readQueue()).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(requestMock).toHaveBeenCalledTimes(2)
    requestMock.mock.calls[1][0].success({ statusCode: 200 })
    expect(readQueue()).toEqual([])
  })

  it('小程序端请求成功只删除本次发送的记录，保留发送期间新进入的数据', () => {
    const storage = new Map<string, string>()
    const requestMock = vi.fn()
    vi.stubGlobal('uni', {
      request: requestMock,
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    resetStorageCache()
    writeQueue([])

    new MpBuryReport({ url: 'https://mp/report', appid: 'a', report: true })
    const reporter = getReport()

    reporter('sent', { i: 1 }, { immediate: true })
    // 请求进行中又有新数据落盘
    reporter('during', { i: 2 })
    vi.advanceTimersByTime(1000)
    expect(readQueue().map((item: any) => item.type)).toEqual(['sent', 'during'])

    requestMock.mock.calls[0][0].success({ statusCode: 200 })
    // 只删除本次实际发送的 sent，发送期间新进入的 during 必须保留
    expect(readQueue().map((item: any) => item.type)).toEqual(['during'])
  })

  it('小程序端发送中的 immediate 会在当前请求结束后立即补发', () => {
    const storage = new Map<string, string>()
    const requestMock = vi.fn()
    vi.stubGlobal('uni', {
      request: requestMock,
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    resetStorageCache()
    writeQueue([])

    new MpBuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })
    const reporter = getReport()

    reporter('first', { i: 1 }, { immediate: true })
    expect(requestMock).toHaveBeenCalledTimes(1)

    reporter('second', { i: 2 }, { immediate: true })
    // 前一个请求未结束时不并发发送
    expect(requestMock).toHaveBeenCalledTimes(1)

    // 前一个请求成功后立即补发第二个，而不是等下一个时间窗口
    requestMock.mock.calls[0][0].success({ statusCode: 200 })
    expect(requestMock).toHaveBeenCalledTimes(2)
    const payload = JSON.parse(requestMock.mock.calls[1][0].data)
    expect(payload.data.map((item: any) => item.data.i)).toEqual([2])
  })
})

describe('体积计算性能相关行为', () => {
  it('getUtf8Size 支持提前退出', () => {
    expect(getUtf8Size('a'.repeat(1000), 10)).toBe(10)
    expect(getUtf8Size('a'.repeat(5), 10)).toBe(5)
  })

  it('limit 为 Infinity 时不做截断也不做全量扫描', () => {
    const big = 'x'.repeat(1024 * 1024)
    expect(normalizeResponse(big, Infinity)).toBe(big)
  })

  it('pickWithinBudget 单条超预算时仍会尝试发送', () => {
    const items = [{ v: 'x'.repeat(100) }, { v: 'y'.repeat(100) }, { v: 'z'.repeat(100) }]
    const part = pickWithinBudget(items, 150)
    expect(part.sent).toHaveLength(1)
    expect(part.rest).toHaveLength(2)
    expect(part.used).toBeGreaterThan(0)

    const oversized = pickWithinBudget([{ v: 'x'.repeat(1000) }, { v: 'y'.repeat(10) }], 10)
    expect(oversized.sent).toHaveLength(1)
    expect(oversized.rest).toHaveLength(1)
  })
})
