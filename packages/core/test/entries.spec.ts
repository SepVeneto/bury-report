import { describe, expect, it } from 'vitest'
import vitePlugin from '../src/vite'
import webpackPlugin from '../src/webpack'
import rspackPlugin from '../src/rspack'
import { BuryReportBase, BuryReportPlugin } from '../src/type'
import type { ReportFn } from '../src/type'

describe('构建工具入口', () => {
  it('vite 插件可用', () => {
    expect(vitePlugin).toBeTruthy()
    expect(typeof vitePlugin).toBe('function')
  })

  it('webpack 插件可用', () => {
    expect(webpackPlugin).toBeTruthy()
  })

  it('rspack 插件可用', () => {
    expect(rspackPlugin).toBeTruthy()
  })
})

describe('类型基类（运行时可继承）', () => {
  it('可以继承并实现 BuryReportBase', () => {
    class Base extends BuryReportBase {
      options = { url: 'u', appid: 'a' } as any
      report: ReportFn = () => {}
    }
    const base = new Base()
    expect(base.options.appid).toBe('a')
    expect(typeof base.report).toBe('function')
  })

  it('可以继承并实现 BuryReportPlugin', () => {
    class Plugin extends BuryReportPlugin {
      name = 'demo'
      inited = false
      init() {
        this.inited = true
      }
    }
    const plugin = new Plugin()
    plugin.init()
    expect(plugin.name).toBe('demo')
    expect(plugin.inited).toBe(true)
  })
})
