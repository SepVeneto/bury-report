<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <BcButton @click="handleUpdate()">
        创建
      </BcButton>
    </bc-search>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
      empty-text="--"
    >
      <template #status="{ row }">
        <StatusIcon
          :code="row.status"
          :filter="filterStatus"
        />
      </template>
      <template #operate="{ row }">
        <BcButton
          type="primary"
          text
          @click="handleAction('update', row)"
        >
          编辑
        </BcButton>
        <BcButton
          type="warning"
          text
          confirmm
          @click="handleAction('trigger', row)"
        >
          执行
        </BcButton>
        <BcButton
          type="info"
          confirm
          text
          @click="handleAction('stop', row)"
        >
          中止
        </BcButton>
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { createDialog } from '@sepveneto/basic-comp'
import type { TaskForm as TaskRecord, TaskStatus } from '@/apis'
import { createTask, getTaskList, stopTask, triggerTask, updateTask } from '@/apis'
import TaskForm from './taskForm.vue'
import StatusIcon from '@/components/statusIcon.vue'

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '名称', prop: 'name' },
  { label: '执行时间', prop: 'execute_time' },
  { label: '状态', prop: 'status' },
  { label: '创建时间', prop: 'create_time' },
  { label: '更新时间', prop: 'update_time' },
  { label: '操作', prop: 'operate' },
])
const searchConfig = shallowRef([])
const filterStatus = (val: TaskStatus) => {
  return {
    success: '成功',
    fail: '失败',
    pending: '待执行',
    abort: '已取消',
  }[val]
}
function getList() {
  return getTaskList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
function handleUpdate(data?: TaskRecord & { id: string }) {
  const dialog = createDialog(TaskForm, { data })
  dialog.open({ title: data ? '编辑任务' : '创建任务', width: '550px' }, async (expose) => {
    if (!expose) return
    const res = await expose.getFormData()
    if (data) {
      await updateTask(data.id, data)
    } else {
      await createTask(res)
    }
    tableRef.value.getList()
    dialog.close()
  })
}
async function handleAction(action: 'stop' | 'trigger' | 'update', row: TaskRecord & { id: string }) {
  switch (action) {
    case 'update':
      handleUpdate(row)
      break
    case 'trigger':
      await triggerTask(row.id)
      break
    case 'stop':
      await stopTask(row.id)
      break
  }
}
</script>
