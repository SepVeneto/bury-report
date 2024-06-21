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
  </section>
</template>

<script lang="ts" setup>
import { createDialog } from '@sepveneto/basic-comp'
import { ElIcon } from 'element-plus'
import { Plus as IconPlus } from '@element-plus/icons-vue'
import EntryWrap from './EntryWrap.vue'
import {
  // deleteProject,
  // getPortal,
  getProjectList,
  updateProject,
  // updateProject
} from '@/apis'
import type { Project } from '@/apis'
import { ref } from 'vue'
import DialogProject from '../project/DialogProject.vue'

const projects = ref<Project[]>([])
getList()
async function getList() {
  const res = await getProjectList()
  projects.value = res.list
}
function handleAdd() {
  const { open, close } = createDialog(DialogProject)
  open(
    { title: '新增项目', width: '550px' },
    async (res) => {
      const data = await res!.getFormData()
      await updateProject(data)
      close()
      getList()
    },
  )
  /**
   * TODO: 动态路由
   */
  // window.open(window.location.origin + '/#/manage/projects', '_blank')
}
</script>

<style lang="scss" scoped>
.portal-container {
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
</style>
