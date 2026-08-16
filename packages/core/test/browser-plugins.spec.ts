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
      { store: false },
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
      { store: false },
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
    // 网络日志走 store:false，不落 localStorage
    expect(c.report.mock.calls.every((call: any[]) => (call[2] as any)?.store === false)).toBe(true)
  })

  it('代理不阻塞宿主自身请求', () => {
    const c = ctx({ network: { enable: true } })
    new NetworkPlugin().init(c as any)
    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    expect(() => xhr.open('GET', '/api')).not.toThrow()
  })

  it('请求体与响应头做大小限制，不拖累主线程', () => {
    const c = ctx({ network: { enable: true, success: true, fail: true } })
    new NetworkPlugin().init(c as any)
    const XHR: any = dom.window.XMLHttpRequest

    // 成功请求字符串 body 超 100KB 截断
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 200
    xhr._body = 'x'.repeat(100 * 1000 + 1)
    xhr.getAllResponseHeaders = () => 'content-type: application/json\r\n'
    xhr.dispatchEvent(new Event('loadend'))
    expect(c.report.mock.calls[0][1].body).toBe('exceed size limit')
    expect(c.report.mock.calls[0][1].responseHeaders).toContain('content-type')

    // 成功请求二进制 body 只保留类型描述，不会展开成巨大对象
    const xhr2 = new XHR()
    xhr2.open('GET', '/api2')
    xhr2.status = 200
    xhr2._body = new Uint8Array(1024 * 1024)
    xhr2.getAllResponseHeaders = () => ''
    xhr2.dispatchEvent(new Event('loadend'))
    expect(c.report.mock.calls[1][1].body).toBe('[object Uint8Array]')
  })

  it('失败请求采集完整内容（body/response 不截断）', () => {
    const c = ctx({ network: { enable: true, success: true, fail: true } })
    new NetworkPlugin().init(c as any)
    const XHR: any = dom.window.XMLHttpRequest

    const bigBody = 'x'.repeat(200 * 1000)
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 500
    xhr._body = bigBody
    xhr.response = 'y'.repeat(200 * 1000)
    xhr.responseURL = '/api'
    xhr.getAllResponseHeaders = () => ''
    xhr.dispatchEvent(new Event('loadend'))

    const info = c.report.mock.calls[0][1]
    expect(info.type).toBe('fail')
    expect(info.body).toBe(bigBody)
    expect(info.response).toBe('y'.repeat(200 * 1000))
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
