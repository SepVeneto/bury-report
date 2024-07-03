<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    />
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
    >
      <template #device_time-header>
        <div style="display: flex; align-items: center;">
          <span style="margin-right: 10px;">请求时间</span>
          <IconTips content="该时间为设备的系统时间，仅供参考" />
        </div>
      </template>
      <template #uuid="{ row }">
        <DeviceLink
          :uuid="row.uuid"
          @click="$router.push({ name: 'DeviceDetail', params: { id: row.uuid } })"
        />
      </template>
      <template #url="{ row }">
        <UrlBlock :url="row.data.url" />
      </template>
      <template #page="{ row }">
        <UrlBlock :url="row.data.page" />
      </template>
      <template #responseStatus="{ row }">
        <StatusIcon
          v-if="row.data.status"
          :code="row.data.status"
        />
        <StatusIcon
          v-else
          :code="filterType(row.data.type)"
        >
          {{ row.data.type }}
        </StatusIcon>
      </template>
      <template #expand="{ row }">
        <NetworkDetail
          :network-id="row.id"
        />
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import IconTips from '@/components/IconTips.vue'
import DeviceLink from './components/DeviceLink.vue'
import UrlBlock from './components/UrlBlock.vue'
import NetworkDetail from './components/NetworkDetail.vue'
import { ref, shallowRef } from 'vue'
import { getAppNetworks } from '@/apis'
import StatusIcon from '@/components/statusIcon.vue'

defineOptions({ name: 'NetworkView' })

const params = ref({
  page: 1,
  size: 10,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { type: 'expand' },
  { label: '上报时间', prop: 'create_time', width: 180 },
  { label: '发起时间', prop: 'device_time', width: 160 },
  { label: '设备ID', prop: 'uuid', width: 220 },
  { label: '请求', prop: 'url' },
  { label: '方法', prop: 'data.method', width: 80 },
  { label: '发起地址', prop: 'page' },
  {
    label: '时间',
    prop: 'data.duration',
    filter: (ms: number) => (ms / 1000).toFixed(2) + '秒',
    width: 140,
  },
  { label: '响应状态', prop: 'responseStatus', width: 140 },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '设备ID', prop: 'uuid', width: 300 },
  { catalog: 'input', name: '接口', prop: 'url', width: 300 },
  { catalog: 'input', name: '发起地址', prop: 'send_page', width: 300 },
  { catalog: 'input', name: '请求参数', prop: 'payload', width: 300 },
  { catalog: 'input', name: '响应内容', prop: 'response', width: 300 },
  {
    catalog: 'select',
    name: '响应状态',
    prop: 'status',
    options: [200, 500, 502, 404],
    allowCreate: true,
    filterable: true,
    width: 300,
  },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])

function filterType(type: string) {
  switch (type) {
    case 'abort':
      return 'info'
    case 'error':
      return 'error'
    case 'timeout':
      return 'error'
    case 'fail':
    default:
      return 'warning'
  }
}
function getList() {
  return getAppNetworks(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
