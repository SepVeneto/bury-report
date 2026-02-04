<template>
  <h2>用户浏览路径</h2>

  <ElTimeline>
    <ElTimelineItem
      v-for="(item, index) in events"
      :key="index"
    >
      <div class="time">
        {{ item.time }}
      </div>
      <div
        v-if="item.type === 'AppLaunch'"
        class="node"
      >
        🚀 应用启动
      </div>
      <div
        v-else-if="item.type === 'Enter'"
        class="node"
      >
        进入页面{{ item.duration ? `（访问时间：${item.duration}ms）` : '' }}
      </div>
      <div v-else-if="item.type === 'PageUnload'">
        离开页面
      </div>
      <div>{{ item.path }}</div>
    </ElTimelineItem>
  </ElTimeline>
</template>

<script lang="ts" setup>
import type { MpRecord } from '@/apis'
import { getMpSession } from '@/apis'
import { shallowRef } from 'vue'
import { dayjs } from 'element-plus'

const props = defineProps<{ session: string }>()
console.log(props.session)

init()
type Event = { time: string, type: string, duration?: number, path?: string }
const events = shallowRef<Event[]>([])

function formatTime(timeStr: string) {
  if (isNaN(Number(timeStr))) {
    return timeStr
  }
  return dayjs(timeStr).format('HH:mm:ss')
}
async function init() {
  const res = await getMpSession(props.session)
  events.value = normalizeEvents(res.list)
}

function normalizeEvents(events: MpRecord[]) {
  const normalized: Event[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]

    if (event.data.type === 'AppLaunch') {
      normalized.push({
        type: 'AppLaunch',
        time: formatTime(event.device_time),
        path: event.data.data.path,
      })
    } else if (event.data.type === 'AppShow') {
      // 启动应用也会触发，和AppLaunch重复
      if (events[i - 1].data.type === 'AppLaunch') {
        continue
      } else {
        // 切回前台
        normalized.push({
          type: 'AppShow',
          time: formatTime(event.device_time),
          path: event.data.data.path,
        })
      }
    } else if (event.data.type === 'PageShow') {
      // 切回前台也触发，和AppShow重复
      // 页面初次加载也会触发，忽略
      if (['PageLoad', 'AppShow'].includes(events[i - 1].data.type)) {
        continue
      } else {
        // 后退，tabbar切换都会触发，视为重新进入页面
        normalized.push({
          type: 'ReEnter',
          time: formatTime(event.device_time),
          path: event.data.data.path,
        })
      }
    } else if (['PageUnload', 'PageHide'].includes(event.data.type)) {
      // 前进，tabbar切换都会触发，视为离开页面，只更新duration
      // 作为路由栈出入是成对的，所以把duration更新到上一个事件中
      normalized[normalized.length - 1].duration = event.data.data.duration
    } else if (event.data.type === 'PageLoad') {
      normalized.push({
        type: 'Enter',
        time: formatTime(event.device_time),
        path: event.data.data.path,
      })
    } else if (event.data.type === 'AppHide') {
      normalized.push({
        type: 'AppHide',
        time: formatTime(event.device_time),
      })
    } else {
      console.warn('未处理的事件', event)
    }
  }

  return normalized
}
</script>

<style scoped>
#chart { width: 100%; height: 300px; }
</style>
