import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn, ReportOptions } from '../type'
import { LIFECYCLE, REPORT_REQUEST } from '@/constant'
import { MAX_CACHE_COUNT, MAX_KEEPALIVE_BYTES, flushMemoryToStorage, getSessionId, getUuid, normalizeInterval, readQueue, splitBySize, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
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
          keepalive: true,
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
        keepalive: true,
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
  let sending = false

  const sendRequest = async (keepalive = false) => {
    // 上一次发送未结束时不重复发送（keepalive 页面关闭场景除外）
    if (sending && !keepalive) return
    sending = true

    let failed = false
    try {
      // 发送前强制 flush，避免内存数据丢失
      flushMemoryToStorage()

      const list = readQueue()
      const worker = window.__BR_WORKER__
      const cache = BuryReport.cache

      // 有 worker 时，store:false 的缓存数据交给 worker 上报；
      // 无 worker（创建失败或已终止）时并入主线程请求，避免数据丢失
      const payload = list.map(item => ({ appid, ...item }))
      if (!worker) payload.push(...cache.map(item => ({ appid, ...item })))

      let queueOk = true
      if (payload.length) {
        if (keepalive) {
          // 页面即将关闭：按大小分片同步发出（keepalive 请求已提交给浏览器，尽力送达）
          for (const chunk of splitBySize(payload, MAX_KEEPALIVE_BYTES)) {
            fetch(options.url, {
              method: 'post',
              mode: 'no-cors',
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
              },
              keepalive: true,
              cache: 'no-store',
              credentials: 'omit',
              priority: 'low',
              body: JSON.stringify({ appid, data: chunk }),
            }).catch(err => {
              console.warn('[report-core] fetch error: ' + err)
            })
          }
        } else {
          try {
            await fetch(options.url, {
              method: 'post',
              mode: 'no-cors',
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
              },
              keepalive: false,
              cache: 'no-store',
              credentials: 'omit',
              priority: 'low',
              body: JSON.stringify({ appid, data: payload }),
            })
          } catch (err) {
            // 网络失败：保留队列，等待下个周期重试
            console.warn('[report-core] fetch error: ' + err)
            queueOk = false
            failed = true
          }
        }
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
          // worker 不可用：保留缓存，下个周期降级由主线程发送
          failed = true
          window.__BR_WORKER__ = undefined
        }
      }

      // 只清空发送成功的数据；失败的数据保留，下个周期自动重试
      if (queueOk) writeQueue([])
      if (worker) {
        // 已交给 worker（worker 内部负责失败重试）
        if (window.__BR_WORKER__) BuryReport.cache = []
      } else if (queueOk) {
        // 无 worker：缓存已并入主线程请求，成功后清空
        BuryReport.cache = []
      }
    } catch (err) {
      // 任何发送过程中的异常都不能影响宿主，仅记录警告
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
      failed = true
    } finally {
      sending = false
      clearInterval(sendTimer)
      sendTimer = undefined

      // 失败后自动重试：仅保留一个定时器，节流在发送周期内，不增加宿主负担
      if (failed && !keepalive) {
        sendTimer = globalThis.setTimeout(() => {
          void sendRequest()
        }, sendInterval) as unknown as number
      }
    }
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
      // 内存缓存设置上限，避免无界增长影响宿主内存
      if (BuryReport.cache.length > MAX_CACHE_COUNT) {
        BuryReport.cache.splice(0, BuryReport.cache.length - MAX_CACHE_COUNT)
      }
    }

    if (immediate) {
      void sendRequest(keepalive)
    }

    if (!sendTimer) {
      sendTimer = globalThis.setTimeout(
        () => {
          void sendRequest()
        },
        sendInterval,
      ) as unknown as number
    }
  }

  globalThis[REPORT_REQUEST] = report
  return report
}
