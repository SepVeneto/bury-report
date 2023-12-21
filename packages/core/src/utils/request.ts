import type { Options } from '../type'

export function initReport(options: Options) {
  return (data: { type: string, data: any }) => {
    window.navigator.sendBeacon(options.url, JSON.stringify(data))
  }
}
