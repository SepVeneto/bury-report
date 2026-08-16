import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectPlugin } from '../src/browser/plugins/collect'
import { ErrorPlugin } from '../src/browser/plugins/error'
import { NetworkPlugin } from '../src/browser/plugins/network'
import { COLLECT_API, COLLECT_ERROR, COLLECT_INFO } from '../src/constant'

const OriginalXHR = dom.window.XMLHttpRequest

function ctx(overrides: Record<string, any> = {}) {
  return {
    options: { url: 'http://report.example/record', appid: 'a', ...overrides },
    report: vi.fn(),
  }
}

beforeEach(() => {
  ;(performance as any).getEntriesByName = () => []
  dom.window.XMLHttpRequest = OriginalXHR
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.window.XMLHttpRequest = OriginalXHR
})

describe('NetworkPlugin（浏览器）', () => {
  it('enable=false 时不代理 XMLHttpRequest', () => {
    const plugin = new NetworkPlugin()
    plugin.init(ctx({ network: { enable: false } }) as any)
    expect(dom.window.XMLHttpRequest).toBe(OriginalXHR)
  })

  it('enable=true 时成功请求由 success 控制上报', () => {
    const c = ctx({ network: { enable: true, success: true, fail: true } })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 200
    xhr.response = '{}'
    xhr.responseURL = '/api'
    xhr.getAllResponseHeaders = () => ''
    xhr.dispatchEvent(new Event('loadend'))

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_API,
      expect.objectContaining({ type: 'success', url: '/api', status: 200 }),
    )
  })

  it('非200请求由 fail 控制上报', () => {
    const c = ctx({ network: { enable: true, success: true, fail: true } })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 500
    xhr.response = 'err'
    xhr.responseURL = '/api'
    xhr.getAllResponseHeaders = () => ''
    xhr.dispatchEvent(new Event('loadend'))

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_API,
      expect.objectContaining({ type: 'fail', status: 500 }),
    )
  })

  it('success=false 时不报成功请求', () => {
    const c = ctx({ network: { enable: true, success: false, fail: true } })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 200
    xhr.dispatchEvent(new Event('loadend'))

    expect(c.report).not.toHaveBeenCalled()
  })

  it('fail=false 时不报非200和传输异常', () => {
    const c = ctx({ network: { enable: true, success: true, fail: false } })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 500
    xhr.dispatchEvent(new Event('loadend'))
    xhr.dispatchEvent(new Event('abort'))
    xhr.dispatchEvent(new Event('error'))
    xhr.dispatchEvent(new Event('timeout'))

    expect(c.report).not.toHaveBeenCalled()
  })

  it('abort/error/timeout 传输异常由 fail 控制上报', () => {
    const c = ctx({ network: { enable: true, success: false, fail: true } })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.dispatchEvent(new Event('timeout'))
    xhr.dispatchEvent(new Event('abort'))
    xhr.dispatchEvent(new Event('error'))

    expect(c.report).toHaveBeenCalledTimes(3)
    expect(c.report.mock.calls.map((call: any[]) => call[1].type).sort()).toEqual(['abort', 'error', 'timeout'])
  })

  it('代理不阻塞宿主自身请求', () => {
    const c = ctx({ network: { enable: true } })
    new NetworkPlugin().init(c as any)
    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    expect(() => xhr.open('GET', '/api')).not.toThrow()
  })
})

describe('ErrorPlugin（浏览器）', () => {
  it('包装 console.error 并上报 CustomError，原 console 仍被调用', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    console.error('boom')

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ name: 'CustomError', message: 'boom' }),
    )
    expect(consoleSpy).toHaveBeenCalledWith('boom')
    plugin.resetListener()
  })

  it('window error 事件上报 ErrorEvent', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    dom.window.dispatchEvent(new Event('error'))

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ name: 'ErrorEvent' }),
    )
    plugin.resetListener()
  })

  it('资源加载错误上报 ResourceError', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    const img = dom.document.createElement('img')
    img.src = 'http://broken.example/x.png'
    const evt = new Event('error')
    Object.defineProperty(evt, 'target', { value: img })
    dom.window.dispatchEvent(evt)

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ name: 'ResourceError' }),
    )
    plugin.resetListener()
  })

  it('unhandledrejection 上报', () => {
    const c = ctx()
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    const evt = new Event('unhandledrejection') as any
    evt.reason = new Error('promise failed')
    dom.window.dispatchEvent(evt)

    expect(c.report).toHaveBeenCalledWith(
      COLLECT_ERROR,
      expect.objectContaining({ name: 'Error', message: 'promise failed' }),
    )
    plugin.resetListener()
  })

  it('内部上报抛错不影响宿主（console.error 原样输出）', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const c = ctx()
    c.report.mockImplementation(() => {
      throw new Error('report broken')
    })
    const plugin = new ErrorPlugin()
    plugin.init(c as any)

    expect(() => console.error('boom')).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith('boom')
    plugin.resetListener()
  })
})

describe('CollectPlugin（浏览器）', () => {
  it('初始化时立即上报环境信息', () => {
    const c = ctx()
    const plugin = new CollectPlugin()
    plugin.init(c as any)

    expect(c.report).toHaveBeenCalledTimes(1)
    const [type, data, opts] = c.report.mock.calls[0]
    expect(type).toBe(COLLECT_INFO)
    expect(opts).toEqual({ immediate: true })
    expect(data).toHaveProperty('ua')
    expect(data).toHaveProperty('dt')
  })
})
