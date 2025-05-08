import safeAreaInsets from 'safe-area-insets'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_INFO } from '@/constant'
import { getUuid } from '@/utils'

export class CollectPlugin implements BuryReportPlugin {
  public name = 'collectPlugin'

  init(ctx: BuryReport) {
    const stat = this.getSystemInfo()

    ctx.report?.(COLLECT_INFO, stat, true)
  }

  getSystemInfo() {
    const system = getSysmteInfo()
    return {
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
  }
}

export function getBrowserInfo() {
  const ua = navigator.userAgent
  /**
  * 是否安卓设备
  */
  const isAndroid = /android/i.test(ua)
  /**
  * 是否iOS设备
  */
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  /**
  * 是否是Windows设备
  */
  const isWindows = ua.match(/Windows NT ([\d|\d.\d]*)/i)
  /**
  * 是否是Mac设备
  */
  const isMac = /Macintosh|Mac/i.test(ua)
  /**
  * 是否是Linux设备
  */
  const isLinux = /Linux|X11/i.test(ua)
  /**
  * 是否是iPadOS
  */
  const isIPadOS = isMac && navigator.maxTouchPoints > 0
  const language = window.navigator.language

  let osname
  let osversion
  let model
  let deviceType = 'phone'

  if (isIOS) {
    osname = 'iOS'
    const osversionFind = ua.match(/OS\s([\w_]+)\slike/)
    if (osversionFind) {
      osversion = osversionFind[1].replace(/_/g, '.')
    }
    const modelFind = ua.match(/\(([a-zA-Z]+);/)
    if (modelFind) {
      model = modelFind[1]
    }
  } else if (isAndroid) {
    osname = 'Android'
    // eslint-disable-next-line no-useless-escape
    const osversionFind = ua.match(/Android[\s/]([\w\.]+)[;\s]/)
    if (osversionFind) {
      osversion = osversionFind[1]
    }
    const infoFind = ua.match(/\((.+?)\)/)
    const infos = infoFind ? infoFind[1].split(';') : ua.split(' ')
    // eslint-disable-next-line no-useless-escape
    const otherInfo = [/\bAndroid\b/i, /\bLinux\b/i, /\bU\b/i, /^\s?[a-z][a-z]$/i, /^\s?[a-z][a-z]-[a-z][a-z]$/i, /\bwv\b/i, /\/[\d\.,]+$/, /^\s?[\d\.,]+$/, /\bBrowser\b/i, /\bMobile\b/i]
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i]
      if (info.indexOf('Build') > 0) {
        model = info.split('Build')[0].trim()
        break
      }
      let other
      for (let o = 0; o < otherInfo.length; o++) {
        if (otherInfo[o].test(info)) {
          other = true
          break
        }
      }
      if (!other) {
        model = info.trim()
        break
      }
    }
  } else if (isIPadOS) {
    model = 'iPad'
    osname = 'iOS'
    osversion = typeof window.BigInt === 'function' ? '14.0' : '13.0'
    deviceType = 'pad'
  } else if (isWindows || isMac || isLinux) {
    model = 'PC'
    osname = 'PC'
    deviceType = 'pc'
    const osversionFind = ua.match(/\((.+?)\)/)?.[1]

    if (isWindows) {
      osname = 'Windows'
      osversion = ''
      switch (isWindows[1]) {
        case '5.1':
          osversion = 'XP'
          break
        case '6.0':
          osversion = 'Vista'
          break
        case '6.1':
          osversion = '7'
          break
        case '6.2':
          osversion = '8'
          break
        case '6.3':
          osversion = '8.1'
          break
        case '10.0':
          osversion = '10'
          break
      }

      const framework = osversionFind?.match(/[Win|WOW]([\d]+)/)
      if (framework) {
        osversion += ` x${framework[1]}`
      }
    } else if (isMac) {
      osname = 'macOS'
      osversion = osversionFind?.match(/Mac OS X (.+)/) || ''

      if (osversion) {
        osversion = osversion[1].replace(/_/g, '.')
        // '10_15_7' or '10.16; rv:86.0'
        if (osversion.indexOf(';') !== -1) {
          osversion = osversion.split(';')[0]
        }
      }
    } else if (isLinux) {
      osname = 'Linux'
      osversion = osversionFind?.match(/Linux (.*)/) || ''

      if (osversion) {
        osversion = osversion[1]
        // 'x86_64' or 'x86_64; rv:79.0'
        if (osversion.indexOf(';') !== -1) {
          osversion = osversion.split(';')[0]
        }
      }
    }
  } else {
    osname = 'Other'
    osversion = '0'
    deviceType = 'unknown'
  }

  const system = `${osname} ${osversion}`
  const platform = osname.toLocaleLowerCase()

  let browserName = ''
  let browserVersion = String(IEVersion())
  if (browserVersion !== '-1') { browserName = 'IE' } else {
    const browseVendors = ['Version', 'Firefox', 'Chrome', 'Edge{0,1}']
    const vendors = ['Safari', 'Firefox', 'Chrome', 'Edge']
    for (let index = 0; index < browseVendors.length; index++) {
      const vendor = browseVendors[index]
      const reg = new RegExp(`(${vendor})/(\\S*)\\b`)
      if (reg.test(ua)) {
        browserName = vendors[index]
        browserVersion = ua.match(reg)![2]
      }
    }
  }

  // deviceOrientation
  let deviceOrientation = 'portrait'
  const orientation = typeof window.screen.orientation === 'undefined' ? window.orientation : window.screen.orientation.angle
  deviceOrientation = Math.abs(orientation) === 90 ? 'landscape' : 'portrait'

  return {
    deviceBrand: undefined,
    brand: undefined,
    deviceModel: model,
    deviceOrientation,
    model,
    system,
    platform,
    browserName: browserName.toLocaleLowerCase(),
    browserVersion,
    language,
    deviceType,
    ua,
    osname,
    osversion,
    theme: getTheme(),
  }
}

function getTheme() {
  if (window.__uniConfig && window.__uniConfig.darkmode !== true) { return (typeof window.__uniConfig.darkmode === 'string') ? window.__uniConfig.darkmode : 'light' }
  try {
    return (
      window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
    )
  } catch (error) {
    return 'light'
  }
}

function IEVersion() {
  const userAgent = navigator.userAgent
  const isIE = userAgent.indexOf('compatible') > -1 && userAgent.indexOf('MSIE') > -1
  const isEdge = userAgent.indexOf('Edge') > -1 && !isIE
  const isIE11 = userAgent.indexOf('Trident') > -1 && userAgent.indexOf('rv:11.0') > -1
  if (isIE) {
    const reIE = /MSIE (\\d+\\.\\d+);/
    reIE.test(userAgent)
    const fIEVersion = parseFloat(RegExp.$1)
    if (fIEVersion > 6) {
      return fIEVersion
    } else {
      return 6
    }
  } else if (isEdge) {
    return -1
  } else if (isIE11) {
    return 11
  } else {
    return -1
  }
}

const ua = window.navigator.userAgent
const isIOS = /iphone|ipad|ipod/i.test(ua)

function getScreenFix() {
  if (!isIOS) return false
  const angle = window.screen?.orientation?.angle
  return angle == null ? typeof window.orientation === 'number' : !!angle
}
function isLandscape(screenFix: boolean) {
  const angle = Math.abs(window.screen?.orientation?.angle || window.orientation)
  return screenFix && angle === 90
}

function getSysmteInfo() {
  const windowInfo = getWindowInfo()
  const deviceInfo = getDeviceInfo()
  const appBaseInfo = getAppBaseInfo()

  const { ua, browserName, browserVersion, osname, osversion } = getBrowserInfo()

  return {
    ...windowInfo,
    ...deviceInfo,
    ...appBaseInfo,
    ua,
    browserName,
    browserVersion,
    uniPlatform: 'web',
    uniCompileVersion: window.__uniConfig?.compilerVersion,
    uniRuntimeVersion: window.__uniConfig?.compilerVersion,
    fontSizeSetting: undefined,
    osName: osname!.toLocaleLowerCase(),
    osVersion: osversion,
    osLanguage: undefined,
    osTheme: undefined,
  }
}

function getAppBaseInfo() {
  const browserInfo = getBrowserInfo()
  const { theme, language, browserName, browserVersion } = browserInfo

  return {
    hostName: browserName,
    hostVersion: browserVersion,
    hostTheme: theme,
    hostLanguage: language,
    hostSDKVersion: undefined,
    hostFontSizeSetting: undefined,
    uniPlatform: 'web',
    uniCompileVersion: window.__uniConfig?.compilerVersion,
    uniCompilerVersion: window.__uniConfig?.compilerVersion,
    uniRuntimeVersion: window.__uniConfig?.compilerVersion,
  }
}

function getDeviceInfo() {
  const browserInfo = getBrowserInfo()
  const {
    deviceBrand,
    deviceModel,
    brand,
    model,
    platform,
    system,
    deviceOrientation,
    deviceType,
    osname,
    osversion,
  } = browserInfo

  return {
    brand,
    deviceBrand,
    deviceModel,
    devicePixelRatio: window.devicePixelRatio,
    deviceId: getUuid(),
    deviceOrientation,
    deviceType,
    model,
    platform,
    system,
    osName: osname ? osname.toLocaleLowerCase() : undefined,
    osVersion: osversion,
  }
}

function getWindowInfo() {
  const pixelRatio = window.devicePixelRatio
  // 横屏时 iOS 获取的屏幕宽高颠倒，进行纠正
  const screenFix = getScreenFix()
  const landscape = isLandscape(screenFix)
  const screenWidth = getScreenWidth(screenFix, landscape)
  const screenHeight = getScreenHeight(screenFix, landscape)
  const windowWidth = getWindowWidth(screenWidth)
  let windowHeight = window.innerHeight
  const statusBarHeight = safeAreaInsets.top

  const safeArea = {
    left: safeAreaInsets.left,
    right: windowWidth - safeAreaInsets.right,
    top: safeAreaInsets.top,
    bottom: windowHeight - safeAreaInsets.bottom,
    width: windowWidth - safeAreaInsets.left - safeAreaInsets.right,
    height: windowHeight - safeAreaInsets.top - safeAreaInsets.bottom,
  }

  const { top: windowTop, bottom: windowBottom } = getWindowOffset()

  windowHeight -= windowTop
  windowHeight -= windowBottom

  return {
    windowTop,
    windowBottom,
    windowWidth,
    windowHeight,
    pixelRatio,
    screenWidth,
    screenHeight,
    statusBarHeight,
    safeArea,
    safeAreaInsets: {
      top: safeAreaInsets.top,
      right: safeAreaInsets.right,
      bottom: safeAreaInsets.bottom,
      left: safeAreaInsets.left,
    },
    screenTop: screenHeight - windowHeight,
  }
}

function getScreenWidth(screenFix: boolean, landscape: boolean) {
  return screenFix
    ? Math[landscape ? 'max' : 'min'](screen.width, screen.height)
    : screen.width
}

function getScreenHeight(screenFix: boolean, landscape: boolean) {
  return screenFix
    ? Math[landscape ? 'min' : 'max'](screen.height, screen.width)
    : screen.height
}

export function getWindowWidth(screenWidth: number) {
  return (
    Math.min(
      window.innerWidth,
      document.documentElement.clientWidth,
      screenWidth,
    ) || screenWidth
  )
}

function getWindowOffsetCssVar(style: CSSStyleDeclaration, name: string) {
  return parseInt((style.getPropertyValue(name).match(/\d+/) || ['0'])[0])
}
function getWindowTop() {
  const style = document.documentElement.style
  const top = getWindowOffsetCssVar(style, '--window-top')
  return top ? top + safeAreaInsets.top : 0
}
function getWindowOffset() {
  const style = document.documentElement.style
  const top = getWindowTop()
  const bottom = getWindowOffsetCssVar(style, '--window-bottom')
  const left = getWindowOffsetCssVar(style, '--window-left')
  const right = getWindowOffsetCssVar(style, '--window-right')
  const topWindowHeight = getWindowOffsetCssVar(style, '--top-window-height')
  return {
    top,
    bottom: bottom ? bottom + safeAreaInsets.bottom : 0,
    left: left ? left + safeAreaInsets.left : 0,
    right: right ? right + safeAreaInsets.right : 0,
    topWindowHeight: topWindowHeight || 0,
  }
}
