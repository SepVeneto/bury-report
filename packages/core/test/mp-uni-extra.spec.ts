import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuryReport, NetworkPlugin, report } from '../src/mp-uni/index'
import { COLLECT_API, REPORT_REQUEST } from '../src/constant'
import { flushMemoryToStorage, readQueue, resetStorageCache } from '../src/utils'

const storage = new Map<string, string>()
const requestMock = vi.fn()

function getReport() {
  return (globalThis as any)[REPORT_REQUEST]
}

function stubUni(overrides: Record<string, any> = {}) {
  vi.stubGlobal('uni', {
    request: requestMock,
    setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
    ...overrides,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  storage.clear()
  requestMock.mockReset()
  resetStorageCache()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  stubUni()
  // utils 的内存缓冲是模块级状态，先排空避免用例间串扰
  flushMemoryToStorage()
  storage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (globalThis as any)[REPORT_REQUEST]
})

describe('mp 独立 report API', () => {
  it('转发到已注册的上报函数并带上 immediate', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn

    report('custom', { a: 1 }, true)
    expect(fn).toHaveBeenCalledWith('custom', { a: 1 }, { immediate: true })

    report('custom', { a: 2 })
    expect(fn).toHaveBeenLastCalledWith('custom', { a: 2 }, { immediate: false })
  })

  it('SDK 未初始化时调用不抛错', () => {
    delete (globalThis as any)[REPORT_REQUEST]
    expect(() => report('custom', { a: 1 })).not.toThrow()
  })
})

describe('mp 上报周期与缓存', () => {
  it('按配置周期自动发送（非 immediate）', () => {
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })
    getReport()('custom', { a: 1 })

    expect(requestMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)

    expect(requestMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(requestMock.mock.calls[0][0].data)
    expect(payload.data[0].type).toBe('custom')
  })

  it('store:false 的数据只进内存，最多保留 20 条，随请求发送后清空', () => {
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })
    const r = getReport()

    for (let i = 0; i < 30; i++) r('track', { i }, { store: false })
    r('custom', { a: 1 }, { immediate: true })

    expect(requestMock).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(requestMock.mock.calls[0][0].data)
    const tracks = payload.data.filter((item: any) => item.type === 'track')
    expect(tracks).toHaveLength(20)
    // 丢弃的是最旧的数据
    expect(tracks[0].data.i).toBe(10)

    requestMock.mock.calls[0][0].success({ statusCode: 200 })
    expect(readQueue()).toEqual([])
  })

  it('没有可发送数据时不发起请求', () => {
    stubUni({
      setStorageSync: () => {
        throw new Error('quota')
      },
    })
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })

    expect(() => getReport()('custom', { a: 1 }, { immediate: true })).not.toThrow()
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('请求失败后保留队列并按周期重试', () => {
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })
    getReport()('custom', { a: 1 }, { immediate: true })

    requestMock.mock.calls[0][0].fail({ errMsg: 'request:fail timeout' })
    expect(readQueue()).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(requestMock).toHaveBeenCalledTimes(2)
  })
})

describe('mp NetworkPlugin 补充分支', () => {
  it('success=false 时可由 condition 决定是否上报', () => {
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true, success: false, fail: true } },
      report: vi.fn(),
    }
    new NetworkPlugin({ condition: (res: any) => res.statusCode === 200 }).init(c as any)
    const wrapped = uni.request as any

    wrapped({ url: '/api', method: 'GET', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[0][0].success({ statusCode: 200, data: 'raw', header: { trace: '1' } })

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_API,
      expect.objectContaining({ type: 'success', url: '/api', status: 200, response: 'raw' }),
      { store: false },
    )
  })

  it('condition 返回 false 时成功请求不上报', () => {
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true, success: false, fail: true } },
      report: vi.fn(),
    }
    new NetworkPlugin({ condition: () => false }).init(c as any)
    const wrapped = uni.request as any

    wrapped({ url: '/api', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[0][0].success({ statusCode: 200, data: '', header: {} })

    expect(c.report).not.toHaveBeenCalled()
  })

  it('采集请求体、响应类型、响应头并透传宿主回调', () => {
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true, success: true, fail: true } },
      report: vi.fn(),
    }
    new NetworkPlugin({}).init(c as any)
    const wrapped = uni.request as any

    const success = vi.fn()
    const complete = vi.fn()
    const res = { statusCode: 200, data: { ok: true }, header: { 'x-trace': '1' }, profile: {} }
    wrapped({ url: '/api', method: 'POST', data: { a: 1 }, responseType: 'json', success, fail: vi.fn(), complete })
    requestMock.mock.calls[0][0].success(res)
    requestMock.mock.calls[0][0].complete(res)

    const info = c.report.mock.calls[0][1]
    expect(info).toMatchObject({
      type: 'success',
      url: '/api',
      method: 'POST',
      body: '[object Object]',
      response: '{"ok":true}',
      responseType: 'json',
      status: 200,
    })
    expect(info.responseHeaders).toContain('x-trace')
    expect(success).toHaveBeenCalledWith(res)
    expect(complete).toHaveBeenCalledWith(res)
  })
})
