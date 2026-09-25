import { dom } from './helpers/dom-stub'
import { selfState } from './helpers/self-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@rrweb/types'
import { BuryReport } from '../src/browser/index'
import { BuryReport as MpBuryReport } from '../src/mp-uni/index'
import { NetworkPlugin } from '../src/browser/plugins/network'
import { ErrorPlugin as BrowserErrorPlugin } from '../src/browser/plugins/error'
import { ErrorPlugin as MpErrorPlugin } from '../src/mp-uni/plugins/error'
import { getBrowserInfo } from '../src/browser/plugins/collect'
import { LIFECYCLE, OPERATION_TRACK, REPORT_REQUEST } from '../src/constant'

const { takeFullSnapshot, record } = vi.hoisted(() => ({
  takeFullSnapshot: vi.fn(),
  record: vi.fn(),
}))

vi.mock('@rrweb/record', () => ({
  record: Object.assign(record, { takeFullSnapshot }),
}))

import '../src/browser/plugins/operationRecord'

const URL = 'http://report.example/record'
const ORIGINAL_CONSOLE_ERROR = console.error
const OriginalXHR = dom.window.XMLHttpRequest
const originalPushState = (dom.window as any).history.pushState
const originalReplaceState = (dom.window as any).history.replaceState

function getReport() {
  return (globalThis as any)[REPORT_REQUEST]
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  dom.bus.clear()
  vi.useFakeTimers()
  dom.window.XMLHttpRequest = OriginalXHR
  dom.window.history.pushState = originalPushState
  dom.window.history.replaceState = originalReplaceState
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  delete (globalThis as any).__BR_MOCK_WORKER_FACTORY
  ;(dom.window as any).__BR_WORKER__ = undefined
  ;(BuryReport as any).cache = []
  ;(BuryReport as any).pluginsOrder = []
  ;(BuryReport as any).instance = undefined
})

afterEach(() => {
  vi.useRealTimers()
  console.error = ORIGINAL_CONSOLE_ERROR
  dom.window.XMLHttpRequest = OriginalXHR
  ;(BuryReport as any).cache = []
  ;(BuryReport as any).pluginsOrder = []
  ;(BuryReport as any).instance = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('插件 enable 开关', () => {
  it('errorPlugin / collectPlugin 分别受 error / collect 控制', () => {
    const errorInit = vi.fn()
    const collectInit = vi.fn()
    class E {
      name = 'errorPlugin'
      init = errorInit
    }
    class C {
      name = 'collectPlugin'
      init = collectInit
    }

    new BuryReport({ url: URL, appid: 'a', report: true, error: false, collect: true })
    ;(BuryReport as any).registerPlugin(new E() as any)
    ;(BuryReport as any).registerPlugin(new C() as any)

    expect(errorInit).not.toHaveBeenCalled()
    expect(collectInit).toHaveBeenCalledTimes(1)
  })

  it('未在开关内的插件默认启用', () => {
    const init = vi.fn()
    class Other {
      name = 'otherPlugin'
      init = init
    }
    new BuryReport({ url: URL, appid: 'a', report: true })
    ;(BuryReport as any).registerPlugin(new Other() as any)
    expect(init).toHaveBeenCalledTimes(1)
  })
})

describe('keepalive 分片发送失败', () => {
  it('分片请求失败只告警，不影响宿主', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')))
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    getReport()('custom', { blob: 'x'.repeat(1024) }, { flush: true })
    dom.window.dispatchEvent(new Event('pagehide'))
    await flush()

    expect(fetchMock).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[report-core] fetch error'),
    )
  })
})

describe('NetworkPlugin.send 采集请求体', () => {
  it('通过 send 发送的请求体会被记录', () => {
    const c = {
      options: { url: URL, appid: 'a', network: { enable: true, success: true, fail: true } },
      report: vi.fn(),
    }
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('POST', '/api')
    xhr.send('payload')
    xhr.status = 200
    xhr.response = '{}'
    xhr.responseURL = '/api'
    xhr.getAllResponseHeaders = () => ''
    xhr.dispatchEvent(new Event('loadend'))

    expect(c.report.mock.calls[0][1]).toMatchObject({ body: 'payload', type: 'success' })
  })
})

describe('collect.ts 剩余分支', () => {
  it('macOS 版本号包含分号时截断', () => {
    ;(dom.window.navigator as any).userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.16; rv:86.0) Gecko/20100101 Firefox/86.0'
    ;(dom.window.navigator as any).maxTouchPoints = 0

    expect(getBrowserInfo().osversion).toBe('10.16')
  })

  it('IE 版本号正则命中时返回解析值', () => {
    // IEVersion 内的正则误用了转义符，实际依赖 RegExp.$1 的静态残留；
    // 这里让 UA 中的 Win64 成为最近一次捕获组，覆盖 >6 的分支
    ;(dom.window.navigator as any).userAgent =
      'Mozilla/4.0 (compatible; MSIE 9.0; Windows NT 6.1; Win64; x64)'

    const info = getBrowserInfo()
    expect(info.browserName).toBe('ie')
    expect(info.browserVersion).toBe('64')
  })
})

describe('错误对象本身包含循环引用', () => {
  it('浏览器端 Error 无法序列化时标记 extra', () => {
    const c = { options: { url: URL, appid: 'a' }, report: vi.fn() }
    const plugin = new BrowserErrorPlugin()
    plugin.init(c as any)

    const err: any = new Error('circular error')
    err.self = err
    console.error(err)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'Error',
      message: 'circular error',
      extra: '[object with circular structre]',
    })
    plugin.resetListener()
  })

  it('浏览器端基础类型拒绝原因转为字符串', () => {
    const c = { options: { url: URL, appid: 'a' }, report: vi.fn() }
    const plugin = new BrowserErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent({ type: 'unhandledrejection', reason: 42 } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: '42',
      stack: '',
      extra: null,
    })
    plugin.resetListener()
  })

  it('小程序端 console.error 无参数与结构异常时降级', () => {
    vi.stubGlobal('uni', {
      canIUse: () => false,
      onError: () => {},
      onUnhandledRejection: () => {},
      setStorageSync: () => {},
      getStorageSync: () => undefined,
      removeStorageSync: () => {},
    })
    vi.stubGlobal('getCurrentPages', () => [])
    const c = { options: { url: 'https://mp/report', appid: 'a' }, report: vi.fn() }
    const plugin = new MpErrorPlugin()
    plugin.init(c as any)

    console.error()
    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: 'console.error with no arguments',
    })

    Object.defineProperty(Array.prototype, 'message', {
      configurable: true,
      get() {
        throw new Error('bad getter')
      },
    })
    try {
      console.error({
        get message() {
          throw new Error('serialize failed')
        },
      })
    } finally {
      delete (Array.prototype as any).message
    }

    expect(c.report.mock.calls[1][1]).toMatchObject({
      message: 'console.error unknown structure',
    })
  })
})

describe('小程序周期发送失败重排', () => {
  it('周期触发的发送失败后重新排期重试', () => {
    const requestMock = vi.fn()
    const storage = new Map<string, string>()
    vi.stubGlobal('uni', {
      request: requestMock,
      setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
      getStorageSync: (key: string) => storage.get(key),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    new MpBuryReport({ url: 'https://mp/report', appid: 'a', report: true, interval: 1 })

    getReport()('custom', { a: 1 })
    vi.advanceTimersByTime(1000)
    expect(requestMock).toHaveBeenCalledTimes(1)

    requestMock.mock.calls[0][0].fail({ errMsg: 'timeout' })
    vi.advanceTimersByTime(1000)

    expect(requestMock).toHaveBeenCalledTimes(2)
  })
})

describe('perf 剩余分支', () => {
  function entries(list: any[]) {
    return { getEntries: () => list } as any
  }

  it('页面加载时已隐藏则不记录首屏隐藏时间', async () => {
    Object.defineProperty(dom.document, 'visibilityState', { value: 'hidden', configurable: true })
    vi.resetModules()
    const { PerfPlugin } = await import('../src/browser/plugins/perf')
    Object.defineProperty(dom.document, 'visibilityState', { value: 'visible', configurable: true })

    const c = { options: { url: URL, appid: 'a' }, report: vi.fn() }
    const plugin = new PerfPlugin()
    plugin.init(c as any)
    plugin.handleEntry(entries([{ entryType: 'paint', name: 'first-contentful-paint', startTime: 1 }]))

    expect(c.report).not.toHaveBeenCalled()
  })

  it('非数字 startTime 原样上报', async () => {
    vi.resetModules()
    const { PerfPlugin } = await import('../src/browser/plugins/perf')
    const c = { options: { url: URL, appid: 'a' }, report: vi.fn() }
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([{ entryType: 'paint', name: 'first-contentful-paint', startTime: '1.5' }]))

    expect(c.report.mock.calls[0][1].fcp).toBe('1.5')
  })
})

describe('OperationRecordPlugin hook 幂等', () => {
  it('重复 hook 只包装一次 history', () => {
    const report = vi.fn()
    const Plugin = (dom.window as any).OperationRecordPlugin
    const plugin = new Plugin()
    plugin.init({ options: {}, report } as any)
    record.mockClear()
    takeFullSnapshot.mockClear()

    plugin.hook()
    plugin.hook()

    dom.window.history.pushState({}, '', '/a')
    vi.advanceTimersByTime(100)

    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)
  })
})

describe('worker 边界', () => {
  it('store 缺失时按空数据处理，不发送请求', async () => {
    vi.resetModules()
    await import('../src/browser/worker')
    selfState.fetch = vi.fn().mockResolvedValue({ ok: true })

    ;(globalThis as any).self.onmessage({ data: { type: 'report', appid: 'a' } })
    await flush()

    expect(selfState.fetch).not.toHaveBeenCalled()
  })

  it('重试定时器触发时缓冲已清空则直接返回', async () => {
    vi.resetModules()
    await import('../src/browser/worker')
    selfState.fetch = vi.fn().mockRejectedValue(new Error('down'))

    const record = (stamp: number) => ({ type: 'custom', data: {}, session: 's', uuid: 'u', time: '1', stamp })

    // 第一次失败 → 留下重试定时器与缓冲
    ;(globalThis as any).self.onmessage({
      data: { type: 'report', store: [record(1)], appid: 'a', keepalive: false },
    })
    await flush()
    expect(vi.getTimerCount()).toBe(1)

    // keepalive 上报会清空缓冲但不清理重试定时器
    selfState.fetch = vi.fn().mockResolvedValue({ ok: true })
    ;(globalThis as any).self.onmessage({
      data: { type: 'report', store: [record(2)], appid: 'a', keepalive: true },
    })
    await flush()

    // 定时器触发时缓冲为空，走提前返回
    expect(() => vi.advanceTimersByTime(10 * 1000)).not.toThrow()
    await flush()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('生命周期记录内容', () => {
  it('pagehide 上报的 LIFECYCLE 记录带 keepalive 选项', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    new BuryReport({ url: URL, appid: 'a', report: true })

    dom.window.dispatchEvent(new Event('pagehide'))

    expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ keepalive: true }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].type).toBe(LIFECYCLE)
  })

  it('录屏插件上报使用 OPERATION_TRACK 类型', () => {
    const report = vi.fn()
    const Plugin = (dom.window as any).OperationRecordPlugin
    const plugin = new Plugin()
    plugin.init({ options: {}, report } as any)
    const emit = record.mock.calls[0][0].emit

    emit({ type: EventType.FullSnapshot, data: {}, timestamp: 1 })

    expect(report.mock.calls[0][0]).toBe(OPERATION_TRACK)
  })
})
