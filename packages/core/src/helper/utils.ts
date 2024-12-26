// 单位B
export function getUtf8Size(str: string) {
  let size = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code <= 0x7F) {
      size += 1 // ASCII字符占1字节
    } else if (code <= 0x7FF) {
      size += 2 // 2字节
    } else if (code <= 0xFFFF) {
      size += 3 // 3字节
    } else {
      size += 4 // 4字节（一般不常见）
    }
  }
  return size
}
