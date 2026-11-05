<template>
  <div
    v-if="isPerf"
    v-loading="loading"
    class="perf-info-log"
  >
    <template v-if="sample">
      <ElTabs
        v-model="activeTab"
        type="border-card"
        class="perf-tabs"
      >
        <ElTabPane
          label="时间轴"
          name="timeline"
          lazy
        >
          <FcpTimeline :sample="sample" />
        </ElTabPane>
        <ElTabPane
          :label="`资源记录 ${sample.requests.length}`"
          name="resources"
          lazy
        >
          <ElTable
            :data="sample.requests"
            size="small"
            max-height="440"
          >
            <ElTableColumn
              label="类型"
              width="120"
            >
              <template #default="{ row: request }">
                <ElTag
                  size="small"
                  effect="plain"
                >
                  {{ request.type }}
                </ElTag>
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="阶段"
              width="110"
            >
              <template #default="{ row: request }">
                {{ formatPhase(request.phase, request.responsePhase) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="请求地址"
              min-width="320"
              show-overflow-tooltip
            >
              <template #default="{ row: request }">
                <span class="request-url">{{ request.url }}</span>
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="开始时间"
              width="110"
            >
              <template #default="{ row: request }">
                {{ formatSeconds(request.startTime) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="结束时间"
              width="110"
            >
              <template #default="{ row: request }">
                {{ formatSeconds(request.responseEnd) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="响应耗时"
              width="110"
            >
              <template #default="{ row: request }">
                {{ formatSeconds(request.responseTime) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="总耗时"
              width="100"
            >
              <template #default="{ row: request }">
                {{ formatSeconds(request.duration) }}
              </template>
            </ElTableColumn>
          </ElTable>
        </ElTabPane>
      </ElTabs>
    </template>

    <ElEmpty
      v-else-if="!loading"
      description="PERF_INFO 详情加载失败"
    />
  </div>
  <ElEmpty
    v-else
    description="该日志不是 PERF_INFO"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { FcpTimelineSample } from '@/apis'
import { getFcpInfoDetail } from '@/apis'
import FcpTimeline from './FcpTimeline.vue'

const props = defineProps<{
  infoId: string
  logType?: string
}>()

const activeTab = ref('timeline')
const loading = ref(false)
const sample = shallowRef<FcpTimelineSample>()
const isPerf = computed(() => props.logType === '__BR_PERF_INFO__')

onMounted(loadDetail)

async function loadDetail() {
  if (!isPerf.value) return
  loading.value = true
  try {
    sample.value = await getFcpInfoDetail(props.infoId)
  } catch {
    sample.value = undefined
  } finally {
    loading.value = false
  }
}

function formatSeconds(value: number | null | undefined) {
  if (value === null || value === undefined) return '不可用'
  return `${((Number(value) || 0) / 1000).toFixed(2)} s`
}

function formatPhase(phase: string, responsePhase: string) {
  const start = phase === 'before-fcp'
    ? '前'
    : phase === 'after-fcp'
      ? '后'
      : '未知'
  const end = responsePhase === 'before-fcp'
    ? '前'
    : responsePhase === 'after-fcp'
      ? '后'
      : '未知'
  return `发起${start} / 完成${end}`
}
</script>

<style lang="scss" scoped>
.perf-info-log {
  display: flex;
  min-height: 120px;
  padding: 10px 20px 16px;
  flex-direction: column;
  gap: 12px;
}

:deep(.el-descriptions) {
  margin-bottom: 4px;
}

.perf-tabs {
  width: 100%;
}

.request-url {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
