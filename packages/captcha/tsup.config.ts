import type { Options } from 'tsup'

export default<Options> {
  entry: [
    "lib/*.ts",
  ],
  format: 'iife',
  clean: true,
  dts: true,
}