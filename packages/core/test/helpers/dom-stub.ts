// 在 node 环境下提供浏览器测试所需的最小 DOM 桩。
// 必须在本文件被 import 时立即生效（模块顶层副作用），
// 因此浏览器相关测试文件需要把它放在第一个 import 位置。

function createStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
}

type Handler = (evt: any) => void

class EventBus {
  private listeners = new Map<string, Handler[]>()

  addEventListener(type: string, handler: Handler) {
    const list = this.listeners.get(type) || []
    list.push(handler)
    this.listeners.set(type, list)
  }

  removeEventListener(type: string, handler: Handler) {
    const list = this.listeners.get(type) || []
    this.listeners.set(
      type,
      list.filter(item => item !== handler),
    )
  }

  dispatchEvent(evt: any) {
    ;(this.listeners.get(evt.type) || []).slice().forEach(handler => handler(evt))
    return true
  }

  clear() {
    this.listeners.clear()
  }
}

// 浏览器插件会基于 window.XMLHttpRequest 做子类化，需要提供可用的基类
class FakeXMLHttpRequest extends (globalThis.EventTarget as any) {
  status = 0
  response: any = null
  responseURL = ''
  responseType = ''
  timeout = 0
  open() {}
  send() {}
  abort() {}
  getAllResponseHeaders = () => ''
}

export function setupBrowserGlobals() {
  const bus = new EventBus()
  const localStorage = createStorage()
  const sessionStorage = createStorage()
  const navigator = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    language: 'zh-CN',
    maxTouchPoints: 0,
  }
  const window = {
    addEventListener: bus.addEventListener.bind(bus),
    removeEventListener: bus.removeEventListener.bind(bus),
    dispatchEvent: bus.dispatchEvent.bind(bus),
    localStorage,
    sessionStorage,
    navigator,
    location: { href: 'http://host.example/page' },
    screen: { width: 800, height: 600, orientation: undefined },
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    orientation: undefined,
    matchMedia: () => ({ matches: false }),
    BigInt,
    XMLHttpRequest: FakeXMLHttpRequest,
    __BR_WORKER__: undefined as any,
    BuryReport: undefined as any,
    __uniConfig: undefined,
    history: {
      pushState() {},
      replaceState() {},
    },
  } as any
  window.self = window
  window.top = window

  const document = {
    addEventListener: bus.addEventListener.bind(bus),
    removeEventListener: bus.removeEventListener.bind(bus),
    dispatchEvent: bus.dispatchEvent.bind(bus),
    visibilityState: 'visible',
    createElement: (tag: string) => ({
      tagName: String(tag).toUpperCase(),
      style: {},
      outerHTML: `<${tag}></${tag}>`,
      src: '',
      href: '',
      appendChild: () => {},
    }),
    body: { appendChild: () => {} },
    documentElement: { style: { getPropertyValue: () => '' } },
    referrer: '',
  } as any

  const performance = {
    now: () => 0,
    getEntries: () => [],
    getEntriesByName: () => [],
    getEntriesByType: () => [],
  } as any
  window.performance = performance

  ;(globalThis as any).window = window
  ;(globalThis as any).document = document
  ;(globalThis as any).performance = performance
  ;(globalThis as any).XMLHttpRequest = FakeXMLHttpRequest
  ;(globalThis as any).screen = window.screen
  ;(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '0px' })
  // Node 21+ 的全局 navigator 是只读 getter，需要用 defineProperty 覆盖
  Object.defineProperty(globalThis, 'navigator', {
    value: navigator,
    configurable: true,
    writable: true,
  })

  return { window, document, bus, localStorage, sessionStorage }
}

export const dom = setupBrowserGlobals()
