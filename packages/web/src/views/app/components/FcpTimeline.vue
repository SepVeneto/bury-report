<template>
  <div class="fcp-timeline">
    <div class="timeline-legend">
      <ElTag
        type="success"
        effect="plain"
      >
        FCP 前 API 请求
      </ElTag>
      <ElTag
        type="warning"
        effect="plain"
      >
        FCP 前资源请求
      </ElTag>
      <span class="legend-note">鼠标悬停请求可查看详细计时信息</span>
    </div>

    <div
      v-if="requests.length"
      class="network-timeline"
    >
      <div class="timeline-head">
        <span>请求</span>
        <div class="head-waterfall">
          <span>0.00 s</span>
          <span
            class="fcp-label"
            :style="{ left: fcpLeft }"
          >
            FCP {{ formatSeconds(sample?.fcp || 0) }}
          </span>
        </div>
        <span class="time-head">耗时</span>
      </div>

      <div class="timeline-body">
        <ElTooltip
          v-for="(request, index) in requests"
          :key="`${request.url}-${request.startTime}-${index}`"
          placement="top"
          :show-after="100"
          effect="light"
        >
          <template #content>
            <div class="request-tooltip">
              <strong>{{ request.url }}</strong>
              <dl>
                <dt>类型</dt>
                <dd>{{ request.type }}</dd>
                <dt>关系</dt>
                <dd>{{ requestRelation(request) }}</dd>
                <dt>开始</dt>
                <dd>{{ formatSeconds(request.startTime) }}</dd>
                <dt>完成</dt>
                <dd>{{ formatSeconds(request.responseEnd) }}</dd>
                <dt>响应耗时</dt>
                <dd>{{ formatSeconds(request.responseTime) }}</dd>
                <dt>总耗时</dt>
                <dd>{{ formatSeconds(request.duration) }}</dd>
              </dl>
            </div>
          </template>

          <div
            class="request-row"
            :class="{ 'is-api': isApiRequest(request) }"
          >
            <div class="request-name">
              <ElTag
                size="small"
                effect="plain"
                :type="isApiRequest(request) ? 'success' : 'warning'"
              >
                {{ request.type }}
              </ElTag>
              <span :title="request.url">{{ shortUrl(request.url) }}</span>
            </div>
            <div class="waterfall-track">
              <span
                class="fcp-line"
                :style="{ left: fcpLeft }"
              />
              <span
                class="request-bar"
                :style="barStyle(request)"
              />
            </div>
            <span class="request-duration">{{ formatSeconds(request.duration) }}</span>
          </div>
        </ElTooltip>
      </div>
    </div>

    <ElEmpty
      v-else
      description="该 FCP 样本没有 FCP 前完成的请求"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FcpTimelineSample } from '@/apis'

const props = defineProps<{
  sample?: FcpTimelineSample
}>()

const requests = computed(() => {
  return [...(props.sample?.requests || [])]
    .filter(item => item.responseEnd <= (props.sample?.fcp || 0))
    .sort((a, b) => a.startTime - b.startTime)
})
const totalTime = computed(() => {
  return Math.max(
    props.sample?.fcp || 0,
    ...requests.value.map(item => item.responseEnd),
    1,
  )
})
const fcpLeft = computed(() => {
  return `${Math.min(100, (props.sample?.fcp || 0) / totalTime.value * 100)}%`
})

function barStyle(request: FcpTimelineSample['requests'][number]) {
  const left = Math.max(0, Math.min(100, request.startTime / totalTime.value * 100))
  const right = Math.max(left, Math.min(100, request.responseEnd / totalTime.value * 100))
  return {
    left: `${left}%`,
    width: `${Math.max(0.6, right - left)}%`,
  }
}

function isApiRequest(request: FcpTimelineSample['requests'][number]) {
  return ['fetch', 'xmlhttprequest', 'beacon'].includes(request.type.toLowerCase())
}

function requestRelation(request: FcpTimelineSample['requests'][number]) {
  return isApiRequest(request) ? 'FCP 前 API 请求' : 'FCP 前资源请求'
}

function formatSeconds(value: number) {
  return `${((Number(value) || 0) / 1000).toFixed(2)} s`
}

function shortUrl(url: string, max = 58) {
  const value = String(url || '')
  return value.length > max ? `…${value.slice(-max)}` : value
}
</script>

<style lang="scss" scoped>
.fcp-timeline {
  min-width: 0;
}

.timeline-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 10px;
  flex-wrap: wrap;
}

.legend-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.network-timeline {
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.timeline-head,
.request-row {
  display: grid;
  grid-template-columns: minmax(260px, 34%) minmax(360px, 1fr) 90px;
  align-items: center;
  column-gap: 12px;
}

.timeline-head {
  min-height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.head-waterfall {
  position: relative;
}

.fcp-label {
  position: absolute;
  top: 50%;
  color: var(--el-color-danger);
  font-size: 11px;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.time-head {
  text-align: right;
}

.timeline-body {
  max-height: 540px;
  overflow-y: auto;
}

.request-row {
  min-height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  cursor: default;
  transition: background 0.15s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.request-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;

  span:last-child {
    overflow: hidden;
    color: var(--el-text-color-primary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.waterfall-track {
  position: relative;
  height: 18px;
  border-radius: 3px;
  background:
    repeating-linear-gradient(
      to right,
      transparent 0,
      transparent calc(20% - 1px),
      var(--el-border-color-extra-light) calc(20% - 1px),
      var(--el-border-color-extra-light) 20%
    ),
    var(--el-fill-color-lighter);
}

.request-bar {
  position: absolute;
  top: 3px;
  height: 12px;
  min-width: 2px;
  border-radius: 2px;
  background: #e6a23c;
}

.request-row.is-api .request-bar {
  background: #67c23a;
}

.fcp-line {
  position: absolute;
  z-index: 2;
  top: -10px;
  bottom: -10px;
  width: 0;
  border-left: 1px dashed #f56c6c;
  pointer-events: none;
}

.request-duration {
  color: var(--el-text-color-regular);
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
}

.request-tooltip {
  width: min(440px, 70vw);

  > strong {
    display: block;
    overflow-wrap: anywhere;
    color: var(--el-text-color-primary);
    font-size: 12px;
    line-height: 1.5;
  }

  dl {
    display: grid;
    grid-template-columns: 70px 1fr;
    gap: 5px 10px;
    margin: 10px 0 0;
    font-size: 12px;
  }

  dt {
    color: var(--el-text-color-secondary);
  }

  dd {
    margin: 0;
    color: var(--el-text-color-primary);
  }
}

@media (max-width: 900px) {
  .timeline-head,
  .request-row {
    grid-template-columns: minmax(180px, 40%) minmax(220px, 1fr) 75px;
  }
}
</style>
