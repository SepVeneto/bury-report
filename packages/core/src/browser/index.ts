import { NetworkPlugin } from './plugins/network'
import { PerfPlugin } from './plugins/perf'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn, ReportOptions } from '../type'
import { LIFECYCLE, REPORT_REQUEST } from '@/constant'
import { MAX_CACHE_COUNT, MAX_KEEPALIVE_BYTES, MAX_KEEPALIVE_TOTAL_BYTES, flushMemoryToStorage, getSessionId, getUuid, normalizeInterval, normalizeMaxRetry, pickWithinBudget, readQueue, removeSentRecords, splitBySize, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
// @ts-expect-error: string
import WorkerFactory from './worker?inline-worker'
import { ErrorPlugin } from './plugins/error'
import { CollectPlugin } from './plugins/collect'
// @ts-expect-error: ignore
import globalThis from 'core-js/internals/global-this.js'

type ProxyControl = {
  // 停止上报代理的发送循环
  stop?: () => void
  // 重试耗尽时的回调，用于中止所有上报相关的操作
  onExhausted?: () => void
}

export class BuryReport implements BuryReportBase {
  public report?: ReportFn
  public options: Options
  // 重试耗尽后置为 true，之后不再产生任何上报
  public aborted = false
  // 由上报代理回填的停止句柄，用于在中止时切断发送循环
  private proxyControl: ProxyControl = {}

  private static pluginsOrder: BuryReportPlugin[] = []
  private static instance?: BuryReport
  public static cache: any[] = []

  constructor(config: Options = {} as Options) {
    BuryReport.instance = this
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
        } else if (e.data.type === 'exhausted') {
          // worker 内部重试同样耗尽：中止一切上报相关的操作（含录屏）
          console.warn('[@sepveneto/report-core] report disabled: worker retry exhausted')
          this.abort()
        }
      }
    }

    this.options = withDefault(config)

    if (!config?.report) return

    this.proxyControl.onExhausted = () => this.abort()
    this.report = createProxy(config, this.proxyControl)

    this.init()
  }

  // 中止所有上报相关的操作：切断发送循环、销毁插件采集行为（录屏、错误监听等）并终止 worker。
  // 上报连续失败次数超过 maxRetry 后自动触发，业务也可主动调用
  abort() {
    if (this.aborted) return
    this.aborted = true

    this.proxyControl.stop?.()

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

function createProxy(options: Options, control: ProxyControl = {}) {
  const { appid } = options
  const sendInterval = normalizeInterval(options.interval)
  const maxRetry = normalizeMaxRetry(options.maxRetry)
  let sendTimer: number | undefined
  let sending = false
  // 连续失败次数：成功一次即清零，超过 maxRetry 判定上报服务不可用
  let failStreak = 0
  // 已中止：不再调度发送，report 也不再入队
  let stopped = false
  // 发送期间又触发的即时（immediate）上报：当前请求结束后立即补发，
  // 而不是被跳过、推迟到下个时间窗口执行
  let pendingImmediate = false

  const stopSending = () => {
    stopped = true
    pendingImmediate = false
    clearInterval(sendTimer)
    sendTimer = undefined
  }
  control.stop = stopSending

  // 重试耗尽：停止发送并通知外部中止上报相关的操作（含录屏）
  const exhaust = () => {
    if (stopped) return
    stopSending()
    try {
      control.onExhausted?.()
    } catch (err) {
      console.warn('[@sepveneto/report-core] abort report failed: ' + err)
    }
  }

  // 按引用移除已投递的记录（内存缓存是同一批对象引用），保留期间新增的数据
  const dropRefs = (list: any[], sent: any[]) => {
    if (!sent.length) return list
    const sentSet = new Set(sent)
    return list.filter(item => !sentSet.has(item))
  }

  const sendRequest = async (keepalive = false, immediate = false) => {
    // 已中止上报：不再发起任何请求
    if (stopped) return
    // 上一次发送未结束时不并发重复发送（keepalive 页面关闭场景除外）；
    // 带即时语义的请求登记一次待补发，等当前请求结束后立即发送
    if (sending && !keepalive) {
      if (immediate) pendingImmediate = true
      return
    }
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
      const queuePayload = list.map(item => ({ appid, ...item }))
      const cachePayload = worker ? [] : cache.map(item => ({ appid, ...item }))
      // keepalive 下实际发出的条数，未发出的部分保留给下次会话
      let sentQueue = list.length
      let sentCache = cache.length

      let queueOk = true
      if (keepalive) {
        // 页面即将关闭：浏览器对 keepalive 请求总量有约 64KB 限制，超出部分会被直接丢弃，
        // 因此只在预算内发送，剩余数据留在队列里等下次会话补发
        const queuePart = pickWithinBudget(queuePayload, MAX_KEEPALIVE_TOTAL_BYTES)
        const cachePart = pickWithinBudget(cachePayload, MAX_KEEPALIVE_TOTAL_BYTES - queuePart.used)
        sentQueue = queuePart.sent.length
        sentCache = cachePart.sent.length

        // 按大小分片同步发出（keepalive 请求已提交给浏览器，尽力送达）
        for (const chunk of splitBySize([...queuePart.sent, ...cachePart.sent], MAX_KEEPALIVE_BYTES)) {
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
      } else if (queuePayload.length || cachePayload.length) {
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
            body: JSON.stringify({ appid, data: [...queuePayload, ...cachePayload] }),
          })
        } catch (err) {
          // 网络失败：保留队列，等待下个周期重试
          console.warn('[report-core] fetch error: ' + err)
          queueOk = false
          failed = true
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
            // 0 表示不限制：worker 内部同样按该次数判断是否停止重试
            maxRetry: Number.isFinite(maxRetry) ? maxRetry : 0,
          })
        } catch (err) {
          console.warn('[report-core] worker postMessage error: ' + err)
          // worker 不可用：保留缓存，下个周期降级由主线程发送
          failed = true
          window.__BR_WORKER__ = undefined
        }
      }

      // 只删除“本次实际投递成功”的那批记录，保留发送期间新进入队列 / 缓存的数据，
      // 避免请求期间产生的新数据在成功时被一并清空导致丢失
      let sentQueueRecords: any[] | undefined
      if (keepalive) sentQueueRecords = list.slice(0, sentQueue)
      else if (queueOk) sentQueueRecords = list
      if (sentQueueRecords) {
        writeQueue(removeSentRecords(readQueue(), sentQueueRecords))
      }

      if (worker) {
        // 缓存已交给 worker（worker 内部负责失败重试）；仅 worker 存活时移除已交付的这批
        if (window.__BR_WORKER__) {
          BuryReport.cache = dropRefs(BuryReport.cache, cache)
        }
      } else if (keepalive) {
        // 无 worker：只移除预算内已发出的缓存部分，其余留到下次会话
        BuryReport.cache = dropRefs(BuryReport.cache, cache.slice(0, sentCache))
      } else if (queueOk) {
        // 无 worker：缓存已并入主线程请求，成功后移除已发出的这批
        BuryReport.cache = dropRefs(BuryReport.cache, cache)
      }
    } catch (err) {
      // 任何发送过程中的异常都不能影响宿主，仅记录警告
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
      failed = true
    } finally {
      sending = false
      clearInterval(sendTimer)
      sendTimer = undefined

      if (stopped) return

      // 发送期间触发的即时上报：当前请求结束后立即补发，而不是被推迟到下个时间窗口
      if (pendingImmediate) {
        pendingImmediate = false
        sendRequest()
        return
      }

      // keepalive（页面关闭）失败不重试，也不参与失败计数
      if (keepalive) return

      if (failed) {
        failStreak += 1
        // 重试指定次数后仍然失败：中止上报相关操作（含录屏）
        if (failStreak > maxRetry) {
          console.warn(`[@sepveneto/report-core] report disabled after ${failStreak - 1} retries`)
          exhaust()
          return
        }
        // 失败后自动重试：仅保留一个定时器，节流在发送周期内，不增加宿主负担
        sendTimer = globalThis.setTimeout(() => {
          sendRequest()
        }, sendInterval) as unknown as number
      } else {
        failStreak = 0
      }
    }
  }

  const report = (
    type: string,
    data: Record<string, any>,
    options: ReportOptions = {},
  ) => {
    // 上报链路的任何异常都不能抛给业务调用方（含入参异常）
    try {
      // 已中止上报：直接丢弃，避免队列继续增长
      if (stopped) return

      // TODO: 网络日志是否需要区分发起时间和响应时间
      const record = storageReport(type, data, Date.now())

      const {
        store = true,
        flush = false,
        immediate = false,
        keepalive = false,
      } = options || {}

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
        sendRequest(keepalive, immediate)
      }

      if (!sendTimer) {
        sendTimer = globalThis.setTimeout(
          () => {
            sendRequest()
          },
          sendInterval,
        ) as unknown as number
      }
    } catch (err) {
      console.warn('[@sepveneto/report-core] report failed: ' + err)
    }
  }

  globalThis[REPORT_REQUEST] = report
  return report
}
