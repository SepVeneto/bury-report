<template>
  <section
    v-if="session.inited.value"
    class="replay"
  >
    <div class="replay__player">
      <div class="replay__player-head">
        <span class="replay__title">会话回放</span>
        <span
          class="replay__state"
          :class="{ 'is-playing': playing }"
        >
          {{ playing ? '播放中' : '已暂停' }}
        </span>
      </div>
      <div
        ref="refPlayer"
        class="replay__stage"
        :style="stageStyle"
      />
      <div class="replay__player-foot">
        <span>🕒 {{ clockText(startTime) }} 开始 · 共 {{ totalDurationText }}</span>
        <span>🎬 {{ eventsCount }} 个事件</span>
      </div>
      <p class="replay__hint">
        点击右侧任意记录可跳转到对应时刻
      </p>
    </div>

    <div
      ref="panelRef"
      class="replay__panel"
    >
      <ElTabs
        v-model="activeTab"
        type="card"
        class="replay__tabs"
      >
        <ElTabPane
          :label="`网络 ${apis.length}`"
          name="net"
        >
          <ElScrollbar height="560px">
            <div
              v-if="!apis.length"
              class="replay__empty"
            >
              暂无网络请求
            </div>
            <div
              v-for="api in apis"
              :key="api.stamp"
              class="record"
              :class="{ 'is-active': activeKey === api.stamp }"
              @click="seekTo(api.stamp)"
            >
              <div class="record__time">
                <span class="record__offset">{{ offsetText(api.stamp) }}</span>
                <span class="record__clock">{{ clockText(api.stamp) }}</span>
              </div>
              <div class="record__main">
                <div class="record__line">
                  <span
                    class="record__method"
                    :class="methodClass(api.data?.method)"
                  >{{ api.data?.method || 'GET' }}</span>
                  <span
                    class="record__status"
                    :class="statusClass(api.data?.status)"
                  >{{ api.data?.status ?? '--' }}</span>
                  <span class="record__duration">{{ durationText(api.data?.duration) }}</span>
                </div>
                <div
                  class="record__text record__text--url"
                  :title="api.data?.url"
                >
                  {{ simpleUrl(api) }}
                </div>
              </div>
            </div>
          </ElScrollbar>
        </ElTabPane>

        <ElTabPane
          :label="`日志 ${logs.length}`"
          name="log"
        >
          <ElScrollbar height="560px">
            <div
              v-if="!logs.length"
              class="replay__empty"
            >
              暂无日志
            </div>
            <div
              v-for="log in logs"
              :key="log.stamp"
              class="record"
              :class="{ 'is-active': activeKey === log.stamp }"
              @click="seekTo(log.stamp)"
            >
              <div class="record__time">
                <span class="record__offset">{{ offsetText(log.stamp) }}</span>
                <span class="record__clock">{{ clockText(log.stamp) }}</span>
              </div>
              <div class="record__main">
                <div class="record__line">
                  <span class="record__type">{{ log.type || '日志' }}</span>
                </div>
                <div
                  class="record__text"
                  :title="logText(log)"
                >
                  {{ logText(log) }}
                </div>
              </div>
            </div>
          </ElScrollbar>
        </ElTabPane>

        <ElTabPane
          :label="`错误 ${errs.length}`"
          name="error"
        >
          <ElScrollbar height="560px">
            <div
              v-if="!errs.length"
              class="replay__empty"
            >
              暂无错误
            </div>
            <div
              v-for="err in errs"
              :key="err.stamp"
              class="record"
              :class="{ 'is-active': activeKey === err.stamp }"
              @click="seekTo(err.stamp)"
            >
              <div class="record__time">
                <span class="record__offset">{{ offsetText(err.stamp) }}</span>
                <span class="record__clock">{{ clockText(err.stamp) }}</span>
              </div>
              <div class="record__main">
                <div class="record__line">
                  <span class="record__type is-error">{{ err.data?.name || '错误' }}</span>
                </div>
                <div
                  class="record__text"
                  :title="errorText(err)"
                >
                  {{ errorText(err) }}
                </div>
              </div>
            </div>
          </ElScrollbar>
        </ElTabPane>
      </ElTabs>
    </div>
  </section>

  <section
    v-else
    class="replay replay--empty"
  >
    <ElEmpty description="暂无数据，请手动同步或一段时间后查询" />
    <div style="text-align: center;">
      <BcButton
        v-if="!session.isSyncing.value"
        type="primary"
        @click="handleSync"
      >
        同步
      </BcButton>
      <BcButton
        v-else
        type="info"
        loading
      >
        同步中
      </BcButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import RrwebPlayer from 'rrweb-player'
import 'rrweb-player/dist/style.css'
import { EventType, IncrementalSource, type eventWithTime } from '@rrweb/types'
import { type SessionApi, type SessionLog } from '@/apis'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { dayjs } from 'element-plus'
import { useH5Session } from './composable'

// rrweb-player 会在给定尺寸里等比缩放录屏画面（缩放比 = min(宽比, 高比)），
// 控制器固定占 80px，所以要按录制时的视口比例给尺寸，竖屏录屏才不会被压扁。
const CONTROLLER_HEIGHT = 80
const MAX_PLAYER_WIDTH = 480
const MIN_PLAYER_HEIGHT = 280
const MAX_PLAYER_HEIGHT = 620

/**
 * 回放防护：录屏页面（尤其是中途被 WAF/降级页重建过 head 的页面）可能把 rrweb 注入到回放
 * iframe 里的 `noscript { display: none }` 样式冲掉。快进等操作会重建 DOM，重建后再被录制的
 * 变更覆盖，<noscript> 里那句 "Please enable javascript to continue" 就会被直接渲染出来，
 * 看着像回放坏了。
 * 这里在快照重建和新增节点时给 noscript 打上内联 display:none —— 内联样式不依赖那张被冲掉的
 * 样式表，所以重建多少次都不会再露出来。
 */
const replayGuard = {
  name: 'hide-noscript',
  handler(
    event: eventWithTime,
    _isSync: boolean,
    context: { replayer: { iframe: HTMLIFrameElement, getMirror: () => { getNode: (id: number) => Node | null } } },
  ) {
    const doc = context?.replayer?.iframe?.contentDocument
    if (!doc) return

    if (event.type === EventType.FullSnapshot) {
      doc.querySelectorAll('noscript').forEach(hideNoscript)
      return
    }
    if (event.type === EventType.IncrementalSnapshot && event.data.source === IncrementalSource.Mutation) {
      event.data.adds.forEach((add) => {
        const node = context.replayer.getMirror().getNode(add.node.id)
        if (node?.nodeName?.toLowerCase() === 'noscript') {
          hideNoscript(node as HTMLElement)
        }
      })
    }
  },
}

function hideNoscript(node: HTMLElement) {
  node.style.display = 'none'
}

const props = defineProps({
  session: {
    type: String,
    required: true,
  },
})

const playerRef = useTemplateRef<HTMLElement>('refPlayer')
const panelRef = useTemplateRef<HTMLElement>('panelRef')
const player = shallowRef<RrwebPlayer>()
const activeTab = ref('net')
const apis = shallowRef<SessionApi[]>([])
const logs = shallowRef<SessionLog[]>([])
const errs = shallowRef<SessionLog[]>([])
const currentOffset = ref(0)
const playing = ref(false)
const eventsCount = ref(0)
const totalTime = ref(0)
const viewport = ref({ width: 0, height: 0 })

let startTime = 0
// 已经渲染过的数据：同步轮询会重复回调，避免重复创建播放器
let loadedEvents: eventWithTime[] | null = null

const session = useH5Session(props.session, onOpened)

onMounted(async () => {
  await session.getDetail()
})

onUnmounted(() => {
  closePlayer()
})

const playerSize = computed(() => {
  const width = Math.min(viewport.value.width || MAX_PLAYER_WIDTH, MAX_PLAYER_WIDTH)
  const rawHeight = viewport.value.width
    ? Math.round(width * viewport.value.height / viewport.value.width)
    : Math.round(width * 0.6)
  const height = Math.min(Math.max(rawHeight, MIN_PLAYER_HEIGHT), MAX_PLAYER_HEIGHT)
  return { width, height }
})

const stageStyle = computed(() => ({
  width: `${playerSize.value.width}px`,
  height: `${playerSize.value.height + CONTROLLER_HEIGHT}px`,
}))

const totalDurationText = computed(() => formatClock(totalTime.value))
const currentList = computed(() => {
  if (activeTab.value === 'log') return logs.value
  if (activeTab.value === 'error') return errs.value
  return apis.value
})

/** 当前播放时刻最近的一条记录（用于高亮 + 自动滚动） */
const activeKey = computed(() => {
  let key: number | undefined
  for (const item of currentList.value) {
    if (item.stamp - startTime <= currentOffset.value + 16) {
      key = item.stamp
    } else {
      break
    }
  }
  return key
})

watch(activeKey, async (key) => {
  if (key === undefined) return
  await nextTick()
  panelRef.value?.querySelector('.record.is-active')?.scrollIntoView({ block: 'nearest' })
})

function handleSync() {
  session.sync()
}

async function onOpened() {
  applyDetail(session.detail.value)

  const events = await session.events.value
  if (!events?.length) {
    return
  }
  if (player.value && loadedEvents === events) {
    return
  }

  startTime = events[0].timestamp
  totalTime.value = (events[events.length - 1]?.timestamp ?? startTime) - startTime
  eventsCount.value = events.length
  viewport.value = getViewport(events)

  // 播放器只创建一次：同步轮询会重复回调 onOpened
  await nextTick()
  const target = playerRef.value
  if (!target) {
    return
  }
  closePlayer()
  player.value = new RrwebPlayer({
    target,
    props: {
      width: playerSize.value.width,
      height: playerSize.value.height,
      events,
      autoPlay: true,
      speedOption: [1, 2, 4, 8],
      plugins: [replayGuard],
    },
  })
  loadedEvents = events
  currentOffset.value = 0
  playing.value = true

  player.value.addEventListener('ui-update-current-time', (evt: { payload: number }) => {
    currentOffset.value = evt?.payload ?? 0
  })
  player.value.addEventListener('ui-update-player-state', (evt: { payload: string }) => {
    playing.value = evt?.payload === 'playing'
  })
  player.value.addEventListener('finish', () => {
    playing.value = false
  })
}

function closePlayer() {
  try {
    player.value?.getReplayer().destroy()
  } catch (err) {
    console.warn('[@sepveneto/report-web] destroy replayer failed: ' + err)
  }
  player.value = undefined
  loadedEvents = null
}

/** 同步/轮询后刷新右侧列表，都按上报时间排序 */
function applyDetail(detail?: { net?: SessionApi[], log?: SessionLog[], err?: SessionLog[] }) {
  apis.value = sortByStamp(detail?.net)
  logs.value = sortByStamp(detail?.log)
  errs.value = sortByStamp(detail?.err)
}

function sortByStamp<T extends { stamp: number }>(list?: T[]) {
  return [...(list ?? [])].sort((a, b) => a.stamp - b.stamp)
}

function getViewport(events: eventWithTime[]) {
  let width = 0
  let height = 0
  events.forEach((event) => {
    if (event.type !== EventType.Meta) return
    width = Math.max(width, event.data.width)
    height = Math.max(height, event.data.height)
  })
  return { width, height }
}

/** 点击记录跳转到对应时刻 */
function seekTo(stamp?: number) {
  if (!player.value || !stamp || !startTime) return
  const offset = Math.max(0, Math.min(stamp - startTime, totalTime.value))
  currentOffset.value = offset
  try {
    player.value.goto(offset, true)
  } catch (err) {
    console.warn('[@sepveneto/report-web] seek replayer failed: ' + err)
  }
}

function clockText(stamp?: number) {
  if (!stamp) return '--:--:--'
  return dayjs(Number(stamp)).format('HH:mm:ss')
}

function offsetText(stamp?: number) {
  if (!stamp || !startTime) return '--:--'
  return `+${formatClock(Math.max(0, stamp - startTime))}`
}

function formatClock(ms?: number) {
  const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function durationText(ms?: number) {
  if (ms === undefined || ms === null) return '--'
  return `${Math.round(ms)}ms`
}

function simpleUrl(api: SessionApi) {
  if (!api.data?.url) {
    return api.data?.type || '--'
  }
  try {
    const url = new URL(api.data.url)
    return `${url.pathname}${url.search}`
  } catch {
    return api.data.url
  }
}

function logText(log: SessionLog) {
  const data = log?.data
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function errorText(err: SessionLog) {
  const { name, message } = err?.data ?? {}
  return [name, typeof message === 'string' ? message : JSON.stringify(message)]
    .filter(Boolean)
    .join(': ')
}

function methodClass(method?: string) {
  const name = String(method || 'get').toLowerCase()
  return `is-${['get', 'post', 'put', 'delete'].includes(name) ? name : 'other'}`
}

function statusClass(status?: number) {
  if (!status) return 'is-unknown'
  if (status < 300) return 'is-success'
  if (status < 400) return 'is-warning'
  return 'is-danger'
}
</script>

<style scoped>
.replay { display: flex; gap: 16px; align-items: flex-start; }
.replay--empty { display: flex; flex-direction: column; }
.replay__player {
  flex: none; padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
}
.replay__player-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.replay__title { font-size: 14px; font-weight: 600; }
.replay__state { font-size: 12px; color: var(--el-text-color-secondary); }
.replay__state.is-playing { color: var(--el-color-primary); }
.replay__stage { position: relative; overflow: hidden; border-radius: 8px; background: #f5f7fa; }
.replay__stage :deep(.rr-player) { box-shadow: none; border-radius: 8px; }
.replay__player-foot {
  display: flex; justify-content: space-between; gap: 8px;
  margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary);
}
.replay__hint { margin: 6px 0 0; font-size: 12px; color: var(--el-text-color-placeholder); }
.replay__panel { flex: 1; min-width: 0; }
.replay__tabs :deep(.el-tabs__header) { margin-bottom: 10px; }
.replay__empty { padding: 40px 0; text-align: center; font-size: 13px; color: var(--el-text-color-secondary); }

.record {
  display: flex; gap: 10px; padding: 8px 10px;
  border: 1px solid transparent; border-radius: 8px;
  cursor: pointer; transition: background-color .15s, border-color .15s;
}
.record + .record { margin-top: 4px; }
.record:hover { background: var(--el-fill-color-light); }
.record.is-active { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-7); }
.record__time { flex: none; width: 94px; display: flex; flex-direction: column; line-height: 1.35; }
.record__offset {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px; font-weight: 600; color: var(--el-color-primary);
}
.record__clock { font-size: 11px; color: var(--el-text-color-secondary); }
.record__main { flex: 1; min-width: 0; }
.record__line { display: flex; align-items: center; gap: 6px; }
.record__method { font-size: 11px; font-weight: 700; }
.record__method.is-get { color: #409eff; }
.record__method.is-post { color: #67c23a; }
.record__method.is-put { color: #e6a23c; }
.record__method.is-delete { color: #f56c6c; }
.record__method.is-other { color: var(--el-text-color-secondary); }
.record__status { padding: 0 6px; border-radius: 10px; font-size: 11px; line-height: 16px; }
.record__status.is-success { color: #67c23a; background: rgba(103, 194, 58, .12); }
.record__status.is-warning { color: #e6a23c; background: rgba(230, 162, 60, .12); }
.record__status.is-danger { color: #f56c6c; background: rgba(245, 108, 108, .12); }
.record__status.is-unknown { color: var(--el-text-color-secondary); background: var(--el-fill-color); }
.record__duration { margin-left: auto; font-size: 11px; color: var(--el-text-color-secondary); }
.record__type { font-size: 11px; font-weight: 600; color: var(--el-text-color-primary); }
.record__type.is-error { color: var(--el-color-danger); }
.record__text {
  margin-top: 2px; font-size: 12px; color: var(--el-text-color-regular);
  word-break: break-all;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.record__text--url { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
</style>
