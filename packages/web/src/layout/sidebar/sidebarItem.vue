<template>
  <el-sub-menu
    v-if="withSubmenu && data.children"
    :index="data.route"
  >
    <template #title>
      {{ data.name }}
    </template>
    <SidebarItem
      v-for="item in data.children"
      :key="item.path"
      :data="item"
      :with-submenu="withSubmenu"
    />
  </el-sub-menu>
  <el-menu-item
    v-else
    :index="data.route"
  >
    {{ data.name }}
  </el-menu-item>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { Route } from '@/store'
import SidebarItem from './sidebarItem.vue'

export default defineComponent({
  name: 'SidebarItem',
})
</script>

<script lang="ts" setup>
defineProps<{ data: Route, withSubmenu?: boolean }>()
</script>
