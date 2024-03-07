import type { Options } from '@/type'
import { REPORT_REQUEST } from '@/utils/constant'
import { createQueue } from './queue'

export function __BR_REPORT_INIT__(
  appid: Options['appid'],
  url: Options['url'],
  interval: Required<Options>['interval'],
) {
  const queue = createQueue(interval, (records: Record<string, any>[]) => {
    uni.request({
      url,
      method: 'POST',
      data: JSON.stringify({ appid, data: records }),
      fail: () => {
        // 防止record失败触发死循环
        globalThis[REPORT_REQUEST] = () => { /** empty */ }
      },
    })
  })
  globalThis[REPORT_REQUEST] = function (
    uuid: string,
    type: string,
    data: Record<string, any>,
  ) {
    queue.push({ uuid, type, data, appid })
  }
}
