<template>
  <PageLayout :header="detail?.name || $route.meta.title">
    <ElTabs>
      <ElTabPane
        label="历史日志"
        lazy
      >
        <LogViewHistory />
      </ElTabPane>
      <ElTabPane
        label="错误记录"
        lazy
      >
        <LogViewError />
      </ElTabPane>
      <ElTabPane
        label="实时日志"
        lazy
      >
        <LogViewRealtime />
      </ElTabPane>
    </ElTabs>
  </PageLayout>
</template>

<script lang="ts" setup>
import { useRoute } from 'vue-router'
import { getApp } from '@/apis'
import type { App } from '@/apis'
import { ref } from 'vue'
import LogViewHistory from './LogView.history.vue'
import LogViewRealtime from './LogView.realtime.vue'
import LogViewError from './LogView.error.vue'

const route = useRoute()
const detail = ref<App | undefined>()

const id = route.params.id as string
id && getApp(id).then(res => {
  detail.value = res
})
</script>
