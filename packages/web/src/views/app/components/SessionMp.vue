<template>
  <h2>用户浏览路径</h2>

  <ElTimeline v-if="session.inited.value && events.length > 0">
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
  <section
    v-else
    style="display: flex; flex-direction: column;"
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

<script lang="ts" setup>
import type { MpPageUnload, MpRecord } from '@/apis'
import { shallowRef } from 'vue'
import { dayjs } from 'element-plus'
import { useMpSession } from './composable'

const props = defineProps<{ session: string }>()

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
const session = useMpSession(props.session, async () => {
  const list = await session.events.value
  events.value = normalizeEvents(list) || []
})

session.getDetail()

function handleSync() {
  session.sync()
}
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
function formatTime(timeStr?: string) {
  if (timeStr === undefined || timeStr === null || String(timeStr).trim() === '') {
    return '--:--'
  }
  // 客户端上报的是毫秒时间戳字符串（如 "1756190000000"）。
  // dayjs 解析"纯数字字符串"时会按日期格式处理（把数字当年月日），拿到的是错误时间，
  // 所以先转成数字；非数字的格式化时间（"2026-01-01 00:00:00"）才交给 dayjs 解析字符串。
  const time = Number(timeStr)
  const date = isNaN(time) ? dayjs(timeStr) : dayjs(time)
  return date.isValid() ? date.format('HH:mm:ss') : String(timeStr)
}

function normalizeEvents(events: MpRecord[]) {
  const normalized: Event[] = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const track = event?.data

    // 只处理小程序页面轨迹；录屏等其它记录没有 data.type，直接跳过
    if (!track || typeof track.type !== 'string') {
      continue
    }

    // 首条事件没有"上一条"，旧实现直接读 events[i - 1].data 会抛错，
    // 导致整个时间轴渲染失败（表现为时间轴空白/显示异常）
    const prevType = events[i - 1]?.data?.type

    if (track.type === 'AppLaunch') {
      normalized.push({
        type: 'AppLaunch',
        time: formatTime(event.device_time),
        path: genUrl(track.data.path, track.data.query),
        scene: track.data.scene,
        referrer: track.data.referrerInfo,
      })
    } else if (track.type === 'AppShow') {
      // 启动应用、切回前台都会触发 AppShow，和 AppLaunch / PageShow 重复
      if (['AppLaunch', 'PageShow'].includes(prevType)) {
        continue
      } else {
        // 切回前台
        normalized.push({
          type: 'AppShow',
          time: formatTime(event.device_time),
          path: track.data.path,
        })
      }
    } else if (track.type === 'PageShow') {
      // 切回前台也触发，和AppShow重复
      // 页面初次加载也会触发，忽略
      if (['PageLoad', 'AppShow', 'AppLaunch'].includes(prevType)) {
        continue
      } else {
        // 后退，tabbar切换都会触发，视为重新进入页面
        normalized.push({
          type: 'ReEnter',
          time: formatTime(event.device_time),
          path: track.data.path,
          duration: 0,
        })
      }
    } else if (['PageUnload', 'PageHide'].includes(track.type)) {
      // 前进，tabbar切换都会触发，视为离开页面，只更新duration
      // 作为路由栈出入是成对的，所以把duration更新到对应的页面节点中
      applyDuration(normalized, track.data.path, (track as MpPageUnload).data.duration)
    } else if (track.type === 'PageLoad') {
      normalized.push({
        type: 'Enter',
        time: formatTime(event.device_time),
        path: genUrl(track.data.path, track.data.query),
        duration: 0,
      })
    } else if (track.type === 'AppHide') {
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

/**
 * 停留时长属于"最近一次进入的那个页面"，写回时有三个坑（都能在真实会话里复现）：
 * 1. 中间会夹着 AppHide / AppShow 节点，不能直接写到数组最后一条；
 * 2. PageHide 之后紧跟的 PageUnload 时长是 0（SDK 在 PageHide 时已经清掉进入时间），
 *    不能让 0 覆盖掉真实停留时长；
 * 3. 一次上报里可能同时有别的页面的 PageUnload，必须按路径匹配，不能挂到别人的节点上。
 */
function applyDuration(list: Event[], path?: string, duration?: number) {
  if (typeof duration !== 'number' || duration <= 0) {
    return
  }

  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (!['Enter', 'ReEnter'].includes(item.type)) {
      continue
    }
    if (path && !samePath(item.path, path)) {
      continue
    }
    // 同一个页面节点可能经历「前台停留 → 切后台 → 回到前台再停留」，
    // PageHide 的时长是分段上报的，累加才是这个页面节点真正的停留时长
    item.duration = (item.duration ?? 0) + duration
    return
  }
}

/** 节点上的路径带 query，离开事件的路径不带，比较时只比 path 部分 */
function samePath(nodePath?: string, path?: string) {
  if (!nodePath || !path) return true
  return nodePath.split('?')[0] === path.split('?')[0]
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
