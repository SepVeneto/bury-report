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
        :color="item.icon"
        :zoom-in="zoomIn"
      />
      <div
        v-if="zoomIn"
        class="icon-add"
        @click="handleAdd"
      >
        <ElIcon
          :size="60"
          color="#999"
        >
          <IconPlus />
        </ElIcon>
      </div>
    </div>
    <div
      ref="titleRef"
      :class="titleClass"
      :style="titleStyle"
      @click="showEdit = true"
    >
      <span v-if="!showEdit">{{ title }}</span>
      <ElInput
        v-else
        v-model="title"
        v-focus
        @blur="handleBlur"
      />
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="zoomIn"
          class="mask"
          @click="zoomIn = false"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { Plus as IconPlus } from '@element-plus/icons-vue'
import type { PropType } from 'vue'
import { type App, getProjectList, updateApp } from '@/apis'
import AppIcon from './IconApp.vue'
import DialogApp from '../app/DialogApp.vue'
import { createDialog } from '@sepveneto/basic-comp'

const props = defineProps({
  name: {
    type: String,
    required: true,
  },
  pid: {
    type: String,
    required: true,
  },
  group: {
    type: Array as PropType<App[]>,
    default: () => [],
  },
})
const emit = defineEmits(['update'])

const vFocus = {
  mounted: (el: HTMLElement) => {
    el.querySelector('input')?.focus()
  },
}

const projectRef = ref<HTMLElement>()
const wrapRef = ref<HTMLElement>()
const titleRef = ref<HTMLElement>()
const showEdit = ref(false)
const zoomIn = ref(false)
const title = ref(props.name)
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
function handleBlur() {
  showEdit.value = false
  emit('update', title.value)
}
function handleAdd() {
  const { open, close } = createDialog(DialogApp)
  open(
    { title: '新增应用', width: '550px' },
    async (res) => {
      const data = await res!.getFormData()
      await updateApp(props.pid, data)
      close()
      getProjectList()
    },
  )
}
function handleZoom() {
  zoomIn.value = true
}
</script>

<style lang="scss" scoped>
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
  position: relative;
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
    grid-template-rows: repeat(3, 80px);
    &::after {
      display: none;
    }
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

  &:hover {
    animation: pulse 1s;
    box-shadow: 0 0 0 1em transparent;
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 #ededed;
    }
  }
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
