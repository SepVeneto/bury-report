import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { LIFECYCLE, REPORT_QUEUE, REPORT_REQUEST } from '@/constant'
import { getLocalStorage, getSessionId, getUuid, setLocalStorage, storageReport, withDefault } from '@/utils'
// @ts-expect-error: string
import WorkerFactory from './worker?inline-worker'
import { ErrorPlugin } from './plugins/error'
import { CollectPlugin } from './plugins/collect'
// @ts-expect-error: ignore
import globalThis from 'core-js/internals/global-this.js'

export class BuryReport implements BuryReportBase {
  public report?: ReportFn
  public options: Options

  private static pluginsOrder: BuryReportPlugin[] = []
  public static cache: any[] = []

  constructor(config: Options) {
    const url = config.url
    const worker = WorkerFactory({ url: process.env.LOG_DEBUG ? 'http://localhost:8870/record' : url })
    window.__BR_WORKER__ = worker

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
        case 'operationRecordPlugin':
          return this.options.operationRecord?.enable
        default:
          return true
      }
    })
    this.triggerPlugin('init')

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const operation: any = BuryReport.pluginsOrder.find(item => item.name === 'OperationRecordPlugin')
        if (operation && operation.collect) {
          operation.collect()
        }
        this.report?.(LIFECYCLE, { t: 'visibilitychange' }, true, true, true)
      }
    })
    window.addEventListener('pagehide', (evt) => {
      const operation: any = BuryReport.pluginsOrder.find(item => item.name === 'OperationRecordPlugin')
      if (operation && operation.collect) {
        operation.collect()
      }
      this.report?.(LIFECYCLE, { t: 'pagehide', c: evt.persisted }, true, true, true)
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
    cache = true,
    keepalive = false,
  ) {
    const sendRequest = (record?: any, keepalive = false) => {
      const list: any[] = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
      if (record) {
        list.push(record)
      }
      // const body = JSON.stringify({ appid, data: list.map(item => ({ ...item, appid })) })

      window.__BR_WORKER__ && window.__BR_WORKER__.postMessage({
        type: 'report',
        appid,
        sessionid: getSessionId(),
        deviceid: getUuid(),
        store: list,
        cache: BuryReport.cache,
        keepalive,
      })

      // 不管上报的成功与否，都需要清除定时器，保证新的上报流程正常执行
      // 都需要把上报队列清空，防止过度使用用户缓存
      BuryReport.cache = []
      setLocalStorage(REPORT_QUEUE, JSON.stringify([]))
      clearInterval(timer)
      timer = undefined
    }

    // TODO: 网络日志是否需要区分发起时间和响应时间
    const record = storageReport(type, data, cache, BuryReport.cache, Date.now())
    if (immediate) {
      sendRequest(record, keepalive)
    } else {
      if (!timer) {
        timer = globalThis.setTimeout(sendRequest, interval * 1000) as unknown as number
      }
    }
  }
}
