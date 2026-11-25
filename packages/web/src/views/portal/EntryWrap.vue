<template>
  <!-- <IconApp
    v-if="data.type === 'app'"
    :name="data.name"
    :app-id="data.id"
    zoom-in
  /> -->
  <IconProject
    style=""
    :name="data.name"
    :pid="data.id"
    :group="data.apps"
    @update="onUpdate"
    @contextmenu.stop="handleContextmenu($event, data.id)"
  />
</template>

<script lang="ts" setup>
// import IconApp from './IconApp.vue'
import IconProject from './IconProject.vue'
import { type Project, deleteProject, getProjectList, updateProject } from '@/apis'
import { type PropType, computed, inject } from 'vue'
import { PortalKey } from './token'
import { ElMessageBox } from 'element-plus'
import { useApp } from '@/store'

const context = inject(PortalKey)
const store = useApp()
const isAdmin = computed(() => store.role === 'admin')

const props = defineProps({
  data: {
    type: Object as PropType<Project>,
    required: true,
  },
})

function handleContextmenu(evt: MouseEvent, projectId: Project['id']) {
  if (!isAdmin.value) return

  context?.handleContextmenu?.(evt, [
    {
      label: '删除',
      onClick: async () => {
        if (props.data.apps.length) {
          await ElMessageBox.alert(
            '该项不为空，请先删除所有关联的应用',
            '警告',
            {
              type: 'error',
            },
          )
          return
        }
        await deleteProject(projectId)
        context.getList()
      },
    },
  ])
}
async function onUpdate(name: string) {
  if (!isAdmin.value) return

  await updateProject({
    ...props.data,
    name,
  })
  getProjectList()
}
</script>
