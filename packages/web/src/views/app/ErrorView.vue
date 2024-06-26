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
      <template #expand="{ row }">
        <pre style="padding-left: 100px; color: var(--el-color-danger);">{{ row.data.stack }}</pre>
      </template>
      <template #error="{ row }">
        {{ `${row.data.name}: ${row.data.message}` }}
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { getAppErrors } from '@/apis'

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { type: 'expand' },
  { label: '发生时间', prop: 'create_time', width: 200 },
  { label: '设备ID', prop: 'uuid', width: 200 },
  { label: '错误概述', prop: 'error' },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '设备ID', prop: 'uuid', width: 300 },
  { catalog: 'datepicker', prop: 'time', type: 'datetimerange' },
])

function getList() {
  return getAppErrors(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
