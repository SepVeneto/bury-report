export function report(type: string, data: any) {
  // @ts-expect-error: exist
  const sendEvent = window.__BR_REPORT__
  sendEvent(type, data)
}
