import { TRACK_EVENT } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin, ReportFn } from '@/type'

export class TrackPlugin implements BuryReportPlugin {
  name = 'TrackPlugin'

  init(ctx: BuryReport) {
    const report = ctx.report
    if (!report) return

    wrapApp(report)
    wrapPage(report)
  }
}

function wrapApp(report: ReportFn) {
  const rawApp = App
  App = function (options: any) {
    const originOnLaunch = options.onLaunch
    options.onLaunch = function (options: any) {
      report(TRACK_EVENT, {
        type: 'AppLaunch',
        data: options,
      })
      return originOnLaunch?.call(this, options)
    }

    const originOnShow = options.onShow
    options.onShow = function (options: any) {
      report(TRACK_EVENT, {
        type: 'AppShow',
        data: options,
      })
      return originOnShow?.call(this, options)
    }

    const originOnHide = options.onHide
    options.onHide = function () {
      report(TRACK_EVENT, {
        type: 'AppHide',
      })
      return originOnHide?.call(this)
    }

    const originOnPageNotFound = options.onPageNotFound
    options.onPageNotFound = function (options: any) {
      report(TRACK_EVENT, {
        type: 'AppPageNotFound',
        data: options,
      })
      return originOnPageNotFound?.call(this, options)
    }

    return rawApp(options)
  }
}

function wrapPage(report: ReportFn) {
  // @ts-expect-error: uni manual bind
  const rawCreatepage = wx.createPage
  // @ts-expect-error: uni manual bind
  wx.createPage = function (...args: any[]) {
    const [pageOptions] = args

    const originOnLoad = pageOptions.onLoad
    pageOptions.onLoad = function (options: any) {
      const mpInstance = this.$scope

      const pageInfo = {
        type: 'PageLoad',
        data: {
          path: mpInstance.route,
          query: options,
        },
      }
      report(TRACK_EVENT, pageInfo)

      return originOnLoad?.apply(this, args)
    }

    const originOnShow = pageOptions.onShow
    pageOptions.onShow = function () {
      const mpInstance = this.$scope
      const now = Date.now()

      this.__enterTime = now

      const pageInfo = {
        type: 'PageShow',
        data: {
          path: mpInstance.route,
        },
      }
      report(TRACK_EVENT, pageInfo)
      // 保证语义清晰和幂等性
      this.__enterTime = null
      return originOnShow?.apply(this)
    }

    const originOnHide = pageOptions.onHide
    pageOptions.onHide = function () {
      const mpInstance = this.$scope

      const now = Date.now()

      const pageInfo = {
        type: 'PageHide',
        data: {
          path: mpInstance.route,
          duration: now - (this.__enterTime || now),
        },
      }
      report(TRACK_EVENT, pageInfo)
      // 保证语义清晰和幂等性
      this.__enterTime = null
      originOnHide?.apply(this)
    }

    const originOnUnload = pageOptions.onUnload
    pageOptions.onUnload = function () {
      const mpInstance = this.$scope
      const now = Date.now()

      const pageInfo = {
        type: 'PageUnload',
        data: {
          path: mpInstance.route,
          duration: now - (this.__enterTime || now),
        },
      }
      report(TRACK_EVENT, pageInfo)
      this.__enterTime = null
      return originOnUnload?.apply(this)
    }
    return rawCreatepage(...args)
  }
}
