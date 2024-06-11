import type { Options } from '@/type'
import { REPORT_QUEUE, REPORT_REQUEST } from '@/utils/constant'
import { getLocalStorage, setLocalStorage } from '@/utils/storage'

let timer: number | undefined

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
    list.push({ uuid, type, data, appid, time: new Date().toLocaleString() })
    setLocalStorage(REPORT_QUEUE, JSON.stringify(list))

    const sendRequest = () => {
      const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
      window.navigator.sendBeacon(url, JSON.stringify({ appid, data: list }))
      setLocalStorage(REPORT_QUEUE, JSON.stringify([]))
      clearInterval(timer)
      timer = undefined
    }

    if (immediate) {
      sendRequest()
      return
    }

    if (!timer) {
      timer = (globalThis.setTimeout(sendRequest, interval * 1000)) as unknown as number
    }
  }
}
