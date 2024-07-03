<template>
  <ElTooltip
    :content="content"
  >
    <ElIcon><IconInfo /></ElIcon>
  </ElTooltip>
</template>

<script lang="ts" setup>
import { InfoFilled as IconInfo } from '@element-plus/icons-vue'

defineProps({
  content: {
    type: String,
    default: '',
  },
})
</script>
