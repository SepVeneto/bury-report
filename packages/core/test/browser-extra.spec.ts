import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuryReport } from '../src/browser/index'
import { LIFECYCLE, REPORT_REQUEST } from '../src/constant'
import { readQueue } from '../src/utils'

const URL = 'http://report.example/record'

function getReport() {
  return (globalThis as any)[REPORT_REQUEST]
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function setVisibility(state: string) {
  Object.defineProperty(dom.document, 'visibilityState', { value: state, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers()
  dom.bus.clear()
  dom.localStorage.clear()
  dom.sessionStorage.clear()
  setVisibility('visible')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  delete (globalThis as any).__BR_MOCK_WORKER_FACTORY
  ;(dom.window as any).__BR_WORKER__ = undefined
  ;(BuryReport as any).cache = []
  ;(BuryReport as any).pluginsOrder = []
  ;(BuryReport as any).instance = undefined
})

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
  ;(dom.window as any).__BR_WORKER__ = undefined
  ;(BuryReport as any).cache = []
  ;(BuryReport as any).pluginsOrder = []
  ;(BuryReport as any).instance = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('worker 生命周期', () => {
  function stubWorker() {
    const worker = {
      postMessage: vi.fn(),
      onmessage: null as any,
    }
    vi.stubGlobal('__BR_MOCK_WORKER_FACTORY', () => worker)
    return worker
  }

  it('收到 exception 消息后判定 worker 已终止', () => {
    const worker = stubWorker()
    new BuryReport({ url: URL, appid: 'a', report: true })

    expect(typeof worker.onmessage).toBe('function')
    worker.onmessage({ data: { type: 'exception' } })

    expect(dom.window.__BR_WORKER__).toBeUndefined()
    expect(console.log).toHaveBeenCalledWith('[report-core] worker terminated')
  })

  it('worker 正常时队列走主线程、store:false 走 worker，互不重复', async () => {
    const worker = stubWorker()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    const report = getReport()

    report('custom', { a: 1 }, { immediate: true })
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data.map((item: any) => item.type)).toEqual(['custom'])
    expect(worker.postMessage).not.toHaveBeenCalled()

    report('track', { e: [] }, { store: false, immediate: true })
    await flush()

    // store:false 的数据不落到 localStorage 队列，交给 worker 上报
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    const message = worker.postMessage.mock.calls[0][0]
    expect(message).toMatchObject({ type: 'report', appid: 'a', keepalive: false })
    expect(message.store).toHaveLength(1)
    expect(message.store[0].type).toBe('track')
    expect((BuryReport as any).cache).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('上报选项', () => {
  it('flush=true 时立即写入本地队列', () => {
    new BuryReport({ url: URL, appid: 'a', report: true })
    getReport()('custom', { a: 1 }, { flush: true })

    expect(readQueue()).toHaveLength(1)
    expect(readQueue()[0].type).toBe('custom')
  })

  it('keepalive=true 的上报请求带 keepalive 标记', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    getReport()('custom', { a: 1 }, { immediate: true, keepalive: true })
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(URL, expect.objectContaining({ keepalive: true }))
  })

  it('发送中的并发上报不并发重复请求，但会在当前请求结束后立即补发', async () => {
    const resolvers: any[] = []
    const fetchMock = vi.fn(() => new Promise(resolve => {
      resolvers.push(resolve)
    }))
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    const report = getReport()

    report('first', { i: 1 }, { immediate: true })
    report('second', { i: 2 }, { immediate: true })

    // 前一个请求未结束时不并发发送，避免重复请求
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 前一个请求结束后，第二个 immediate 立即补发，而不是等下一个时间窗口
    resolvers[0]({ ok: true })
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse((fetchMock.mock.calls[1] as any[])[1].body)
    expect(body.data.map((item: any) => item.data.i)).toEqual([2])
  })

  it('请求成功时只删除本次实际发送的记录，保留发送期间新进入的数据', async () => {
    let resolveFetch: any
    const fetchMock = vi.fn(() => new Promise(resolve => {
      resolveFetch = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    const report = getReport()

    report('sent', { i: 1 }, { immediate: true })
    // 请求进行中又有新数据落盘
    report('during', { i: 2 }, { flush: true })
    expect(readQueue().map((item: any) => item.type)).toEqual(['sent', 'during'])

    resolveFetch({ ok: true })
    await flush()

    // 只删除本次实际发送的 sent，发送期间新进入的 during 必须保留
    expect(readQueue().map((item: any) => item.type)).toEqual(['during'])
  })

  it('存储不可用导致没有可发送数据时不发起请求', async () => {
    vi.spyOn(dom.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    getReport()('custom', { a: 1 }, { immediate: true })
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('发送过程出现未知异常时只告警，不影响宿主', async () => {
    new BuryReport({ url: URL, appid: 'a', report: true })
    // 模拟序列化缓存时抛错，进入 sendRequest 的兜底 catch
    ;(BuryReport as any).cache = {
      map: () => {
        throw new Error('boom')
      },
    }

    expect(() => getReport()('custom', { a: 1 }, { immediate: true })).not.toThrow()
    await flush()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('send request failed'),
    )
  })
})

describe('页面生命周期联动', () => {
  it('页面隐藏时通知录屏插件并上报 LIFECYCLE', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const collect = vi.fn()
    class FakeOperationPlugin {
      name = 'OperationRecordPlugin'
      collect = collect
      init() {}
    }
    ;(BuryReport as any).registerPlugin(new FakeOperationPlugin() as any)

    new BuryReport({
      url: URL,
      appid: 'a',
      report: true,
      operationRecord: { enable: true },
    })

    setVisibility('hidden')
    dom.document.dispatchEvent(new Event('visibilitychange'))

    expect(collect).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0]).toMatchObject({ type: LIFECYCLE, data: { t: 'visibilitychange' } })
  })

  it('页面可见时不触发上报', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    setVisibility('visible')
    dom.document.dispatchEvent(new Event('visibilitychange'))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pagehide 携带 persisted 标记（往返缓存）', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    const evt = new Event('pagehide') as any
    Object.defineProperty(evt, 'persisted', { value: true })
    dom.window.dispatchEvent(evt)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0]).toMatchObject({ type: LIFECYCLE, data: { t: 'pagehide', c: true } })
  })

  it('pagehide 时通知录屏插件 flush 剩余事件', () => {
    const collect = vi.fn()
    class FakeOperationPlugin {
      name = 'OperationRecordPlugin'
      collect = collect
      init() {}
    }
    ;(BuryReport as any).registerPlugin(new FakeOperationPlugin() as any)

    new BuryReport({
      url: URL,
      appid: 'a',
      report: true,
      operationRecord: { enable: true },
    })
    dom.window.dispatchEvent(new Event('pagehide'))

    expect(collect).toHaveBeenCalledTimes(1)
  })
})

describe('上报重试上限', () => {
  function registerRecordPlugin() {
    const destroy = vi.fn()
    class FakeRecordPlugin {
      name = 'OperationRecordPlugin'
      init() {}
      destroy = destroy
    }
    ;(BuryReport as any).registerPlugin(new FakeRecordPlugin() as any)
    return destroy
  }

  it('连续失败超过 maxRetry 后停止上报并中止录屏', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'))
    vi.stubGlobal('fetch', fetchMock)
    const destroy = registerRecordPlugin()

    new BuryReport({
      url: URL,
      appid: 'a',
      report: true,
      maxRetry: 2,
      operationRecord: { enable: true },
    })
    const report = getReport()

    report('custom', { a: 1 }, { immediate: true })
    await flush()
    vi.advanceTimersByTime(10 * 1000)
    await flush()
    vi.advanceTimersByTime(10 * 1000)
    await flush()

    // maxRetry=2：首次 + 2 次重试都失败后中止
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((BuryReport as any).instance.aborted).toBe(true)
    // 录屏等插件被销毁
    expect(destroy).toHaveBeenCalledTimes(1)

    // 中止后不再产生任何请求
    report('custom', { a: 2 }, { immediate: true })
    vi.advanceTimersByTime(60 * 1000)
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('maxRetry=0 表示不限制重试次数', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('down'))
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true, maxRetry: 0 })
    getReport()('custom', { a: 1 }, { immediate: true })

    for (let i = 0; i < 8; i++) {
      await flush()
      vi.advanceTimersByTime(10 * 1000)
    }
    await flush()

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(8)
    expect((BuryReport as any).instance.aborted).toBe(false)
  })

  it('收到 worker 重试耗尽通知后中止上报相关操作并终止 worker', () => {
    const worker = { postMessage: vi.fn(), onmessage: null as any, terminate: vi.fn() }
    vi.stubGlobal('__BR_MOCK_WORKER_FACTORY', () => worker)
    const destroy = registerRecordPlugin()

    new BuryReport({ url: URL, appid: 'a', report: true, operationRecord: { enable: true } })

    expect(typeof worker.onmessage).toBe('function')
    worker.onmessage({ data: { type: 'exhausted' } })

    expect((BuryReport as any).instance.aborted).toBe(true)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(dom.window.__BR_WORKER__).toBeUndefined()
  })

  it('worker 上报时透传 maxRetry', async () => {
    const worker = { postMessage: vi.fn(), onmessage: null as any }
    vi.stubGlobal('__BR_MOCK_WORKER_FACTORY', () => worker)

    new BuryReport({ url: URL, appid: 'a', report: true, maxRetry: 3 })
    getReport()('track', { e: [] }, { store: false, immediate: true })
    await flush()

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage.mock.calls[0][0]).toMatchObject({ type: 'report', maxRetry: 3 })
  })
})
