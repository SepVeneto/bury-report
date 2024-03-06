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
    uni.request({
      url,
      method: 'POST',
      data: JSON.stringify({ uuid, type, data, appid }),
      fail: () => {
        // 防止record失败触发死循环
        globalThis[REPORT_REQUEST] = () => { /** empty */ }
      },
    })
  }
}
