import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  estimateSize,
  getLocalStorage,
  getSessionId,
  getUuid,
  getUtf8Size,
  readQueue,
  removeLocalStorage,
  resetSessionId,
  resetStorageCache,
  setLocalStorage,
  storageReport,
  tryJsonString,
  writeQueue,
} from '../src/utils'
import { REPORT_QUEUE, SESSIONID_KEY, UUID_KEY } from '../src/constant'

// 本文件不注入 uni，用于覆盖纯 web（window.localStorage/sessionStorage）分支
beforeEach(() => {
  resetStorageCache()
  dom.localStorage.clear()
  dom.sessionStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('web 端存储实现', () => {
  it('无 uni 环境时使用 window.localStorage 读写', () => {
    expect(setLocalStorage('k', 'v')).toBe(true)
    expect(getLocalStorage('k')).toBe('v')
    expect(dom.localStorage.getItem('k')).toBe('v')

    removeLocalStorage('k')
    expect(getLocalStorage('k')).toBeNull()
  })

  it('写入存储异常时返回 false 且不抛错', () => {
    vi.spyOn(dom.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(setLocalStorage('k', 'v')).toBe(false)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('set storage queue failed'),
    )
  })

  it('uuid 持久化到 localStorage 且读取异常时仍能生成', () => {
    const uuid = getUuid()
    expect(dom.localStorage.getItem(UUID_KEY)).toBe(uuid)

    resetStorageCache()
    vi.spyOn(dom.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => getUuid()).not.toThrow()
    expect(getUuid()).toBeTruthy()
  })

  it('session id 使用 window.sessionStorage 并可通过 resetSessionId 重置', () => {
    const sid = getSessionId()
    expect(dom.sessionStorage.getItem(SESSIONID_KEY)).toBe(sid)

    expect(() => resetSessionId()).not.toThrow()
    // web 端会话由 sessionStorage 维护，resetSessionId 仅用于小程序手动重置
    expect(getSessionId()).toBeTruthy()
  })

  it('读写队列走 window.localStorage', () => {
    expect(writeQueue([{ a: 1 }])).toBe(true)
    expect(JSON.parse(dom.localStorage.getItem(REPORT_QUEUE)!)).toEqual([{ a: 1 }])
    expect(readQueue()).toEqual([{ a: 1 }])
  })

  it('无法序列化的队列数据不会抛错', () => {
    const circular: any = {}
    circular.self = circular

    expect(writeQueue([circular])).toBe(false)
    expect(console.warn).toHaveBeenCalled()
  })

  it('storageReport 复用已缓存的 uuid/session', () => {
    const record = storageReport('custom', { a: 1 })
    expect(record.uuid).toBe(getUuid())
    expect(record.session).toBe(getSessionId())
  })
})

describe('体积估算异常分支', () => {
  it('对象无法序列化时回退到默认体积，避免分片失败', () => {
    const circular: any = {}
    circular.self = circular

    expect(estimateSize(circular)).toBe(1024)
    expect(estimateSize({ a: 1 })).toBe(7)
  })

  it('孤立代理对按 3 字节计算，不会越界读取', () => {
    expect(getUtf8Size('\uD800')).toBe(3)
    expect(getUtf8Size('\uDC00')).toBe(3)
  })

  it('tryJsonString 正常返回序列化结果', () => {
    expect(tryJsonString({ a: 1 })).toBe('{"a":1}')
  })
})
