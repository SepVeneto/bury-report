<template>
  <div
    ref="projectRef"
    class="project-icon"
    @click="handleZoom"
  >
    <div
      ref="wrapRef"
      :class="wrapClass"
      :style="wrapStyle"
    >
      <AppIcon
        v-for="item in group"
        :key="item.id"
        :name="item.name"
        :app-id="item.id"
        :zoom-in="zoomIn"
      />
    </div>
    <div
      ref="titleRef"
      :class="titleClass"
      :style="titleStyle"
    >
      {{ name }}
    </div>
  </div>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="zoomIn"
        class="mask"
      />
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import type { PropType } from 'vue'
import type { App } from '@/apis'
import AppIcon from './IconApp.vue'
import { onClickOutside } from '@vueuse/core'

const projectRef = ref<HTMLElement>()
const wrapRef = ref<HTMLElement>()
const titleRef = ref<HTMLElement>()
const zoomIn = ref(false)
const wrapClass = computed(() => ['project-wrap', zoomIn.value && 'zoom-in'])
const wrapStyle = computed(() => {
  if (!wrapRef.value || !zoomIn.value) return {}
  const w = wrapRef.value.offsetLeft
  const h = wrapRef.value.offsetTop

  return {
    transform: `translate(calc(50vw - 50% - ${w}px), calc(50vh - 50% - ${h}px)) scale(2.5)`,
  }
})
const titleClass = computed(() => ['project-title', zoomIn.value && 'zoom-in'])
const titleStyle = computed(() => {
  if (!titleRef.value || !zoomIn.value) return {}
  const w = titleRef.value.offsetLeft
  const h = titleRef.value.offsetTop

  return {
    transformOrigin: 'center center',
    transform: `translate(calc(50vw - 50% - ${w}px), calc(-${h}px)) scale(2)`,
  }
})
onClickOutside(projectRef, () => {
  zoomIn.value = false
})
function handleZoom() {
  zoomIn.value = true
}
defineProps({
  name: {
    type: String,
    required: true,
  },
  group: {
    type: Array as PropType<App[]>,
    default: () => [],
  },
})
</script>

<style lang=scss scoped>
.zoom-in {
  position: relative;
  z-index: 1;
}
.project-wrap {
  display: grid;
  grid-template-columns: repeat(3, 60px);
  grid-template-rows: repeat(3, 60px);
  background: #edededcb;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  box-sizing: border-box;
  transition: transform 0.2s;
  &.zoom-in {
    transform-origin: center center;
    z-index: 1;
    grid-template-rows: repeat(3, 80px);
  }
}
.project-title {
  transition: all 0.2s;
  color: #fff;
  text-align: center;
  margin-top: 10px;
  font-size: 22px;
}
.mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #3e3e3e6c;
  z-index: 0;
}
:global(.fade-enter-from, .fade-leave-to) {
  opacity: 0;
}
:global(.fade-enter-active, .fade-leave-active) {
  transition: opacity 2s;
}
</style>

<style>
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.fade-enter-active, .fade-leave-active {
  z-index: 0;
  transition: opacity 0.2s;
}
</style>
