<template>
  <PageLayout :header="title">
    <ElScrollbar
      ref="scrollbarRef"
      height="calc(100vh - 106px - var(--layout-outer-padding) - var(--layout-inner-padding) - 56px)"
      noresize
      style="background: black; color: #fff;"
      view-style="padding: 10px; position: relative;"
    >
      <ElIcon
        style="position: absolute; right: 20px; top: 20px; cursor: pointer;"
        @click="handleFullScreen"
      >
        <IconFullScreen />
      </ElIcon>
      <div
        v-for="(record, index) in records"
        :key="index"
        style="margin-bottom: 10px;"
      >
        {{ record }}
      </div>
    </ElScrollbar>
  </PageLayout>
</template>

<script lang="ts" setup>
import { nextTick, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getApp, readLogs } from '@/apis'
import type { ScrollbarInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { FullScreen as IconFullScreen } from '@element-plus/icons-vue'

const route = useRoute()
const records = ref<string[]>([])
const scrollbarRef = ref<ScrollbarInstance>()
const title = ref('')

getApp(route.params.id as string).then((res) => {
  title.value = res.name
})
const ws = readLogs(route.params.id as string, async (_ws, evt) => {
  if (evt.data === 'CONNECT') {
    console.log('建立连接成功')
  }
  switch (evt.data) {
    case 'CONNECT':
      records.value.push('建立连接成功')
      break
    case 'PONG':
      break
    default:
    {
      const { create_time, ...params } = JSON.parse(evt.data)
      records.value.push(`${new Date(create_time).toLocaleString()}  ${JSON.stringify(params)}`)
    }
  }
  await nextTick()
  scrollbarRef.value?.setScrollTop(Number.MAX_SAFE_INTEGER)
}, () => {
  records.value.push('与服务器连接中断!')
}, () => {
  ElMessage.error('日志连接建立失败, 请稍候重试...')
})
onUnmounted(() => {
  ws?.close()
})

function handleFullScreen() {
  const isFull = !!document.fullscreenElement
  if (isFull) {
    document.exitFullscreen()
  } else {
    scrollbarRef.value?.$el.requestFullscreen()
  }
}
</script>
