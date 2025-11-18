import dayjs from "dayjs";
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

export function toDate(date: string) {
  return dayjs(date).toDate()
}

export function getRecentDays(limit: number, offset?: number) {
  const time = dayjs().subtract(limit, 'day')
  if (!offset) {
    return time.toDate()
  }
  if (offset > 0) {
    time.add(offset, 'hour')
  } else {
    time.subtract(Math.abs(offset), 'hour')
  }
  return time.toDate()
}

export function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createDebug(name: string) {
  return (...args: unknown[]) => {
    console.log(`[${name}]`, ...args)
  }
}
