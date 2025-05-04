declare global {
  namespace globalThis {
    function __BR_REPORT__(
      uuid: string,
      type: string,
      data: Record<string, any>,
      immediate: boolean,
    ): void

    interface Window {
      __BR_WORKER__: Worker | undefined
      BuryReport: any
    }
  }
}

export {}