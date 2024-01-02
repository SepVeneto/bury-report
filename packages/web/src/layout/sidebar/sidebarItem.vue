<template>
  <el-sub-menu
    v-if="showSubMenu"
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
    v-else-if="!data.hidden"
    :index="data.route"
  >
    {{ data.name }}
  </el-menu-item>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import type { Route } from '@/store'
import SidebarItem from './sidebarItem.vue'

export default defineComponent({
  name: 'SidebarItem',
})
</script>

<script lang="ts" setup>
const props = defineProps<{ data: Route, withSubmenu?: boolean }>()
const showSubMenu = computed(() => props.withSubmenu && props.data.children && props.data.children.filter(item => !item.hidden).length > 0)
</script>
