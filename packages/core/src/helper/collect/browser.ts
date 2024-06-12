import { getBrowserInfo } from '@/utils/system'
import { COLLECT_INFO } from '@/utils/constant'
import { report } from '@/index'
import { IS_UNIAPP } from '@/utils/env'

export function __BR_COLLECT_INIT__() {
  const stat = getSystemInfo()
  report(COLLECT_INFO, stat, true)
}

function getSystemInfo() {
  if (IS_UNIAPP()) {
    const system = uni.getSystemInfoSync()
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
  } else {
    const browserInfo = getBrowserInfo()
    return {
      dt: browserInfo.deviceType,
      dm: browserInfo.deviceModel,
      dp: window.devicePixelRatio,
      do: browserInfo.deviceOrientation,
      on: browserInfo.osname,
      ov: browserInfo.osversion,
      bn: browserInfo.browserName,
      bv: browserInfo.browserVersion,
      ua: browserInfo.ua,
    }
  }
}
