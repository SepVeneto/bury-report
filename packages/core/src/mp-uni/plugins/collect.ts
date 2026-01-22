import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_INFO } from '@/constant'
import { resetSessionId } from '@/utils'

export class CollectPlugin implements BuryReportPlugin {
  public name = 'collectPlugin'

  init(ctx: BuryReport) {
    resetSessionId()
    const stat = this.getSystemInfo()

    ctx.report?.(COLLECT_INFO, stat, { immediate: true })
  }

  getSystemInfo() {
    const system = uni.getSystemInfoSync()
    if (uni.canIUse('getDeviceInfo')) {
      const deviceInfo = uni.getDeviceInfo()
      system.deviceType = deviceInfo.deviceType
      system.deviceBrand = deviceInfo.brand
      system.deviceModel = deviceInfo.model
      system.osName = deviceInfo.platform
      system.osVersion = deviceInfo.system
    }
    if (uni.canIUse('getWindowInfo')) {
      const info = uni.getWindowInfo()
      system.devicePixelRatio = info.pixelRatio
    }
    if (uni.canIUse('getAppBaseInfo')) {
      const info = uni.getAppBaseInfo()
      system.hostVersion = info.version
      system.hostFontSizeSetting = info.hostFontSizeSetting
      system.hostSDKVersion = info.SDKVersion
    }
    const info: Record<string, any> = {
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
      wt: system.windowTop,
      wb: system.windowBottom,
      ww: system.windowWidth,
      wh: system.windowHeight,
      sw: system.screenWidth,
      sh: system.screenHeight,
      sbh: system.statusBarHeight,
      sa: system.safeAreaInsets,
    }

    if (uni.canIUse('getSystemSetting')) {
      const _info = uni.getSystemSetting()
      info.al = _info.locationEnabled
    }
    return info
  }
}
