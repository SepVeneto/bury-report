<template>
  <h2>用户浏览路径</h2>

  <ElTimeline>
    <ElTimelineItem
      v-for="(item, index) in events"
      :key="index"
      :type="getTimelineType(item.type)"
    >
      <div class="time">
        {{ item.time }}
      </div>

      <div
        class="content"
        :class="[getTimelineType(item.type)]"
      >
        <div
          v-if="item.type === 'AppLaunch'"
        >
          <div class="action-name">
            🚀 应用启动
          </div>
          <div>场景值：{{ item.scene }}</div>
          <div v-if="!isEmptyObject(item.referrer)">
            额外信息：{{ item.referrer }}
          </div>
        </div>
        <div
          v-else-if="item.type === 'Enter'"
          class="node"
        >
          <div>👀 进入页面</div>
        </div>
        <div
          v-else-if="item.type === 'ReEnter'"
          class="node"
        >
          重新进入页面
        </div>
        <div v-else-if="item.type === 'PageUnload'">
          离开页面
        </div>
        <div v-else-if="item.type === 'AppHide'">
          🔒 应用进入后台
        </div>
        <div v-else-if="item.type === 'AppShow'">
          📱 应用回到前台
        </div>
        <div class="path-text">
          {{ item.path }}
        </div>
        <div
          v-if="item.duration"
          class="duration-badge"
        >
          ⏱️ 停留了{{ (item.duration / 1000).toFixed(1) }}s
        </div>
      </div>
    </ElTimelineItem>
  </ElTimeline>
</template>

<script lang="ts" setup>
import type { MpPageUnload, MpRecord } from '@/apis'
import { getMpSession } from '@/apis'
import { shallowRef } from 'vue'
import { dayjs } from 'element-plus'

const props = defineProps<{ session: string }>()
console.log(props.session)

// type Event = {
//   time: string, type: string, duration?: number, path?: string
// }
type Event = {
  type: string,
  path?: string
  time?: string
  duration?: number
  scene?: number
  referrer?: Record<string, any>
}
const events = shallowRef<Event[]>([])

init()
function getTimelineType(type: string) {
  if (type === 'AppLaunch') {
    return 'success'
  } else if (type === 'AppHide') {
    return 'danger'
  } else if (type === 'AppShow') {
    return 'warning'
  } else {
    return 'primary'
  }
}
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
        path: genUrl(event.data.data.path, event.data.data.query),
        scene: event.data.data.scene,
        referrer: event.data.data.referrerInfo,
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
          type: 'Enter',
          time: formatTime(event.device_time),
          path: event.data.data.path,
          duration: 0,
        })
      }
    } else if (['PageUnload', 'PageHide'].includes(event.data.type)) {
      // 前进，tabbar切换都会触发，视为离开页面，只更新duration
      // 作为路由栈出入是成对的，所以把duration更新到上一个事件中
      normalized[normalized.length - 1].duration = (event.data as MpPageUnload).data.duration
    } else if (event.data.type === 'PageLoad') {
      normalized.push({
        type: 'Enter',
        time: formatTime(event.device_time),
        path: genUrl(event.data.data.path, event.data.data.query),
        duration: 0,
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

  console.log(normalized)
  return normalized
}

function isEmptyObject(data?: Record<string, any>) {
  if (!data) return true

  return Object.keys(data).length === 0
}

function genUrl(path: string, query: Record<string, any> = {}) {
  const qs = Object.entries(query).reduce<string[]>((acc, [key, value]) => {
    acc.push(`${key}=${value}`)
    return acc
  }, [])
  return path + (qs.length > 0 ? '?' : '') + qs.join('&')
}
</script>

<style scoped>
#chart { width: 100%; height: 300px; }

.timeline { position: relative; border-left: 2px solid #007bff; margin-left: 20px; padding: 0; list-style: none; }
.item { position: relative; margin-bottom: 30px; padding-left: 30px; }
.item::before {
    content: ""; position: absolute; left: -11px; top: 5px;
    width: 16px; height: 16px; border-radius: 50%; background: #007bff; border: 3px solid #fff;
}
.time { font-size: 13px; color: #888; margin-bottom: 5px; font-weight: 500; }
.content {
  background: #f8f9fa;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}
.content.success {
  background: var(--el-color-success-light-9);
}
.content.warning {
  background: var(--el-color-warning-light-9);
}
.content.danger {
  background: var(--el-color-danger-light-9);
}
.action-name { font-weight: bold; font-size: 15px; color: #0056b3; margin-bottom: 4px; display: block; }
.path-text { font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; color: #666; word-break: break-all; }
.duration-badge {
    display: inline-block; margin-top: 8px; padding: 2px 10px;
    background: #e7f3ff; color: #007bff; border-radius: 20px; font-size: 12px; font-weight: bold;
}
.tag-launch { background: #e6fffa; color: #2d8a7d; border-color: #b2f5ea; }
</style>
