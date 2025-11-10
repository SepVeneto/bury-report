import { OPERATION_TRACK } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import * as rrweb from '@rrweb/record'

class OperationRecordPlugin implements BuryReportPlugin {
  public name = 'OperationRecordPlugin'
  public reportRequest: any

  private events: any[] = []

  init(ctx: BuryReport) {
    rrweb.record({
      emit: (event, isCheckout) => {
        if (isCheckout) {
          ctx.report?.(OPERATION_TRACK, { events: this.events })
          this.events = []
        }
        this.events.push(event)
      },
      checkoutEveryNms: 5 * 1000,
    })
  }
}

window.OperationRecordPlugin = OperationRecordPlugin
