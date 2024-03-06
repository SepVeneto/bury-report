import { isUniapp } from './utils/env'
import { REPORT_REQUEST, UUID_KEY } from './utils/constant'

export const report = (type: string, data: any) => {
  const sendEvent = globalThis[REPORT_REQUEST]
  const uuid = getUuid()
  sendEvent(uuid, type, data)
}

function getUuid() {
  let uuid
  try {
    uuid = getLocalStorage(UUID_KEY)
  } catch {}

  if (!uuid) {
    uuid = `${Date.now()}${Math.floor(Math.random() * 1e7)}`
    try {
      setLocalStorage(UUID_KEY, uuid)
    } catch {}
  }
  return uuid
}
function setLocalStorage(key: string, value: string) {
  if (isUniapp()) {
    uni.setStorageSync(key, value)
  } else {
    window.localStorage.setItem(key, value)
  }
}
function getLocalStorage(key: string) {
  if (isUniapp()) {
    return uni.getStorageSync(key)
  } else {
    return window.localStorage.getItem(key)
  }
}
