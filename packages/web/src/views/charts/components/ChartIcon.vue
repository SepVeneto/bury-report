<template>
  <div
    class="icon-wrap"
    :class="[active && 'active', disabled && 'disabled']"
  >
    <ElImage :src="icon" />
    <div>{{ label }}</div>
  </div>
</template>

<script lang="ts" setup>
import IconBar from '../assets/bar.svg'
import IconLine from '../assets/line.svg'
import IconPie from '../assets/pie.svg'
import IconTable from '../assets/table.svg'
import type { PropType } from 'vue'
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String as PropType<'Pie' | 'Line' | 'Bar' | 'Table'>,
    required: true,
  },
  disabled: Boolean,
  label: {
    type: String,
    required: true,
  },
  active: Boolean,
})
const icon = computed(() => ({
  Pie: IconPie,
  Line: IconLine,
  Bar: IconBar,
  Table: IconTable,
})[props.type])
</script>

<style lang="scss" scoped>
.active {
  box-shadow: inset 0 0 0 2px var(--el-color-primary);
  &.disabled {
    box-shadow: inset 0 0 0 2px var(--el-text-color-disabled);
  }
}
.icon-wrap {
  padding: 10px;
  &:not(.active, .disabled):hover {
    animation-name: pulse;
    animation-duration: 0.3s;
    box-shadow: inset 0 0 0 2px var(--el-color-primary);
  }
  &.disabled {
    cursor: not-allowed;
  }
  &:not(.active, .disabled) {
    cursor: pointer;
  }
}

@keyframes pulse {
  from { box-shadow: inset 0 0 0 10px transparent}
}
</style>
