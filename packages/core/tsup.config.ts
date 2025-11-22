import type { Options } from 'tsup'
import * as fs from 'node:fs'
import swc from '@swc/core'
import { buildSync, transformSync } from 'esbuild'
import path from 'node:path'
import { version } from './package.json'
import { InlineWorkerPlugin } from './lib/inline-worker'

const browser: Options = {
  entry: [
    'src/browser/index.ts',
    'src/browser/plugins/operationRecord.ts',
  ],
  clean: true,
  format: ['iife'],
  platform: 'browser',
  splitting: false,
  minify: 'terser',
  esbuildPlugins: [
    // {
    //   name: 'ts-raw-import',
    //   setup(build) {
    //     build.onResolve({ filter: /\?raw$/ }, (args) => {
    //       return {
    //         path: args.path,
    //         pluginData: path.resolve(args.resolveDir, args.path).replace(/\?raw$/, ''),
    //         namespace: 'ts-raw',
    //       }
    //     })

    //     build.onLoad({ filter: /\?raw$/ }, async (args) => {
    //       const filepath = args.pluginData + '.ts'

    //       const tsCode = fs.readFileSync(filepath, 'utf-8')

    //       const result = transformSync(tsCode, {
    //         loader: 'ts',
    //         format: 'iife',
    //         target: 'chrome68',
    //       })

    //       return {
    //         contents: `export default ${JSON.stringify(result.code)}`,
    //         loader: 'js',
    //         resolveDir: path.dirname(args.path),
    //       }
    //     })
    //   },
    // },
    InlineWorkerPlugin(),
  ],
}

const cli: Options = {
  entry: [
    'src/vite.ts',
    'src/webpack.ts',
    'src/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['html-webpack-plugin'],
  treeshake: true,
  define: {
    'process.env.DEFINE_VERSION': `"${version}"`,
  },
  esbuildPlugins: [
    {
      name: 'ts-raw-import',
      setup(build) {
        build.onResolve({ filter: /\?raw$/ }, (args) => {
          return {
            path: args.path,
            pluginData: path.resolve(args.resolveDir, args.path).replace(/\?raw$/, ''),
            namespace: 'ts-raw',
          }
        })

        build.onLoad({ filter: /\?raw$/ }, async (args) => {
          const filepath = args.pluginData + '.ts'

          const result = buildSync({
            entryPoints: [filepath],
            format: 'iife',
            platform: 'browser',
            minify: true,
            target: 'chrome68',
            write: false,
            outdir: 'out',
            bundle: true,
            define: {
              'process.env.DEFINE_VERSION': `'${version}'`,
            },
          })

          return {
            contents: result.outputFiles[0].text,
            loader: 'text',
          }
        })
      },
    },
    {
      name: 'swc-loader',
      setup(build) {
        build.onLoad({ filter: /(.js|.jsx|.ts|.tsx)/ }, (args) => {
          const content = fs.readFileSync(args.path, 'utf8')
          const { code } = swc.transformSync(content, {
            filename: args.path,
          })
          return {
            contents: code,
          }
        })
      },
    },
  ],
}

const client: Options = {
  entry: [
    'src/mp-uni/index.ts',
  ],
  format: ['cjs', 'esm'],
  external: ['html-webpack-plugin'],
  dts: true,
  bundle: true,
  outDir: 'dist/mp-uni',
  // esbuildPlugins: [
  //   {
  //     name: 'swc-loader',
  //     setup(build) {
  //       build.onLoad({ filter: /(.js|.jsx|.ts|.tsx)/ }, (args) => {
  //         const content = fs.readFileSync(args.path, 'utf8')
  //         const { code } = swc.transformSync(content, {
  //           filename: args.path,
  //           env: {
  //             targets: 'chrome 53,ios 11,safari 10',
  //             coreJs: '3.21',
  //             mode: 'usage',
  //           },
  //         })
  //         return {
  //           contents: code,
  //         }
  //       })
  //     },
  //   },
  // ],
  onSuccess: 'npm run build:fix',
}

export default <Options[]>[
  browser,
  cli,
  client,
]
