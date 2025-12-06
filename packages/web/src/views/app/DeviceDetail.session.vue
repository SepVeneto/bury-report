<template>
  <BcTable
    :config="tableConfig"
    :api="getList"
    pagination
  >
    <template #session="{ row }">
      <DeviceLink
        :uuid="row.session"
        @click="handleOpen(row)"
      />
    </template>
  </BcTable>

  <ElDialog
    v-model="show"
    destroy-on-close
    style="min-height: 700px;"
    @closed="onClosed"
  >
    <section style="display: flex;">
      <div ref="refPlayer" />
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
                [{{ timeFormat(api.stamp) }}] {{ simpleUrl(api) }}
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
                {{ api.data.duration.toFixed(2) }}ms
              </ElDescriptionsItem>
            </ElDescriptions>
          </ElCollapseItem>
        </ElCollapse>
      </ElScrollbar>
    </section>
  </ElDialog>
</template>

<script lang="ts" setup>
import type { SessionApi } from '@/apis'
import { getSessionDetail, getSessionEvents, getSessionList } from '@/apis'
import { nextTick, ref, shallowRef, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import RrwebPlayer from 'rrweb-player'
import 'rrweb-player/dist/style.css'
import { EventType, type eventWithTime } from '@rrweb/types'
import DeviceLink from './components/DeviceLink.vue'

const route = useRoute()
const playerRef = useTemplateRef('refPlayer')

const deviceId = route.params.id as string
const params = ref({
  page: 1,
  size: 20,
})
const tableConfig = shallowRef([
  { label: '会话', prop: 'session' },
  { label: '时间', prop: 'create_time' },
])
const show = ref(false)

function getList() {
  return getSessionList(deviceId, params.value)
}
const events = shallowRef<eventWithTime[]>([])
const apis = shallowRef<SessionApi[]>([])
let startTime = 0

async function handleOpen(row: any) {
  show.value = true
  const res = await getSessionDetail(row.session)
  events.value = await getSessionEvents(res.event_urls)
  console.log(events.value)
  startTime = events.value[0].timestamp
  apis.value = res.net

  nextTick().then(() => {
    onOpened()
  })
}

const player = shallowRef<RrwebPlayer>()
const currentStamp = ref(0)
function onOpened() {
  if (!playerRef.value) {
    return
  }
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

function onClosed() {
  player.value?.getReplayer().destroy()
}

function simpleUrl(api: SessionApi) {
  const url = new URL(api.data.url)
  return url.pathname
}

function timeFormat(stamp: number) {
  const offset = stamp - startTime
  const seconds = Math.floor(offset / 1000)
  const minutes = Math.floor(seconds / 60)

  return `${addZero(minutes)}:${addZero(seconds % 60)}`
}

function addZero(num: number) {
  return num < 10 ? `0${num}` : num
}

function isActiveApi(api: SessionApi) {
  const offset = api.stamp - startTime
  return currentStamp.value >= offset
}
</script>

<style lang="scss" scoped>
:global(.rr-player) {
  box-shadow: none;
}
.api-item {
  color: gray;
  &.active {
    color: black;
  }
}
</style>
