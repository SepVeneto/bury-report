<template>
  <IconApp
    v-if="data.type === 'app'"
    :name="data.name"
    :app-id="data.id"
    zoom-in
  />
  <!-- <IconProject
    v-else
    style=""
    :name="data.name"
    :group="data.apps"
  /> -->
</template>

<script lang="ts" setup>
import IconApp from './IconApp.vue'
import IconProject from './IconProject.vue'
import type { PortalInst } from '@/apis'
import type { PropType } from 'vue'

defineProps({
  data: {
    type: Object as PropType<PortalInst>,
    required: true,
  },
})
</script>
