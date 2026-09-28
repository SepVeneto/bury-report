import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkPlugin } from '../src/browser/plugins/network'
import { COLLECT_API } from '../src/constant'

const OriginalXHR = dom.window.XMLHttpRequest

function ctx(network: Record<string, any>) {
  return {
    options: { url: 'http://report.example/record', appid: 'a', network },
    report: vi.fn(),
  }
}

function performanceEntry(url: string) {
  return {
    name: url,
    startTime: 1,
    fetchStart: 2,
    redirectStart: 0,
    redirectEnd: 0,
    domainLookupStart: 2,
    domainLookupEnd: 2.5,
    connectStart: 3,
    connectEnd: 4,
    secureConnectionStart: 0,
    requestStart: 5,
    responseStart: 6,
    responseEnd: 7,
    nextHopProtocol: 'h2',
    encodedBodySize: 100,
    transferSize: 200,
  }
}

beforeEach(() => {
  dom.window.XMLHttpRequest = OriginalXHR
  ;(performance as any).getEntriesByName = () => []
})

afterEach(() => {
  dom.window.XMLHttpRequest = OriginalXHR
  vi.restoreAllMocks()
})

describe('NetworkPlugin 性能采集', () => {
  it('成功请求附带 performance 资源耗时', () => {
    ;(performance as any).getEntriesByName = (url: string) => [performanceEntry(url)]
    const c = ctx({ enable: true, success: true, fail: true })
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
      expect.objectContaining({
        type: 'success',
        profile: expect.objectContaining({
          invokeStart: 1,
          fetchStart: 2,
          requestEnd: 6,
          protocol: 'h2',
          socketReused: false,
          sendBytesCount: 100,
          receivedBytedCount: 200,
        }),
      }),
      { store: false },
    )
  })

  it('缺少性能条目时 profile 为 undefined', () => {
    const c = ctx({ enable: true, success: true, fail: true })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('GET', '/api')
    xhr.status = 200
    xhr.response = '{}'
    xhr.responseURL = '/api'
    xhr.getAllResponseHeaders = () => ''
    xhr.dispatchEvent(new Event('loadend'))

    expect(c.report.mock.calls[0][1].profile).toBeUndefined()
  })
})

describe('NetworkPlugin 关闭全部上报', () => {
  it('success/fail 均为 false 时不挂监听也不上报', () => {
    const c = ctx({ enable: true, success: false, fail: false })
    new NetworkPlugin().init(c as any)

    const XHR: any = dom.window.XMLHttpRequest
    const xhr = new XHR()
    xhr.open('POST', '/api')
    expect(() => xhr.send('body')).not.toThrow()
    xhr.status = 200
    xhr.dispatchEvent(new Event('loadend'))
    xhr.dispatchEvent(new Event('abort'))
    xhr.dispatchEvent(new Event('error'))

    expect(c.report).not.toHaveBeenCalled()
  })
})
