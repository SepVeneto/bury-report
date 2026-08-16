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

// 插件会包装 history.pushState/replaceState，且 dom-stub 的 history 在文件内共享，
// 每个用例前还原原始实现，避免包装层数叠加
const originalPushState = dom.window.history.pushState
const originalReplaceState = dom.window.history.replaceState

function initPlugin(options: Record<string, any> = {}) {
  const report = vi.fn()
  const Plugin = (dom.window as any).OperationRecordPlugin
  const plugin = new Plugin()
  plugin.init({ options, report } as any)
  return { plugin, report, emit: record.mock.calls[0][0].emit }
}

beforeEach(() => {
  vi.useFakeTimers()
  dom.window.history.pushState = originalPushState
  dom.window.history.replaceState = originalReplaceState
  record.mockReset()
  takeFullSnapshot.mockReset()
  dom.bus.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('OperationRecordPlugin', () => {
  it('init 默认开启 5s 周期检查点并关闭样式内联', () => {
    initPlugin({ operationRecord: { enable: true } })
    const options = record.mock.calls[0][0]
    expect(options.checkoutEveryNms).toBe(5 * 1000)
    expect(options.inlineStylesheet).toBe(false)
  })

  it('支持自定义检查点间隔与样式内联开关', () => {
    initPlugin({
      operationRecord: { enable: true, checkoutEveryNms: 3000, inlineStylesheet: true },
    })
    const options = record.mock.calls[0][0]
    expect(options.checkoutEveryNms).toBe(3000)
    expect(options.inlineStylesheet).toBe(true)
  })

  it('checkoutEveryNms 设为 0 时关闭检查点', () => {
    initPlugin({ operationRecord: { enable: true, checkoutEveryNms: 0 } })
    expect(record.mock.calls[0][0].checkoutEveryNms).toBe(0)
  })

  it('FullSnapshot 事件立即上报整个批次', () => {
    const { report, emit } = initPlugin({})
    emit({ type: EventType.FullSnapshot, data: { node: {} }, timestamp: 1 })
    expect(report).toHaveBeenCalledWith(
      OPERATION_TRACK,
      { events: expect.arrayContaining([expect.objectContaining({ type: EventType.FullSnapshot })]) },
      { immediate: true, keepalive: false, store: false },
    )
  })

  it('录屏事件流保持原子性：大量事件仍作为单条记录上报，不拆分', () => {
    const { report, emit } = initPlugin({})
    // 大量增量事件 + 段内快照
    for (let i = 0; i < 200; i++) {
      emit({
        type: EventType.IncrementalSnapshot,
        data: { source: 0, texts: [], attributes: [], removes: [], adds: [], blob: 'x'.repeat(400) },
        timestamp: i + 1,
      })
    }
    emit({ type: EventType.FullSnapshot, data: { node: {} }, timestamp: 201 })

    // 单条记录包含全部事件（拆分会因 keepalive 部分送达导致整段不完整）
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][1].events).toHaveLength(201)
    expect(report.mock.calls[0][2]).toEqual({ immediate: true, keepalive: false, store: false })
  })

  it('路由切换不立即拍快照，渲染完成后才拍（避免中间态快照）', () => {
    const { emit } = initPlugin({})
    // 首个 FullSnapshot 建立路由 hook
    emit({ type: EventType.FullSnapshot, data: { node: {} }, timestamp: 1 })

    const history = dom.window.history as any
    history.pushState({}, '', '/cashier')
    // 延迟拍快照：此刻不应已执行
    expect(takeFullSnapshot).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)
  })

  it('页面重新可见（从第三方回到 portal）时重建检查点', () => {
    initPlugin({})
    Object.defineProperty(dom.document, 'visibilityState', { value: 'visible', configurable: true })
    dom.document.dispatchEvent(new Event('visibilitychange'))

    expect(takeFullSnapshot).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)
  })

  it('快照节流：1s 内重复触发只拍一次', () => {
    const { emit } = initPlugin({})
    emit({ type: EventType.FullSnapshot, data: { node: {} }, timestamp: 1 })
    const history = dom.window.history as any

    history.pushState({}, '', '/a')
    history.replaceState({}, '', '/b')
    vi.advanceTimersByTime(100)
    expect(takeFullSnapshot).toHaveBeenCalledTimes(1)

    // 超过节流窗口后再触发
    vi.advanceTimersByTime(1000)
    history.pushState({}, '', '/c')
    vi.advanceTimersByTime(100)
    expect(takeFullSnapshot).toHaveBeenCalledTimes(2)
  })
})
