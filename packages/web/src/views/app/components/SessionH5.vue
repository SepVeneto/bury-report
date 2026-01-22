<template>
  <section style="display: flex;">
    <div style="width: 500px;">
      <div ref="refPlayer" />
    </div>
    <ElTabs
      type="card"
      model-value="net"
    >
      <ElTabPane
        name="net"
        label="网络"
      >
        <ElScrollbar
          height="700px"
          style="flex: 1;"
        >
          <ElCollapse>
            <ElCollapseItem
              v-for="(api, index) in apis"
              :key="index"
            >
              <template #title>
                <div
                  class="api-item"
                  :class="[isActiveApi(api) && 'active']"
                >
                  <span class="log-stamp">[{{ timeFormat(api.stamp) }}]</span>
                  <span>{{ simpleUrl(api) }}</span>
                </div>
              </template>
              <ElDescriptions :column="1">
                <ElDescriptionsItem label="请求URL">
                  {{ api.data.url }}
                </ElDescriptionsItem>
                <ElDescriptionsItem label="状态">
                  {{ api.data.status }}
                </ElDescriptionsItem>
                <ElDescriptionsItem label="耗时">
                  {{ api.data.duration?.toFixed(2) || '--' }}ms
                </ElDescriptionsItem>
              </ElDescriptions>
            </ElCollapseItem>
          </ElCollapse>
        </ElScrollbar>
      </ElTabPane>

      <ElTabPane
        name="log"
        label="日志"
      >
        <ElScrollbar
          height="700px"
          style="flex: 1;"
        >
          <div
            v-for="(log, index) in logs"
            :key="index"
          >
            <div
              class="api-item"
              :class="[isActiveApi(log) && 'active']"
            >
              <div class="log-stamp">
                [{{ timeFormat(log.stamp) }}]
              </div>
              <div>{{ JSON.stringify(log.data) }}</div>
            </div>
          </div>
        </ElScrollbar>
      </ElTabPane>

      <ElTabPane
        name="error"
        label="错误"
      >
        <ElScrollbar
          height="700px"
          style="flex: 1;"
        >
          <div
            v-for="(err, index) in errs"
            :key="index"
          >
            <div
              class="api-item"
              :class="[isActiveApi(err) && 'active']"
            >
              <div class="log-stamp">
                [{{ timeFormat(err.stamp) }}]
              </div>
              <div>{{ `${err.data.name}: ${JSON.stringify(err.data.message)}` }}</div>
            </div>
          </div>
        </ElScrollbar>
      </ElTabPane>
    </ElTabs>
  </section>
</template>

<script setup lang="ts">
import RrwebPlayer from 'rrweb-player'
import 'rrweb-player/dist/style.css'
import { EventType, type eventWithTime } from '@rrweb/types'
import type { SessionApi, SessionLog } from '@/apis'
import { getSessionDetail, getSessionEvents } from '@/apis'
import { nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef } from 'vue'
import { ElMessage } from 'element-plus'

const playerRef = useTemplateRef('refPlayer')
const currentStamp = ref(0)

const events = shallowRef<eventWithTime[]>([])
const apis = shallowRef<SessionApi[]>([])
const logs = shallowRef<SessionLog[]>([])
const errs = shallowRef<SessionLog[]>([])
const player = shallowRef<RrwebPlayer>()
let startTime = 0

const props = defineProps({
  session: {
    type: String,
    required: true,
  },
})

onMounted(async () => {
  const res = await getSessionDetail(props.session)
  events.value = await getSessionEvents(res.event_urls)
  apis.value = res.net
  logs.value = res.log
  errs.value = res.err
  apis.value.sort((a, b) => a.stamp - b.stamp)
  logs.value.sort((a, b) => a.stamp - b.stamp)
  errs.value.sort((a, b) => a.stamp - b.stamp)
  nextTick().then(() => {
    onOpened()
  })
})

onUnmounted(() => {
  onClosed()
})

function onClosed() {
  player.value?.getReplayer().destroy()
}
function onOpened() {
  if (!playerRef.value) {
    return
  }
  if (events.value.length === 0) {
    ElMessage.warning('缺少会话数据，请稍候重试或手动同步')
    return
  }
  startTime = events.value[0].timestamp
  player.value = new RrwebPlayer({
    target: playerRef.value,
    props: {
      width: 500,
      height: 500,
      events: events.value,
      // plugins: [{
      //   handler(event, isSync, context) {
      //     if (event.type === '')
      //   }
      // }]
    },
  })
  player.value.addEventListener('custom-event', (evt) => {
    console.log('custom', evt)
  })
  player.value.addEventListener('event-cast', (evt) => {
    switch (evt.type) {
      case EventType.Plugin: {
        if (evt.data.plugin === '@sepveneto/enhanced') {
          switch (evt.data.payload.event) {
            case 'visibilitychange': {
              console.log(evt.data.payload.action)
            }
          }
        }
      }
    }
  })
  player.value.addEventListener('ui-update-current-time', (evt) => {
    currentStamp.value = evt.payload
  })
}

function simpleUrl(api: SessionApi) {
  if (!api.data.url) {
    return api.data.type
  }
  const url = new URL(api.data.url)
  return url.pathname
}

function timeFormat(stamp?: number) {
  if (!stamp) return '--:--'

  const flag = stamp > startTime
  const offset = Math.abs(stamp - startTime)
  const seconds = Math.floor(offset / 1000)
  const minutes = Math.floor(seconds / 60)

  return `${flag ? '' : '-'}${addZero(minutes)}:${addZero(seconds % 60)}`
}

function addZero(num: number) {
  return num < 10 ? `0${num}` : num
}

function isActiveApi(api: SessionApi) {
  const offset = api.stamp - startTime
  return currentStamp.value >= offset
}
</script>
