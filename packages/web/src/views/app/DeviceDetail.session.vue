<template>
  <BcSearch
    v-model="params"
    :config="searchConfig"
    @reset="params.session = undefined"
  />
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
    <template #operate="{ row }">
      <BcButton
        text
        type="primary"
        @click="handleSync(row.session)"
      >
        同步
      </BcButton>
    </template>
  </BcTable>

  <ElDialog
    v-model="show"
    destroy-on-close
    style="min-height: 700px;"
    @closed="onClosed"
  >
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
                [{{ timeFormat(log.stamp) }}] {{ JSON.stringify(log.data) }}
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
            <ElCollapse>
              <ElCollapseItem
                v-for="(err, index) in errs"
                :key="index"
              >
                <template #title>
                  <div
                    class="api-item"
                    :class="[isActiveApi(err) && 'active']"
                  >
                    [{{ timeFormat(err.stamp) }}] {{ `${err.data.name}: ${JSON.stringify(err.data.message)}` }}
                  </div>
                </template>
              </ElCollapseItem>
            </ElCollapse>
          </ElScrollbar>
        </ElTabPane>
      </ElTabs>
    </section>
  </ElDialog>
</template>

<script lang="ts" setup>
import type { SessionApi, SessionLog } from '@/apis'
import { getSessionDetail, getSessionEvents, getSessionList, syncSession } from '@/apis'
import { nextTick, ref, shallowRef, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import RrwebPlayer from 'rrweb-player'
import 'rrweb-player/dist/style.css'
import { EventType, type eventWithTime } from '@rrweb/types'
import DeviceLink from './components/DeviceLink.vue'
import { ElMessage } from 'element-plus'

const route = useRoute()
const playerRef = useTemplateRef('refPlayer')

const deviceId = route.params.id as string
const params = ref<{ session?: string, page: number, size: number }>({
  page: 1,
  size: 20,
})
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'session', name: '会话ID' },
])
const tableConfig = shallowRef([
  { label: '会话', prop: 'session' },
  { label: '时间', prop: 'create_time' },
  { label: '操作', prop: 'operate' },
])
const show = ref(false)

if (route.query.session) {
  params.value.session = route.query.session as string
}

function handleSync(session: string) {
  syncSession(session)
}

function getList() {
  return getSessionList(deviceId, params.value)
}
const events = shallowRef<eventWithTime[]>([])
const apis = shallowRef<SessionApi[]>([])
const logs = shallowRef<SessionLog[]>([])
const errs = shallowRef<SessionLog[]>([])
let startTime = 0

async function handleOpen(row: any) {
  show.value = true
  const res = await getSessionDetail(row.session)
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
}

const player = shallowRef<RrwebPlayer>()
const currentStamp = ref(0)
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

function onClosed() {
  player.value?.getReplayer().destroy()
}

function simpleUrl(api: SessionApi) {
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
