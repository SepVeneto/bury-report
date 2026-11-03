import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PERF_INFO } from '../src/constant'

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

// perf.ts 里 `new PerformanceObserver(...)` 走的是全局标识符（Node 24 自带），
// `if (window.PerformanceObserver)` 走的是 window，因此两处都要替换
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

function fcp(startTime: number) {
  return { entryType: 'paint', name: 'first-contentful-paint', startTime }
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

beforeEach(() => {
  dom.bus.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  FakeObserver.cb = undefined
  FakeObserver.instances = []
  stubObserver()
  defineTop(dom.window)
  ;(dom.window as any).performance = ORIGINAL_WINDOW_PERFORMANCE
  ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntries = () => []
  ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => []
  dom.document.referrer = ''
})

afterEach(() => {
  defineTop(ORIGINAL_TOP)
  ;(dom.window as any).performance = ORIGINAL_WINDOW_PERFORMANCE
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PerfPlugin', () => {
  it('页面生命周期 API 初始化异常时模块加载仍然不影响宿主', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(dom.document, 'visibilityState')
    Object.defineProperty(dom.document, 'visibilityState', {
      get() {
        throw new Error('visibility unavailable')
      },
      configurable: true,
    })

    try {
      await expect(loadPerf()).resolves.toBeTypeOf('function')
    } finally {
      if (descriptor) Object.defineProperty(dom.document, 'visibilityState', descriptor)
    }
  })

  it('初始化时监听 paint 指标', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    expect(FakeObserver.instances).toHaveLength(1)
    expect(FakeObserver.instances[0].observe).toHaveBeenCalledWith({ entryTypes: ['paint'] })
    // 当前没有 paint 记录，不上报
    expect(c.report).not.toHaveBeenCalled()
  })

  it('采集到 FCP 时上报毫秒值并停止观察', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx({ stamp: 'build-stamp' })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(1.234)]))

    expect(c.report).toHaveBeenCalledWith(PERF_INFO, {
      fcp: 1234,
      if: false,
      stamp: 'build-stamp',
    })
    expect(FakeObserver.instances[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('无 stamp 配置时上报空字符串', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(1)]))

    expect(c.report.mock.calls[0][1].stamp).toBe('')
  })

  it('FCP 未超过阈值时仍上报 FCP，但不收集请求时间轴', async () => {
    const getEntriesByType = vi.fn(() => [resource({})])
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = getEntriesByType
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1500 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    expect(() => plugin.handleEntry(entries([fcp(1500)]))).not.toThrow()

    expect(getEntriesByType).not.toHaveBeenCalled()
    expect(c.report).toHaveBeenCalledWith(PERF_INFO, {
      fcp: 1_500_000,
      if: false,
      stamp: '',
    })
  })

  it('FCP 超过阈值时只上报 FCP 前完成的所有请求类型', async () => {
    const getEntriesByType = vi.fn(() => [
      resource({
        name: 'https://cdn.example/app.js',
        initiatorType: 'script',
        startTime: 100,
        requestStart: 120,
        responseEnd: 300,
        duration: 200,
      }),
      resource({
        name: 'https://cdn.example/app.css',
        initiatorType: 'link',
        startTime: 200,
        requestStart: 220,
        responseEnd: 500,
        duration: 300,
      }),
      resource({
        name: 'https://api.example/user',
        initiatorType: 'fetch',
        startTime: 300,
        requestStart: 320,
        responseEnd: 400,
        duration: 100,
      }),
      resource({
        name: 'https://cdn.example/late.png',
        initiatorType: 'img',
        startTime: 3500,
        requestStart: 3600,
        responseEnd: 4000,
        duration: 500,
      }),
    ])
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = getEntriesByType
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 2000, stamp: 'build-stamp' })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(3000)]))

    expect(c.report).toHaveBeenCalledWith(PERF_INFO, {
      fcp: 3_000_000,
      if: false,
      stamp: 'build-stamp',
      resourceCount: 3,
      resources: [
        {
          url: 'https://cdn.example/app.js',
          type: 'script',
          startTime: 100,
          responseEnd: 300,
          responseTime: 180,
          duration: 200,
        },
        {
          url: 'https://cdn.example/app.css',
          type: 'link',
          startTime: 200,
          responseEnd: 500,
          responseTime: 280,
          duration: 300,
        },
        {
          url: 'https://api.example/user',
          type: 'fetch',
          startTime: 300,
          responseEnd: 400,
          responseTime: 80,
          duration: 100,
        },
      ],
    })
  })

  it('性能 API 或单条资源数据异常时只告警，不影响 FCP 上报和宿主', async () => {
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => {
      throw new Error('resource timing unavailable')
    }
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    expect(() => plugin.handleEntry(entries([fcp(2000)]))).not.toThrow()

    expect(c.report).toHaveBeenCalledWith(PERF_INFO, {
      fcp: 2_000_000,
      if: false,
      stamp: '',
    })
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('collect performance failed'),
    )
  })

  it('请求时间轴有数量和 URL 长度上限，避免拖慢宿主', async () => {
    const resources = Array.from({ length: 220 }, (_, index) => resource({
      name: `https://cdn.example/${'x'.repeat(index === 0 ? 1500 : 10)}.js?v=${index}`,
      responseEnd: 100 + index,
    }))
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntriesByType = () => resources
    const PerfPlugin = await loadPerf()
    const c = ctx({ fcpThreshold: 1000 })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(2000)]))

    const data = c.report.mock.calls[0][1]
    expect(data.resourceCount).toBe(220)
    expect(data.resources).toHaveLength(200)
    expect(data.resources[0].url).toHaveLength(1000)
  })

  it('宿主上报函数或性能入口抛错时不向宿主抛出异常', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    c.report.mockImplementation(() => {
      throw new Error('host report failed')
    })
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    expect(() => plugin.handleEntry(entries([fcp(1)]))).not.toThrow()
    expect(() => plugin.handleEntry({
      getEntries() {
        throw new Error('entries failed')
      },
    } as any)).not.toThrow()
  })

  it('observer 回调也会触发上报', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    FakeObserver.cb!(entries([fcp(2)]))

    expect(c.report).toHaveBeenCalledTimes(1)
  })

  it('FCP 只上报一次，pagehide 补采不会产生重复记录', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(1)]))
    dom.document.dispatchEvent({ type: 'pagehide', timeStamp: 2 } as any)

    expect(c.report).toHaveBeenCalledTimes(1)
  })

  it('免登后立即刷新时，在 pagehide 补采尚未回调的 FCP', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx({ stamp: 'build-stamp' })
    const plugin = new PerfPlugin()
    plugin.init(c as any)
    expect(c.report).not.toHaveBeenCalled()

    // FCP 已写入 paint 缓冲区，但 PerformanceObserver 回调尚未执行，
    // 此时业务在免登成功后立即刷新页面。
    ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntries = () => [fcp(1.234)]
    dom.document.dispatchEvent({ type: 'pagehide', timeStamp: 2 } as any)

    expect(c.report).toHaveBeenCalledWith(PERF_INFO, {
      fcp: 1234,
      if: false,
      stamp: 'build-stamp',
    })
  })

  it('首屏隐藏时间早于 FCP 时不上报', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    // 页面在 FCP 前就被隐藏
    dom.document.dispatchEvent({ type: 'pagehide', timeStamp: 100 })
    plugin.handleEntry(entries([fcp(200)]))

    expect(c.report).not.toHaveBeenCalled()
  })

  it('FCP 超过 10 分钟上限时不上报', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(10 * 60 * 1000 + 1)]))

    expect(c.report).not.toHaveBeenCalled()
  })

  it('忽略非 FCP 的 paint 记录', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([{ entryType: 'paint', name: 'first-paint', startTime: 1 }]))

    expect(c.report).not.toHaveBeenCalled()
  })

  it('不在 iframe 中时 if 为 false', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    plugin.handleEntry(entries([fcp(1)]))

    expect(c.report.mock.calls[0][1].if).toBe(false)
  })

  it('在 iframe 中时记录来源', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    defineTop({})
    dom.document.referrer = 'http://parent.example/page'
    plugin.handleEntry(entries([fcp(1)]))

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
    plugin.handleEntry(entries([fcp(1)]))

    expect(c.report.mock.calls[0][1].if).toBe(true)
  })

  it('不支持 performance.getEntries 时跳过初始化采集', async () => {
    ;(dom.window as any).performance = undefined
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    expect(() => plugin.init(c as any)).not.toThrow()
    expect(c.report).not.toHaveBeenCalled()
  })
})
