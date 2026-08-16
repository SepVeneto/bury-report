import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn, ReportOptions } from '../type'
import { LIFECYCLE, REPORT_REQUEST } from '@/constant'
import { flushMemoryToStorage, getSessionId, getUuid, normalizeInterval, readQueue, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
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

  constructor(config: Options = {} as Options) {
    const url = config?.url
    let worker: any
    try {
      worker = WorkerFactory({ url: process.env.LOG_DEBUG ? 'http://localhost:8870/record' : url })
    } catch (error) {
      // worker 创建失败（如 CSP 限制）不影响宿主，数据会降级由主线程发送
      console.warn('[@sepveneto/report-core] worker init failed: ' + error)
    }
    window.__BR_WORKER__ = worker
    if (worker) {
      worker.onmessage = (e: any) => {
        if (e.data.type === 'exception') {
          console.log('[report-core] worker terminated')
          window.__BR_WORKER__ = undefined
        }
      }
    }

    this.options = withDefault(config)

    if (!config?.report) return

    this.report = createProxy(config)

    this.init()
  }

  static registerPlugin(plugin: BuryReportPlugin) {
    this.pluginsOrder.push(plugin)
  }

  private init() {
    BuryReport.pluginsOrder = BuryReport.pluginsOrder.filter(plugin => {
      switch (plugin.name.toLowerCase()) {
        case 'errorplugin':
          return this.options?.error
        case 'collectplugin':
          return this.options?.collect
        case 'networkplugin':
          return this.options?.network?.enable
        case 'operationrecordplugin':
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
    BuryReport.pluginsOrder.forEach(plugin => {
      try {
        plugin[lifecycle](this)
      } catch (error) {
        // 单个插件初始化失败不影响宿主
        console.warn('[@sepveneto/report-core] plugin init failed: ' + error)
      }
    })
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
  const { appid } = options
  const sendInterval = normalizeInterval(options.interval)
  let sendTimer: number | undefined

  const sendRequest = (keepalive = false) => {
    try {
      // 发送前强制 flush，避免内存数据丢失
      flushMemoryToStorage()

      const list = readQueue()
      const worker = window.__BR_WORKER__
      const cache = BuryReport.cache

      // 有 worker 时，store:false 的缓存数据交给 worker 上报；
      // 无 worker（创建失败或已终止）时并入主线程请求，避免数据丢失
      if (list.length || (!worker && cache.length)) {
        const data = list.map(item => ({ appid, ...item }))
        if (!worker) data.push(...cache.map(item => ({ appid, ...item })))
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
          body: JSON.stringify({ appid, data }),
        }).catch(err => {
          console.warn('[report-core] fetch error: ' + err)
        })
      }

      if (worker && cache.length) {
        try {
          worker.postMessage({
            type: 'report',
            appid,
            sessionid: getSessionId(),
            deviceid: getUuid(),
            store: cache,
            keepalive,
          })
        } catch (err) {
          console.warn('[report-core] worker postMessage error: ' + err)
        }
      }
    } catch (err) {
      // 任何发送过程中的异常都不能影响宿主，仅记录警告
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
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
        sendInterval,
      ) as unknown as number
    }
  }

  globalThis[REPORT_REQUEST] = report
  return report
}
