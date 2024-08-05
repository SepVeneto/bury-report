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
    />
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { createTrigger, getTriggerList } from '@/apis'
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
      dialog.close()
    },
  )
}
</script>
