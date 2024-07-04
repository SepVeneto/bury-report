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
      class="source-table"
      :config="tableConfig"
      :data="tableData"
      row-key="id"
      @save="handleSave"
    >
      <template #operate="{ row }">
        <BcButton
          confirm
          type="danger"
          text
          @click="handleDel(row.id)"
        >
          删除
        </BcButton>
        <BcButton
          v-if="!row.pid"
          @click="handleAddDimension(row)"
        >
          添加统计维度
        </BcButton>
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { source } from '@/apis'
import type { TableInstance } from '@sepveneto/basic-comp'
import type { SourceRecord } from '@/apis/source'

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '名称', prop: 'name', editable: true },
  { label: '标识', prop: 'value', editable: true },
  { label: '操作', prop: 'operate' },
])
const searchConfig = shallowRef([])
async function handleAddDimension(record: any) {
  await source.update({
    pid: record.id,
    name: `自定义维度 ${new Date().toLocaleString()}`,
    value: 'custom' + Date.now(),
  })
  handleSearch()
}
const tableData = shallowRef<SourceRecord[]>([])
getList()
async function getList() {
  tableData.value = await source.getList()
}
function handleSearch() {
  getList()
}
async function handleDel(id: string) {
  await source.del(id)
  handleSearch()
}
async function handleAdd() {
  await source.update({ name: `自定义指标 ${new Date().toLocaleString()}`, value: 'custom' + Date.now() })
  handleSearch()
}
const handleSave: TableInstance['onSave'] = async (cell, props, record) => {
  const data: SourceRecord = {
    ...record as SourceRecord,
    [props]: cell,
  }
  console.log('?')
  await source.update(data)
}
</script>

<style lang="scss" scoped>
.source-table :deep(.cell) {
  display: flex;
  align-items: center;
}
.source-table :deep(.bc-table-cell-edit) {
  flex: 1;
}
</style>
