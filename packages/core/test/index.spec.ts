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

describe('公共 report API', () => {
  it('SDK 未初始化时调用不抛错', () => {
    expect(() => report('custom', { a: 1 })).not.toThrow()
    expect(() => reportNetwork({ url: '/x' })).not.toThrow()
  })

  it('第一个参数非字符串时警告且不抛错', () => {
    expect(() => report(123 as any, { a: 1 })).not.toThrow()
  })

  it('已初始化时转发调用并携带 immediate', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn
    report('custom', { a: 1 }, true)
    expect(fn).toHaveBeenCalledWith('custom', { a: 1 }, { immediate: true })
  })

  it('reportNetwork 转发到 COLLECT_API', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn
    reportNetwork({ url: '/x' })
    expect(fn).toHaveBeenCalledWith(COLLECT_API, { url: '/x' }, { immediate: undefined })
  })

  it('setCustomId 立即上报 CUSTOM_ID', () => {
    const fn = vi.fn()
    ;(globalThis as any)[REPORT_REQUEST] = fn
    setCustomId('abc')
    expect(fn).toHaveBeenCalledWith(CUSTOM_ID, { id: 'abc' }, { immediate: true })
  })
})
