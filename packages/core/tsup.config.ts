import type { Options } from 'tsup'

export default <Options>{
  entryPoints: [
    'src/*.ts',
    'src/helper/**/*.ts',
  ],
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  onSuccess: 'npm run build:fix',
}
