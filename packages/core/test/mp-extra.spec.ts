import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuryReport } from '../src/mp-uni/index'
import { TrackPlugin } from '../src/mp-uni/plugins/track'
import { TRACK_EVENT } from '../src/constant'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.stubGlobal('uni', {
    request: vi.fn(),
    setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
    canIUse: () => false,
  })
  vi.stubGlobal('App', vi.fn())
  vi.stubGlobal('wx', { createPage: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  ;(BuryReport as any).pluginsOrder = []
})

describe('小程序插件注册', () => {
  it('registerPlugin 注册的插件会随 SDK 初始化', () => {
    const init = vi.fn()
    class DemoPlugin {
      name = 'demoPlugin'
      init = init
    }
    BuryReport.registerPlugin(new DemoPlugin() as any)

    new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('单个插件初始化抛错不影响宿主与其它插件', () => {
    class BoomPlugin {
      name = 'boomPlugin'
      init() {
        throw new Error('plugin broken')
      }
    }
    const okInit = vi.fn()
    class OkPlugin {
      name = 'okPlugin'
      init = okInit
    }
    BuryReport.registerPlugin(new BoomPlugin() as any)
    BuryReport.registerPlugin(new OkPlugin() as any)

    expect(() => new BuryReport({ url: 'https://mp/report', appid: 'a', report: true })).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('plugin init failed'),
    )
    expect(okInit).toHaveBeenCalledTimes(1)
  })

  it('未开启 report 时不创建上报函数也不初始化插件', () => {
    const init = vi.fn()
    class DemoPlugin {
      name = 'demoPlugin'
      init = init
    }
    BuryReport.registerPlugin(new DemoPlugin() as any)

    const instance = new BuryReport({ url: 'https://mp/report', appid: 'a', report: false })

    expect(instance.report).toBeUndefined()
    expect(init).not.toHaveBeenCalled()
  })
})

describe('TrackPlugin 分支', () => {
  it('没有 report 函数时直接返回，不包装全局 App/Page', () => {
    const app = (globalThis as any).App
    const wx = (globalThis as any).wx

    const plugin = new TrackPlugin()
    expect(() => plugin.init({ options: {} } as any)).not.toThrow()

    expect((globalThis as any).App).toBe(app)
    expect((globalThis as any).wx).toBe(wx)
  })

  it('未经过 onShow 时 onHide 的停留时长回退为 0', () => {
    const report = vi.fn()
    new TrackPlugin().init({ report, options: {} } as any)

    const pageOptions: any = { onHide: vi.fn(), onUnload: vi.fn() }
    ;(globalThis as any).wx.createPage(pageOptions)
    const instance: any = { $scope: { route: 'pages/detail/index' } }

    pageOptions.onHide.call(instance)
    pageOptions.onUnload.call(instance)

    const hide = report.mock.calls.find(call => call[1]?.type === 'PageHide')
    const unload = report.mock.calls.find(call => call[1]?.type === 'PageUnload')
    expect(hide[0]).toBe(TRACK_EVENT)
    expect(hide[1].data).toMatchObject({ path: 'pages/detail/index', duration: 0 })
    expect(unload[1].data).toMatchObject({ path: 'pages/detail/index', duration: 0 })
  })
})
