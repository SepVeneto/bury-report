import type { Options } from 'tsup'
import * as fs from 'node:fs'
import swc from '@swc/core'

export default <Options>{
  entryPoints: [
    'src/*.ts',
    'src/helper/**/*.ts',
  ],
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  esbuildPlugins: [
    {
      name: 'swc-loader',
      setup(build) {
        build.onLoad({ filter: /(.js|.jsx|.ts|.tsx)/ }, (args) => {
          const content = fs.readFileSync(args.path, 'utf8')
          const { code } = swc.transformSync(content, {
            filename: args.path,
            env: {
              targets: 'chrome 69',
              coreJs: '3.21',
              mode: 'usage',
            },
          })
          return {
            contents: code,
          }
        })
      },
    },
  ],
  onSuccess: 'npm run build:fix',
}
