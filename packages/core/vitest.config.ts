import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))

// vitest 无法解析 ?inline-worker（该后缀由构建时的 esbuild 插件处理），
// 这里用统一的 mock 工厂代替，便于测试 worker 创建失败 / postMessage 失败等异常场景
function inlineWorkerStub() {
  return {
    name: 'vitest-inline-worker-stub',
    enforce: 'pre' as const,
    resolveId(source: string) {
      if (source.endsWith('?inline-worker')) {
        return '\0inline-worker:' + source
      }
    },
    load(id: string) {
      if (id.startsWith('\0inline-worker:')) {
        return `
          export default function WorkerFactory(opts = {}) {
            const factory = globalThis.__BR_MOCK_WORKER_FACTORY
            if (typeof factory === 'function') return factory(opts)
            throw new Error('Worker is not available')
          }
        `
      }
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  plugins: [inlineWorkerStub() as any],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})
