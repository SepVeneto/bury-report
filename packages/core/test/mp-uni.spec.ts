import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuryReport, NetworkPlugin } from '../src/mp-uni/index'
import { COLLECT_API, REPORT_REQUEST } from '../src/constant'
import { readQueue } from '../src/utils'

const storage = new Map<string, string>()
let requestMock: ReturnType<typeof vi.fn>

function getReport() {
  return (globalThis as any)[REPORT_REQUEST]
}

beforeEach(() => {
  storage.clear()
  requestMock = vi.fn()
  vi.stubGlobal('uni', {
    request: requestMock,
    setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BuryReport（mp）', () => {
  it('immediate 上报立即调用 uni.request，成功后清空队列', () => {
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })
    getReport()('custom', { a: 1 }, { immediate: true })

    expect(requestMock).toHaveBeenCalledTimes(1)
    const opts = requestMock.mock.calls[0][0]
    expect(opts.url).toBe('https://mp/report')
    expect(opts.method).toBe('POST')

    const payload = JSON.parse(opts.data)
    expect(payload.appid).toBe('a')
    expect(payload.data[0].type).toBe('custom')

    opts.success({ statusCode: 200 })
    expect(readQueue()).toEqual([])
  })

  it('请求失败（服务器宕机/网络波动）不抛错，保留队列等待重试', () => {
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })
    getReport()('custom', {}, { immediate: true })

    const opts = requestMock.mock.calls[0][0]
    expect(() => opts.fail({ errMsg: 'request:fail timeout' })).not.toThrow()

    // 失败后队列保留
    expect(readQueue()).toHaveLength(1)
    // 下一次上报仍然会发送（不再永久熔断）
    expect(() => getReport()('custom', {}, { immediate: true })).not.toThrow()
    expect(requestMock).toHaveBeenCalledTimes(2)
    // 成功后清空
    requestMock.mock.calls[1][0].success({ statusCode: 200 })
    expect(readQueue()).toEqual([])
  })

  it('uni.request 同步抛错（参数错误）也不影响宿主', () => {
    requestMock.mockImplementation(() => {
      throw new Error('bad params')
    })
    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })

    expect(() => getReport()('custom', {}, { immediate: true })).not.toThrow()
  })

  it('配置错误不抛错，上报流程仍可用', () => {
    expect(() => new BuryReport(undefined as any)).not.toThrow()
    expect(() => new BuryReport({} as any)).not.toThrow()
    expect(() =>
      new BuryReport({
        url: 'x',
        appid: 'a',
        interval: 'bad' as any,
        network: 'x' as any,
        report: true,
      }),
    ).not.toThrow()
    expect(() => getReport()('custom', {}, { immediate: true })).not.toThrow()
  })
})

describe('NetworkPlugin（mp）', () => {
  it('enable=false 不代理 uni.request', () => {
    const original = uni.request
    const c = { options: { url: 'https://mp/report', appid: 'a', network: { enable: false } }, report: vi.fn() }
    new NetworkPlugin().init(c as any)
    expect(uni.request).toBe(original)
  })

  it('enable=true 时代理 uni.request 并上报成功/失败', () => {
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true, success: true, fail: true } },
      report: vi.fn(),
    }
    new NetworkPlugin().init(c as any)
    const wrapped = uni.request as any

    // 200 成功
    wrapped({ url: '/api', method: 'GET', success: vi.fn(), fail: vi.fn(), complete: vi.fn() })
    requestMock.mock.calls[0][0].success({ statusCode: 200, data: '{}', header: {}, profile: {} })
    expect(c.report).toHaveBeenCalledWith(
      COLLECT_API,
      expect.objectContaining({ type: 'success', url: '/api', status: 200 }),
      { store: false },
    )

    // 非200（500）由 fail 上报
    wrapped({ url: '/api2', method: 'GET', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[1][0].success({ statusCode: 500, data: 'err', header: {} })
    expect(c.report).toHaveBeenCalledWith(
      COLLECT_API,
      expect.objectContaining({ type: 'fail', url: '/api2', status: 500 }),
      { store: false },
    )

    // 传输层失败
    wrapped({ url: '/api3', method: 'GET', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[2][0].fail({ errMsg: 'request:fail timeout' })
    expect(c.report).toHaveBeenCalledWith(
      COLLECT_API,
      expect.objectContaining({ type: 'fail', url: '/api3' }),
      { store: false },
    )
  })

  it('fail=false 时不报非200和传输失败', () => {
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true, success: true, fail: false } },
      report: vi.fn(),
    }
    new NetworkPlugin().init(c as any)
    const wrapped = uni.request as any

    wrapped({ url: '/api', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[0][0].success({ statusCode: 500, data: 'err', header: {} })
    wrapped({ url: '/api2', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[1][0].fail({ errMsg: 'fail' })

    expect(c.report).not.toHaveBeenCalled()
  })

  it('上报接口自身的请求不会重复上报', () => {
    const c = {
      options: { url: 'https://mp/report', appid: 'a', network: { enable: true } },
      report: vi.fn(),
    }
    new NetworkPlugin().init(c as any)
    const wrapped = uni.request as any

    wrapped({ url: 'https://mp/report', success: vi.fn(), fail: vi.fn() })
    requestMock.mock.calls[0][0].success({ statusCode: 200, data: '{}', header: {} })
    expect(c.report).not.toHaveBeenCalled()
  })
})
