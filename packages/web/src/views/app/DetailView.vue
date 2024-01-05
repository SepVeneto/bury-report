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

    <div style="display: flex; margin-top: 20px;">
      <div
        ref="totalOpenLineRef"
        style="width: 400px; height: 300px;"
      />
      <div
        ref="yesterdayOpenLineRef"
        style="width: 400px; height: 300px;"
      />

      <div
        ref="deviceTypeRef"
        style="width: 400px; height: 300px;"
      />
      <div
        ref="deviceBrandRef"
        style="width: 400px; height: 300px;"
      />
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
import { getApp, getAppChart, getAppStatistics } from '@/apis'
import type { App, AppStatistics } from '@/apis'
import { onMounted, ref } from 'vue'
import LogViewHistory from './LogView.history.vue'
import LogViewRealtime from './LogView.realtime.vue'
import LogViewError from './LogView.error.vue'
import { useLine, usePie } from './charts'

const route = useRoute()
const router = useRouter()
const detail = ref<App | undefined>()
const statistics = ref<AppStatistics | undefined>()
const totalOpenLineRef = ref()
const yesterdayOpenLineRef = ref()
const deviceTypeRef = ref()
const deviceBrandRef = ref()
let totalLine: ReturnType<typeof useLine>
let yesterdayLine: ReturnType<typeof useLine>
let deviceType: ReturnType<typeof usePie>
let deviceBrand: ReturnType<typeof usePie>

onMounted(() => {
  totalLine = useLine(totalOpenLineRef.value, '累计打开趋势')
  yesterdayLine = useLine(yesterdayOpenLineRef.value, '昨日打开趋势')
  deviceType = usePie(deviceTypeRef.value, '设备类型统计')
  deviceBrand = usePie(deviceBrandRef.value, '设备品牌统计')
})

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
getAppChart(id, 'totalOpenTrend').then(res => {
  const xAxis = []
  const data = []
  res.forEach(item => {
    xAxis.push(item.date)
    data.push(item.count)
  })
  totalLine.updateConfig(xAxis, data)
})
getAppChart(id, 'yesterdayOpenTrend').then(res => {
  const xAxis = []
  const data = []
  res.forEach(item => {
    xAxis.push(item.date)
    data.push(item.count)
  })
  yesterdayLine.updateConfig(xAxis, data)
})
getAppChart(id, 'deviceType').then(res => {
  const _res = Object.entries(res).map(([key, value]) => {
    return { value, name: key }
  })
  deviceType.updateConfig(_res)
})
getAppChart(id, 'deviceBrand').then(res => {
  const _res = Object.entries(res).map(([key, value]) => {
    return { value, name: key }
  })
  deviceBrand.updateConfig(_res)
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
