import { isUniapp } from './utils'

export function report(type: string, data: any) {
  // @ts-expect-error: exist
  const sendEvent = globalThis.__BR_REPORT__
  sendEvent(type, data)
}

export function collect() {
  const stat = getSystemInfo()
  report('info', stat)
}

const UUID_KEY = '__BR_UUID__'
function getUuid() {
  let uuid
  try {
    uuid = getLocalStorage(UUID_KEY)
  } catch {}

  if (!uuid) {
    uuid = `${Date.now()} ${Math.floor(Math.random() * 1e7)}`
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
function getSystemInfo() {
  if (isUniapp()) {
    const system = uni.getSystemInfoSync()
    return {
      uuid: system.deviceId || getUuid(),
      // mp, web
      dt: system.deviceType,
      // mp
      db: system.deviceBrand,
      // mp, web
      dm: system.deviceModel,
      // mp, web
      dp: system.devicePixelRatio,
      // mp, web
      do: system.deviceOrientation,
      // mp, web
      on: system.osName,
      // mp, web
      ov: system.osVersion,
      // web
      bn: system.browserName,
      // web
      bv: system.browserVersion,
      // mp
      hv: system.hostVersion,
      // mp
      hfs: system.hostFontSizeSetting,
      // mp
      hsdk: system.hostSDKVersion,
      // web, mp
      up: system.uniPlatform,
      // web, mp
      uc: system.uniCompileVersion,
      // web, mp
      ur: system.uniRuntimeVersion,
      // web
      ua: system.ua,
      wt: system.windowTop,
      wb: system.windowBottom,
      ww: system.windowWidth,
      wh: system.windowHeight,
      sw: system.screenWidth,
      sh: system.screenHeight,
      sbh: system.statusBarHeight,
      sa: system.safeAreaInsets,
    }
  } else {
    return {
      // uuid: getUuid(),
      // ua: window.navigator.userAgent,
      // dt: 'pc',
      // dm:
    }
  }
}
