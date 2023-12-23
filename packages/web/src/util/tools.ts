// 获取随机字符串
export const getUuid = () => {
  const s = []
  const hexDigits = '0123456789abcdef'
  for (let i = 0; i < 32; i++) {
    s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1)
  }
  s[14] = '4' // bits 12-15 of the time_hi_and_version field to 0010
  s[19] = hexDigits.substr((Number(s[19]) & 0x3) | 0x8, 1) // bits 6-7 of the clock_seq_hi_and_reserved to 01
  s[8] = s[13] = s[18] = s[23]
  const uuid = s.join('')
  return uuid
}
// 获取时间戳
export const getTimestamp = (date?: string) => {
  const time = date || new Date().toString()
  let tmp = String(Date.parse(time))
  tmp = tmp.substr(0, 10)
  return tmp
}

export function walkRoute<T extends Array<any>>(
  routeList: T,
  fn: (route: T[number], depth: number, parent?: T[number]) => boolean | void | T,
  parent?: T[number],
  depth = 0
) {
  for (const item of routeList) {
    const res = fn(item, depth, parent)
    if (res === false) {
      return
    }
    const _depth = depth + 1
    if (Array.isArray(res)) {
      walkRoute(res, fn, item, _depth)
    }
  }
}
