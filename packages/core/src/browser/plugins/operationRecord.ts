import '../polyfill'

import { OPERATION_TRACK } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import * as rrweb from '@rrweb/record'
import { EventType, type RecordPlugin } from '@rrweb/types'

const TIMEOUT = 5 * 1000

class OperationRecordPlugin implements BuryReportPlugin {
  public name = 'OperationRecordPlugin'
  public reportRequest: any

  private events: any[] = []
  private ctx?: BuryReport
  private reportTimer?: number
  private isHooked = false

  hook() {
    if (this.isHooked) return
    this.isHooked = true

    const originalPush = window.history.pushState
    const originalReplace = window.history.replaceState

    window.history.pushState = function (...args) {
      originalPush.apply(this, args)
      rrweb.record.takeFullSnapshot()
    }
    window.history.replaceState = function (...args) {
      originalReplace.apply(this, args)
      rrweb.record.takeFullSnapshot()
    }
  }

  init(ctx: BuryReport) {
    this.ctx = ctx
    rrweb.record({
      emit: (event) => {
        this.events.push(event)
        if (!this.reportTimer) {
          this.reportTimer = setTimeout(() => {
            this.collect()
            this.reportTimer = undefined
          }, TIMEOUT) as unknown as number
        }
        if (event.type === EventType.FullSnapshot) {
          this.hook()
          clearTimeout(this.reportTimer)
          this.reportTimer = undefined
          this.collect(true)
        }
      },
      // 每5秒重建快照
      // checkoutEveryNms: TIMEOUT,
      plugins: [enhancedPlugin()],
      sampling: {
        mousemove: 200,
        scroll: 300,
        input: 'last',
      },
    })
  }

  collect(immediate = false, keepalive = false) {
    if (!this.events.length) return

    this.ctx?.report?.(OPERATION_TRACK, { events: this.events }, immediate, true, keepalive)
    this.events = []
  }
}

window.OperationRecordPlugin = OperationRecordPlugin

const enhancedPlugin: () => RecordPlugin = () => ({
  name: '@sepveneto/enhanced',
  observer(cb, win) {
    const onVisibilitychange = () => {
      const payload = {
        event: 'visibilitychange',
        action: win.document.visibilityState,
      }
      cb(payload)
    }
    const onPageHide = (evt: PageTransitionEvent) => {
      const payload = {
        event: 'pagehide',
        persisted: evt.persisted,
      }
      cb(payload)
    }
    win.document.addEventListener('visibilitychange', onVisibilitychange)
    win.addEventListener('pagehide', onPageHide)
    return () => {
      win.removeEventListener('pagehide', onPageHide)
      win.document.removeEventListener('visibilitychange', onVisibilitychange)
    }
  },
  options: {},
})
