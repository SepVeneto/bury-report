import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_INFO } from '@/constant'

export class CollectPlugin implements BuryReportPlugin {
  public name = 'collectPlugin'

  init(ctx: BuryReport) {
    const stat = this.getSystemInfo()

    ctx.report(COLLECT_INFO, stat, true)
  }

  getSystemInfo() {
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
  }
}
