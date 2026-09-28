import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../src/browser/polyfill'
import { getUtf8Size, resetStorageCache } from '../src/utils'
import { report } from '../src/index'

const REPORT_URL = 'http://report.example/record'
const ORIGINAL_CONSOLE_ERROR = console.error

let scripts: any[] = []

beforeEach(() => {
  resetStorageCache()
  scripts = []
  dom.bus.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(dom.document.body, 'appendChild').mockImplementation((el: any) => {
    scripts.push(el)
    return el
  })
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
  vi.restoreAllMocks()
  delete process.env.DEFINE_VERSION
  delete process.env.LOG_DEBUG
})

describe('polyfill 幂等性', () => {
  it('重复加载时命中已 patch 分支，不重复包装', async () => {
    const before = Uint8Array.from
    vi.resetModules()
    await expect(import('../src/browser/polyfill')).resolves.toBeDefined()
    expect(Uint8Array.from).toBe(before)
  })
})

describe('getUtf8Size 分支', () => {
  it('2 字节字符按 2 字节计算', () => {
    expect(getUtf8Size('é')).toBe(2)
    expect(getUtf8Size('ß')).toBe(2)
  })
})

describe('report 入参兜底', () => {
  it('无参数调用时给出告警且不抛错', () => {
    expect(() => (report as any)()).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('the first argument must be a string'),
    )
  })
})

describe('injector 构建变量分支', () => {
  it('未注入 DEFINE_VERSION 时版本号降级为 undefined', async () => {
    delete process.env.DEFINE_VERSION
    ;(globalThis as any).SDK_OPTIONS = { url: REPORT_URL, appid: 'a' }
    vi.resetModules()
    await import('../src/browser/injector')

    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toContain('/sdk/undefined.undefined/index.global.js')
  })

  it('LOG_DEBUG 下从本地 public 目录加载脚本', async () => {
    process.env.LOG_DEBUG = '1'
    ;(globalThis as any).SDK_OPTIONS = { url: REPORT_URL, appid: 'a' }
    vi.resetModules()
    await import('../src/browser/injector')

    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('/public/index.global.js')
  })
})
