<template>
  <section class="portal-container">
    <div class="icons">
      <EntryWrap
        v-for="item in projects"
        :key="item.id"
        :data="item"
      />
    </div>
  </section>
</template>

<script lang="ts" setup>
import EntryWrap from './EntryWrap.vue'
import {
  // deleteProject,
  // getPortal,
  getProjectList,
  // updateProject
} from '@/apis'
import type { Project } from '@/apis'
import { ref } from 'vue'

const projects = ref<Project[]>([])
getList()
async function getList() {
  const res = await getProjectList({ page: 1, size: Number.MAX_SAFE_INTEGER })
  projects.value = res.data.list
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
</style>
