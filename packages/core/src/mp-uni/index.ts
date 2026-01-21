import { NetworkPlugin as _NetworkPlugin } from './plugins/network'
import type { BuryReportBase, BuryReportPlugin, Options, ReportFn } from '../type'
import { REPORT_QUEUE, REPORT_REQUEST } from '@/constant'
import { getLocalStorage, setLocalStorage, storageReport, withDefault } from '@/utils'
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

  constructor(config: Options) {
    this.options = withDefault(config)

    if (!config.report) return

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
    BuryReport.pluginsOrder.forEach(plugin => plugin[lifecycle](this))
  }
}

export function report(type: string, data: Record<string, any>, immediate = false) {
  globalThis[REPORT_REQUEST]?.(type, data, immediate)
}

// 1秒节流
const FLUSH_INTERVAL = 1000
// 最多缓存最新的50条
const MAX_PERSIST_COUNT = 50
function createProxy(options: Options) {
  const { appid, interval = 10, url } = options
  let canSend = true
  let sendTimer: number | undefined

  let memoryBuffer: any[] = []
  let flushTimer: number | undefined

  const readQueue: () => any[] = () => {
    try {
      return JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
    } catch (err) {
      console.warn(err)
      return []
    }
  }

  const writeQueue = (list: any[]) => {
    try {
      setLocalStorage(REPORT_QUEUE, JSON.stringify(list))
    } catch (err) {
      console.warn(err)
    }
  }

  const flushMemoryToStorage = () => {
    if (!memoryBuffer.length) return

    const list = readQueue()
    list.push(...memoryBuffer)

    if (list.length > MAX_PERSIST_COUNT) {
      list.splice(0, list.length - MAX_PERSIST_COUNT)
    }

    writeQueue(list)

    memoryBuffer = []
    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  const sendRequest = () => {
    if (!canSend) return

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

    clearTimeout(sendTimer)
    sendTimer = undefined
  }

  const report = (
    type: string,
    data: Record<string, any>,
    immediate = false,
  ) => {
    const record = storageReport(type, data)

    memoryBuffer.push(record)

    if (!flushTimer) {
      flushTimer = globalThis.setTimeout(
        flushMemoryToStorage,
        FLUSH_INTERVAL,
      ) as unknown as number
    }

    if (immediate) {
      sendRequest()
      return
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

// export default BuryReport
