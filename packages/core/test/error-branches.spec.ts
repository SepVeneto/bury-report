import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorPlugin } from '../src/browser/plugins/error'
import { COLLECT_ERROR } from '../src/constant'
import { flushMemoryToStorage, readQueue, resetStorageCache, writeQueue } from '../src/utils'

const ORIGINAL_CONSOLE_ERROR = console.error

function ctx() {
  return {
    options: { url: 'http://report.example/record', appid: 'a' },
    report: vi.fn(),
  }
}

beforeEach(() => {
  dom.bus.clear()
  resetStorageCache()
  writeQueue([])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
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

    dom.window.dispatchEvent({
      type: 'error',
      error: new Error('script crash'),
      filename: 'http://host.example/a.js',
      lineno: 10,
      colno: 20,
      message: 'script crash',
    } as any)

    const data = c.report.mock.calls[0][1]
    expect(data).toMatchObject({ name: 'Error', message: 'script crash' })
    expect(data.extra).toMatchObject({
      filename: 'http://host.example/a.js',
      lineno: 10,
      colno: 20,
    })
    plugin.resetListener()
  })

  it('仅有 message 的脚本错误（跨域脚本）也能归一化', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent({ type: 'error', message: 'Script error.' } as any)

    expect(c.report.mock.calls[0][1]).toMatchObject({
      name: 'ErrorEvent',
      message: 'Script error.',
    })
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
})
