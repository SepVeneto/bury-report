<template>
  <div class="status-wrap">
    <span
      class="status-icon"
      :style="iconStyle"
    />
    <span style="margin-left: 10px;">
      <slot>{{ filter(code) }}</slot>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { computed } from 'vue'
function noop(val: any) { return val }
const props = defineProps({
  code: {
    type: [String, Number],
    required: true,
  },
  filter: {
    type: Function as PropType<typeof noop>,
    default: function <T>(val: T): T { return val },
  },
})

const type = computed(() => {
  if (typeof props.code === 'string') {
    return props.code
  }

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
    case 'abort':
    case 'pending':
    case 'info':
      return '--el-color-info'
    case 'success':
      return '--el-color-success'
    case 'fail':
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
