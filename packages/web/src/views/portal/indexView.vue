<template>
  <section class="portal-container">
    <div class="icons">
      <EntryWrap
        v-for="item in projects"
        :key="item.id"
        :data="item"
      />
      <div>
        <div
          class="icon-add"
          @click="handleAdd"
        >
          <ElIcon
            :size="120"
            color="#999"
          >
            <IconPlus />
          </ElIcon>
        </div>
      </div>
    </div>

    <div class="input-wrap">
      <ElInput
        v-model="search"
        placeholder="搜索appid或名称"
        clearable
        @input="throttleSearch"
      />
    </div>
  </section>
</template>

<script lang="ts" setup>
import { ElIcon } from 'element-plus'
import { Plus as IconPlus } from '@element-plus/icons-vue'
import EntryWrap from './EntryWrap.vue'
import {
  getProjectList,
  updateProject,
} from '@/apis'
import type { Project } from '@/apis'
import { computed, provide, reactive, ref, shallowRef } from 'vue'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'
import type { MenuItem } from '@imengyu/vue3-context-menu'
import ContextMenu from '@imengyu/vue3-context-menu'
import { PortalKey } from './token'
import { useThrottleFn } from '@vueuse/core'

function handleContextmenu(evt: MouseEvent, items: MenuItem[]) {
  evt.preventDefault()
  ContextMenu.showContextMenu({
    x: evt.x,
    y: evt.y,
    items,
  })
}

const cacheProjects = shallowRef<Project[]>([])
const projects = ref<Project[]>([])
const search = ref('')
const apps = computed(() => {
  const map = new Map<Project['id'], Project>()
  cacheProjects.value.forEach(project => {
    map.set(project.id, project)
  })
  return map
})
const throttleSearch = useThrottleFn(() => {
  if (!search.value) {
    projects.value = [...cacheProjects.value]
    return
  }

  const hitMap = new Map()
  apps.value.forEach((project, pid) => {
    const hitApps = project.apps.filter(app => app.name.includes(search.value) || app.id.includes(search.value))
    if (hitApps.length) {
      hitMap.set(pid, { ...project, apps: hitApps })
    }
  })
  projects.value = Array.from(hitMap.values())
}, 300)

provide(PortalKey, reactive({
  handleContextmenu,
  getList,
  projects,
}))
getList()
async function getList() {
  const res = await getProjectList()
  projects.value = res
  cacheProjects.value = [...res]
}
async function handleAdd() {
  const newProject = {
    id: '',
    name: `新项目-${Date.now()}`,
  }
  await updateProject(newProject)
  getList()
  // const { open, close } = createDialog(DialogProject)
  // open(
  //   { title: '新增项目', width: '550px' },
  //   async (res) => {
  //     const data = await res!.getFormData()
  //     await updateProject(data)
  //     close()
  //     getList()
  //   },
  // )
  /**
   * TODO: 动态路由
   */
  // window.open(window.location.origin + '/#/manage/projects', '_blank')
}
</script>

<style lang="scss" scoped>
.portal-container {
  overflow: auto;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(#e66465, #9198e5);
  padding: 50px;
  box-sizing: border-box;
  .icons {
    display: flex;
    justify-content: flex-start;
    // display: grid;
    // grid-template-columns: repeat(6, 1fr);
    column-gap: 20px;
    row-gap: 20px;
    flex-wrap: wrap;
  }
}
.icon-add {
  width: 220px;
  height: 220px;
  background: #edededcb;
  border-radius: 10px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;

  &:hover {
    animation: pulse 1s;
    box-shadow: 0 0 0 2em transparent;
  }
  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 #ededed;
    }
  }
}
.input-wrap {
  background: #fff;
  width: 80%;
  padding: 20px;
  border-radius: 20px;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 20px;
}
</style>
