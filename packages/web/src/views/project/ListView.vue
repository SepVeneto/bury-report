<template>
  <section>
    <bc-search
      v-model="params"
      :search="handleSearch"
      :config="searchConfig"
    >
      <bc-button @click="handleCreate">
        新增
      </bc-button>
    </bc-search>
    <bc-table
      ref="tableRef"
      v-model="params"
      :config="tableConfig"
      pagination
      :api="getList"
    >
      <template #apps="{ row }">
        <div>
          <ElTag
            v-for="(app, index) in row.apps"
            :key="index"
            style="margin-right: 10px; cursor: pointer;"
            disable-transitions
            @click="handleDetail(app)"
          >
            {{ app.name }}
          </ElTag>
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
import { deleteProject, getProjectList, updateProject } from '@/apis'
import type { App, Project } from '@/apis'
import { createDialog } from '@sepveneto/basic-comp'
import DialogProject from './DialogProject.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const params = ref({
  page: 1,
  size: 20,
})
const tableRef = ref()
const tableConfig = shallowRef([
  { label: '项目名称', prop: 'name' },
  { label: '关联应用', prop: 'apps' },
  { label: '操作', prop: 'operate', width: 220 },
])
const searchConfig = shallowRef([
  { catalog: 'input', prop: 'name', name: '项目名称' },
  { catalog: 'input', prop: 'app', name: '应用名称' },
])
function handleDetail(app: App) {
  router.push({ name: 'AppDetail', params: { id: app.id } })
}
function getList() {
  return getProjectList(params.value)
}
function handleSearch() {
  tableRef.value.getList()
}
function handleCreate() {
  _updateProject('新增项目')
}
function handleEdit(record: Project) {
  _updateProject('编辑项目', record)
}
async function handleDelete(record: Project) {
  await deleteProject(record.id)
  params.value.page = 1
  handleSearch()
}
function _updateProject(title: string, record?: Project) {
  const { open, close } = createDialog(DialogProject, { recordId: record?.id })
  open(
    { title, width: '550px' },
    async (res) => {
      const data = await res!.getFormData()
      await updateProject(data)
      close()
      handleSearch()
    },
  )
}
</script>
