import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { LIFECYCLE, REPORT_REQUEST } from '@/constant'
import { withDefault } from '@/utils'
// @ts-expect-error: string
import WorkerFactory from './worker?inline-worker'
import { ErrorPlugin } from './plugins/error'
import { CollectPlugin } from './plugins/collect'
import { createBrowserTransport } from './transport'
import type { BrowserTransport } from './transport'

export class BuryReport implements BuryReportBase {
  public report?: ReportFn
  public options: Options
  // 业务主动调用 abort 后置为 true；网络失败不会自动中止
  public aborted = false
  private transport?: BrowserTransport

  private static pluginsOrder: BuryReportPlugin[] = []
  // eslint-disable-next-line no-use-before-define
  private static instance?: BuryReport
  public static cache: any[] = []

  constructor(config: Options = {} as Options) {
    BuryReport.instance = this
    this.options = withDefault(config)
    if (!config?.report) return

    const url = this.options.url
    let worker: any
    try {
      worker = WorkerFactory({ url: process.env.LOG_DEBUG ? 'http://localhost:8870/record' : url })
    } catch (error) {
      // worker 创建失败（如 CSP 限制）不影响宿主，数据会降级由主线程发送
      console.warn('[@sepveneto/report-core] worker init failed: ' + error)
    }
    window.__BR_WORKER__ = worker
    this.transport = createBrowserTransport(this.options, {
      get: () => BuryReport.cache,
      set: (items) => {
        BuryReport.cache = items
      },
    })
    this.report = this.transport.report
    ;(globalThis as any)[REPORT_REQUEST] = this.report
    if (worker) {
      worker.onmessage = (e: any) => {
        if (e.data?.type === 'exception') {
          console.log('[report-core] worker terminated')
        }
        this.transport?.handleWorkerMessage(e.data)
      }
    }

    this.init()
  }

  // 业务主动停止 SDK。网络失败只会进入退避重试，不会自动触发 abort。
  abort() {
    if (this.aborted) return
    this.aborted = true

    this.transport?.stop()

    BuryReport.pluginsOrder.forEach(plugin => {
      if (typeof plugin.destroy !== 'function') return
      try {
        plugin.destroy(this)
      } catch (error) {
        console.warn('[@sepveneto/report-core] plugin destroy failed: ' + error)
      }
    })
    BuryReport.pluginsOrder = []

    const worker = window.__BR_WORKER__
    if (worker) {
      try {
        worker.terminate?.()
      } catch (error) {
        console.warn('[@sepveneto/report-core] worker terminate failed: ' + error)
      }
      window.__BR_WORKER__ = undefined
    }
  }

  static registerPlugin(plugin: BuryReportPlugin) {
    this.pluginsOrder.push(plugin)

    // SDK 已初始化后注册的插件（如异步加载的 rrweb 插件）立即初始化，
    // 且同样受 enable 开关过滤
    const instance = this.instance
    if (instance && shouldEnablePlugin(plugin, instance.options)) {
      try {
        plugin.init(instance)
      } catch (error) {
        console.warn('[@sepveneto/report-core] plugin init failed: ' + error)
      }
    }
  }

  private init() {
    BuryReport.pluginsOrder = BuryReport.pluginsOrder.filter(plugin => shouldEnablePlugin(plugin, this.options))
    this.triggerPlugin('init')

    // visibilitychange(hidden) 与 pagehide 通常连续触发。第一次事件已经通过
    // keepalive flush 队列，第二次只做录屏收尾，避免同一批记录并发发送两遍。
    let hiddenLifecycleReported = false
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenLifecycleReported) return
        hiddenLifecycleReported = true
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
      } else {
        hiddenLifecycleReported = false
      }
    })
    window.addEventListener('pagehide', (evt) => {
      const operation: any = BuryReport.pluginsOrder.find(item => item.name === 'OperationRecordPlugin')
      if (operation && operation.collect) {
        operation.collect()
      }
      if (hiddenLifecycleReported) return
      hiddenLifecycleReported = true
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

function shouldEnablePlugin(plugin: BuryReportPlugin, options: Options) {
  switch (plugin.name.toLowerCase()) {
    case 'errorplugin':
      return options?.error
    case 'collectplugin':
      return options?.collect
    case 'networkplugin':
      return options?.network?.enable
    case 'operationrecordplugin':
      return options.operationRecord?.enable
    default:
      return true
  }
}
