import { dom } from './helpers/dom-stub'
import { afterEach, describe, expect, it } from 'vitest'
import { shouldIgnoreError, shouldIgnoreNetworkRequest } from '../src/browser/event-filter'
import { evaluateThirdPartyFrames } from '../src/browser/module-metadata'
import { reviveOptions, serializeOptions } from '../src/browser/options'

describe('构建期过滤配置', () => {
  afterEach(() => {
    delete (dom.window as any)._brModuleMetadata
  })

  it('RegExp 可以经过 loader JSON 序列化后恢复', () => {
    const serialized = serializeOptions({
      ignoreErrors: [/known\s+noise/i],
      network: {
        ignoreUrls: [/analytics/],
      },
    })
    const restored = reviveOptions(JSON.parse(serialized))

    expect(restored.ignoreErrors[0]).toBeInstanceOf(RegExp)
    expect(restored.ignoreErrors[0].test('known noise')).toBe(true)
    expect(restored.network.ignoreUrls[0]).toBeInstanceOf(RegExp)
  })

  it('错误过滤器支持默认噪音、第三方、白名单和业务自定义规则', () => {
    expect(shouldIgnoreError({ message: 'Script error.' })).toBe(true)
    ;(dom.window as any)._brModuleMetadata = {
      'Error\n    at http://host.example/assets/app.js:1:1': {
        '_brBundlerAppKey:app': true,
      },
    }
    const vendorOnlyStack = 'Error: vendor failed\n    at https://vendor.example/sdk.js:1:1'
    expect(shouldIgnoreError(
      { message: 'vendor failed', stack: vendorOnlyStack },
      { applicationKey: 'app', thirdPartyErrors: 'keep' },
    )).toBe(false)
    expect(shouldIgnoreError(
      { message: 'vendor failed', stack: vendorOnlyStack },
      { applicationKey: 'app', thirdPartyErrors: 'drop' },
    )).toBe(true)
    expect(shouldIgnoreError(
      { message: 'vendor failed', stack: vendorOnlyStack },
      { applicationKey: 'app', thirdPartyErrors: 'drop', allowUrls: [/vendor\.example/] },
    )).toBe(false)
    expect(shouldIgnoreError(
      { message: 'known noise' },
      { ignoreErrors: [/known/] },
      dom.window.location.href,
    )).toBe(true)

    const globalPattern = /noise/g
    const options = { ignoreErrors: [globalPattern] }
    expect(shouldIgnoreError({ message: 'noise' }, options)).toBe(true)
    expect(shouldIgnoreError({ message: 'noise' }, options)).toBe(true)
  })

  it('按 chunk key 区分业务帧、混合帧和纯第三方帧，并支持打标', () => {
    ;(dom.window as any)._brModuleMetadata = {
      'Error\n    at http://host.example/assets/app.js:10:2': {
        '_brBundlerAppKey:app': true,
      },
    }
    expect(evaluateThirdPartyFrames(
      'Error\n    at http://host.example/assets/app.js:20:1',
      'app',
    )).toMatchObject({ recognized: true, exclusivelyThirdParty: false })
    expect(evaluateThirdPartyFrames(
      'Error\n    at https://vendor.example/sdk.js:1:1',
      'app',
    )).toMatchObject({ recognized: true, exclusivelyThirdParty: true })
    expect(evaluateThirdPartyFrames(
      'Error\n    at http://host.example/assets/app.js:20:1\n    at https://vendor.example/sdk.js:1:1',
      'app',
    )).toMatchObject({ containsThirdParty: true, exclusivelyThirdParty: false })

    const error: any = {
      message: 'vendor tag',
      stack: 'Error\n    at https://vendor.example/sdk.js:1:1',
    }
    expect(shouldIgnoreError(error, {
      applicationKey: 'app',
      thirdPartyErrors: 'apply-tag-if-exclusively-contains-third-party-frames',
    })).toBe(false)
    expect(error.tags).toEqual({ third_party_code: true })
  })

  it('网络过滤器忽略上报接口自身与配置的噪音 URL', () => {
    expect(shouldIgnoreNetworkRequest(
      'http://report.example/record',
      { url: 'http://report.example/record' },
    )).toBe(true)
    expect(shouldIgnoreNetworkRequest(
      'http://host.example/analytics/track',
      { network: { ignoreUrls: [/analytics/] } },
    )).toBe(true)
  })

  it('过滤规则本身抛错时降级为不过滤，不向业务抛出', () => {
    const brokenErrorOptions = {} as any
    Object.defineProperty(brokenErrorOptions, 'ignoreErrors', {
      get() {
        throw new Error('broken filter')
      },
    })
    expect(() => shouldIgnoreError(
      { message: 'business error' },
      brokenErrorOptions,
      dom.window.location.href,
    )).not.toThrow()

    const brokenNetworkOptions = {} as any
    Object.defineProperty(brokenNetworkOptions, 'network', {
      get() {
        throw new Error('broken network filter')
      },
    })
    expect(() => shouldIgnoreNetworkRequest(
      'http://host.example/api',
      brokenNetworkOptions,
    )).not.toThrow()
  })
})
