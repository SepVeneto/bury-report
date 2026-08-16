import { NetworkPlugin as _NetworkPlugin } from './plugins/network'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { REPORT_REQUEST } from '@/constant'
import { MAX_MEMORY_COUNT, flushMemoryToStorage, normalizeInterval, readQueue, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
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

  private static pluginsOrder: BuryReportPlugin[] = []

  constructor(config: Options = {} as Options) {
    this.options = withDefault(config)

    if (!config?.report) return

    this.report = createProxy(config)

    this.init()
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

function createProxy(options: Options) {
  const { appid, interval = 10, url } = options
  const sendInterval = normalizeInterval(interval)
  let sending = false
  let sendTimer: number | undefined
  // store:false 的数据（如网络日志）只放内存，避免写入小程序本地缓存
  let memoryOnly: any[] = []

  const sendRequest = () => {
    clearTimeout(sendTimer)
    sendTimer = undefined

    if (sending) return
    sending = true

    try {
      // 发送前强制 flush，避免内存数据丢失
      flushMemoryToStorage()

      const list = readQueue()
      const payload = [...list.map(item => ({ ...item, appid })), ...memoryOnly]
      if (!payload.length) {
        sending = false
        return
      }

      uni.request({
        url,
        method: 'POST',
        data: JSON.stringify({ appid, data: payload }),
        timeout: 3000,
        success: () => {
          sending = false
          writeQueue([])
          memoryOnly = []
        },
        fail: () => {
          // 失败保留队列，下个周期自动重试（节流在发送周期内，不增加宿主负担）
          sending = false
          if (!sendTimer) {
            sendTimer = globalThis.setTimeout(sendRequest, sendInterval) as unknown as number
          }
        },
      })
    } catch (err) {
      // 发送失败不影响宿主，仅记录警告
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
      sending = false
      if (!sendTimer) {
        sendTimer = globalThis.setTimeout(sendRequest, sendInterval) as unknown as number
      }
    }
  }

  const report = (
    type: string,
    data: Record<string, any>,
    options: { immediate?: boolean, store?: boolean } = {},
  ) => {
    const { immediate = false, store = true } = options
    const record = storageReport(type, data, Date.now())

    if (store) {
      writeMemory(record)
    } else {
      memoryOnly.push(record)
      if (memoryOnly.length > MAX_MEMORY_COUNT) {
        memoryOnly.splice(0, memoryOnly.length - MAX_MEMORY_COUNT)
      }
    }

    if (immediate) {
      sendRequest()
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

// export default BuryReport
