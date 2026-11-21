import { NetworkPlugin as _NetworkPlugin } from './plugins/network'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { REPORT_REQUEST } from '@/constant'
import { MAX_MEMORY_COUNT, flushMemoryToStorage, normalizeInterval, normalizeMaxRetry, readQueue, removeSentRecords, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
import { ErrorPlugin as _ErrorPlugin } from './plugins/error'
import { CollectPlugin as _CollectPlugin } from './plugins/collect'
import { TrackPlugin as _TrackPlugin } from './plugins/track'

export const CollectPlugin = _CollectPlugin
export const ErrorPlugin = _ErrorPlugin
export const NetworkPlugin = _NetworkPlugin
export const TrackPlugin = _TrackPlugin

export class BuryReport implements BuryReportBase {
  public report?: ReportFn
  public options: Options
  // 业务主动调用 abort 后置为 true；网络失败不会自动中止
  public aborted = false
  private transportStop?: () => void

  private static pluginsOrder: BuryReportPlugin[] = []

  constructor(config: Options = {} as Options) {
    this.options = withDefault(config)

    if (!config?.report) return

    this.report = createProxy(config, stop => {
      this.transportStop = stop
    })

    this.init()
  }

  // 业务主动停止 SDK。网络失败只会进入退避重试，不会自动触发 abort。
  abort() {
    if (this.aborted) return
    this.aborted = true

    this.transportStop?.()

    BuryReport.pluginsOrder.forEach(plugin => {
      if (typeof plugin.destroy !== 'function') return
      try {
        plugin.destroy(this)
      } catch (error) {
        console.warn('[@sepveneto/report-core] plugin destroy failed: ' + error)
      }
    })
    BuryReport.pluginsOrder = []
  }

  static registerPlugin(plugin: BuryReportPlugin) {
    this.pluginsOrder.push(plugin)
  }

  private init() {
    this.triggerPlugin('init')
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

export function report(type: string, data: Record<string, any>, immediate = false) {
  globalThis[REPORT_REQUEST]?.(type, data, { immediate })
}

function createProxy(options: Options, onStop: (stop: () => void) => void) {
  const { appid, interval = 10, url } = options
  const sendInterval = normalizeInterval(interval)
  const maxRetry = normalizeMaxRetry(options.maxRetry)
  let sending = false
  let sendTimer: number | undefined
  // 发送期间又触发的即时（immediate）上报：当前请求结束后立即补发，
  // 而不是被跳过、推迟到下个时间窗口执行
  let pendingImmediate = false
  // 发送期间新增的任意上报：当前请求结束后继续排空，避免数据依赖业务再次上报触发
  let pendingSend = false
  // 连续失败次数：成功一次即清零，用于控制退避间隔
  let failStreak = 0
  // 已中止：不再调度发送，report 也不再入队
  let stopped = false
  // store:false 的数据（如网络日志）只放内存，避免写入小程序本地缓存
  let memoryOnly: any[] = []

  const clearSendTimer = () => {
    clearTimeout(sendTimer)
    sendTimer = undefined
  }

  const scheduleSend = (delay = sendInterval) => {
    if (stopped || sendTimer !== undefined) return
    sendTimer = globalThis.setTimeout(() => {
      sendTimer = undefined
      sendRequest()
    }, delay) as unknown as number
  }

  const stopSending = () => {
    stopped = true
    pendingImmediate = false
    pendingSend = false
    clearSendTimer()
    const uniScope = globalThis as any
    try {
      uniScope.uni?.offNetworkStatusChange?.(onNetworkStatusChange)
    } catch {}
  }
  onStop(stopSending)

  const onNetworkStatusChange = (status: { isConnected?: boolean }) => {
    if (stopped || !status?.isConnected) return
    failStreak = 0
    clearSendTimer()
    sendRequest()
  }
  try {
    (globalThis as any).uni?.onNetworkStatusChange?.(onNetworkStatusChange)
  } catch {}

  // 一次发送结束后的统一收尾：处理待补发的即时请求，或在失败时排期重试
  const finish = (retry = false) => {
    sending = false
    if (stopped) return

    const needsFollowUp = pendingSend || pendingImmediate
    pendingSend = false
    pendingImmediate = false

    if (retry) {
      failStreak += 1
      const exponentCap = Number.isFinite(maxRetry) ? Math.max(0, Math.min(maxRetry, 6)) : 0
      const exponent = Math.min(Math.max(0, failStreak - 1), exponentCap)
      scheduleSend(Math.min(sendInterval * 2 ** exponent, 5 * 60 * 1000))
    } else {
      failStreak = 0
      if (needsFollowUp) sendRequest()
    }
  }

  const sendRequest = (immediate = false) => {
    // 已中止上报：不再发起任何请求
    if (stopped) return

    // 上一个请求尚未结束：不并发重复发送；带即时语义的请求登记待补发
    if (sending) {
      pendingSend = true
      if (immediate) pendingImmediate = true
      return
    }

    clearSendTimer()
    pendingSend = false
    pendingImmediate = false
    sending = true

    // 记录本次实际发送的数据，成功后只删除这批，保留发送期间新进入的记录
    let sentRecords: any[] = []
    let sentMemory: any[] = []

    try {
      // 发送前强制 flush，避免内存数据丢失
      flushMemoryToStorage()

      const list = readQueue()
      sentRecords = list
      sentMemory = memoryOnly
      const payload = [...list.map(item => ({ ...item, appid })), ...sentMemory]
      if (!payload.length) {
        finish()
        return
      }

      uni.request({
        url,
        method: 'POST',
        data: JSON.stringify({ appid, data: payload }),
        timeout: 3000,
        success: (res: any) => {
          // uni.request 对任意 HTTP 状态码都会回调 success，只有 2xx 才视为投递成功；
          // 未知状态码（如 statusCode 缺失）同样按失败处理，避免误清队列导致丢数据
          const status = res?.statusCode
          if (typeof status !== 'number' || status < 200 || status >= 300) {
            finish(true)
            return
          }
          // 删除本次实际发送的那批记录，保留发送期间新进入的记录
          writeQueue(removeSentRecords(readQueue(), sentRecords))
          const sentSet = new Set(sentMemory)
          memoryOnly = memoryOnly.filter(item => !sentSet.has(item))
          finish(false)
        },
        fail: () => {
          // 失败保留队列，下个周期自动重试（节流在发送周期内，不增加宿主负担）
          finish(true)
        },
      })
    } catch (err) {
      // 发送失败不影响宿主，仅记录警告
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
      finish(true)
    }
  }

  const report = (
    type: string,
    data: Record<string, any>,
    options: { immediate?: boolean, store?: boolean } = {},
  ) => {
    // 上报链路的任何异常都不能抛给业务调用方（含入参异常）
    try {
      // 已中止上报：直接丢弃，避免队列继续增长
      if (stopped) return

      const { immediate = false, store = true } = options || {}
      const record = storageReport(type, data, Date.now())

      if (store) {
        writeMemory(record)
      } else {
        memoryOnly.push(record)
        if (memoryOnly.length > MAX_MEMORY_COUNT) {
          memoryOnly.splice(0, memoryOnly.length - MAX_MEMORY_COUNT)
        }
      }

      if (sending) pendingSend = true

      if (immediate) {
        sendRequest(true)
      }

      scheduleSend()
    } catch (err) {
      console.warn('[@sepveneto/report-core] report failed: ' + err)
    }
  }

  globalThis[REPORT_REQUEST] = report
  return report
}

// export default BuryReport
