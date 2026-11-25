import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorPlugin } from '../src/browser/plugins/error'
import { COLLECT_ERROR } from '../src/constant'
import { flushMemoryToStorage, readQueue, resetStorageCache, writeQueue } from '../src/utils'

const ORIGINAL_CONSOLE_ERROR = console.error

function ctx(overrides: Record<string, any> = {}) {
  return {
    options: { url: 'http://report.example/record', appid: 'a', ...overrides },
    report: vi.fn(),
  }
}

beforeEach(() => {
  dom.bus.clear()
  delete (dom.window as any)._brModuleMetadata
  resetStorageCache()
  writeQueue([])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
  delete (dom.window as any)._brModuleMetadata
  vi.restoreAllMocks()
})

describe('ErrorPlugin 错误归一化（浏览器）', () => {
  it('console.error 传入 Error 时保留名称与堆栈', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    console.error(new TypeError('bad type'))

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ name: 'TypeError', message: 'bad type' }),
    )
    plugin.resetListener()
  })

  it('console.error 无参数时给出占位信息', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    console.error()

    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: 'console.error with no arguments',
    })
    plugin.resetListener()
  })

  it('console.error 传入普通对象时提取不到 message 使用占位文案', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    console.error({ code: 500 })

    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: '(object error)',
      extra: '[{"code":500}]',
    })
    expect(consoleSpy).toHaveBeenCalledWith({ code: 500 })
    plugin.resetListener()
  })

  it('console.error 传入循环引用对象时不抛错，extra 做降级标记', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    const circular: any = {}
    circular.self = circular
    expect(() => console.error(circular)).not.toThrow()

    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: '(object error)',
      extra: '[object with circular structre]',
    })
    plugin.resetListener()
  })

  it('脚本错误事件优先使用 evt.error 并附带位置信息', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    ;(dom.window.onerror as any)(
      'script crash',
      'http://host.example/a.js',
      10,
      20,
      new Error('script crash'),
    )

    const data = c.report.mock.calls[0][1]
    expect(data).toMatchObject({ name: 'Error', message: 'script crash' })
    expect(data.extra).toMatchObject({
      filename: 'http://host.example/a.js',
      lineno: 10,
      colno: 20,
    })
    plugin.resetListener()
  })

  it('window.onerror 捕获脚本语法错误并可上报', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)
    const syntaxError = new SyntaxError('Unexpected token }')

    dom.window.onerror!(
      'Unexpected token }',
      'http://host.example/assets/app.js',
      1,
      20,
      syntaxError,
    )

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({
        name: 'SyntaxError',
        message: 'Unexpected token }',
        extra: expect.objectContaining({
          filename: 'http://host.example/assets/app.js',
          lineno: 1,
          colno: 20,
        }),
      }),
      { immediate: true, flush: true },
    )
    plugin.resetListener()
  })

  it('仅有 message 的不透明跨域脚本错误默认过滤', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent({ type: 'error', message: 'Script error.' } as any)

    expect(c.report).not.toHaveBeenCalled()
    plugin.resetListener()
  })

  it('第三方错误默认保留，显式 thirdPartyErrors=drop 时过滤', () => {
    ;(dom.window as any)._brModuleMetadata = {
      'Error\n    at http://host.example/app.js:1:1': {
        '_brBundlerAppKey:app': true,
      },
    }
    const vendorError = new Error('third party failed')
    vendorError.stack = 'Error: third party failed\n    at https://cdn.vendor.example/sdk.js:1:1'

    const kept = ctx({ applicationKey: 'app' })
    const keptPlugin = new ErrorPlugin()
    keptPlugin.init(kept as any)
    dom.window.onerror!(
      'third party failed',
      'https://cdn.vendor.example/sdk.js',
      1,
      1,
      vendorError,
    )
    expect(kept.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ message: 'third party failed' }),
    )
    keptPlugin.resetListener()

    const filtered = ctx({ applicationKey: 'app', thirdPartyErrors: 'drop' })
    const filteredPlugin = new ErrorPlugin()
    filteredPlugin.init(filtered as any)
    dom.window.onerror!(
      'third party failed',
      'https://cdn.vendor.example/sdk.js',
      1,
      1,
      vendorError,
    )
    expect(filtered.report).not.toHaveBeenCalled()
    filteredPlugin.resetListener()
  })

  it('支持 ignoreErrors、denyUrls 和 allowUrls 过滤', () => {
    const c = ctx({
      ignoreErrors: [/known noise/],
      allowUrls: [/cdn\.vendor\.example/],
    })
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.onerror!('known noise', 'https://cdn.vendor.example/app.js', 1, 1)
    dom.window.onerror!('not allowlisted', 'https://other.example/app.js', 1, 1)
    dom.window.onerror!('extension failure', 'chrome-extension://abc/app.js', 1, 1)
    dom.window.onerror!('allowed app failure', 'https://cdn.vendor.example/app.js', 1, 1)

    expect(c.report).toHaveBeenCalledTimes(1)
    expect(c.report.mock.calls[0][1]).toMatchObject({ message: 'allowed app failure' })
    plugin.resetListener()
  })

  it('过滤仅影响上报，不阻断业务错误监听和原 console 调用', () => {
    const businessListener = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(dom.window as any)._brModuleMetadata = {
      'Error\n    at http://host.example/app.js:1:1': {
        '_brBundlerAppKey:app': true,
      },
    }
    const c = ctx({ applicationKey: 'app', thirdPartyErrors: 'drop' })
    const plugin = new ErrorPlugin()
    plugin.init(c as any)
    dom.window.addEventListener('error', businessListener)

    const extensionError = Object.assign(new Error('extension noise'), {
      stack: 'Error: extension noise\n    at chrome-extension://abc/app.js:1:1',
    })
    const evt = new Event('error') as any
    evt.message = 'extension noise'
    evt.filename = 'chrome-extension://abc/app.js'
    evt.error = extensionError
    dom.window.dispatchEvent(evt)
    dom.window.onerror!(
      'extension noise',
      'chrome-extension://abc/app.js',
      1,
      1,
      extensionError,
    )

    const noisy = new Error('extension console noise')
    noisy.stack = 'Error: extension console noise\n    at chrome-extension://abc/app.js:1:1'
    expect(() => console.error(noisy)).not.toThrow()

    expect(businessListener).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith(noisy)
    expect(c.report).not.toHaveBeenCalled()

    dom.window.removeEventListener('error', businessListener)
    plugin.resetListener()
  })

  it('资源加载错误缺少地址时给出占位 URL', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    const img = dom.document.createElement('img')
    dom.window.dispatchEvent({ type: 'error', target: img } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'ResourceError',
      message: 'Resource load error: <img>(no url)',
    })
    plugin.resetListener()
  })

  it('未处理的 Promise 拒绝：字符串原因', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent({ type: 'unhandledrejection', reason: 'plain failure' } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'UnhandleRejection',
      message: 'plain failure',
      extra: null,
    })
    plugin.resetListener()
  })

  it('未处理的 Promise 拒绝：null 原因', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent({ type: 'unhandledrejection', reason: null } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      message: 'null or undefined error',
    })
    plugin.resetListener()
  })

  it('未处理的 Promise 拒绝：对象原因', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent({
      type: 'unhandledrejection',
      reason: { message: 'obj err', stack: 'stack-line' },
    } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'UnhandleRejection',
      message: 'obj err',
      stack: 'stack-line',
      extra: '{"message":"obj err","stack":"stack-line"}',
    })
    plugin.resetListener()
  })

  it('resetListener 后不再监听错误事件', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)
    plugin.resetListener()

    dom.window.dispatchEvent({ type: 'error', message: 'after reset' } as any)
    dom.window.dispatchEvent({ type: 'unhandledrejection', reason: 'after reset' } as any)

    expect(c.report).not.toHaveBeenCalled()
  })

  it('仅传 appid 初始化（白屏检测场景）时写入本地缓存', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const plugin = new ErrorPlugin()
    plugin.init('appid-only')

    console.error('early error')
    flushMemoryToStorage()

    const queue = readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      type: COLLECT_ERROR,
      data: expect.objectContaining({ name: 'CustomError', message: 'early error' }),
    })
    plugin.resetListener()
  })

  it('链式调用并恢复宿主已有的 window.onerror', () => {
    const previous = vi.fn(() => true)
    ;(dom.window as any).onerror = previous
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.onerror!('business error', 'http://host.example/app.js', 1, 1)
    expect(previous).toHaveBeenCalledTimes(1)

    plugin.resetListener()
    expect(dom.window.onerror).toBe(previous)
  })
})
