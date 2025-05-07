import { NetworkPlugin } from './plugins/network'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { REPORT_QUEUE } from '@/constant'
import { getLocalStorage, getUuid, setLocalStorage, withDefault } from '@/utils'
import workerStr from './worker?raw'
import { ErrorPlugin } from './plugins/error'
import { CollectPlugin } from './plugins/collect'

export class BuryReport implements BuryReportBase {
  public report?: ReportFn
  public options: Options

  private static pluginsOrder: BuryReportPlugin[] = []

  constructor(config: Options) {
    this.options = withDefault(config)

    if (!config.report) return 

    this.report = createProxy(config)

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

window.BuryReport = BuryReport

let timer: number | undefined
function createProxy(options: Options) {
  const { appid, interval = 10, url } = options

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
      const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
      const body = JSON.stringify({ appid, data: list })

      // 按照sendBeacon的实现标准，不同浏览器可能会有不同的大小限制
      // 以Chrome为例，是队列加总计64KB
      // 以Firefox为例，则是没有限制
      // 当上报请求被浏览器拦截后自动降级为Fetch
      // 为了不影响主线程，临时创建一个worker去发送大数据，用完立即销毁
      const isSend = window.navigator.sendBeacon(url, body)
      if (!isSend) {
        const blob = new Blob([workerStr.replace('BR_URL', url)], { type: 'application/javascript' })
        const workerUrl = window.URL.createObjectURL(blob)
        window.__BR_WORKER__ = new window.Worker(workerUrl)
        window.__BR_WORKER__.onmessage = () => {
          window.__BR_WORKER__?.terminate()
          delete window.__BR_WORKER__
        }
        window.__BR_WORKER__.postMessage({ type: 'report', body })
      }

      // 不管上报的成功与否，都需要清除定时器，保证新的上报流程正常执行
      // 都需要把上报队列清空，防止过度使用用户缓存
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
