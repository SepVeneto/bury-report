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
      <template #uuid="{ row }">
        <DeviceLink
          :uuid="row.uuid"
          @click="handleLink(row.uuid)"
        />
      </template>
      <template #session="{ row }">
        <DeviceLink
          :uuid="row.session"
          @click="handleLink(row.uuid, row.session)"
        />
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { getDeviceList } from '@/apis'
import { ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import DeviceLink from './components/DeviceLink.vue'

defineOptions({
  name: 'HistoryDevice',
})

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '设备ID', prop: 'uuid' },
  { label: '最近一次会话', prop: 'session' },
  { label: '最后打开时间', prop: 'update_time' },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '设备ID', prop: 'uuid', width: 300 },
  { catalog: 'input', name: '会话ID', prop: 'session' },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])
function getList() {
  return getDeviceList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
const router = useRouter()
function handleLink(id: string, session?: string) {
  router.push({ name: 'DeviceDetail', params: { id }, query: { session } })
}
</script>
