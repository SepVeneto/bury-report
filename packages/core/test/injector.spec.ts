import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REPORT_URL = 'http://report.example/record'
const ORIGINAL_CONSOLE_ERROR = console.error

type ScriptStub = {
  src: string
  crossOrigin: string
  onload?: () => void
  onerror?: (err?: any) => void
}

let scripts: ScriptStub[] = []

function loadInjector(options: Record<string, any> = {}) {
  ;(globalThis as any).SDK_OPTIONS = {
    url: REPORT_URL,
    appid: 'a',
    ...options,
  }
  vi.resetModules()
  return import('../src/browser/injector')
}

async function tick() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  dom.bus.clear()
  scripts = []
  ;delete (dom.window as any).BuryReport
  ;delete (dom.window as any).OperationRecordPlugin
  process.env.DEFINE_VERSION = '1.2.3'
  vi.spyOn(dom.document.body, 'appendChild').mockImplementation((el: any) => {
    scripts.push(el)
    return el
  })
})

afterEach(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
  vi.restoreAllMocks()
  delete process.env.DEFINE_VERSION
  ;delete (dom.window as any).BuryReport
  ;delete (dom.window as any).OperationRecordPlugin
})

describe('injector 核心脚本加载', () => {
  it('按版本号拼接 sdk 地址并加载核心脚本', async () => {
    await loadInjector()

    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('http://report.example/sdk/1.2/index.global.js?v=1.2.3')
    expect(scripts[0].crossOrigin).toBe('anonymous')
  })

  it('核心脚本加载完成后使用 options 初始化 BuryReport', async () => {
    const constructed: any[] = []
    class FakeBuryReport {
      constructor(options: any) {
        constructed.push(options)
      }
    }
    ;(dom.window as any).BuryReport = FakeBuryReport

    await loadInjector()
    scripts[0].onload!()
    await tick()

    expect(constructed).toHaveLength(1)
    expect(constructed[0]).toMatchObject({ url: REPORT_URL, appid: 'a' })
  })

  it('window 上找不到 BuryReport 时给出警告且不抛错', async () => {
    await loadInjector()
    expect(() => scripts[0].onload!()).not.toThrow()
    await tick()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('cannot find BuryReport in window'),
    )
  })

  it('BuryReport 构造抛错时不影响宿主', async () => {
    ;(dom.window as any).BuryReport = class {
      constructor() {
        throw new Error('boom')
      }
    }

    await loadInjector()
    expect(() => scripts[0].onload!()).not.toThrow()
    await tick()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('init failed with error'),
      expect.any(Error),
    )
  })

  it('核心脚本加载失败时恢复 console.error 并警告，不抛错', async () => {
    await loadInjector()
    // init 时 ErrorPlugin 代理了 console.error
    expect(console.error).not.toBe(ORIGINAL_CONSOLE_ERROR)

    expect(() => scripts[0].onerror!(new Error('404'))).not.toThrow()
    await tick()

    expect(console.error).toBe(ORIGINAL_CONSOLE_ERROR)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('core sdk load failed'),
    )
  })

  it('未开启录屏时不加载 rrweb 插件', async () => {
    await loadInjector({ operationRecord: { enable: false } })
    expect(scripts).toHaveLength(1)
  })
})

describe('injector rrweb 插件异步加载', () => {
  it('开启录屏后加载插件脚本，加载完成后注册到已初始化的 SDK', async () => {
    const registerPlugin = vi.fn()
    ;(dom.window as any).BuryReport = class {}
    ;(dom.window as any).BuryReport.registerPlugin = registerPlugin
    class FakePlugin {}
    ;(dom.window as any).OperationRecordPlugin = FakePlugin

    await loadInjector({ operationRecord: { enable: true } })
    expect(scripts).toHaveLength(2)
    expect(scripts[1].src).toBe(
      'http://report.example/sdk/1.2/plugins/operationRecord.global.js?v=1.2.3',
    )

    scripts[0].onload!()
    await tick()
    scripts[1].onload!()
    await tick()

    expect(registerPlugin).toHaveBeenCalledTimes(1)
    expect(registerPlugin.mock.calls[0][0]).toBeInstanceOf(FakePlugin)
  })

  it('rrweb 插件缺失时不注册', async () => {
    const registerPlugin = vi.fn()
    ;(dom.window as any).BuryReport = class {}
    ;(dom.window as any).BuryReport.registerPlugin = registerPlugin

    await loadInjector({ operationRecord: { enable: true } })
    scripts[0].onload!()
    await tick()
    scripts[1].onload!()
    await tick()

    expect(registerPlugin).not.toHaveBeenCalled()
  })

  it('rrweb 插件加载失败不影响核心 SDK', async () => {
    await loadInjector({ operationRecord: { enable: true } })
    scripts[0].onerror!(new Error('404'))
    expect(() => scripts[1].onerror!(new Error('404'))).not.toThrow()
    await tick()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('operation record plugin load failed'),
    )
  })
})

describe('injector 兜底', () => {
  it('注入过程出现异常时被整体捕获，不影响宿主', async () => {
    vi.spyOn(dom.document, 'createElement').mockImplementation(() => {
      throw new Error('document broken')
    })

    await expect(loadInjector()).resolves.toBeDefined()

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('init failed with error'),
      expect.any(Error),
    )
  })
})
