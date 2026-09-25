import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorPlugin as BrowserErrorPlugin } from '../src/browser/plugins/error'
import { ErrorPlugin as MpErrorPlugin } from '../src/mp-uni/plugins/error'
import { COLLECT_ERROR } from '../src/constant'

const ORIGINAL_CONSOLE_ERROR = console.error

function browserCtx() {
  return {
    options: { url: 'http://report.example/record', appid: 'a' },
    report: vi.fn(),
  }
}

function mpCtx() {
  return {
    options: { url: 'https://mp/report', appid: 'a' },
    report: vi.fn(),
  }
}

beforeEach(() => {
  dom.bus.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('uni', {
    canIUse: () => false,
    onError: () => {},
    onUnhandledRejection: () => {},
    setStorageSync: () => {},
    getStorageSync: () => undefined,
    removeStorageSync: () => {},
  })
  vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/index/index' }])
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('浏览器 ErrorPlugin 归一化兜底', () => {
  it('额外参数无法序列化时标记为不可序列化', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = browserCtx()
    const plugin = new BrowserErrorPlugin()
    plugin.init(c as any)

    const circular: any = {}
    circular.self = circular
    console.error('boom', circular)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: 'boom',
      stack: '[unserializable stack]',
    })
    plugin.resetListener()
  })

  it('错误结构异常无法归一化时给出兜底文案', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = browserCtx()
    const plugin = new BrowserErrorPlugin()
    plugin.init(c as any)

    // 触发 normalizeError 内部读取 message 抛错，进入 normalizeConsoleError 的兜底分支
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

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'CustomError',
      message: 'console.error unknown structure',
    })
    plugin.resetListener()
  })
})

describe('小程序 ErrorPlugin 归一化分支', () => {
  it('额外参数无法序列化时标记为不可序列化', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = mpCtx()
    const plugin = new MpErrorPlugin()
    plugin.init(c as any)

    const circular: any = {}
    circular.self = circular
    console.error('boom', circular)

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ message: 'boom', stack: '[unserializable stack]' }),
    )
  })

  it('console.error 传入普通对象时使用占位文案', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = mpCtx()
    new MpErrorPlugin().init(c as any)

    console.error({ code: 500 })

    expect(c.report.mock.calls[0][1]).toMatchObject({ message: '(object error)' })
  })

  it('onError 传入 Error 对象时保留名称与堆栈', () => {
    const c = mpCtx()
    const plugin = new MpErrorPlugin()
    plugin.init(c as any)

    plugin.uncaughtErrorListener(new TypeError('native error'))

    expect(c.report.mock.calls[0][1]).toMatchObject({ name: 'TypeError', message: 'native error' })
  })

  it('未处理拒绝的 null / 对象 / 基础类型原因', () => {
    const c = mpCtx()
    const plugin = new MpErrorPlugin()
    plugin.init(c as any)

    plugin.unhandleRejectionErrorListener({ reason: null } as any)
    plugin.unhandleRejectionErrorListener({ reason: { code: 1 } } as any)
    plugin.unhandleRejectionErrorListener({ reason: 42 } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({ message: 'null or undefined error' })
    expect(c.report.mock.calls[1][1]).toMatchObject({ message: '(object error)' })
    expect(c.report.mock.calls[2][1]).toMatchObject({ name: 'UnhandleRejection', message: '42' })
  })
})
