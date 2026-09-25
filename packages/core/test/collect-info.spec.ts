import { dom } from './helpers/dom-stub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import safeAreaInsets from 'safe-area-insets'
import { CollectPlugin, getBrowserInfo, getWindowWidth } from '../src/browser/plugins/collect'

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'

function setUA(ua: string, extra: Record<string, any> = {}) {
  ;(dom.window.navigator as any).userAgent = ua
  Object.assign(dom.window.navigator as any, extra)
}

// collect.ts 里用的是全局 screen，dom-stub 初始化时把它指向了 window.screen，
// 因此只能原地修改，不能替换引用
function setScreen(width: number, height: number, orientation?: any) {
  ;(dom.window.screen as any).width = width
  ;(dom.window.screen as any).height = height
  ;(dom.window.screen as any).orientation = orientation
  ;(globalThis as any).screen = dom.window.screen
}

function ctx() {
  return {
    options: { url: 'http://report.example/record', appid: 'a' },
    report: vi.fn(),
  }
}

beforeEach(() => {
  dom.bus.clear()
  setScreen(375, 812)
  ;(dom.window as any).orientation = undefined
  ;(dom.window as any).__uniConfig = undefined
  ;(dom.window as any).BigInt = BigInt
  ;(dom.window as any).matchMedia = () => ({ matches: false })
  dom.document.documentElement.style.getPropertyValue = () => ''
  dom.document.documentElement.clientWidth = undefined as any
  dom.window.innerWidth = 400
  dom.window.innerHeight = 600
  setUA(DESKTOP_UA, { maxTouchPoints: 0, language: 'zh-CN' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getBrowserInfo：设备与系统识别', () => {
  it('iOS 设备识别机型与系统版本', () => {
    setUA(IOS_UA)
    const info = getBrowserInfo()

    expect(info).toMatchObject({
      osname: 'iOS',
      osversion: '15.0',
      model: 'iPhone',
      deviceModel: 'iPhone',
      deviceType: 'phone',
      platform: 'ios',
      browserName: 'safari',
    })
  })

  it('Android 设备从 Build 字段识别机型', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 10; SM-G975F Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.91 Mobile Safari/537.36',
    )
    const info = getBrowserInfo()

    expect(info).toMatchObject({
      osname: 'Android',
      osversion: '10',
      model: 'SM-G975F',
      deviceType: 'phone',
      browserName: 'chrome',
      browserVersion: '90.0.4430.91',
    })
  })

  it('Android 无 Build 字段时取首个非关键词片段作为机型', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 9; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0 Mobile Safari/537.36',
    )
    const info = getBrowserInfo()

    expect(info).toMatchObject({ osname: 'Android', osversion: '9', model: 'Pixel 3' })
  })

  it('iPadOS（Mac + 触摸）识别为 pad，并按 BigInt 判断版本', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', {
      maxTouchPoints: 5,
    })
    expect(getBrowserInfo()).toMatchObject({ osname: 'iOS', model: 'iPad', deviceType: 'pad', osversion: '14.0' })

    ;(dom.window as any).BigInt = undefined
    expect(getBrowserInfo().osversion).toBe('13.0')
  })

  it('Windows 版本号映射为可读名称', () => {
    const cases: Array<[string, string]> = [
      ['5.1', 'XP'],
      ['6.0', 'Vista'],
      ['6.1', '7'],
      ['6.2', '8'],
      ['6.3', '8.1'],
      ['10.0', '10'],
    ]
    for (const [nt, expected] of cases) {
      setUA(`Mozilla/5.0 (Windows NT ${nt}; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36`)
      const info = getBrowserInfo()
      expect(info.osname).toBe('Windows')
      expect(info.osversion).toContain(expected)
    }
  })

  it('macOS 与 Linux 识别', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', {
      maxTouchPoints: 0,
    })
    expect(getBrowserInfo()).toMatchObject({ osname: 'macOS', deviceType: 'pc', model: 'PC' })

    setUA('Mozilla/5.0 (X11; Linux x86_64; rv:79.0) Gecko/20100101 Firefox/79.0')
    expect(getBrowserInfo()).toMatchObject({ osname: 'Linux', browserName: 'firefox' })
  })

  it('无法识别的环境降级为 Other/unknown', () => {
    setUA('curl/7.68.0')
    expect(getBrowserInfo()).toMatchObject({
      osname: 'Other',
      osversion: '0',
      deviceType: 'unknown',
    })
  })

  it('IE / IE11 / Edge 浏览器识别', () => {
    setUA('Mozilla/4.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)')
    expect(getBrowserInfo().browserName).toBe('ie')

    setUA('Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko')
    expect(getBrowserInfo().browserName).toBe('ie')

    setUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.19041')
    expect(getBrowserInfo().browserName).toBe('edge')
  })

  it('屏幕方向：横屏（orientation.angle 与 window.orientation 两种来源）', () => {
    expect(getBrowserInfo().deviceOrientation).toBe('portrait')

    setScreen(812, 375, { angle: 90 })
    expect(getBrowserInfo().deviceOrientation).toBe('landscape')

    setScreen(812, 375)
    ;(dom.window as any).orientation = -90
    expect(getBrowserInfo().deviceOrientation).toBe('landscape')
  })
})

describe('getBrowserInfo：主题识别', () => {
  it('uni 配置为字符串时直接使用', () => {
    ;(dom.window as any).__uniConfig = { darkmode: 'dark' }
    expect(getBrowserInfo().theme).toBe('dark')

    ;(dom.window as any).__uniConfig = { darkmode: false }
    expect(getBrowserInfo().theme).toBe('light')
  })

  it('uni 配置为 true 时回退到 prefers-color-scheme', () => {
    ;(dom.window as any).__uniConfig = { darkmode: true }
    ;(dom.window as any).matchMedia = () => ({ matches: true })
    expect(getBrowserInfo().theme).toBe('light')

    ;(dom.window as any).matchMedia = () => ({ matches: false })
    expect(getBrowserInfo().theme).toBe('dark')
  })

  it('matchMedia 不可用时降级为 light', () => {
    ;(dom.window as any).matchMedia = () => {
      throw new Error('not supported')
    }
    expect(getBrowserInfo().theme).toBe('light')
  })
})

describe('窗口尺寸计算', () => {
  it('取 innerWidth / clientWidth / screenWidth 的最小值', () => {
    dom.window.innerWidth = 900
    dom.document.documentElement.clientWidth = 750 as any
    expect(getWindowWidth(1000)).toBe(750)
  })

  it('clientWidth 不可用时回退到屏幕宽度', () => {
    dom.window.innerWidth = 900
    dom.document.documentElement.clientWidth = undefined as any
    expect(getWindowWidth(1000)).toBe(1000)
  })

  it('读取 CSS 变量计算窗口边距', () => {
    const vars: Record<string, string> = {
      '--window-top': '10px',
      '--window-bottom': '20px',
      '--window-left': '1px',
      '--window-right': '2px',
      '--top-window-height': '30px',
    }
    dom.document.documentElement.style.getPropertyValue = (name: string) => vars[name] || ''

    const info = new CollectPlugin().getSystemInfo()
    const top = 10 + safeAreaInsets.top
    const bottom = 20 + safeAreaInsets.bottom

    expect(info.wt).toBe(top)
    expect(info.wb).toBe(bottom)
    expect(info.wh).toBe(600 - top - bottom)
  })
})

describe('CollectPlugin.getSystemInfo', () => {
  it('汇总设备、宿主与 uni 编译信息', () => {
    ;(dom.window as any).__uniConfig = { compilerVersion: '3.1.0' }
    const c = ctx()
    new CollectPlugin().init(c as any)

    const info = c.report.mock.calls[0][1]
    expect(info).toMatchObject({
      dt: 'pc',
      on: 'windows',
      bn: 'chrome',
      up: 'web',
      uc: '3.1.0',
      ur: '3.1.0',
      wh: 600,
      sw: 375,
      sh: 812,
    })
    // sa 上报的是 safeAreaInsets 原始四边数据
    expect(info.sa).toHaveProperty('top')
    expect(info.sa).toHaveProperty('bottom')
  })
})

describe('iOS 横屏屏幕修正', () => {
  async function loadIOSCollect() {
    setUA(IOS_UA)
    vi.resetModules()
    const mod = await import('../src/browser/plugins/collect')
    return mod
  }

  it('横屏时交换屏幕宽高', async () => {
    const { CollectPlugin: IOSCollect } = await loadIOSCollect()
    setScreen(375, 812, { angle: 90 })

    const info = new IOSCollect().getSystemInfo()
    expect(info).toMatchObject({ sw: 812, sh: 375 })
  })

  it('screen.orientation 缺失时回退到 window.orientation', async () => {
    const { CollectPlugin: IOSCollect } = await loadIOSCollect()
    setScreen(375, 812)
    ;(dom.window as any).orientation = 0

    const info = new IOSCollect().getSystemInfo()
    expect(info).toMatchObject({ sw: 375, sh: 812 })
  })
})
