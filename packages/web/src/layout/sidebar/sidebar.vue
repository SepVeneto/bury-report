<template>
  <div>
    <el-menu
      class="first-menu"
      :style="!hasSubMenu && 'flex: 1;'"
      :default-active="mainActiveMenu"
      @select="handleJump"
    >
      <SidebarItem
        v-for="item in menus"
        :key="item.path"
        :data="item"
        :with-submenu="!splitMenu"
      />
    </el-menu>
    <aside
      v-if="hasSubMenu"
      style="flex: 1;"
    >
      <div style="height: 56px; line-height: 56px; text-align: center; background: rgb(240,242,245);">
        {{ subMenus!.name }}管理
      </div>
      <el-menu
        class="second-menu"
        :default-active="activeSubMenu"
        @select="$router.push({ name: $event })"
      >
        <SidebarItem
          v-for="item in subMenus!.children"
          :key="item.path"
          :data="item"
        />
      </el-menu>
    </aside>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watchEffect } from 'vue'
import SidebarItem from './sidebarItem.vue'
import type { Route } from '@/store'
import type { PropType } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({
  name: 'LayoutSidebar',
})

const props = defineProps({
  splitMenu: Boolean,
  menus: {
    type: Array as PropType<Route[]>,
    default: () => ([]),
  },
  title: {
    type: String,
    default: '',
  },
  activeMenu: {
    type: String,
    default: '',
  },
  activeSubMenu: {
    type: String,
    default: '',
  },
})
const router = useRouter()

const subMenus = ref<Route>()

watchEffect(() => {
  subMenus.value = props.menus.find(menu => menu.route === props.activeMenu)
})

const hasSubMenu = computed(() => {
  if (!props.splitMenu) return false
  return subMenus.value?.children?.length && subMenus.value.children.length > 1
})
const mainActiveMenu = computed(() => {
  // 对于不需要菜单分列的情况，没有sub-menu的概念，activeSubMenu就是当前激活的路由
  return props.splitMenu ? props.activeMenu : props.activeSubMenu
})
function handleJump(index: string) {
  subMenus.value = props.menus.find(menu => menu.route === index)
  router.push({ name: index })
}
</script>

<style lang="scss" scoped>
.first-menu {
  --el-menu-text-color: #fff;
  --el-menu-bg-color: #545c64;
  --el-menu-active-color: #ffd04b;
  --el-menu-hover-bg-color: rgb(67, 74, 80);
}
.second-menu {
  --el-menu-bg-color: #fff;
  --el-menu-text-color: #333;
  --el-menu-active-color: var(--el-color-primary);
}
</style>
