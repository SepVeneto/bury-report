<template>
  <footer style="text-align: right;">
    <ElButton
      :disabled="model.page === 1"
      :icon="IconLeft"
      @click="handlePrev"
    />
    <span style="color: var(--el-text-color-secondary);">第{{ model.page }}页</span>
    <ElButton
      :icon="IconRight"
      @click="handleNext"
    />
  </footer>
</template>

<script lang="ts" setup>
import {
  ArrowLeft as IconLeft,
  ArrowRight as IconRight,
} from '@element-plus/icons-vue'

const model = defineModel<{ page: number, size: number }>({ required: true })
const emit = defineEmits(['pagination'])

function handlePrev() {
  if (model.value.page === 1) return

  model.value.page -= 1
  emit('pagination')
}
function handleNext() {
  model.value.page += 1
  emit('pagination')
}
</script>
