<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <BcButton @click="handleCreate">
        新增
      </BcButton>
    </bc-search>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
    >
      <template #id="{ row }">
        <div
          style="cursor: pointer;"
          @click="handleCopy(row.id)"
        >
          <span>{{ row.id }}</span>
          <ElIcon style="margin-left: 10px;">
            <IconCopy />
          </ElIcon>
        </div>
      </template>
      <template #operate="{ row }">
        <bc-button
          type="primary"
          text
          @click="handleEdit(row)"
        >
          编辑
        </bc-button>
        <bc-button
          text
          type="danger"
          confirm
          @click="handleDelete(row)"
        >
          删除
        </bc-button>
      </template>
    </bc-table>
  </section>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { deleteApp, getAppList, updateApp } from '@/apis'
import type { App } from '@/apis'
import { copyText, createDialog } from '@sepveneto/basic-comp'
import DialogApp from './DialogApp.vue'
import { DocumentCopy as IconCopy } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '应用名称', prop: 'name' },
  { label: 'AppID', prop: 'id' },
  { label: '操作', prop: 'operate', width: 220 },
])
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'name', name: '应用名称' },
  { catalog: 'input', prop: 'appId', name: 'AppId', style: 'width: 220px' },
])
async function handleCopy(text: string) {
  await copyText(text)
  ElMessage.success('复制成功')
}
function getList() {
  return getAppList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
function handleCreate() {
  _updateApp('新增应用')
}
function handleEdit(record: App) {
  _updateApp('编辑应用', record)
}
function _updateApp(title: string, record?: App) {
  const { open, close } = createDialog(DialogApp, { recordId: record?.id })
  open(
    { title, width: '550px' },
    async (res) => {
      const data = await res!.getFormData()
      await updateApp(data)
      close()
      handleSearch()
    },
  )
}
async function handleDelete(record: App) {
  try {
    await ElMessageBox.prompt('请输入该应用的名称以确认删除操作', '注意', {
      confirmButtonText: '确认删除',
      confirmButtonClass: 'el-button--danger',
      cancelButtonText: '取消',
      inputPattern: new RegExp(`^${record.name}$`),
      inputErrorMessage: '应用名称不匹配',
    })
    await deleteApp(record.id)
    params.value.page = 1
    handleSearch()
  } catch {}
}
</script>
