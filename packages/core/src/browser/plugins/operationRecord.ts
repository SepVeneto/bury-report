import '../polyfill'

import { OPERATION_TRACK } from '@/constant'
import type { BuryReportBase as BuryReport, BuryReportPlugin } from '@/type'
import * as rrweb from '@rrweb/record'
import { EventType, type RecordPlugin } from '@rrweb/types'

// 批量上报间隔
const TIMEOUT = 5 * 1000
// 检查点重建间隔：周期生成 FullSnapshot，快照丢失/拍错时回放也能从下一个检查点恢复。
// 分段会话中每段都短于该间隔时不会触发，请配合可见性快照使用
const CHECKOUT_INTERVAL = 5 * 1000
// 快照节流：避免短时间内（如 webview 前后台抖动、连续路由切换）重复拍快照
const SNAPSHOT_THROTTLE = 1000

class OperationRecordPlugin implements BuryReportPlugin {
  public name = 'OperationRecordPlugin'
  public reportRequest: any

  private events: any[] = []
  private ctx?: BuryReport
  private reportTimer?: number
  private isHooked = false
  private lastSnapshotAt = 0

  hook() {
    if (this.isHooked) return
    this.isHooked = true

    const originalPush = window.history.pushState
    const originalReplace = window.history.replaceState
    const takeSnapshot = () => this.takeDeferredSnapshot()

    window.history.pushState = function (...args) {
      originalPush.apply(this, args)
      takeSnapshot()
    }
    window.history.replaceState = function (...args) {
      originalReplace.apply(this, args)
      takeSnapshot()
    }
  }

  init(ctx: BuryReport) {
    this.ctx = ctx
    const config = ctx.options.operationRecord || {}

    rrweb.record({
      emit: (event) => {
        this.events.push(event)
        if (!this.reportTimer) {
          this.reportTimer = setTimeout(() => {
            this.collect()
            this.reportTimer = undefined
          }, TIMEOUT) as unknown as number
        }
        if (event.type === EventType.FullSnapshot) {
          this.hook()
          clearTimeout(this.reportTimer)
          this.reportTimer = undefined
          this.collect(true)
        }
      },
      // 周期重建快照：某段快照丢失/拍错时，回放也能从下一个检查点继续（设为0可关闭）
      checkoutEveryNms: config.checkoutEveryNms ?? CHECKOUT_INTERVAL,
      // 样式不内联进快照，显著减小快照体积，降低超传输限制被丢弃的概率
      inlineStylesheet: config.inlineStylesheet ?? false,
      plugins: [enhancedPlugin()],
      sampling: {
        mousemove: 200,
        scroll: 300,
        input: 'last',
      },
    })

    // 从第三方场景回到 portal（页面重新可见）时重建检查点
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.takeDeferredSnapshot()
    }
  }

  // 路由渲染是异步的，等渲染完成后（下一帧）再拍快照，
  // 避免拍到旧页面/切换中间态导致回放白屏
  private takeDeferredSnapshot() {
    const now = Date.now()
    if (now - this.lastSnapshotAt < SNAPSHOT_THROTTLE) return
    this.lastSnapshotAt = now

    let done = false
    const snapshot = () => {
      if (done) return
      done = true
      try {
        rrweb.record.takeFullSnapshot()
      } catch (err) {
        console.warn('[@sepveneto/report-core] take full snapshot failed: ' + err)
      }
    }

    if (typeof requestAnimationFrame === 'function') {
      let rafFired = false
      requestAnimationFrame(() => {
        rafFired = true
        snapshot()
      })
      // rAF 在页面隐藏时不触发，用 setTimeout 兜底
      setTimeout(() => {
        if (!rafFired) snapshot()
      }, 100)
    } else {
      setTimeout(snapshot, 100)
    }
  }

  collect(immediate = false, keepalive = false) {
    if (!this.events.length) return

    // 录屏事件流必须原子上报：拆分会因 keepalive 部分送达导致整段数据不完整、
    // 消费端解析失败。事件流在页面可见期间已由定时器/快照触发经普通路径分批发送，
    // 页面隐藏/关闭时仅剩小尾巴，单条记录走 keepalive 全量送达或整条丢弃
    this.ctx?.report?.(OPERATION_TRACK, { events: this.events }, {
      immediate,
      keepalive,
      store: false,
    })
    this.events = []
  }
}

window.OperationRecordPlugin = OperationRecordPlugin

const enhancedPlugin: () => RecordPlugin = () => ({
  name: '@sepveneto/enhanced',
  observer(cb, win) {
    const onVisibilitychange = () => {
      const payload = {
        event: 'visibilitychange',
        action: win.document.visibilityState,
      }
      cb(payload)
    }
    const onPageHide = (evt: PageTransitionEvent) => {
      const payload = {
        event: 'pagehide',
        persisted: evt.persisted,
      }
      cb(payload)
    }
    win.document.addEventListener('visibilitychange', onVisibilitychange)
    win.addEventListener('pagehide', onPageHide)
    return () => {
      win.removeEventListener('pagehide', onPageHide)
      win.document.removeEventListener('visibilitychange', onVisibilitychange)
    }
  },
  options: {},
})
