import { REPORT_REQUEST, UUID_KEY } from './utils/constant'
import { getLocalStorage, setLocalStorage } from './utils/storage'

export const report = (type: string, data: any, immediate = false) => {
  const sendEvent = globalThis[REPORT_REQUEST]
  const uuid = getUuid()
  sendEvent?.(uuid, type, data, immediate)
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
