<template>
  <div class="wrapper">
    <div>
      <ElImage
        class="background"
        :src="background"
      />
      <ElImage
        ref="blockRef"
        class="block"
        :style="blockStyle"
        :src="block"
      />
    </div>

    <div class="bar">
      <div
        class="mask"
        :style="maskStyle"
      />
      <div
        class="slider"
        :style="sliderStyle"
        @mousedown="onDragStart"
      />
      <span>向右滑动填充拼图</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
defineOptions({
  name: 'JigsawCaptcha',
})
const props = defineProps({
  width: {
    type: Number,
    default: 310,
  },
  height: {
    type: Number,
    default: 155,
  },
  background: {
    type: String,
    required: true,
  },
  block: {
    type: String,
    required: true,
  },
})
const emit = defineEmits<{ finish: [number] }>()

const offset = ref(0)
const blockRef = ref<HTMLImageElement>()
const sliderStyle = computed(() => ({
  transform: `translate(${offset.value}px)`,
  cursor: dragging.value ? 'grabbing' : 'grab',
}))
const maskStyle = computed(() => ({
  transform: `translate(${offset.value}px)`,
}))
const blockStyle = computed(() => {
  const len = props.width - 63
  const wrapLen = props.width - 40
  const per = offset.value / wrapLen
  return {
    transform: `translate(${len * per}px)`,
  }
})
const dragging = ref(false)
let start = { x: 0, y: 0 }

function onDragStart(evt: MouseEvent) {
  dragging.value = true
  start = { x: evt.clientX, y: evt.clientY }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(evt: MouseEvent) {
  offset.value = Math.min(Math.max(evt.clientX - start.x, 0), props.width - 40)
}
function onDragEnd() {
  dragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)

  blockStyle.value.transform.replace(/(\d*.?\d*)px/, (all, $1) => {
    const offset = $1
    emit('finish', parseFloat(offset))
    return all
  })
}
function reset() {
  offset.value = 0
}

defineExpose({ reset })
</script>

<style lang="scss" scoped>
.bar {
  width: 310px;
  height: 40px;
  text-align: center;
  line-height: 40px;
  background-color: #f7f9fa;
  border: 1px solid #e4e7eb;
  position: relative;
  user-select: none;
  overflow: hidden;
}
.mask {
  height: 100%;
  width: 100%;
  position: absolute;
  top: 0;
  left: -100%;
  background-color: #67C23A;
}
.slider {
  width: 40px;
  height: 40px;
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.3);
  background-color: #fff;
  position: absolute;
  top: 0;
  left: 0;
  cursor: grap;
}
.wrapper {
  position: relative;
}
.block{
  position: absolute;
  top: 0;
  left: 0;
}
</style>
