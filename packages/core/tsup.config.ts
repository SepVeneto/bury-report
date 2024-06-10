import type { Options } from 'tsup'

export default <Options>{
  entryPoints: [
    'src/*.ts',
    'src/helper/**/*.ts',
  ],
  define: {
    'process.env.UNI_PLATFORM': JSON.stringify(process.env.UNI_PLATFORM || ''),
  },
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  onSuccess: 'npm run build:fix',
}
