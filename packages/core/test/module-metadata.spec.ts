import { afterEach, describe, expect, it } from 'vitest'
import { createModuleMetadataSnippet } from '../src/browser/module-metadata'

describe('chunk applicationKey 注入', () => {
  afterEach(() => {
    delete (globalThis as any)._brModuleMetadata
  })

  it('注入代码会把当前 chunk stack 与 applicationKey 关联', () => {
    const originalError = globalThis.Error
    const stack = 'Error\n    at http://host.example/assets/app.js:1:1'
    ;(globalThis as any).Error = class extends originalError {
      stack = stack
    }
    try {
      // eslint-disable-next-line no-eval
      eval(createModuleMetadataSnippet('app'))
      expect((globalThis as any)._brModuleMetadata[stack]).toEqual({
        '_brBundlerAppKey:app': true,
      })
    } finally {
      ;(globalThis as any).Error = originalError
    }
  })
})
