import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { LIFECYCLE, REPORT_QUEUE, REPORT_REQUEST } from '@/constant'
import { getLocalStorage, getSessionId, getUuid, setLocalStorage, storageReport, withDefault } from '@/utils'
import workerStr from './worker?raw'
import { ErrorPlugin } from './plugins/error'
import { CollectPlugin } from './plugins/collect'
// @ts-expect-error: ignore
import globalThis from 'core-js/internals/global-this.js'

export class BuryReport implements BuryReportBase {
  public report?: ReportFn
  public options: Options

  private static pluginsOrder: BuryReportPlugin[] = []

  constructor(config: Options) {
    const url = config.url
    const blob = new Blob([workerStr.replace('BR_URL', url)], { type: 'application/javascript' })
    const workerUrl = window.URL.createObjectURL(blob)
    window.__BR_WORKER__ = new window.Worker(workerUrl)

    this.options = withDefault(config)

    if (!config.report) return

    this.report = createProxy(config)

    globalThis[REPORT_REQUEST] = this.report

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

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.report?.(LIFECYCLE, { t: 'visibilitychange' }, true)
      }
    })
    window.addEventListener('pagehide', (evt) => {
      this.report?.(LIFECYCLE, { t: 'pagehide', c: evt.persisted }, true)
    })
  }

  private triggerPlugin(lifecycle: 'init') {
    BuryReport.pluginsOrder.forEach(plugin => plugin[lifecycle](this))
  }
}

const INNER_PLUGINs = [
  new PerfPlugin(),
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
  const { appid, interval = 10 } = options

  return function (
    type: string,
    data: Record<string, any>,
    immediate = false,
  ) {
    const sendRequest = (record?: any) => {
      const list: any[] = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
      if (record) {
        list.push(record)
      }
      if (!list.length) return

      // const body = JSON.stringify({ appid, data: list.map(item => ({ ...item, appid })) })

      window.__BR_WORKER__ && window.__BR_WORKER__.postMessage({
        type: 'report',
        appid,
        sessionid: getSessionId(),
        deviceid: getUuid(),
        body: JSON.stringify(list),
      })

      // 不管上报的成功与否，都需要清除定时器，保证新的上报流程正常执行
      // 都需要把上报队列清空，防止过度使用用户缓存
      setLocalStorage(REPORT_QUEUE, JSON.stringify([]))
      clearInterval(timer)
      timer = undefined
    }

    if (immediate) {
      const record = storageReport(type, data, false)
      sendRequest(record)
    } else {
      storageReport(type, data)

      if (!timer) {
        timer = globalThis.setTimeout(sendRequest, interval * 1000) as unknown as number
      }
    }
  }
}
