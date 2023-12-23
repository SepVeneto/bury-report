<template>
  <nav class="topbar">
    <TopLogo :title="store.title" />
    <TopMenu
      style="flex: 1;"
      :list="menuList"
    />
    <TopAccount :name="store.username" />
  </nav>
</template>

<script lang="ts" setup>
import { useApp } from '@/store'
import { computed } from 'vue'
import TopMenu from './TopMenu.vue'
import TopLogo from './TopLogo.vue'
import TopAccount from './TopAccount.vue'

defineOptions({
  name: 'LayoutTopbar',
})
const store = useApp()

const menuList = computed(() => store.modList)
</script>

<style lang="scss" scoped>
.topbar {
  display: flex;
  height: var(--topbar-height);
  background-color: rgb(24,145,255);
}
</style>
