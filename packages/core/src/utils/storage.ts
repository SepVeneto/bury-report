import { IS_UNIAPP } from './env'

export function setLocalStorage(key: string, value: string) {
  if (IS_UNIAPP) {
    uni.setStorageSync(key, value)
  } else {
    window.localStorage.setItem(key, value)
  }
}
export function getLocalStorage(key: string) {
  if (IS_UNIAPP) {
    return uni.getStorageSync(key)
  } else {
    return window.localStorage.getItem(key)
  }
}
