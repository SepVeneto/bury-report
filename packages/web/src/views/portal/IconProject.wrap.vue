<template>
  <div
    ref="wrapRef"
    :class="wrapClass"
    :style="wrapStyle"
  >
    <template v-if="!zoomIn || displayGroups.length === 1">
      <div
        class="wrap-item"
        :class="zoomIn && 'zoom-in'"
      >
        <AppIcon
          v-for="item in displayGroups[0]"
          :key="item.id"
          :name="item.name"
          :app-id="item.id"
          :color="item.icon"
          :zoom-in="zoomIn"
          @contextmenu.stop="$emit('contextmenu', $event, item)"
        />
        <div
          v-if="zoomIn"
          class="icon-add"
          @click="$emit('add')"
        >
          <ElIcon
            :size="60"
            color="#999"
          >
            <IconPlus />
          </ElIcon>
        </div>
      </div>
    </template>
    <ElCarousel
      v-else-if="zoomIn && displayGroups.length > 1"
      :autoplay="false"
      arrow="never"
      height="260px"
    >
      <ElCarouselItem
        v-for="(group, index) in displayGroups"
        :key="index"
      >
        <div
          class="wrap-item"
          :class="zoomIn && 'zoom-in'"
        >
          <AppIcon
            v-for="item in group"
            :key="item.id"
            :name="item.name"
            :app-id="item.id"
            :color="item.icon"
            :zoom-in="zoomIn"
            @contextmenu.stop="$emit('contextmenu', $event, item)"
          />
          <div
            v-if="zoomIn && index === displayGroups.length - 1"
            class="icon-add"
            @click="$emit('add')"
          >
            <ElIcon
              :size="60"
              color="#999"
            >
              <IconPlus />
            </ElIcon>
          </div>
        </div>
      </ElCarouselItem>
    </ElCarousel>
    <div
      v-else-if="zoomIn"
      class="icon-add"
      @click="$emit('add')"
    >
      <ElIcon
        :size="60"
        color="#999"
      >
        <IconPlus />
      </ElIcon>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { App } from '@/apis'
import { type PropType, computed, ref } from 'vue'
import AppIcon from './IconApp.vue'
import { Plus as IconPlus } from '@element-plus/icons-vue'

defineEmits(['contextmenu', 'add'])
const props = defineProps({
  allGroup: {
    type: Array as PropType<App[]>,
    default: () => ([]),
  },
  zoomIn: Boolean,
})
const displayGroups = computed(() => {
  if (!props.zoomIn) {
    return [props.allGroup.slice(0, 9)]
  } else {
    let temp = []
    const list = []
    for (let i = 0; i < props.allGroup.length; ++i) {
      temp.push(props.allGroup[i])
      if (i === 8) {
        list.push(temp)
        temp = []
      }
    }
    // if (temp.length || (list.length > 0 && list.slice(-1)[0].length === 9)) {
    list.push(temp)
    // }
    return list
  }
})
const wrapRef = ref()
const wrapClass = computed(() => ['project-wrap', props.zoomIn && 'zoom-in'])
const wrapStyle = computed(() => {
  if (!wrapRef.value || !props.zoomIn) return {}
  const w = wrapRef.value.offsetLeft
  const h = wrapRef.value.offsetTop

  return {
    transform: `translate(calc(50vw - 50% - ${w}px), calc(50vh - 50% - ${h}px)) scale(2.5)`,
  }
})
</script>

<style lang="scss" scoped>
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
  position: relative;
  &:deep(.el-carousel__indicators) {
    bottom: -16px;
  }
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
  }
  &.zoom-in {
    transform-origin: center center;
    z-index: 1;
    display: block;
    // grid-template-rows: repeat(3, 80px);
    &::after {
      display: none;
    }
  }
}
.wrap-item {
  display: grid;
  grid-template-rows: repeat(3, 60px);
  grid-template-columns: repeat(3, 60px);
  gap: 10px;
  &.zoom-in {
    grid-template-rows: repeat(3, 80px);
  }
}
.icon-add {
  width: 60px;
  height: 60px;
  border: 1px solid #edededcb;
  border-radius: 10px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}
</style>
