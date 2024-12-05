export function setLocalStorage(key: string, value: string) {
  let IS_UNIAPP = false
  try {
    IS_UNIAPP = !!uni
  } catch { }

  try {
    if (IS_UNIAPP) {
      uni.setStorageSync(key, value)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch (err) {
    console.warn('[@sepveneto/report-core] set storage queue failed: ' + err)
  }
}
export function getLocalStorage(key: string) {
  let IS_UNIAPP = false
  try {
    IS_UNIAPP = !!uni
  } catch { }

  if (IS_UNIAPP) {
    return uni.getStorageSync(key)
  } else {
    return window.localStorage.getItem(key)
  }
}
