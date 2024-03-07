import type { Options } from '@/type'
import { REPORT_REQUEST } from '@/utils/constant'
import { createQueue } from './queue'

export function __BR_REPORT_INIT__(
  appid: Options['appid'],
  url: Options['url'],
  interval: Required<Options>['interval'],
) {
  const queue = createQueue(interval, (data: any) => {
    window.navigator.sendBeacon(url, JSON.stringify({ appid, data }))
  })
  globalThis[REPORT_REQUEST] = function (
    uuid: string,
    type: string,
    data: Record<string, any>,
  ) {
    const json = { uuid, type, appid, data }
    queue.push(json)
  }
}
