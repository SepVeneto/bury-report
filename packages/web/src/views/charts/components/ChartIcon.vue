<template>
  <div
    class="icon-wrap"
    :class="[active && 'active']"
  >
    <ElImage :src="icon" />
    <div>{{ label }}</div>
  </div>
</template>

<script lang="ts" setup>
import IconBar from '../assets/bar.svg'
import IconLine from '../assets/line.svg'
import IconPie from '../assets/pie.svg'
import type { PropType } from 'vue'
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String as PropType<'pie' | 'line' | 'bar'>,
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  active: Boolean,
})
const icon = computed(() => ({
  pie: IconPie,
  line: IconLine,
  bar: IconBar,
})[props.type])
</script>

<style lang="scss" scoped>
.active {
  box-shadow: inset 0 0 0 2px #409eff;
}
.icon-wrap {
  padding: 10px;
  cursor: pointer;
  &:not(.active):hover {
    animation-name: pulse;
    animation-duration: 0.3s;
    box-shadow: inset 0 0 0 2px #409eff;
  }
}

@keyframes pulse {
  from { box-shadow: inset 0 0 0 10px transparent}
}
</style>
