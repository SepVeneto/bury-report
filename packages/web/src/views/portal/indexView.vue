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
import { deleteProject, getPortal, getProjectList, updateProject } from '@/apis'
import type { PortalInst } from '@/apis'
import { ref } from 'vue'

const projects = ref<PortalInst[]>([])
getList()
async function getList() {
  const res = await getPortal()
  projects.value = res
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
    display: grid;
    grid-template-columns: repeat(60px);
    column-gap: 20px;
    row-gap: 20px;
  }
}
</style>
