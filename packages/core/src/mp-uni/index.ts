import { NetworkPlugin } from './plugins/network'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { REPORT_QUEUE } from '@/constant'
import { getLocalStorage, getUuid, setLocalStorage } from '@/utils'
import { ErrorPlugin } from './plugins/error'
import { CollectPlugin } from './plugins/collect'

class BuryReport implements BuryReportBase {
  public report: ReportFn
  public options: Options

  private static pluginsOrder: BuryReportPlugin[] = []

  constructor(config: Options) {
    this.report = createProxy(config)
    this.options = config

    this.init()
  }

  static registerPlugin(plugin: BuryReportPlugin) {
    this.pluginsOrder.push(plugin)
  }

  private init() {
    BuryReport.pluginsOrder = BuryReport.pluginsOrder.filter(plugin => {
      switch (plugin.name) {
        case 'errorPlugin':
          return this.options?.error
        case 'collectPlugin':
          return this.options?.collect
        case 'networkPlugin':
          return this.options?.network?.enable
        default:
          return true
      }
    })
    this.triggerPlugin('init')
  }

  private triggerPlugin(lifecycle: 'init') {
    BuryReport.pluginsOrder.forEach(plugin => plugin[lifecycle](this))
  }
}

const INNER_PLUGINs = [
  new CollectPlugin(),
  new ErrorPlugin(),
  new NetworkPlugin(),
]

INNER_PLUGINs.forEach(plugin => {
  BuryReport.registerPlugin(plugin)
})

let timer: number | undefined
function createProxy(options: Options) {
  const { appid, interval = 10, url } = options
  let abort = false

  return function (
    type: string,
    data: Record<string, any>,
    immediate = false,
  ) {
    const uuid = getUuid()

    const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
    list.push({ uuid, type, data, appid, time: new Date().toLocaleString() })
    setLocalStorage(REPORT_QUEUE, JSON.stringify(list))

    const sendRequest = () => {
      if (abort) return

      const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
      uni.request({
        url,
        method: 'POST',
        data: JSON.stringify({ appid, data: list }),
        fail: () => {
          // 防止record失败触发死循环
          abort = true
        },
      })
      setLocalStorage(REPORT_QUEUE, JSON.stringify([]))
      clearInterval(timer)
      timer = undefined
    }

    if (immediate) {
      sendRequest()
      return
    }

    if (!timer) {
      timer = globalThis.setTimeout(sendRequest, interval * 1000) as unknown as number
    }
  }
}

export default BuryReport
