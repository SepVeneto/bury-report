<template>
  <PageLayout :header="detail?.name || $route.meta.title">
    <div style="display: flex; justify-content: space-around; margin-top: 20px;">
      <div class="statistics-card">
        <div>累计打开次数</div>
        <div>{{ statistics?.totalOpen || '-' }}</div>
      </div>
      <div class="statistics-card">
        <div>昨日打开次数</div>
        <div>{{ statistics?.yesterdayTotalOpen || '-' }}</div>
      </div>
      <div class="statistics-card">
        <div>累计打开人数</div>
        <div>{{ statistics?.total || '-' }}</div>
      </div>
      <div class="statistics-card">
        <div>昨日打开人数</div>
        <div>{{ statistics?.yesterdayTotal || '-' }}</div>
      </div>
    </div>
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
import { useRoute, useRouter } from 'vue-router'
import { getApp, getAppStatistics } from '@/apis'
import type { App, AppStatistics } from '@/apis'
import { ref } from 'vue'
import LogViewHistory from './LogView.history.vue'
import LogViewRealtime from './LogView.realtime.vue'
import LogViewError from './LogView.error.vue'

const route = useRoute()
const router = useRouter()
const detail = ref<App | undefined>()
const statistics = ref<AppStatistics | undefined>()

const id = route.params.id as string
if (!id) {
  router.back()
}
getApp(id).then(res => {
  detail.value = res
})
getAppStatistics(id).then(res => {
  statistics.value = res
})
</script>

<style lang="scss" scoped>
.statistics-card {
  width: 300px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  border: 1px solid #ccc;
  padding: 20px;
}
</style>
