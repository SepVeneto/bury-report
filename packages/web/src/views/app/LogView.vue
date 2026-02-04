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
import { useRouter } from 'vue-router'

defineOptions({
  name: 'LogView',
})

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '日志类型', prop: 'type', width: 300 },
  { label: '上报时间', prop: 'create_time', width: 180 },
  { label: '发起时间', prop: 'device_time', width: 180 },
  { label: '会话ID', prop: 'session', width: 240 },
  { label: '设备ID', prop: 'uuid', width: 240 },
  { label: '上报数据', prop: 'data' },
])
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'type', name: '日志类型' },
  { catalog: 'input', prop: 'session', name: '会话ID', style: 'width: 320px' },
  { catalog: 'input', prop: 'uuid', name: '设备ID', style: 'width: 320px' },
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
</script>
