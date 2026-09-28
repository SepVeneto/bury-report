import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectPlugin } from '../src/mp-uni/plugins/collect'
import { ErrorPlugin } from '../src/mp-uni/plugins/error'
import { TrackPlugin } from '../src/mp-uni/plugins/track'
import { COLLECT_ERROR, COLLECT_INFO, MP_WARNING, TRACK_EVENT } from '../src/constant'

const ORIGINAL_CONSOLE_ERROR = console.error

const storage = new Map<string, string>()
let canIUseResult: Record<string, boolean> = {}
let onErrorHandler: any
let onUnhandledRejectionHandler: any

function ctx(overrides: Record<string, any> = {}) {
  return {
    options: { url: 'https://mp/report', appid: 'a', ...overrides },
    report: vi.fn(),
  }
}

beforeEach(() => {
  storage.clear()
  canIUseResult = {}
  onErrorHandler = undefined
  onUnhandledRejectionHandler = undefined
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})

  vi.stubGlobal('uni', {
    setStorageSync: (key: string, value: any) => storage.set(key, String(value)),
    getStorageSync: (key: string) => storage.get(key),
    removeStorageSync: (key: string) => storage.delete(key),
    canIUse: (name: string) => !!canIUseResult[name],
    getSystemInfoSync: () => ({
      deviceType: 'phone',
      deviceBrand: 'brand',
      deviceModel: 'model',
      devicePixelRatio: 2,
      deviceOrientation: 'portrait',
      osName: 'ios',
      osVersion: '15.0',
      hostVersion: '8.0.0',
      hostFontSizeSetting: 16,
      hostSDKVersion: '2.30.0',
      uniPlatform: 'mp-weixin',
      uniCompileVersion: '3.0.0',
      uniRuntimeVersion: '3.0.0',
      windowTop: 0,
      windowBottom: 0,
      windowWidth: 375,
      windowHeight: 667,
      screenWidth: 375,
      screenHeight: 812,
      statusBarHeight: 44,
      safeAreaInsets: { top: 44, bottom: 34, left: 0, right: 0 },
    }),
    getDeviceInfo: () => ({
      deviceType: 'phone',
      brand: 'Apple',
      model: 'iPhone 13',
      platform: 'ios',
      system: 'iOS 15.0',
    }),
    getWindowInfo: () => ({ pixelRatio: 3 }),
    getAppBaseInfo: () => ({
      version: '8.0.5',
      fontSizeSetting: 16,
      SDKVersion: '2.31.0',
    }),
    getSystemSetting: () => ({ locationEnabled: true }),
    onError: (cb: any) => {
      onErrorHandler = cb
    },
    onUnhandledRejection: (cb: any) => {
      onUnhandledRejectionHandler = cb
    },
  })
  vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/index/index' }, { route: 'pages/detail/index' }])
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mp CollectPlugin', () => {
  it('优先使用新版接口（getDeviceInfo/getWindowInfo/getAppBaseInfo/getSystemSetting）', () => {
    canIUseResult = {
      getDeviceInfo: true,
      getWindowInfo: true,
      getAppBaseInfo: true,
      getSystemSetting: true,
    }
    const c = ctx()
    new CollectPlugin().init(c as any)

    expect(c.report).toHaveBeenCalledTimes(1)
    const [type, info, opts] = c.report.mock.calls[0]
    expect(type).toBe(COLLECT_INFO)
    expect(opts).toEqual({ immediate: true })
    expect(info).toMatchObject({
      dt: 'phone',
      db: 'Apple',
      dm: 'iPhone 13',
      on: 'ios',
      ov: 'iOS 15.0',
      dp: 3,
      hv: '8.0.5',
      // collect.ts 读取的是 getAppBaseInfo().hostFontSizeSetting，而接口实际返回 fontSizeSetting，当前取不到值
      hfs: undefined,
      hsdk: '2.31.0',
      al: true,
      up: 'mp-weixin',
    })
  })

  it('旧版本环境降级使用 getSystemInfoSync', () => {
    canIUseResult = {}
    const c = ctx()
    new CollectPlugin().init(c as any)

    const info = c.report.mock.calls[0][1]
    expect(info).toMatchObject({
      dm: 'model',
      db: 'brand',
      dp: 2,
      hsdk: '2.30.0',
    })
    // 无 getSystemSetting 时不带定位授权字段
    expect(info).not.toHaveProperty('al')
  })

  it('初始化时重置会话 id', () => {
    storage.set('__BR_SESSIONID__', 'old-session')
    canIUseResult = {}
    new CollectPlugin().init(ctx() as any)
    expect(storage.has('__BR_SESSIONID__')).toBe(false)
  })
})

describe('mp ErrorPlugin', () => {
  it('注册 uni.onError 与 onUnhandledRejection', () => {
    canIUseResult = { onError: true, onUnhandledRejection: true }
    const plugin = new ErrorPlugin()
    plugin.init(ctx() as any)

    expect(typeof onErrorHandler).toBe('function')
    expect(typeof onUnhandledRejectionHandler).toBe('function')
  })

  it('uni.onError 的字符串错误被拆解为 name/message/stack', () => {
    canIUseResult = { onError: true }
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    onErrorHandler('TypeError\nCannot read property\nat pages/index.js:1:1')

    expect(c.report).toHaveBeenCalledWith(COLLECT_ERROR, {
      name: 'TypeError',
      message: 'Cannot read property',
      stack: 'at pages/index.js:1:1',
      extra: '',
      page: 'pages/index/index->pages/detail/index',
    })
  })

  it('uni.onError 携带 reason（Promise reject）时归一化', () => {
    canIUseResult = { onError: true }
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    onErrorHandler({ reason: new Error('rejected') })

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'Error',
      message: 'rejected',
      extra: '',
    })
  })

  it('onUnhandledRejection 归一化 reason', () => {
    canIUseResult = {}
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    plugin.unhandleRejectionErrorListener({ reason: 'plain failure' } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'UnhandleRejection',
      message: 'plain failure',
    })
  })

  it('包装 console.error 上报 CustomError，且原始输出保留', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    new ErrorPlugin().init(c as any)

    console.error('boom', { a: 1 })

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ name: 'CustomError', message: 'boom' }),
    )
    expect(consoleSpy).toHaveBeenCalledWith('boom', { a: 1 })
  })

  it('取不到页面栈时 page 为空且不抛错', () => {
    vi.stubGlobal('getCurrentPages', () => {
      throw new Error('no page')
    })
    canIUseResult = {}
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    plugin.unhandleRejectionErrorListener({ reason: new Error('x') } as any)

    expect(c.report.mock.calls[0][1].page).toBe('')
  })

  it('上报自身抛错时不影响宿主', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    c.report.mockImplementation(() => {
      throw new Error('report broken')
    })
    new ErrorPlugin().init(c as any)

    expect(() => console.error('boom')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith('boom')
  })
})

describe('mp TrackPlugin', () => {
  function setup() {
    const rawApp = vi.fn((options: any) => options)
    const appOptions: any = {}
    vi.stubGlobal('App', (options: any) => {
      appOptions.value = options
      return rawApp(options)
    })
    const rawCreatePage = vi.fn()
    vi.stubGlobal('wx', { createPage: rawCreatePage })
    return { rawApp, appOptions, rawCreatePage }
  }

  it('包装 App 生命周期并透传原始回调', () => {
    const { rawApp, appOptions } = setup()
    const c = ctx()
    new TrackPlugin().init(c as any)

    const originals = {
      onLaunch: vi.fn(),
      onShow: vi.fn(),
      onHide: vi.fn(),
      onPageNotFound: vi.fn(),
      onMemoryWarning: vi.fn(),
    }
    App({ ...originals })

    const wrapped = appOptions.value
    wrapped.onLaunch({ path: 'pages/index/index' })
    wrapped.onShow({ path: 'pages/index/index' })
    wrapped.onHide()
    wrapped.onPageNotFound({ path: 'pages/nope' })
    wrapped.onMemoryWarning({ level: 10 })

    expect(rawApp).toHaveBeenCalledTimes(1)
    expect(originals.onLaunch).toHaveBeenCalledWith({ path: 'pages/index/index' })
    expect(originals.onShow).toHaveBeenCalled()
    expect(originals.onHide).toHaveBeenCalled()
    expect(originals.onPageNotFound).toHaveBeenCalled()
    expect(originals.onMemoryWarning).toHaveBeenCalled()

    const trackTypes = c.report.mock.calls
      .filter(call => call[0] === TRACK_EVENT)
      .map(call => call[1].type)
    expect(trackTypes).toEqual(['AppLaunch', 'AppShow', 'AppHide'])
    // AppHide 需要立即上报
    const hideCall = c.report.mock.calls.find(call => call[1]?.type === 'AppHide')
    expect(hideCall?.[2]).toEqual({ immediate: true })

    const warningTypes = c.report.mock.calls
      .filter(call => call[0] === MP_WARNING)
      .map(call => call[1].type)
    expect(warningTypes).toEqual(['AppPageNotFound', 'AppMemoryWarning'])
  })

  it('缺少原始 App 回调时仍能上报且不抛错', () => {
    const { appOptions } = setup()
    const c = ctx()
    new TrackPlugin().init(c as any)

    App({})
    const wrapped = appOptions.value
    expect(() => wrapped.onLaunch({})).not.toThrow()
    expect(() => wrapped.onHide()).not.toThrow()
    expect(c.report).toHaveBeenCalled()
  })

  it('触发 Page 生命周期回调并上报路径与耗时', () => {
    const { rawCreatePage } = setup()
    const c = ctx()
    new TrackPlugin().init(c as any)

    const originals = {
      onLoad: vi.fn(),
      onShow: vi.fn(),
      onHide: vi.fn(),
      onUnload: vi.fn(),
    }
    const pageOptions = { ...originals }
    ;(globalThis as any).wx.createPage(pageOptions)

    const instance: any = { $scope: { route: 'pages/index/index' } }
    pageOptions.onLoad.call(instance, { id: 1 })
    pageOptions.onShow.call(instance)
    pageOptions.onHide.call(instance)
    pageOptions.onUnload.call(instance)

    expect(rawCreatePage).toHaveBeenCalledWith(pageOptions)
    expect(originals.onLoad).toHaveBeenCalled()
    expect(originals.onShow).toHaveBeenCalled()
    expect(originals.onHide).toHaveBeenCalled()
    expect(originals.onUnload).toHaveBeenCalled()

    const types = c.report.mock.calls
      .filter(call => call[0] === TRACK_EVENT)
      .map(call => call[1].type)
    expect(types).toEqual(['PageLoad', 'PageShow', 'PageHide', 'PageUnload'])

    const loadCall = c.report.mock.calls.find(call => call[1]?.type === 'PageLoad')
    expect(loadCall?.[1].data).toEqual({ path: 'pages/index/index', query: { id: 1 } })
    const hideCall = c.report.mock.calls.find(call => call[1]?.type === 'PageHide')
    expect(typeof hideCall?.[1].data.duration).toBe('number')
    expect(instance.__enterTime).toBeNull()
  })
})
