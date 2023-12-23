<template>
  <el-menu
    class="topbar-menu"
    mode="horizontal"
    :default-active="defaultActive"
    @select="handleSelect"
  >
    <el-menu-item
      v-for="(item, index) in list"
      :key="index"
      :index="item.route"
    >
      {{ item.name }}
    </el-menu-item>
  </el-menu>
</template>

<script lang="ts" setup>
import type { PropType } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ref, watchEffect } from 'vue'
import type { MenuEmits } from 'element-plus'

defineProps({
  list: {
    type: Array as PropType<any[]>,
    default: () => ([]),
  },
})
const route = useRoute()
const router = useRouter()
const defaultActive = ref()
watchEffect(() => {
  defaultActive.value = route.matched[0].name
})
const handleSelect:MenuEmits['select'] = (index) => {
  router.push({ name: index })
  return true
}
</script>

<style scoped lang="scss">
.topbar-menu {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #fff;
  --el-menu-active-color: #fff;
  --el-menu-hover-bg-color: rgb(21,131,230);
  --el-menu-hover-text-color: #fff;
  :deep(.el-menu-item):hover {
    font-weight: bold;
  }
  :deep(.el-menu-item.is-active) {
    font-weight: bold;
    background-color: var(--el-menu-hover-bg-color);
  }
}
</style>
