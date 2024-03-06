import type { Options } from '@/type'
import { REPORT_REQUEST } from '@/utils/constant'

export function __BR_REPORT_INIT__(
  appid: Options['appid'],
  url: Options['url'],
) {
  globalThis[REPORT_REQUEST] = function (
    uuid: string,
    type: string,
    data: Record<string, any>,
  ) {
    const json = { uuid, type, data, appid }
    window.navigator.sendBeacon(url, JSON.stringify(json))
  }
}
