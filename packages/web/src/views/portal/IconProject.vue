<template>
  <div
    ref="projectRef"
    class="project-icon"
    @click="handleZoom"
  >
    <ProjectWrap
      :all-group="group"
      :zoom-in="zoomIn"
      @contextmenu="handleContextmenu"
      @add="handleAdd"
    />
    <div
      ref="titleRef"
      :class="titleClass"
      :style="titleStyle"
      @click="showEdit = true"
    >
      <span
        v-if="!showEdit"
        :title="title"
      >{{ title }}</span>
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
import { computed, inject, ref } from 'vue'
import type { PropType } from 'vue'
import { type App, deleteApp, moveAppTo, updateApp } from '@/apis'
import DialogApp from '../app/DialogApp.vue'
import { createDialog } from '@sepveneto/basic-comp'
import { PortalKey } from './token'
import ProjectWrap from './IconProject.wrap.vue'

const context = inject(PortalKey)
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
const titleRef = ref<HTMLElement>()
const showEdit = ref(false)
const zoomIn = ref(false)
const title = ref(props.name)

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
function handleContextmenu(evt: MouseEvent, app: App) {
  context?.handleContextmenu?.(evt, [
    {
      label: '编辑',
      onClick: () => handleUpdate(app),
    },
    {
      label: '删除',
      onClick: async () => {
        await deleteApp(app.id)
        context.getList()
      },
    },
    {
      label: '移动至',
      children: context.projects.map((project) => ({
        label: project.name,
        disabled: project.id === props.pid,
        onClick: async () => {
          await moveAppTo(app.id, project.id)
          context.getList()
        },
      })),
    },
  ])
}
function handleBlur() {
  showEdit.value = false
  emit('update', title.value)
}
function handleUpdate(app: App) {
  const { open, close } = createDialog(DialogApp, { recordId: app.id })
  open(
    { title: '编辑应用', width: '550px' },
    async (res) => {
      const data = await res!.getFormData()
      await updateApp(props.pid, data)
      close()
      context?.getList?.()
    },
  )
}
function handleAdd() {
  const { open, close } = createDialog(DialogApp)
  open(
    { title: '新增应用', width: '550px' },
    async (res) => {
      const data = await res!.getFormData()
      await updateApp(props.pid, data)
      close()
      context?.getList?.()
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
.project-title {
  transition: all 0.2s;
  color: #fff;
  text-align: center;
  margin-top: 10px;
  font-size: 22px;
  width: 220px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
