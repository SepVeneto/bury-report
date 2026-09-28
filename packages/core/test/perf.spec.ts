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

beforeEach(() => {
  dom.bus.clear()
  FakeObserver.cb = undefined
  FakeObserver.instances = []
  stubObserver()
  defineTop(dom.window)
  ;(dom.window as any).performance = ORIGINAL_WINDOW_PERFORMANCE
  ;(ORIGINAL_WINDOW_PERFORMANCE as any).getEntries = () => []
  dom.document.referrer = ''
})

afterEach(() => {
  defineTop(ORIGINAL_TOP)
  ;(dom.window as any).performance = ORIGINAL_WINDOW_PERFORMANCE
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PerfPlugin', () => {
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

  it('observer 回调也会触发上报', async () => {
    const PerfPlugin = await loadPerf()
    const c = ctx()
    const plugin = new PerfPlugin()
    plugin.init(c as any)

    FakeObserver.cb!(entries([fcp(2)]))

    expect(c.report).toHaveBeenCalledTimes(1)
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
