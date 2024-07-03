<template>
  <div style="display: flex; align-items: center;">
    <ElLink
      type="primary"
      @click="$emit('click')"
    >
      {{ uuid }}
    </ElLink>
    <ElIcon
      class="copy-btn"
      size="18"
      @click="handleCopy(uuid)"
    >
      <IconCopy />
    </ElIcon>
  </div>
</template>

<script lang="ts" setup>
import { CopyDocument as IconCopy } from '@element-plus/icons-vue'
import { copyContent as handleCopy } from '@/util/tools'

defineProps({
  uuid: {
    type: String,
    required: true,
  },
})
defineEmits(['click'])
</script>

<style scoped>
.copy-btn {
  margin-left: 10px;
  cursor: pointer;
}
</style>
