import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuryReport } from '../src/browser/index'
import { LIFECYCLE, REPORT_REQUEST } from '../src/constant'

const URL = 'http://report.example/record'

function getReport() {
  return (globalThis as any)[REPORT_REQUEST]
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  delete (globalThis as any).__BR_MOCK_WORKER_FACTORY
  ;(dom.window as any).__BR_WORKER__ = undefined
  dom.localStorage.clear()
  dom.sessionStorage.clear()
  // 每个用例独立统计，避免静态状态串扰
  ;(BuryReport as any).cache = []
  ;(BuryReport as any).pluginsOrder = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  ;(dom.window as any).__BR_WORKER__ = undefined
  ;(BuryReport as any).cache = []
})

describe('条件1：网络波动 / 服务器宕机不影响宿主', () => {
  it('fetch 拒绝时不抛错、无未处理异常，后续上报仍正常', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', fetchMock)

    expect(() => new BuryReport({ url: URL, appid: 'a', report: true })).not.toThrow()
    const report = getReport()

    // 立即上报应同步返回，不阻塞宿主
    expect(() => report('custom', { a: 1 }, { immediate: true })).not.toThrow()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalled()

    // 恢复网络后继续上报
    fetchMock.mockResolvedValue({ ok: true })
    expect(() => report('custom', { a: 2 }, { immediate: true })).not.toThrow()
  })

  it('fetch 同步抛错（url 非法）时不抛错', () => {
    const fetchMock = vi.fn(() => {
      throw new TypeError('Invalid URL')
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(() => new BuryReport({ url: URL, appid: 'a', report: true })).not.toThrow()
    expect(() => getReport()('custom', {}, { immediate: true })).not.toThrow()
  })

  it('worker 创建失败（如 CSP 限制）不抛错，数据降级由主线程发送', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    // 不设置 mock factory，默认创建 worker 抛错

    expect(() => new BuryReport({ url: URL, appid: 'a', report: true })).not.toThrow()
    expect((dom.window as any).__BR_WORKER__).toBeUndefined()

    const report = getReport()
    expect(() => report('custom', { a: 1 }, { immediate: true })).not.toThrow()
    expect(() => report('track', { e: [] }, { store: false, immediate: true })).not.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 无 worker 时 store:false 的数据也并入主线程请求，不丢失
    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body.data.map((d: any) => d.type)).toEqual(['track'])
  })

  it('worker postMessage 抛错时不抛错，且后续上报正常', () => {
    const worker = {
      postMessage: vi.fn(() => {
        throw new Error('postMessage failed')
      }),
      onmessage: null as any,
    }
    vi.stubGlobal('__BR_MOCK_WORKER_FACTORY', () => worker)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    expect(() => new BuryReport({ url: URL, appid: 'a', report: true })).not.toThrow()
    expect(() => getReport()('track', { e: [] }, { store: false, immediate: true })).not.toThrow()
    expect(worker.postMessage).toHaveBeenCalled()
  })

  it('worker 异常终止后再次上报不抛错，数据走主线程', () => {
    const worker = {
      postMessage: vi.fn(() => {
        throw new Error('postMessage failed')
      }),
      onmessage: null as any,
    }
    vi.stubGlobal('__BR_MOCK_WORKER_FACTORY', () => worker)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    // 触发一次 postMessage 失败后，模拟主线程把 worker 置空
    getReport()('track', { e: [] }, { store: false, immediate: true })
    ;(dom.window as any).__BR_WORKER__ = undefined

    expect(() => getReport()('custom', { a: 1 }, { immediate: true })).not.toThrow()
    expect(fetchMock).toHaveBeenCalled()
  })
})

describe('条件2：开发者配置错误不影响宿主', () => {
  it('config 缺失或类型错误不抛错', () => {
    expect(() => new BuryReport(undefined as any)).not.toThrow()
    expect(() => new BuryReport({} as any)).not.toThrow()
    expect(() =>
      new BuryReport({
        url: 123 as any,
        appid: 'a',
        interval: 'bad' as any,
        network: 'x' as any,
        operationRecord: 'y' as any,
        report: true,
      }),
    ).not.toThrow()

    expect(() => getReport()('custom', {}, { immediate: true })).not.toThrow()
  })

  it('非法 interval 回退默认周期，不会造成疯狂轮询', () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true, interval: 'bad' as any })
    getReport()('custom', {})

    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10 * 1000 - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('插件初始化抛错不影响宿主', () => {
    class BadPlugin {
      name = 'badPlugin'
      init() {
        throw new Error('plugin broken')
      }
    }
    ;(BuryReport as any).registerPlugin(new BadPlugin())
    expect(() => new BuryReport({ url: URL, appid: 'a', report: true })).not.toThrow()
    // 宿主的上报功能仍可用
    expect(() => getReport()('custom', {}, { immediate: true })).not.toThrow()
  })
})

describe('生命周期与常规上报', () => {
  it('pagehide 触发立即上报且不抛错', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    expect(() => dom.window.dispatchEvent(new Event('pagehide'))).not.toThrow()
    expect(fetchMock).toHaveBeenCalled()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].type).toBe(LIFECYCLE)
  })

  it('visibilitychange(hidden) 触发立即上报且不抛错', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'a', report: true })
    Object.defineProperty(dom.document, 'visibilityState', { value: 'hidden', configurable: true })
    expect(() => dom.document.dispatchEvent(new Event('visibilitychange'))).not.toThrow()
    expect(fetchMock).toHaveBeenCalled()
  })

  it('自定义上报会携带 appid 与记录结构', () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    new BuryReport({ url: URL, appid: 'my-app', report: true })
    getReport()('custom', { hello: 1 }, { immediate: true })

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ method: 'post', mode: 'no-cors' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.appid).toBe('my-app')
    expect(body.data[0]).toMatchObject({ appid: 'my-app', type: 'custom', data: { hello: 1 } })
  })
})
