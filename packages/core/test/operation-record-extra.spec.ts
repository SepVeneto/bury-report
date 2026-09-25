import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@rrweb/types'
import { OPERATION_TRACK } from '../src/constant'

const { takeFullSnapshot, record } = vi.hoisted(() => ({
  takeFullSnapshot: vi.fn(),
  record: vi.fn(),
}))

vi.mock('@rrweb/record', () => ({
  record: Object.assign(record, { takeFullSnapshot }),
}))

import '../src/browser/plugins/operationRecord'

const originalPushState = dom.window.history.pushState
const originalReplaceState = dom.window.history.replaceState

function initPlugin(options: Record<string, any> = {}) {
  const report = vi.fn()
  const Plugin = (dom.window as any).OperationRecordPlugin
  const plugin = new Plugin()
  plugin.init({ options, report } as any)
  return {
    plugin,
    report,
    emit: record.mock.calls[0][0].emit,
    options: record.mock.calls[0][0],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  dom.window.history.pushState = originalPushState
  dom.window.history.replaceState = originalReplaceState
  record.mockReset()
  takeFullSnapshot.mockReset()
  dom.bus.clear()
  // rrweb 观察器通过 win.document 访问文档，dom-stub 只挂了全局 document
  ;(dom.window as any).document = dom.document
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  delete (globalThis as any).requestAnimationFrame
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (globalThis as any).requestAnimationFrame
})

describe('OperationRecordPlugin 采集批次', () => {
  it('没有事件时不上报', () => {
    const { plugin, report } = initPlugin({})
    plugin.collect()
    expect(report).not.toHaveBeenCalled()
  })

  it('增量事件由定时器批量上报（非立即）', () => {
    const { report, emit } = initPlugin({})

    emit({ type: EventType.IncrementalSnapshot, data: { source: 0 }, timestamp: 1 })
    emit({ type: EventType.IncrementalSnapshot, data: { source: 1 }, timestamp: 2 })
    expect(report).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5 * 1000)

    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toBe(OPERATION_TRACK)
    expect(report.mock.calls[0][1].events).toHaveLength(2)
    expect(report.mock.calls[0][2]).toEqual({ immediate: false, keepalive: false, store: false })
  })

  it('collect 支持 keepalive 参数（页面关闭场景）', () => {
    const { plugin, report, emit } = initPlugin({})
    emit({ type: EventType.IncrementalSnapshot, data: { source: 0 }, timestamp: 1 })

    plugin.collect(true, true)

    expect(report).toHaveBeenCalledWith(
      OPERATION_TRACK,
      { events: expect.any(Array) },
      { immediate: true, keepalive: true, store: false },
    )
    // 上报后清空，避免重复发送
    expect(plugin.events).toHaveLength(0)
  })

  it('没有 requestAnimationFrame 时用 setTimeout 兜底拍快照', () => {
    const { plugin, options } = initPlugin({})
    expect(options.plugins).toHaveLength(1)

    plugin.hook()
    dom.window.history.pushState({}, '', '/next')
    expect(takeFullSnapshot).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)
  })

  it('rAF 未触发时由 setTimeout 兜底，且只拍一次', () => {
    let rafCallback: any
    ;(globalThis as any).requestAnimationFrame = (cb: any) => {
      rafCallback = cb
    }
    const { plugin } = initPlugin({})
    plugin.hook()

    dom.window.history.pushState({}, '', '/next')
    vi.advanceTimersByTime(100)
    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)

    // rAF 之后才触发也不会重复拍
    rafCallback()
    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)
  })

  it('rAF 正常触发时走下一帧拍快照', () => {
    ;(globalThis as any).requestAnimationFrame = (cb: any) => cb()
    const { plugin } = initPlugin({})
    plugin.hook()

    dom.window.history.replaceState({}, '', '/next')
    vi.advanceTimersByTime(100)

    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)
  })

  it('拍快照失败只告警，不影响宿主', () => {
    takeFullSnapshot.mockImplementation(() => {
      throw new Error('snapshot failed')
    })
    const { plugin } = initPlugin({})
    plugin.hook()

    expect(() => {
      dom.window.history.pushState({}, '', '/next')
      vi.advanceTimersByTime(100)
    }).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('take full snapshot failed'),
    )
  })
})

describe('enhancedPlugin 观察器', () => {
  it('上报可见性变化与 pagehide，并支持卸载', () => {
    const { options } = initPlugin({})
    const enhanced = options.plugins[0]
    expect(enhanced.name).toBe('@sepveneto/enhanced')

    const cb = vi.fn()
    const cleanup = enhanced.observer(cb, dom.window)

    Object.defineProperty(dom.document, 'visibilityState', { value: 'visible', configurable: true })
    dom.document.dispatchEvent(new Event('visibilitychange'))
    expect(cb).toHaveBeenCalledWith({ event: 'visibilitychange', action: 'visible' })

    const evt: any = new Event('pagehide')
    evt.persisted = true
    dom.window.dispatchEvent(evt)
    expect(cb).toHaveBeenCalledWith({ event: 'pagehide', persisted: true })

    cleanup()
    dom.document.dispatchEvent(new Event('visibilitychange'))
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
