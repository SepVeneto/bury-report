<template>
  <section
    v-loading="loading"
    class="fcp-overview"
  >
    <ElCard
      shadow="never"
      class="filter-card"
    >
      <div class="filter-row">
        <div>
          <h2>FCP 大盘</h2>
          <p>观察整体首屏性能、慢 FCP 占比，以及影响最大的请求。</p>
        </div>
        <div class="filters">
          <ElDatePicker
            v-model="filters.range"
            type="daterange"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            range-separator="至"
            :clearable="false"
          />
          <span class="filter-label">慢 FCP 阈值</span>
          <ElInputNumber
            v-model="filters.threshold"
            :min="0"
            :max="600"
            :step="0.1"
            :precision="1"
            controls-position="right"
            class="threshold-input"
          />
          <span class="unit">s</span>
          <ElButton
            type="primary"
            :loading="loading"
            @click="loadAnalysis"
          >
            查询
          </ElButton>
        </div>
      </div>
      <div class="filter-hint">
        统计最近最多 {{ analysis?.sampleLimit || 5000 }} 条 FCP 记录。
        <template v-if="analysis?.sampled">
          当前时间范围共有 {{ analysis.summary.totalInWindow }} 条，已按最新数据采样。
        </template>
      </div>
    </ElCard>

    <ElEmpty
      v-if="analysis && !analysis.summary.total"
      class="empty-card"
      description="当前时间范围内暂无 FCP 数据"
    />

    <template v-if="analysis?.summary.total">
      <div class="summary-grid">
        <div class="summary-card">
          <span>FCP 样本</span>
          <strong>{{ analysis.summary.total.toLocaleString() }}</strong>
          <small>{{ analysis.summary.resourceCoverage }}% 含请求明细</small>
        </div>
        <div class="summary-card">
          <span>平均 FCP</span>
          <strong>{{ formatSeconds(analysis.summary.average) }}</strong>
          <small>P50 {{ formatSeconds(analysis.summary.p50) }}</small>
        </div>
        <div class="summary-card">
          <span>P75 FCP</span>
          <strong>{{ formatSeconds(analysis.summary.p75) }}</strong>
          <small>P90 {{ formatSeconds(analysis.summary.p90) }}</small>
        </div>
        <div class="summary-card warning">
          <span>慢 FCP 占比</span>
          <strong>{{ analysis.summary.slowRate }}%</strong>
          <small>
            {{ analysis.summary.slowCount.toLocaleString() }} 条超过
            {{ formatSeconds(analysis.summary.slowThreshold) }}
          </small>
        </div>
        <div class="summary-card">
          <span>P95 FCP</span>
          <strong>{{ formatSeconds(analysis.summary.p95) }}</strong>
          <small>最大 {{ formatSeconds(analysis.summary.max) }}</small>
        </div>
      </div>

      <ElAlert
        :closable="false"
        type="info"
        show-icon
        class="insight"
        :title="insight"
      />

      <div class="chart-grid">
        <ElCard
          shadow="never"
          class="chart-card"
        >
          <template #header>
            <div class="card-header">
              <span>FCP 趋势</span>
              <small>柱状为样本量，折线为每日 P75</small>
            </div>
          </template>
          <div
            ref="trendRef"
            class="chart"
          />
        </ElCard>

        <ElCard
          shadow="never"
          class="chart-card"
        >
          <template #header>
            <div class="card-header">
              <span>FCP 分布</span>
              <small>优先关注 2 秒以上的长尾</small>
            </div>
          </template>
          <div
            ref="distributionRef"
            class="chart"
          />
        </ElCard>
      </div>

      <div class="analysis-grid">
        <ElCard
          shadow="never"
          class="chart-card"
        >
          <template #header>
            <div class="card-header">
              <span>请求耗时排行</span>
              <small>按请求的平均总耗时排序</small>
            </div>
          </template>
          <div
            v-show="analysis.resources.length"
            ref="resourceRef"
            class="resource-chart"
          />
          <ElEmpty
            v-show="!analysis.resources.length"
            description="暂无请求耗时明细"
          />
        </ElCard>

        <ElCard
          shadow="never"
          class="chart-card"
        >
          <template #header>
            <div class="card-header">
              <span>请求影响排行</span>
              <small>出现次数与关联慢 FCP 用于判断影响范围</small>
            </div>
          </template>
          <ElTable
            :data="analysis.resources.slice(0, 10)"
            size="small"
            max-height="380"
          >
            <ElTableColumn
              label="请求"
              min-width="240"
            >
              <template #default="{ row }">
                <div class="request-name">
                  <ElTag
                    size="small"
                    effect="plain"
                  >
                    {{ row.type }}
                  </ElTag>
                  <ElTooltip
                    :content="row.url"
                    placement="top"
                  >
                    <span>{{ shortUrl(row.url) }}</span>
                  </ElTooltip>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="平均耗时"
              width="105"
            >
              <template #default="{ row }">
                {{ formatSeconds(row.averageDuration) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              label="慢 FCP 关联"
              width="120"
            >
              <template #default="{ row }">
                {{ row.slowRate }}%
                <span class="muted">({{ row.count }})</span>
              </template>
            </ElTableColumn>
          </ElTable>
        </ElCard>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { init } from 'echarts'
import type { EChartsType } from 'echarts'
import { getFcpAnalysis } from '@/apis'
import type { FcpAnalysis, FcpResourceImpact } from '@/apis'

const loading = ref(false)
const analysis = ref<FcpAnalysis>()
const trendRef = ref<HTMLElement>()
const distributionRef = ref<HTMLElement>()
const resourceRef = ref<HTMLElement>()
const trendChart = shallowRef<EChartsType>()
const distributionChart = shallowRef<EChartsType>()
const resourceChart = shallowRef<EChartsType>()

const filters = ref({
  range: [
    formatInputDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)),
    formatInputDate(new Date()),
  ],
  threshold: 2.5,
})

const insight = computed(() => {
  const data = analysis.value
  if (!data?.summary.total) return ''
  const top = data.resources[0]
  if (!top) {
    return `当前样本中有 ${data.summary.resourceCoverage}% 带请求明细，暂时无法判断具体请求影响。`
  }
  return `最慢请求为 ${shortUrl(top.url)}，平均耗时 ${formatSeconds(top.averageDuration)}；该请求关联的慢 FCP 占比为 ${top.slowRate}%。`
})

onMounted(() => {
  window.addEventListener('resize', resizeCharts)
  loadAnalysis()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  disposeCharts()
})

async function loadAnalysis() {
  loading.value = true
  try {
    disposeCharts()
    analysis.value = await getFcpAnalysis({
      timerange: filters.value.range,
      threshold: filters.value.threshold * 1000,
    })
    await nextTick()
    initCharts()
    renderCharts()
  } catch {
    analysis.value = undefined
  } finally {
    loading.value = false
  }
}

function initCharts() {
  const data = analysis.value
  if (!data?.summary.total) return
  if (!trendChart.value && trendRef.value) trendChart.value = init(trendRef.value)
  if (!distributionChart.value && distributionRef.value) distributionChart.value = init(distributionRef.value)
  if (!resourceChart.value && resourceRef.value && data.resources.length) resourceChart.value = init(resourceRef.value)
}

function renderCharts() {
  const data = analysis.value
  if (!data) return

  trendChart.value?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['样本量', 'P75 FCP'] },
    grid: { left: 48, right: 56, top: 46, bottom: 34 },
    xAxis: {
      type: 'category',
      data: data.trend.map(item => item.date),
      axisLabel: { hideOverlap: true },
    },
    yAxis: [
      { type: 'value', name: '样本量', minInterval: 1 },
      { type: 'value', name: 'FCP (s)', axisLabel: { formatter: (value: number) => formatAxisSeconds(value) } },
    ],
    series: [
      {
        name: '样本量',
        type: 'bar',
        data: data.trend.map(item => item.count),
        itemStyle: { color: '#a7c7ff', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: 'P75 FCP',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        data: data.trend.map(item => item.p75),
        itemStyle: { color: '#f56c6c' },
        areaStyle: { color: 'rgba(245, 108, 108, 0.12)' },
      },
    ],
  }, true)

  distributionChart.value?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 42, right: 20, top: 24, bottom: 34 },
    xAxis: {
      type: 'category',
      data: data.distribution.map(item => item.label),
    },
    yAxis: { type: 'value', name: '样本量', minInterval: 1 },
    series: [{
      type: 'bar',
      barMaxWidth: 48,
      data: data.distribution.map((item, index) => ({
        value: item.count,
        itemStyle: {
          color: index < 2 ? '#67c23a' : index === 2 ? '#e6a23c' : '#f56c6c',
          borderRadius: [5, 5, 0, 0],
        },
      })),
    }],
  }, true)

  const resources = data.resources.slice(0, 10).reverse()
  resourceChart.value?.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const resource = params[0]?.data?.resource as FcpResourceImpact | undefined
        if (!resource) return ''
        return [
          shortUrl(resource.url, 100),
          `平均总耗时：${formatSeconds(resource.averageDuration)}`,
          `平均响应耗时：${formatSeconds(resource.averageResponseTime)}`,
          `出现次数：${resource.count}`,
          `关联慢 FCP：${resource.slowRate}%`,
        ].join('<br>')
      },
    },
    grid: { left: 24, right: 48, top: 12, bottom: 22, containLabel: true },
    xAxis: { type: 'value', name: '耗时（s）', axisLabel: { formatter: (value: number) => formatAxisSeconds(value) } },
    yAxis: {
      type: 'category',
      data: resources.map(item => shortUrl(item.url, 36)),
      axisLabel: { width: 230, overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 18,
      data: resources.map(item => ({
        value: item.averageDuration,
        resource: item,
        itemStyle: {
          color: item.averageDuration >= 1000 ? '#f56c6c' : '#409eff',
          borderRadius: [0, 5, 5, 0],
        },
      })),
      label: {
        show: true,
        position: 'right',
        formatter: (params: any) => formatSeconds(Number(params.value)),
      },
    }],
  }, true)
}

function disposeCharts() {
  trendChart.value?.dispose()
  distributionChart.value?.dispose()
  resourceChart.value?.dispose()
  trendChart.value = undefined
  distributionChart.value = undefined
  resourceChart.value = undefined
}

function resizeCharts() {
  trendChart.value?.resize()
  distributionChart.value?.resize()
  resourceChart.value?.resize()
}

function formatSeconds(value: number) {
  return `${((Number(value) || 0) / 1000).toFixed(2)} s`
}

function formatAxisSeconds(value: number) {
  return `${(Number(value) / 1000).toFixed(1)}`
}

function shortUrl(url: string, max = 42) {
  const value = String(url || '')
  return value.length > max ? `…${value.slice(-max)}` : value
}

function formatInputDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
</script>

<style lang="scss" scoped>
.fcp-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;

  h2 {
    margin: 0 0 8px;
    color: var(--el-text-color-primary);
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-label {
  color: var(--el-text-color-regular);
  font-size: 13px;
  white-space: nowrap;
}

.threshold-input {
  width: 120px;
}

.unit,
.filter-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.filter-hint {
  margin-top: 12px;
}

.empty-card {
  min-height: 300px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 14px;
}

.summary-card {
  display: flex;
  min-height: 108px;
  padding: 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  box-sizing: border-box;
  flex-direction: column;
  justify-content: center;

  span {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  strong {
    margin: 7px 0 5px;
    color: var(--el-text-color-primary);
    font-size: 25px;
    line-height: 1.1;
  }

  small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  &.warning {
    border-color: var(--el-color-danger-light-7);
    background: var(--el-color-danger-light-9);
  }
}

.insight {
  border-radius: 8px;
}

.chart-grid,
.analysis-grid {
  display: grid;
  gap: 16px;
}

.chart-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.analysis-grid {
  grid-template-columns: minmax(0, 1.25fr) minmax(420px, 1fr);
}

.chart-card {
  min-width: 0;
}

.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;

  span {
    color: var(--el-text-color-primary);
    font-size: 15px;
    font-weight: 600;
  }

  small {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
}

.chart {
  height: 310px;
}

.resource-chart {
  height: 360px;
}

.request-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 1200px) {
  .filter-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .summary-grid {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }

  .analysis-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .summary-grid,
  .chart-grid {
    grid-template-columns: 1fr;
  }

  .filters {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
