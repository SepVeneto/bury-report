<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <BcButton @click="handleAdd">
        新增
      </BcButton>
    </bc-search>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      :api="getList"
      pagination
    />
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { source } from '@/apis'

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '名称', prop: 'name', editable: true },
  { label: '标识', prop: 'source', editable: true },
])
const searchConfig = shallowRef([])
function getList() {
  return source.getList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
function handleAdd() {

}
</script>
