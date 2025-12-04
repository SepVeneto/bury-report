import { OPERATION_TRACK } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import * as rrweb from '@rrweb/record'
import type { RecordPlugin } from '@rrweb/types'

class OperationRecordPlugin implements BuryReportPlugin {
  public name = 'OperationRecordPlugin'
  public reportRequest: any

  private events: any[] = []
  private ctx?: BuryReport

  init(ctx: BuryReport) {
    this.ctx = ctx
    rrweb.record({
      emit: (event) => {
        this.events.push(event)
      },
      plugins: [enhancedPlugin()],
    })

    setInterval(() => {
      this.collect()
    }, 5 * 1000)
  }

  collect() {
    this.ctx?.report?.(OPERATION_TRACK, { events: this.events })
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
