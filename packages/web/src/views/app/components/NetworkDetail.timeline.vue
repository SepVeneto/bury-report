<template>
  <div class="timeline-container">
    <div class="header">
      <ElTag type="primary">
        协议：{{ profile.protocol }}
      </ElTag>
      <ElTag :type="profile.socketReused ? 'success' : 'danger'">
        连接复用: {{ profile.socketReused ? '是' : '否' }}
      </ElTag>

      <ElTag
        v-if="typeof profile.estimate_nettype === 'number'"
        type="primary"
      >
        网络状态：{{ filterNetEnv(profile.estimate_nettype) }}
      </ElTag>

      <ElTag
        v-if="profile.rtt"
        type="info"
      >
        实时RTT: {{ profile.rtt }}ms
      </ElTag>
      <ElTag
        v-if="profile.httpRttEstimate"
        type="info"
      >
        协议层RTT: {{ profile.httpRttEstimate }}ms
      </ElTag>
      <ElTag
        v-if="profile.transportRttEstimate"
        type="info"
      >
        传输层RTT: {{ profile.transportRttEstimate }}ms
      </ElTag>

      <ElTag
        v-if="!profile.invokeStart"
        type="warning"
      >
        缺少invokeStart
      </ElTag>
    </div>
  </div>

  <div class="section-title">
    应用层感知 (XHR 统计)
  </div>
  <div class="row">
    <div class="label">
      感官耗时（总耗时）
    </div>
    <div class="bar-container">
      <div
        class="bar"
        style="left: 0; width: 100%; background: #333;"
      >
        {{ `${Math.round(realDuration)}ms` }}
      </div>
    </div>
    <div style="width: 50px; font-size: 11px; margin-left: 10px; color: #333">
      {{ realDuration.toFixed(1) }}ms
    </div>
  </div>

  <div class="row">
    <div class="label">
      应用层耗时
    </div>
    <div class="bar-container">
      <div
        class="bar"
        :style="`left: 0; width: ${(duration - total) / realDuration * 100}%; background: #6c5ce7;`"
      >
        {{ `${Math.round(duration - total)}ms` }}
      </div>
    </div>
    <div style="width: 50px; font-size: 11px; margin-left: 10px; color: #333">
      {{ (duration - total).toFixed(1) }}ms
    </div>
  </div>

  <div class="section-title">
    网络层明细
  </div>
  <div
    v-for="(item, index) in timeline"
    :key="index"
    class="row"
  >
    <div class="label">
      {{ item.name }}
    </div>
    <div class="bar-container">
      <div
        :class="`bar ${item.class} ${item.isZero ? 'zero-ms' : ''}`"
        :style="`left: ${item.left}%; width: ${item.width}%`"
      >
        {{ item.width > 2 ? `${Math.round(item.duration)}ms` : '' }}
      </div>
    </div>
    <div :style="`width: 50px; font-size: 11px; margin-left: 10px; color: ${item.isZero ? '#ccc' : '#333'}`">
      {{ item.displayValue }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

interface Profile {
  invokeStart: number;
  fetchStart: number;
  domainLookUpStart: number;
  domainLookUpEnd: number;
  connectStart: number;
  connectEnd: number;
  SSLconnectionStart: number;
  SSLconnectionEnd: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  protocol: string;
  socketReused: boolean;

  rtt?: number,
  transportRttEstimate?: number,
  httpRttEstimate?: number,
  estimate_nettype?: number,
}
const props = defineProps<{
  profile: Profile,
  duration: number,
}>()

const timeline = computed(() => [
  {
    name: 'Stalled（准备）',
    class: 'color-stall',
    ...genRow(props.profile.fetchStart, props.profile.requestStart),
  },
  {
    name: 'DNS（域名解析）',
    class: 'color-dns',
    ...genRow(props.profile.domainLookUpStart, props.profile.domainLookUpEnd),
  },
  {
    name: 'TCP（建立连接）',
    class: 'color-tcp',
    ...genRow(props.profile.connectStart, props.profile.SSLconnectionStart),
  },
  {
    name: 'SSL（安全连接）',
    class: 'color-ssl',
    ...genRow(props.profile.SSLconnectionStart, props.profile.SSLconnectionEnd),
  },
  {
    name: 'TTFB（服务器处理）',
    class: 'color-ttfb',
    ...genRow(props.profile.requestStart, props.profile.responseStart),
  },
  {
    name: 'Download（内容下载）',
    class: 'color-download',
    ...genRow(props.profile.responseStart, props.profile.responseEnd),
  },
])

const total = computed(() => {
  return props.profile.responseEnd - (props.profile.invokeStart || props.profile.fetchStart)
})

const realDuration = computed(() => {
  return Math.max(props.duration, total.value)
})

function genRow(start: number, end: number) {
  const duration = end - start
  const left = (start - (props.profile.invokeStart || props.profile.fetchStart)) / total.value * 100
  const isZero = duration <= 0
  const width = isZero ? 0 : duration / total.value * 100
  const displayValue = isZero ? '0ms' : (duration.toFixed(1) + 'ms')

  return {
    duration,
    left,
    width,
    displayValue,
    isZero,
  }
}

function filterNetEnv(type: number) {
  return [
    'unknown',
    'offline',
    'Slow 2G',
    '2G',
    '3G',
    '4G',
    '环境异常',
  ][type]
}
</script>

<style lang="scss" scoped>
.header { display: flex; gap: 10px; }
.timeline-container { width: 100%; padding: 25px; }
.row { display: flex; align-items: center; margin-bottom: 12px; height: 30px; }
.label { width: 140px; font-size: 13px; color: #333; font-weight: bold; }

/* 时间轴容器 */
.bar-container { flex: 1; position: relative; height: 100%; background: #eee; border-radius: 4px; border: 1px solid #e0e0e0; }

/* 进度条基础样式 */
.bar { position: absolute; height: 100%; top: 0; display: flex; align-items: center; padding-left: 5px; box-sizing: border-box; color: white; font-size: 10px; font-weight: bold; transition: width 0.3s; }

/* 针对 0ms 的样式：显示为一根竖线 */
// .zero-ms { border-left: 2px solid #999; width: 2px !important; }

.color-stall    { background-color: #bdc3c7; } /* Stalled */
.color-dns      { background-color: #a29bfe; } /* DNS */
.color-tcp      { background-color: #e17055; } /* TCP */
.color-ssl      { background-color: #fdcb6e; } /* SSL */
.color-ttfb     { background-color: #00c853; } /* TTFB (服务器处理) */
.color-download { background-color: #ff9800; } /* 下载 */
.section-title { font-size: 12px; color: #999; margin: 15px 0 8px 0; border-left: 3px solid #ddd; padding-left: 8px; }
</style>
