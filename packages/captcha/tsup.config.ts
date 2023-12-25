import type { Options } from 'tsup'

export default<Options> {
  entry: [
    "lib/*.ts",
  ],
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
}