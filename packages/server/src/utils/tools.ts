import { Context } from "@oak/oak";

export function normalizeQuery(ctx: Context) {
  return normalize(Array.from(ctx.request.url.searchParams.entries()))
}

export function normalize(objOrArr: object | Array<[string, string]>) {
  const list = Array.isArray(objOrArr) ? objOrArr : Object.entries(objOrArr)
  // deno-lint-ignore no-explicit-any
  return list.reduce<Record<string, any>>((all, curr) => {
    const [key, value] = curr
    if (value == null || value === '') {
      return all
    }
    all[key] = value
    return all
  }, {})
}
