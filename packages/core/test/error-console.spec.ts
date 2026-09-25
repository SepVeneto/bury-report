import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorPlugin as BrowserErrorPlugin } from '../src/browser/plugins/error'
import { ErrorPlugin as MpErrorPlugin } from '../src/mp-uni/plugins/error'
import { COLLECT_ERROR } from '../src/constant'

const ORIGINAL_CONSOLE_ERROR = console.error

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
  vi.stubGlobal('getCurrentPages', () => [])
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('console.error 代理的兜底分支', () => {
  it('浏览器端原始 console.error 抛错时只告警', () => {
    const c = { options: { url: 'http://report.example/record', appid: 'a' }, report: vi.fn() }
    const broken = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('broken console')
    })

    const plugin = new BrowserErrorPlugin()
    plugin.init(c as any)

    expect(() => console.error('boom')).not.toThrow()
    expect(c.report).toHaveBeenCalled()
    expect(broken).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('小程序端原始 console.error 抛错时只告警', () => {
    const c = { options: { url: 'https://mp/report', appid: 'a' }, report: vi.fn() }
    const broken = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('broken console')
    })

    const plugin = new MpErrorPlugin()
    plugin.init(c as any)

    expect(() => console.error('boom')).not.toThrow()
    expect(c.report).toHaveBeenCalled()
    expect(broken).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('小程序端循环引用的 Error 对象降级 extra', () => {
    const c = { options: { url: 'https://mp/report', appid: 'a' }, report: vi.fn() }
    const plugin = new MpErrorPlugin()
    plugin.init(c as any)

    const err: any = new Error('circular')
    err.self = err
    // onError 分支会固定 extra 为空，这里走 unhandledRejection 分支以保留归一化结果
    plugin.unhandleRejectionErrorListener({ reason: err } as any)

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({
        name: 'Error',
        message: 'circular',
        extra: '[object with circular structre]',
      }),
    )
  })
})
