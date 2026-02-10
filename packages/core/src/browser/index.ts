import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn, ReportOptions } from '../type'
import { LIFECYCLE, REPORT_REQUEST } from '@/constant'
import { flushMemoryToStorage, getSessionId, getUuid, readQueue, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
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
    if (window.__BR_WORKER__) {
      window.__BR_WORKER__.onmessage = (e) => {
        if (e.data.type === 'exception') {
          console.log('[report-core] worker terminated')
          window.__BR_WORKER__ = undefined
        }
      }
    }

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
        this.report?.(LIFECYCLE, { t: 'visibilitychange' }, {
          immediate: true,
          store: true,
          flush: true,
        })
      }
    })
    window.addEventListener('pagehide', (evt) => {
      const operation: any = BuryReport.pluginsOrder.find(item => item.name === 'OperationRecordPlugin')
      if (operation && operation.collect) {
        operation.collect()
      }
      this.report?.(LIFECYCLE, { t: 'pagehide', c: evt.persisted }, {
        immediate: true,
        store: true,
        flush: true,
      })
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

function createProxy(options: Options) {
  const { appid, interval = 10 } = options
  let sendTimer: number | undefined

  const sendRequest = (keepalive = false) => {
    if (!window.__BR_WORKER__) return

    // 发送前强制 flush，避免内存数据丢失
    flushMemoryToStorage()

    const list = readQueue()

    if (list.length) {
      fetch(options.url, {
        method: 'post',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
        keepalive,
        cache: 'no-store',
        credentials: 'omit',
        priority: 'low',
        body: JSON.stringify({ appid, data: list.map(item => ({ appid, ...item })) }),
      })
    }

    if (BuryReport.cache.length) {
      window.__BR_WORKER__.postMessage({
        type: 'report',
        appid,
        sessionid: getSessionId(),
        deviceid: getUuid(),
        store: BuryReport.cache,
        keepalive,
      })
    }

    // 不管上报的成功与否，都需要清除定时器，保证新的上报流程正常执行
    // 都需要把上报队列清空，防止过度使用用户缓存
    writeQueue([])
    BuryReport.cache = []
    clearInterval(sendTimer)
    sendTimer = undefined
  }

  const report = (
    type: string,
    data: Record<string, any>,
    options: ReportOptions = {},
  ) => {
    // TODO: 网络日志是否需要区分发起时间和响应时间
    const record = storageReport(type, data, Date.now())

    const {
      store = true,
      flush = false,
      immediate = false,
      keepalive = false,
    } = options

    if (store) {
      writeMemory(record, flush)
    } else {
      // 如果不需要存入本地缓存，那就得把数据写入到另一块内存中
      // 否则当执行刷新操作时，内存中的数据仍然会写入到本地缓存中
      BuryReport.cache.push(record)
    }

    if (immediate) {
      sendRequest(keepalive)
    }

    if (!sendTimer) {
      sendTimer = globalThis.setTimeout(
        sendRequest,
        interval * 1000,
      ) as unknown as number
    }
  }

  globalThis[REPORT_REQUEST] = report
  return report
}
