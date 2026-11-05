<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <template #union>
        <UnionSearch v-model="params" />
      </template>
    </bc-search>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      :api="getList"
    >
      <template #expand="{ row }">
        <PerfInfoLog
          :info-id="row.id"
          :log-type="row.type"
        />
      </template>
      <template #uuid="{ row }">
        <DeviceLink
          :uuid="row.uuid"
          @click="handleDetail(row.uuid)"
        />
      </template>
      <template #session="{ row }">
        <DeviceLink
          :uuid="row.session"
          @click="handleDetail(row.uuid, row.session)"
        />
      </template>
      <template #data="{ row }">
        <span v-if="row.type === '__BR_PERF_INFO__'">
          {{ formatPerfMetrics(row.data) }}
        </span>
        <span v-else>{{ row.data }}</span>
      </template>
    </bc-table>

    <UnlimitPagination
      v-model="params"
      @pagination="handleSearch"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { getLogList } from '@/apis'
import DeviceLink from './components/DeviceLink.vue'
import UnlimitPagination from '@/components/UnlimitPagination.vue'
import { useRouter } from 'vue-router'
import { formatDatetime } from '@/util/tools'
import UnionSearch from './components/UnionSearch.vue'
import PerfInfoLog from './components/PerfInfoLog.vue'

defineOptions({
  name: 'LogView',
})

const params = ref({
  uuid: '',
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { type: 'expand' },
  { label: '日志类型', prop: 'type', width: 300 },
  { label: '上报时间', prop: 'create_time', width: 180 },
  { label: '发起时间', prop: 'device_time', width: 180, filter: formatDatetime },
  { label: '会话ID', prop: 'session', width: 240 },
  { label: '设备ID', prop: 'uuid', width: 240 },
  { label: '上报数据', prop: 'data' },
])
const searchConfig = shallowRef([
  { catalog: 'custom', prop: 'union', style: 'width: 320px' },
  { catalog: 'input', prop: 'type', name: '日志类型' },
  // { catalog: 'input', prop: 'session', name: '会话ID', style: 'width: 320px' },
  { catalog: 'input', prop: 'data', name: '上报数据', style: 'width: 320px' },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])

const router = useRouter()
function handleDetail(id: string, session?: string) {
  router.push({ name: 'DeviceDetail', params: { id }, query: { session } })
}
function getList() {
  return getLogList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}

function formatPerfMetrics(data: unknown) {
  const record = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : {}
  if (Number(record.perfVersion) >= 2) {
    return [
      ['FCP', record.fcp],
      ['LCP', record.lcp],
      ['INP', record.inp],
      ['TTFB', record.ttfb],
    ]
      .filter(([, value]) => value !== null && value !== undefined && Number.isFinite(Number(value)))
      .map(([name, value]) => `${name} ${(Number(value) / 1000).toFixed(2)}s`)
      .join(' · ')
  }

  const fcpMs = Number(record.fcpMs)
  const legacyFcp = Number(record.fcp)
  const fcp = Number.isFinite(fcpMs) && fcpMs > 0
    ? fcpMs
    : Number.isFinite(legacyFcp) && legacyFcp > 0
      ? legacyFcp / 1000
      : 0
  return `FCP ${(fcp / 1000).toFixed(2)} s`
}
</script>
