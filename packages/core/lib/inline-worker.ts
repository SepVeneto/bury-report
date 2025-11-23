import path from 'path'
import esbuild from 'esbuild'
import type { EsbuildPlugin } from 'unplugin'

export function InlineWorkerPlugin(): EsbuildPlugin {
  return {
    name: 'inline-worker',
    setup(build) {
      build.onResolve({ filter: /\?inline-worker$/ }, args => {
        const filePath = path.resolve(args.resolveDir, args.path.replace(/\?inline-worker$/, ''))
        return {
          path: filePath,
          namespace: 'inline-worker',
        }
      })

      build.onLoad({ filter: /.*/, namespace: 'inline-worker' }, async (args) => {
        // 单独构建 worker
        const workerBundle = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          write: false,
          format: 'iife',
          platform: 'browser',
          target: 'chrome68',
          minify: true,
        })

        const code = workerBundle.outputFiles[0].text

        // 将 worker 代码包装成 factory
        const wrapped = `
          export default function WorkerFactory(vars = {}) {
            const code = \`${code}\`;

            // 简单变量替换（如 BR_URL）
            const finalCode = code.replace(/BR_URL/g, vars.url || '');

            const blob = new Blob([finalCode], { type: "application/javascript" });
            return new Worker(URL.createObjectURL(blob), { type: "classic" });
          }
        `

        return {
          contents: wrapped,
          loader: 'js',
        }
      })
    },
  }
}
