import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import { getMainEntry, isEntry, unpluginFactory } from '../src/lib'
import type { Options } from '../src/type'

const nodeRequire = createRequire(import.meta.url)
const cwd = process.cwd()
const entryFile = path.resolve(cwd, 'entry.ts')
const ENV_KEYS = ['UNI_PLATFORM', 'UNI_INPUT_DIR']

let envBackup: Record<string, string | undefined> = {}

beforeEach(() => {
  envBackup = {}
  for (const key of ENV_KEYS) {
    envBackup[key] = process.env[key]
    delete process.env[key]
  }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (envBackup[key] === undefined) delete process.env[key]
    else process.env[key] = envBackup[key]
  }
  vi.restoreAllMocks()
})

function factory(options: Partial<Options> = {}) {
  return unpluginFactory({
    url: 'http://report.example/record',
    appid: 'a',
    entry: entryFile,
    ...options,
  } as Options)
}

describe('getMainEntry', () => {
  it('未指定 UNI_INPUT_DIR 时抛错', () => {
    expect(() => getMainEntry()).toThrow('UNI_INPUT_DIR not specified')
  })

  it('存在 main.ts 时优先返回 main.ts', () => {
    process.env.UNI_INPUT_DIR = path.resolve(cwd, 'playground/uni/src')
    expect(getMainEntry()).toBe('main.ts')
  })

  it('不存在 main.ts 时回退到 main.js', () => {
    process.env.UNI_INPUT_DIR = path.resolve(cwd, 'src')
    expect(getMainEntry()).toBe('main.js')
  })
})

describe('isEntry', () => {
  it('小程序平台下与 UNI_INPUT_DIR 的入口比较', () => {
    process.env.UNI_PLATFORM = 'mp-weixin'
    process.env.UNI_INPUT_DIR = path.resolve(cwd, 'playground/uni/src')

    expect(isEntry(path.resolve(cwd, 'playground/uni/src/main.ts'), 'ignored.ts')).toBe(true)
    expect(isEntry(path.resolve(cwd, 'playground/uni/src/pages/index.ts'), 'ignored.ts')).toBe(false)
  })

  it('非小程序平台下与 cwd + entryFile 比较', () => {
    expect(isEntry(entryFile, 'entry.ts')).toBe(true)
    expect(isEntry(path.resolve(cwd, 'other.ts'), 'entry.ts')).toBe(false)
  })
})

describe('transformInclude', () => {
  it('命中入口文件，忽略 node_modules 与其它文件', () => {
    const plugin = factory()
    expect(plugin.transformInclude!(entryFile)).toBe(true)
    expect(plugin.transformInclude!(`${entryFile}/node_modules/dep.ts`)).toBe(false)
    expect(plugin.transformInclude!(path.resolve(cwd, 'other.ts'))).toBe(false)
  })

  it('支持入口数组', () => {
    const second = path.resolve(cwd, 'second.ts')
    const plugin = factory({ entry: [entryFile, second] })
    expect(plugin.transformInclude!(second)).toBe(true)
  })
})

describe('transform', () => {
  it('H5 平台不注入代码', () => {
    process.env.UNI_PLATFORM = 'h5'
    const plugin = factory()
    expect(plugin.transform!('const a = 1', entryFile)).toBe('const a = 1')
  })

  it('未指定平台时按 H5 处理（外部脚本注入）', () => {
    const plugin = factory()
    const res = plugin.transform!('const a = 1', entryFile)
    expect(typeof res).toBe('string')
  })

  it('小程序平台按配置注入插件注册代码与构建信息', () => {
    process.env.UNI_PLATFORM = 'mp-weixin'
    const plugin = factory({
      collect: true,
      error: true,
      network: { enable: true },
    })
    const res = plugin.transform!('const a = 1', entryFile) as any

    expect(res.code).toContain(
      "import { BuryReport, ErrorPlugin, NetworkPlugin, CollectPlugin } from '@sepveneto/report-core/mp'",
    )
    expect(res.code).toContain('BuryReport.registerPlugin(new CollectPlugin())')
    expect(res.code).toContain('BuryReport.registerPlugin(new ErrorPlugin())')
    expect(res.code).toContain('BuryReport.registerPlugin(new NetworkPlugin())')
    expect(res.code).toContain('new BuryReport(')
    expect(res.code).toContain('"appid":"a"')
    expect(res.map).toBeDefined()
  })

  it('关闭的插件不注入注册代码', () => {
    process.env.UNI_PLATFORM = 'mp-weixin'
    const plugin = factory({
      collect: false,
      error: false,
      network: { enable: false },
    })
    const res = plugin.transform!('const a = 1', entryFile) as any

    expect(res.code).toContain('import { BuryReport, ErrorPlugin, NetworkPlugin, CollectPlugin }')
    expect(res.code).not.toContain('new CollectPlugin()')
    expect(res.code).not.toContain('new ErrorPlugin()')
    expect(res.code).not.toContain('new NetworkPlugin()')
  })
})

describe('vite 适配', () => {
  it('H5 下插入外部脚本标签', () => {
    const plugin = factory() as any
    const res = plugin.vite.transformIndexHtml('<html><body></body></html>')

    expect(res.html).toBe('<html><body></body></html>')
    expect(res.tags).toHaveLength(1)
    expect(res.tags[0].tag).toBe('script')
    expect(res.tags[0].injectTo).toBe('body-prepend')
    expect(typeof res.tags[0].children).toBe('string')
    expect(res.tags[0].children).toContain('"appid":"a"')
    expect(res.tags[0].children).toMatch(/"stamp":"\d{14}"/)
  })

  it('小程序下不插入脚本标签', () => {
    process.env.UNI_PLATFORM = 'mp-weixin'
    const plugin = factory() as any
    expect(plugin.vite.transformIndexHtml('<html></html>')).toBe('<html></html>')
  })
})

describe('webpack 适配', () => {
  let restoreHtmlWebpackPlugin: (() => void) | undefined

  afterEach(() => {
    restoreHtmlWebpackPlugin?.()
    restoreHtmlWebpackPlugin = undefined
  })

  function stubHtmlWebpackPlugin(exports: any) {
    const id = nodeRequire.resolve('html-webpack-plugin')
    const cache = nodeRequire.cache
    const prev = cache[id]
    cache[id] = { id, filename: id, loaded: true, exports } as any
    restoreHtmlWebpackPlugin = () => {
      if (prev) cache[id] = prev
      else delete cache[id]
    }
  }

  it('在 bodyTags 头部插入上报脚本', () => {
    const alterCallbacks: any[] = []
    stubHtmlWebpackPlugin({
      getHooks: (compilation: any) => compilation.__hwp,
    })

    const plugin = factory() as any
    const compileCallbacks: any[] = []
    plugin.webpack({
      hooks: {
        thisCompilation: {
          tap: (_name: string, cb: any) => compileCallbacks.push(cb),
        },
      },
    })

    const compilation = {
      __hwp: {
        alterAssetTagGroups: {
          tapAsync: (_name: string, cb: any) => alterCallbacks.push(cb),
        },
      },
    }
    compileCallbacks[0](compilation)
    expect(alterCallbacks).toHaveLength(1)

    let result: any
    alterCallbacks[0]({ bodyTags: [] }, (_err: any, data: any) => {
      result = data
    })

    expect(result.bodyTags).toHaveLength(1)
    expect(result.bodyTags[0].tagName).toBe('script')
    expect(result.bodyTags[0].innerHTML).toContain('"appid":"a"')
  })
})

describe('rspack 适配', () => {
  it('在 html 资源的 body 起始处插入上报脚本', () => {
    const plugin = factory() as any
    const compileCallbacks: any[] = []
    plugin.rspack({
      webpack: {
        sources: {
          RawSource: class {
            constructor(public value: string) {}
          },
        },
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: 100,
        },
      },
      hooks: {
        thisCompilation: {
          tap: (_opts: any, cb: any) => compileCallbacks.push(cb),
        },
      },
    })

    const processCallbacks: any[] = []
    const updated: Record<string, string> = {}
    const compilation = {
      hooks: {
        processAssets: {
          tap: (_opts: any, cb: any) => processCallbacks.push(cb),
        },
      },
      getAssets: () => [
        { name: 'index.html', source: { source: () => '<html><body class="a"></body></html>' } },
        { name: 'index.js', source: { source: () => 'console.log(1)' } },
      ],
      updateAsset: (name: string, source: any) => {
        updated[name] = source.value
      },
    }
    compileCallbacks[0](compilation)
    processCallbacks[0]()

    expect(updated['index.html']).toContain('<body class="a"><script>')
    expect(updated['index.html']).toContain('"appid":"a"')
    expect(updated['index.js']).toBeUndefined()
  })
})
