<template>
  <section>
    <bc-search
      v-model="params"
      name-mode="label"
      :search="handleSearch"
      :config="searchConfig"
    />
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
    />
  </section>
</template>

<script setup lang="ts">
import { getHistoryErrorList } from '@/apis'
import { ref, shallowRef } from 'vue'
import { dayjs } from 'element-plus'

function formatTime(time: string) {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '指纹', prop: 'fingerprint', width: 300 },
  { label: '摘要', prop: 'summary' },
  { label: '最后触发原文', prop: 'message' },
  { label: '累计触发次数', prop: 'count', width: 120 },
  { label: '首次触发时间', prop: 'first_seen', width: 160, filter: formatTime },
  { label: '最后触发时间', prop: 'last_seen', width: 160, filter: formatTime },
  { label: '来源规则', prop: 'rule_id', width: 200 },
])
const searchConfig = shallowRef([
  { catalog: 'input', name: '指纹', prop: 'fingerprint', placeholder: '支持模糊查询' },
  { catalog: 'input', name: '摘要', prop: 'summary', placeholder: '支持模糊查询' },
  {
    catalog: 'datepicker',
    prop: 'time',
    type: 'datetimerange',
    name: '最后触发时间',
  },
])
function getList() {
  return getHistoryErrorList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
