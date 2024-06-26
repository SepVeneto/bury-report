<template>
  <div class="status-wrap">
    <span
      class="status-icon"
      :style="iconStyle"
    />
    <span style="margin-left: 10px;">{{ code }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  code: {
    type: Number,
    required: true,
  },
})

const type = computed(() => {
  switch (props.code) {
    case 200:
      return 'success'
    case 500:
    case 502:
    case 404:
    case 403:
    case 400:
      return 'error'
    default:
      return 'warning'
  }
})

const color = computed(() => {
  switch (type.value) {
    case 'success':
      return '--el-color-success'
    case 'error':
      return '--el-color-danger'
    case 'warning':
    default:
      return '--el-color-warning'
  }
})
const iconStyle = computed(() => ({
  background: `var(${color.value})`,
}))
</script>

<style scoped>
.status-icon {
  --size: 16px;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  display: inline-block;
}
.status-wrap {
  display: inline-flex;
  align-items: center;
}
</style>
