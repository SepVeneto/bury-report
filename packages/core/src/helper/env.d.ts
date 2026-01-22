import { ReportOptions } from "@/type"

declare global {
  namespace globalThis {
    function __BR_REPORT__(
      type: string,
      data: Record<string, any>,
      options?: ReportOptions,
    ): void

    interface Window {
      __BR_WORKER__: Worker | undefined
      BuryReport: any
      OperationRecordPlugin: any
      __uniConfig?: Record<string, any>
      uni?: Record<string, any>
    }
  }
}

export {}