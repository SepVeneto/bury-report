import { combineCode, genCode, isEntry } from './utils'

export default function loader(source: string) {
  // @ts-expect-error: ignore
  const id = this.resourcePath

  if (isEntry(id)) {
  // @ts-expect-error: ignore
    source = combineCode(source, genCode(this.query))
  }
  return source
}
