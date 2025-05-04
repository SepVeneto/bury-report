import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import { COLLECT_ERROR } from '@/constant'
import { initErrorProxy, storageReport } from '@/utils'

export class ErrorPlugin implements BuryReportPlugin {
  public name = 'errorPlugin'
  private ctx?: BuryReport
  private appid?: string

  public uncaughtErrorListener = (error: { message: string, stack: string }) => {
    this.reportError({
      name: error?.message || '[@sepveneto/report-core] unknown error',
      message: error?.message,
      stack: error?.stack,
    })
  }

  constructor() {
    this.uncaughtErrorListener = this.uncaughtErrorListener.bind(this)
    this.unhandleRejectionErrorListener = this.unhandleRejectionErrorListener.bind(this)
  }

  init(ctx: BuryReport | string) {
    if (typeof ctx === 'string') {
      this.appid = ctx
    } else {
      this.ctx = ctx
    }
    initErrorProxy((data) => this.reportError(data))
    this.onUncaughtError()
    this.onUnhandleRejectionError()
  }

  public reportError(error: { name: string, message: string, stack?: string }) {
    const data = { ...error, page: window.location.href }
    // 白屏检测没有上下文，需要先放到缓存中
    if (this.ctx) {
      this.ctx.report(COLLECT_ERROR, data)
    } else {
      storageReport(this.appid!, data)
    }
  }

  public onUncaughtError() {
    if (uni.canIUse('onError')) {
      uni.onError(this.uncaughtErrorListener as any)
    }
  }

  public onUnhandleRejectionError() {
    if (uni.canIUse('onUnhandledRejection')) {
      uni.onUnhandledRejection(this.uncaughtErrorListener as any)
    }
  }

  public unhandleRejectionErrorListener = (evt: PromiseRejectionEvent) => {
    const error = evt.reason

    this.reportError({
      name: 'UnhandleRejection',
      message: error?.message,
      stack: error?.stack,
    })
  }
}
