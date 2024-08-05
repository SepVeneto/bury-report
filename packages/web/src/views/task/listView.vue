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
    />
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
const params = ref({})
const tableRef = ref()
const tableConfig = shallowRef([])
const searchConfig = shallowRef([])
function getList() {
  return Promise.resolve({
    data: {
      data: [],
      total: 0,
    },
  })
}
function handleSearch() {
  tableRef.value.getList()
}
</script>
