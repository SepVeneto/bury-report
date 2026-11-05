import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PERF_INFO } from '../src/constant'

const vitals = vi.hoisted(() => {
  const callbacks = new Map<string, (metric: any) => void>()
  return {
    callbacks,
    reset() {
      callbacks.clear()
    },
  }
})

vi.mock('web-vitals', () => {
  const register = (name: string) => (callback: (metric: any) => void) => {
    vitals.callbacks.set(name, callback)
  }
  return {
    onFCP: register('FCP'),
    onLCP: register('LCP'),
    onINP: register('INP'),
    onTTFB: register('TTFB'),
  }
})

const ORIGINAL_WINDOW_PERFORMANCE = dom.window.performance
const ORIGINAL_TOP = (dom.window as any).top

class FakeObserver {
  static cb: ((list: any) => void) | undefined
  static instances: FakeObserver[] = []

  observe = vi.fn()
  disconnect = vi.fn()

  constructor(cb: (list: any) => void) {
    FakeObserver.cb = cb
    FakeObserver.instances.push(this)
  }
}

function stubObserver() {
  ;(dom.window as any).PerformanceObserver = FakeObserver
  vi.stubGlobal('PerformanceObserver', FakeObserver)
}

function defineTop(value: any) {
  Object.defineProperty(dom.window, 'top', {
    value,
    writable: true,
    configurable: true,
  })
}

async function loadPerf() {
  vi.resetModules()
  const mod = await import('../src/browser/plugins/perf')
  return mod.PerfPlugin
}

function ctx(overrides: Record<string, any> = {}) {
  return {
    options: { url: 'http://report.example/record', appid: 'a', ...overrides },
    report: vi.fn(),
  }
}

function entries(list: any[]) {
  return { getEntries: () => list } as any
}

function metric(name: string, value: number, overrides: Record<string, any> = {}) {
  return {
    name,
    value,
    rating: 'good',
    delta: value,
    id: `${name}-id`,
    entries: [],
    navigationType: 'navigate',
    navigationId: 1,
    ...overrides,
  }
}

function resource(overrides: Record<string, any>) {
  return {
    entryType: 'resource',
    name: 'https://cdn.example/app.js',
    initiatorType: 'script',
    startTime: 100,
    duration: 200,
    requestStart: 120,
    responseEnd: 300,
    ...overrides,
  }
}

function emitVital(name: string, value: number, overrides: Record<string, any> = {}) {
  const callback = vitals.callbacks.get(name)
  if (!callback) throw new Error(`missing web-vitals callback: ${name}`)
  callback(metric(name, value, overrides))
}

function pageHide() {
  dom.document.dispatchEvent({ type: 'pagehide', timeStamp: 5000 })
}

beforeEach(() => {
  dom.bus.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  FakeObserver.cb = undefined
  FakeObserver.instances = []
  vitals.reset()
  stubObserver()
  defineTop(dom.window)
  ;(dom.window as any).performance = ORIGINAL_WINDOW_PERFORMANCE
  ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntries = () => []
  ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => []
  dom.document.referrer = ''
  dom.document.visibilityState = 'visible'
})

afterEach(() => {
  defineTop(ORIGINAL_TOP)
  ;(dom.window as any).performance = ORIGINAL_WINDOW_PERFORMANCE
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PerfPlugin', () => {
  it('通过 web-vitals 注册 FCP、LCP、INP、TTFB 并持续观察资源', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    expect([...vitals.callbacks.keys()].sort()).toEqual(['FCP', 'INP', 'LCP', 'TTFB'])
    expect(FakeObserver.instances).toHaveLength(1)
    expect(FakeObserver.instances[0].observe).toHaveBeenCalledWith({
      type: 'resource',
      buffered: true,
    })
    expect(c.report).not.toHaveBeenCalled()
  })

  it('页面隐藏时一次性上报四项 web-vitals 指标', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx({ stamp: 'build-stamp' })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('TTFB', 120.45)
    emitVital('FCP', 1234.56)
    emitVital('LCP', 2345.67, { rating: 'needs-improvement' })
    emitVital('INP', 88.88, { rating: 'poor' })
    pageHide()

    expect(c.report).toHaveBeenCalledTimes(1)
    expect(c.report).toHaveBeenCalledWith(PERF_INFO, {
      perfVersion: 2,
      fcp: 1234.6,
      lcp: 2345.7,
      inp: 88.9,
      ttfb: 120.5,
      ratings: {
        ttfb: 'good',
        fcp: 'good',
        lcp: 'needs-improvement',
        inp: 'poor',
      },
      metricIds: {
        ttfb: 'TTFB-id',
        fcp: 'FCP-id',
        lcp: 'LCP-id',
        inp: 'INP-id',
      },
      navigationType: 'navigate',
      if: false,
      stamp: 'build-stamp',
    }, {
      immediate: true,
      flush: true,
      keepalive: true,
    })
    expect(FakeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('资源清单同时包含 FCP 前和 FCP 后发起的请求', async () => {
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => [
      resource({
        name: 'https://cdn.example/before.js',
        startTime: 100,
        requestStart: 120,
        responseEnd: 300,
        duration: 200,
      }),
      resource({
        name: 'https://cdn.example/pending.js',
        startTime: 1200,
        requestStart: 1250,
        responseEnd: 2400,
        duration: 1200,
      }),
      resource({
        name: 'https://cdn.example/after.js',
        startTime: 2500,
        requestStart: 2520,
        responseEnd: 2800,
        duration: 300,
      }),
    ]
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 2000)
    emitVital('LCP', 3000)
    pageHide()

    expect(c.report.mock.calls[0][1]).toMatchObject({
      resourceCount: 3,
      resourcesBeforeFcp: 2,
      resourcesAfterFcp: 1,
      resourcesCompletedBeforeFcp: 1,
      resourcesCompletedAfterFcp: 2,
      resources: [
        {
          url: 'https://cdn.example/before.js',
          phase: 'before-fcp',
        },
        {
          url: 'https://cdn.example/pending.js',
          phase: 'before-fcp',
          responsePhase: 'after-fcp',
          responseEnd: 2400,
        },
        {
          url: 'https://cdn.example/after.js',
          phase: 'after-fcp',
        },
      ],
    })
  })

  it('通过 resource observer 捕获并从缓冲区清理中恢复动态资源', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    FakeObserver.cb!(entries([
      resource({
        name: 'https://cdn.example/dynamic.js',
        startTime: 200,
        responseEnd: 500,
      }),
    ]))
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntries = () => []
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => []
    emitVital('FCP', 3000)
    emitVital('LCP', 4000)
    pageHide()

    expect(c.report.mock.calls[0][1].resources[0]).toMatchObject({
      url: 'https://cdn.example/dynamic.js',
      type: 'script',
      phase: 'before-fcp',
    })
  })

  it('跨域资源缺少 TAO 授权时保留资源并将响应耗时标记为未知', async () => {
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => [
      resource({
        name: 'https://cross-origin.example/app.js',
        startTime: 100,
        fetchStart: 100,
        requestStart: 0,
        responseStart: 0,
        responseEnd: 0,
        duration: 300,
      }),
    ]
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 2000)
    emitVital('LCP', 3000)
    pageHide()

    expect(c.report.mock.calls[0][1].resources[0]).toMatchObject({
      url: 'https://cross-origin.example/app.js',
      responseEnd: 400,
      responseTime: null,
      duration: 300,
    })
  })

  it('资源超过上限时为 FCP 前后两个阶段各保留一半', async () => {
    const resources = [
      ...Array.from({ length: 300 }, (_, index) => resource({
        name: `https://cdn.example/before/${index}.js`,
        startTime: index + 1,
        responseEnd: index + 2,
      })),
      ...Array.from({ length: 300 }, (_, index) => resource({
        name: `https://cdn.example/after/${index}.js`,
        startTime: 2001 + index,
        responseEnd: 2002 + index,
      })),
    ]
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => resources
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 2000)
    emitVital('LCP', 3000)
    pageHide()

    const data = c.report.mock.calls[0][1]
    expect(data.resourceCount).toBe(600)
    expect(data.resourcesBeforeFcp).toBe(300)
    expect(data.resourcesAfterFcp).toBe(300)
    expect(data.resources).toHaveLength(200)
    expect(data.resources.filter((item: any) => item.phase === 'before-fcp')).toHaveLength(100)
    expect(data.resources.filter((item: any) => item.phase === 'after-fcp')).toHaveLength(100)
  })

  it('FCP 未超过阈值时不扫描或上报资源清单', async () => {
    const getEntriesByType = vi.fn(() => [resource({})])
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = getEntriesByType
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1500 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 1500)
    emitVital('LCP', 3000)
    pageHide()

    const data = c.report.mock.calls[0][1]
    expect(getEntriesByType).not.toHaveBeenCalled()
    expect(data.fcp).toBe(1500)
    expect(data).not.toHaveProperty('resources')
  })

  it('资源清单只统计到 LCP，LCP 后发起的请求会被排除', async () => {
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => [
      resource({
        name: 'https://cdn.example/before-lcp.js',
        startTime: 1000,
        responseEnd: 1500,
      }),
      resource({
        name: 'https://cdn.example/at-lcp.js',
        startTime: 2500,
        responseEnd: 3000,
      }),
      resource({
        name: 'https://cdn.example/after-lcp.js',
        startTime: 3500,
        responseEnd: 4000,
      }),
    ]
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 1500)
    emitVital('LCP', 2500)
    pageHide()

    const data = c.report.mock.calls[0][1]
    expect(data.resourceCount).toBe(2)
    expect(data.resources.map((item: any) => item.url)).toEqual([
      'https://cdn.example/before-lcp.js',
      'https://cdn.example/at-lcp.js',
    ])
  })

  it('没有 LCP 截止点时不上报资源清单', async () => {
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => [resource({})]
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 2000)
    pageHide()

    expect(c.report.mock.calls[0][1]).not.toHaveProperty('resources')
  })

  it('visibilitychange 和 pagehide 只产生一条性能记录', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 1000)
    dom.document.visibilityState = 'hidden'
    dom.document.dispatchEvent({ type: 'visibilitychange' })
    pageHide()

    expect(c.report).toHaveBeenCalledTimes(1)
  })

  it('忽略无效 FCP，但仍上报其他 web-vitals 指标', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 10 * 60 * 1000)
    emitVital('TTFB', 100)
    emitVital('LCP', 2000)
    pageHide()

    const data = c.report.mock.calls[0][1]
    expect(data.fcp).toBeNull()
    expect(data.inp).toBeNull()
    expect(data.ttfb).toBe(100)
    expect(data.lcp).toBe(2000)
  })

  it('性能 API 或单条资源数据异常时仍上报指标', async () => {
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => {
      throw new Error('resource timing unavailable')
    }
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 2000)
    emitVital('LCP', 3000)
    expect(() => pageHide()).not.toThrow()

    expect(c.report.mock.calls[0][1].fcp).toBe(2000)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('collect performance failed'),
    )
  })

  it('宿主上报函数抛错时不向宿主抛出异常', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    c.report.mockImplementation(() => {
      throw new Error('host report failed')
    })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 1000)
    expect(() => pageHide()).not.toThrow()
  })

  it('不在 iframe 中时 if 为 false', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    emitVital('FCP', 1000)
    pageHide()

    expect(c.report.mock.calls[0][1].if).toBe(false)
  })

  it('在 iframe 中时记录来源', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    defineTop({})
    dom.document.referrer = 'http://parent.example/page'
    emitVital('FCP', 1000)
    pageHide()

    expect(c.report.mock.calls[0][1].if).toBe('http://parent.example/page')
  })

  it('跨域访问 window.top 抛错时按 iframe 处理', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    Object.defineProperty(dom.window, 'top', {
      get() {
        throw new Error('cross origin')
      },
      configurable: true,
    })
    emitVital('FCP', 1000)
    pageHide()

    expect(c.report.mock.calls[0][1].if).toBe(true)
  })

  it('不支持 PerformanceObserver 时仍上报 web-vitals 指标', async () => {
    ;(dom.window as any).PerformanceObserver = undefined
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    expect(() => plugin.init(c as any)).not.toThrow()

    emitVital('TTFB', 80)
    pageHide()
    expect(c.report.mock.calls[0][1].ttfb).toBe(80)
  })

  it('destroy 后不再上报', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.destroy()
    emitVital('FCP', 1000)
    pageHide()

    expect(c.report).not.toHaveBeenCalled()
    expect(FakeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)
  })
})
