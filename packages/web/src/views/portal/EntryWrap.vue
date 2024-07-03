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
import { type PropType, inject } from 'vue'
import { PortalKey } from './token'

const context = inject(PortalKey)

const props = defineProps({
  data: {
    type: Object as PropType<Project>,
    required: true,
  },
})

function handleContextmenu(evt: MouseEvent, projectId: Project['id']) {
  context?.handleContextmenu?.(evt, [
    {
      label: '删除',
      onClick: async () => {
        await deleteProject(projectId)
        context.getList()
      },
    },
  ])
}
async function onUpdate(name: string) {
  await updateProject({
    ...props.data,
    name,
  })
  getProjectList()
}
</script>
