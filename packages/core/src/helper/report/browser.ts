import type { Options } from '@/type'
import { REPORT_QUEUE, REPORT_REQUEST } from '@/utils/constant'
import { getLocalStorage, setLocalStorage } from '@/utils/storage'

let time = Date.now()

export function __BR_REPORT_INIT__(
  appid: Options['appid'],
  url: Options['url'],
  interval: Required<Options>['interval'],
) {
  globalThis[REPORT_REQUEST] = function (
    uuid: string,
    type: string,
    data: Record<string, any>,
    immediate = false,
  ) {
    const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
    list.push({ uuid, type, data, appid })
    const offset = Date.now() - time

    if (!immediate && offset < interval * 1000) {
      setLocalStorage(REPORT_QUEUE, JSON.stringify(list))
      time = Date.now()
      return
    }

    window.navigator.sendBeacon(url, JSON.stringify({ appid, data: list }))

    setLocalStorage(REPORT_QUEUE, JSON.stringify([]))
  }
}
