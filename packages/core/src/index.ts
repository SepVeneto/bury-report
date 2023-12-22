import { createUnplugin } from 'unplugin'
import type { UnpluginFactory } from 'unplugin'
// import { initReport } from './utils'
import type { Options } from './type'
import * as path from 'node:path'
import * as fs from 'node:fs'
import MagicString from 'magic-string'
import { report } from './lib'

export const unpluginFactory: UnpluginFactory<Options> = options => {
  let request
  if (isUniapp()) {
    request = `uni.request({
      url: '${options.url}',
      method: 'POST',
      data: JSON.stringify({ type: type, data: data, appid: '${options.appid}'})
    })`
  } else {
    request = `window.navigator.sendBeacon('${options.url}', JSON.stringify({ type, data: data, appid: '${options.appid}'}))`
  }
  const reportContent = `global.__BR_REPORT__ = function(type, data) {
    ${request}
  }`
  return {
    name: 'plugin-bury-report',
    enforce: 'pre',
    transformIndexHtml(html: string) {
      return isUniapp()
        ? html
        : {
            html,
            tags: [
              {
                tag: 'script',
                children: reportContent,
              },
            ],
          }
    },
    transform(code, id) {
      if (isUniapp() && id === path.resolve(process.env.UNI_INPUT_DIR!, getMainEntry())) {
        const s = new MagicString(code)
        s.prepend(reportContent)
        return s.toString()
      }
      return code
    },
  }
}
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin

function getMainEntry() {
  if (!process.env.UNI_INPUT_DIR) {
    throw new Error('UNI_INPUT_DIR not specified')
  }
  const mainEntry = fs.existsSync(path.resolve(process.env.UNI_INPUT_DIR, 'main.ts')) ? 'main.ts' : 'main.js'
  return mainEntry
}

function isUniapp() {
  return process.env.UNI_PLATFORM
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
