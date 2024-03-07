import { isUniapp } from '@/utils/env'

export function setLocalStorage(key: string, value: string) {
  if (isUniapp()) {
    uni.setStorageSync(key, value)
  } else {
    window.localStorage.setItem(key, value)
  }
}
export function getLocalStorage(key: string) {
  if (isUniapp()) {
    return uni.getStorageSync(key)
  } else {
    return window.localStorage.getItem(key)
  }
}
