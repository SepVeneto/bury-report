import type { MpRecord } from '@/apis'
import { getMpSessionEvents, getSessionDetail, getSessionEvents, syncSession } from '@/apis'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { type eventWithTime } from '@rrweb/types'

type SessionDetailLike = {
  event_urls?: string[]
  events?: unknown[]
  records?: unknown[]
}

/**
 * 是否有回放数据。
 * 新版本以服务端合并后的 events/records 为准：老会话的回放数据只有 Mongo 里的旧版本数据，
 * 没有 event_urls；未升级的 server 不返回这两个字段，仍按 event_urls 判断（保持旧行为）。
 */
function hasReplayData(detail?: SessionDetailLike) {
  if (!detail) return false
  if (detail.events || detail.records) {
    return (detail.events?.length ?? 0) > 0 || (detail.records?.length ?? 0) > 0
  }
  return Array.isArray(detail.event_urls) && detail.event_urls.length > 0
}

export function useH5Session(session: string, cb?: () => void) {
  const timer = ref<number | null>()
  const detail = shallowRef()

  const { promise, resolve } = Promise.withResolvers<Promise<eventWithTime[]>>()
  const events = shallowRef(promise)
  const inited = computed(() => hasReplayData(detail.value))

  async function getDetail() {
    const res = await getSessionDetail(session)
    detail.value = res
    if (inited.value) {
      timer.value && clearInterval(timer.value)
      timer.value = null
      // 新版本由 server 合并去重；未升级的 server 不返回 events，退回按 COS 分片自行合并
      resolve(res.events ? Promise.resolve(res.events) : getSessionEvents(res.event_urls))
      cb && nextTick().then(cb)
    }
    return detail.value
  }

  async function sync() {
    await syncSession(session)
    timer.value = setInterval(() => {
      getDetail()
    }, 3000)
  }

  onBeforeUnmount(() => {
    timer.value && clearInterval(timer.value)
    timer.value = null
    detail.value = undefined
  })

  return {
    inited,
    events,
    detail,
    isSyncing: timer,
    sync,
    getDetail,
  }
}

export function useMpSession(session: string, cb: () => void) {
  const timer = ref<number | null>()
  const detail = shallowRef()

  const { promise, resolve } = Promise.withResolvers<Promise<MpRecord[]>>()
  const events = shallowRef(promise)
  const inited = computed(() => hasReplayData(detail.value))

  async function getDetail() {
    const res = await getSessionDetail(session)
    detail.value = res
    if (inited.value) {
      timer.value && clearInterval(timer.value)
      timer.value = null
      // 同上：服务端合并去重后的页面轨迹，旧版本 server 退回读 COS
      resolve(res.records ? Promise.resolve(res.records) : getMpSessionEvents(res.event_urls))
      nextTick().then(cb)
    }
    return detail.value
  }

  async function sync() {
    await syncSession(session)
    timer.value = setInterval(() => {
      getDetail()
    }, 3000)
  }

  onBeforeUnmount(() => {
    timer.value && clearInterval(timer.value)
    timer.value = null
    detail.value = undefined
  })

  return {
    inited,
    events,
    detail,
    isSyncing: timer,
    sync,
    getDetail,
  }
}
