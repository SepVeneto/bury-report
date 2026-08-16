import { NetworkPlugin as _NetworkPlugin } from './plugins/network'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { REPORT_REQUEST } from '@/constant'
import { flushMemoryToStorage, normalizeInterval, readQueue, storageReport, withDefault, writeMemory, writeQueue } from '@/utils'
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
  let canSend = true
  let sendTimer: number | undefined

  const sendRequest = () => {
    clearTimeout(sendTimer)
    sendTimer = undefined

    if (!canSend) return

    try {
      // 发送前强制 flush，避免内存数据丢失
      flushMemoryToStorage()

      const list = readQueue()
      if (!list.length) return

      uni.request({
        url,
        method: 'POST',
        data: JSON.stringify({ appid, data: list.map(item => ({ ...item, appid })) }),
        timeout: 3000,
        success: () => {
          writeQueue([])
        },
        fail: () => {
          // 生命周期级熔断：只禁发送
          canSend = false
        },
      })
    } catch (err) {
      // 发送失败不影响宿主，仅记录警告
      console.warn('[@sepveneto/report-core] send request failed: ' + err)
    }
  }

  const report = (
    type: string,
    data: Record<string, any>,
    options: { immediate?: boolean } = {},
  ) => {
    const { immediate = false } = options
    const record = storageReport(type, data, Date.now())

    writeMemory(record)

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
