import type { MpRecord } from '@/apis'
import { getMpSessionEvents, getSessionDetail, getSessionEvents, syncSession } from '@/apis'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { type eventWithTime } from '@rrweb/types'

export function useH5Session(session: string, cb?: () => void) {
  const timer = ref<number | null>()
  const detail = shallowRef()

  const { promise, resolve } = Promise.withResolvers<Promise<eventWithTime[]>>()
  const events = shallowRef(promise)
  const inited = computed(() => {
    return detail.value && detail.value.event_urls.length > 0
  })

  async function getDetail() {
    const res = await getSessionDetail(session)
    detail.value = res
    if (inited.value) {
      timer.value && clearInterval(timer.value)
      timer.value = null
      resolve(getSessionEvents(detail.value.event_urls))
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
  const inited = computed(() => {
    return detail.value && detail.value.event_urls.length > 0
  })

  async function getDetail() {
    const res = await getSessionDetail(session)
    detail.value = res
    if (inited.value) {
      timer.value && clearInterval(timer.value)
      timer.value = null
      resolve(getMpSessionEvents(detail.value.event_urls))
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
