declare global {
  namespace globalThis {
    function __BR_REPORT__(
      type: string,
      data: Record<string, any>,
      immediate: boolean,
    ): void

    interface Window {
      __BR_WORKER__: Worker | undefined
      BuryReport: any
      __uniConfig?: Record<string, any>
      uni?: Record<string, any>
    }
  }
}

export {}