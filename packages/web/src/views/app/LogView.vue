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
      :api="getList"
    >
      <template #uuid="{ row }">
        <DeviceLink
          :uuid="row.uuid"
          @click="$router.push({ name: 'DeviceDetail', params: { id: row.uuid } })"
        />
      </template>
      <template #data="{ row }">
        <span>{{ row.data }}</span>
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

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '日志类型', prop: 'type', width: 300 },
  { label: '上报时间', prop: 'create_time', width: 180 },
  { label: '发起时间', prop: 'device_time', width: 180 },
  { label: '设备ID', prop: 'uuid', width: 240 },
  { label: '上报数据', prop: 'data' },
])
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'type', name: '日志类型' },
  { catalog: 'input', prop: 'uuid', name: '设备ID', style: 'width: 320px' },
  { catalog: 'input', prop: 'data', name: '上报数据', style: 'width: 320px' },
])
function getList() {
  return getLogList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
