declare global {
  namespace globalThis {
    function __BR_REPORT__(
      uuid: string,
      type: string,
      data: Record<string, any>
    ): void
  }
}

export {}