<template>
  <div class="container">
    <main class="viewer">
      <aside
        v-if="showSidebar"
        class="sidebar"
      >
        <Sidebar
          :split-menu="false"
          :menus="menuList"
          :active-menu="activeMenu"
          :active-sub-menu="activeSubMenu"
          class="main-menu"
        />
      </aside>
      <section style="flex: 1; width: calc(100vw - var(--sidebar-width));">
        <breadcrumb />
        <el-scrollbar
          height="calc(100vh - var(--topbar-height) - var(--breadcrumb-height))"
          style="background: var(--layout-outer-background);"
          wrap-style="padding: var(--layout-outer-padding)"
        >
          <PageLayout>
            <RouterView v-slot="{ Component }">
              <transition
                name="page"
                mode="out-in"
              >
                <component :is="Component" />
              </transition>
            </RouterView>
          </PageLayout>
        </el-scrollbar>
      </section>
    </main>
  </div>
</template>

<script lang="ts" setup>
import Sidebar from './sidebar'
import breadcrumb from './breadcrumb.vue'
import { useApp } from '@/store'
import { computed, toRef } from 'vue'
import { RouterView } from 'vue-router'
import { useMenu } from './hooks'
import PageLayout from './PageLayout.vue'

defineOptions({
  name: 'ConLayout',
})
const props = defineProps({
  modId: {
    type: Number,
    required: true,
  },
})

const store = useApp()
const [activeMenu, activeSubMenu] = useMenu(toRef(props, 'modId'))

const menuList = computed(() => store.menuList)
const showSidebar = computed(() => {
  if (menuList.value.length === 0) {
    return false
  }
  const subMenu = menuList.value[0].children
  if (menuList.value.length === 1 && (!subMenu?.length || subMenu.length < 2)) {
    return false
  }
  return true
})
</script>

<style lang="scss" scoped>
.sidebar {
  display: flex;
  width: var(--sidebar-width);
  flex-shrink: 0;
  box-sizing: border-box;
}
.viewer {
  display: flex;
  flex: 1;
}
.sub-menu {
  flex: 1;
  :deep(.el-menu) {
    border-right: none;
  }
}
.main-menu {
  display: flex;
  flex: 1;
  border-right: none !important;
  &:deep(.el-menu) {
    border-right: none;
  }
}
</style>
