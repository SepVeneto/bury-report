<template>
  <div
    class="screen-wrap"
    :style="wrapStyle"
    :data-w="width"
    :data-h="height"
  >
    <div
      v-if="status"
      class="status-bar"
      :style="statusStyle"
    />
    <div
      class="used-screen"
      :style="screenStyle"
      :data-w="screen[2]"
      :data-h="screen[3]"
    />
  </div>
</template>

<script lang="ts" setup>
import type { PropType } from 'vue'
import { computed } from 'vue'

const props = defineProps({
  width: {
    type: Number,
    required: true,
  },
  height: {
    type: Number,
    required: true,
  },
  screen: {
    type: Array as PropType<number[]>,
    required: true,
  },
  status: {
    type: Number,
    required: true,
  },
})
const wrapStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${props.height}px`,
}))
const screenStyle = computed(() => {
  const [top, bottom, width, height] = props.screen
  return {
    width: `${width}px`,
    height: `${height}px`,
    top: `${top}px`,
    bottom: `${bottom}px`,
  }
})
const statusStyle = computed(() => {
  return {
    height: `${props.status}px`,
  }
})
</script>

<style scoped lang="scss">
.screen-wrap {
  position: relative;
  border: 1px solid #333;
  border-radius: 20px;
  overflow: hidden;
  &:hover {
    &::after {
      transition: background 0.2s;
      content: '屏幕区域\D\A('attr(data-w)'x'attr(data-h)')';
      width: 100%;
      height: 100%;
      background: aqua;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 50px;
      text-align: center;
    }
  }
}
.used-screen {
  position: absolute;
  border: 1px dashed #333;
  &:hover {
    &::after {
      transition: background 0.2s;
      content: '可用区域\D\A('attr(data-w)'x'attr(data-h)')';
      width: 100%;
      height: 100%;
      background: crimson;
      display: flex;
      text-align: center;
      align-items: center;
      justify-content: center;
      font-size: 42px;
    }
  }
}
.status-bar {
  border: 1px dashed #333;
  position: absolute;
  left: 0;
  right: 0;
}
</style>
