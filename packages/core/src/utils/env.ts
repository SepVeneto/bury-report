export function isUniapp() {
  return !!process.env.UNI_PLATFORM
}

export function isUniH5() {
  return process.env.UNI_PLATFORM === 'h5'
}
