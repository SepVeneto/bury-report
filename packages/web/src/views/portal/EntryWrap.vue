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
  />
</template>

<script lang="ts" setup>
// import IconApp from './IconApp.vue'
import IconProject from './IconProject.vue'
import { type Project, getProjectList, updateProject } from '@/apis'
import type { PropType } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<Project>,
    required: true,
  },
})

async function onUpdate(name: string) {
  await updateProject({
    ...props.data,
    name,
  })
  getProjectList()
}
</script>
