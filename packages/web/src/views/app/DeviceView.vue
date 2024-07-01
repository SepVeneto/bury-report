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
        <ElLink
          type="primary"
          @click="handleLink(row.uuid)"
        >
          {{ row.uuid }}
        </ElLink>
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { getDeviceList } from '@/apis'
import { ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '设备ID', prop: 'uuid' },
  { label: '总计打开次数', prop: 'total_open' },
  { label: '最后打开时间', prop: 'last_open' },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '设备ID', prop: 'uuid', width: 300 },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])
function getList() {
  return getDeviceList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
const router = useRouter()
function handleLink(id: string) {
  router.push({ name: 'DeviceDetail', params: { id } })
}
</script>
