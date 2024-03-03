export function isUniapp() {
  if (!globalThis.process) return false
  return !!process.env.UNI_PLATFORM
}

export function isUniH5() {
  return process.env.UNI_PLATFORM === 'h5'
}

export function isUniWeixin() {
  return process.env.UNI_PLATFORM === 'mp-weixin'
}
