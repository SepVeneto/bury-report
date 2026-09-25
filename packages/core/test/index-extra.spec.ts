import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { report, reportNetwork, setCustomId } from '../src/index'
import { COLLECT_API, CUSTOM_ID, REPORT_REQUEST } from '../src/constant'

beforeEach(() => {
  delete (globalThis as any)[REPORT_REQUEST]
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('uni', {
    setStorageSync: () => {},
    getStorageSync: () => undefined,
    removeStorageSync: () => {},
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (globalThis as any)[REPORT_REQUEST]
})

describe('公共 API 异常分支', () => {
  it('REPORT_REQUEST 被占用为非函数时告警并降级缓存，不抛错', () => {
    ;(globalThis as any)[REPORT_REQUEST] = 'not-a-function'

    expect(() => report('custom', { a: 1 })).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('the report function is not a function'),
    )
  })

  it('reportNetwork 在 REPORT_REQUEST 非函数时同样降级，不抛错', () => {
    ;(globalThis as any)[REPORT_REQUEST] = 'not-a-function'

    expect(() => reportNetwork({ url: '/x' })).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('the report function is not a function'),
    )
  })

  it('reportNetwork 未初始化时降级缓存，不抛错', () => {
    expect(() => reportNetwork({ url: '/x' }, true)).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cannot find report function'),
    )
  })

  it('report 第一个参数非字符串时告警且不转发', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn

    report(123 as any, { a: 1 })

    expect(fn).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('the first argument must be a string'),
    )
  })

  it('report 正常转发并透传 immediate', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn

    report('custom', { a: 1 }, true)
    expect(fn).toHaveBeenCalledWith('custom', { a: 1 }, { immediate: true })

    report('custom', { a: 2 })
    expect(fn).toHaveBeenLastCalledWith('custom', { a: 2 }, { immediate: undefined })
  })

  it('setCustomId 以立即上报的方式写入 CUSTOM_ID', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn

    setCustomId('user-1')

    expect(fn).toHaveBeenCalledWith(CUSTOM_ID, { id: 'user-1' }, { immediate: true })
  })

  it('reportNetwork 正常转发到 COLLECT_API', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn

    reportNetwork({ url: '/x' }, true)

    expect(fn).toHaveBeenCalledWith(COLLECT_API, { url: '/x' }, { immediate: true })
  })
})
