import { Context } from "@oak/oak";

export function normalizeQuery(ctx: Context) {
  return normalize(ctx.request.url.searchParams)
}

export function normalize(obj: object) {
  // deno-lint-ignore no-explicit-any
  return Object.entries(obj).reduce<Record<string, any>>((all, curr) => {
    const [key, value] = curr
    if (value == null || value === '') {
      return all
    }
    all[key] = value
    return all
  }, {})
}
