import '../src/browser/polyfill'
import { describe, expect, it } from 'vitest'

describe('polyfill: Uint8Array.from 手动实现', () => {
  it('已替换为手动实现并带幂等标记', () => {
    expect((Uint8Array.from as any).__patched__).toBe(true)
  })

  it('rrweb 的调用模式：字符串 + charCodeAt mapFn', () => {
    // 与 operationRecord.global.js 求值时的调用一致：
    // Uint8Array.from(atob(cc), e => e.charCodeAt(0))
    const bytes = Uint8Array.from('ABC', (c: any) => c.charCodeAt(0))
    expect(Array.from(bytes)).toEqual([65, 66, 67])
  })

  it('数组与类数组正常工作', () => {
    expect(Array.from(Uint8Array.from([1, 2, 3]))).toEqual([1, 2, 3])
    expect(Array.from(Uint8Array.from({ length: 2, 0: 9, 1: 8 }))).toEqual([9, 8])
  })

  it('返回真正的 Uint8Array 实例', () => {
    expect(Uint8Array.from([1])).toBeInstanceOf(Uint8Array)
  })
})
