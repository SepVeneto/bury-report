<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <BcButton @click="handleCreate">
        创建
      </BcButton>
    </bc-search>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
    >
      <template #operate="{ row }">
        <BcButton
          text
          type="primary"
          @click="handleEdit(row)"
        >
          编辑
        </BcButton>
        <BcButton
          text
          type="danger"
          confirm
          @click="handleDelete(row)"
        >
          删除
        </BcButton>
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import type { Trigger } from '@/apis'
import { createTrigger, deleteTrigger, getTriggerList, updateTrigger } from '@/apis'
import { createDialog } from '@sepveneto/basic-comp'
import TriggerForm from './triggerForm.vue'

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '名称', prop: 'name' },
  { label: 'webhook', prop: 'webhook' },
  { label: '创建时间', prop: 'create_time' },
  { label: '操作', prop: 'operate' },
])
const searchConfig = shallowRef([])

function getList() {
  return getTriggerList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
function handleCreate() {
  const dialog = createDialog(TriggerForm)
  dialog.open(
    { title: '创建触发器', width: '550px' },
    async (expose) => {
      if (!expose) return
      const res = await expose.getFormData()
      await createTrigger(res)
      tableRef.value.getList()
      dialog.close()
    },
  )
}
function handleEdit(row: Trigger & { id: string }) {
  const dialog = createDialog(TriggerForm, { data: { ...row } })
  dialog.open(
    { title: '编辑触发器', width: '550px' },
    async (expose) => {
      if (!expose) return
      const res = await expose.getFormData()
      await updateTrigger(row.id, res)
      tableRef.value.getList()
      dialog.close()
    },
  )
}
async function handleDelete(row: { id: string }) {
  await deleteTrigger(row.id)
  params.value.page = 1
  tableRef.value.getList()
}
</script>
