<template>
  <el-breadcrumb
    class="breadcrumb-container"
    :separator-icon="ArrowRight"
  >
    <el-breadcrumb-item
      v-for="(item, index) in routeList"
      :key="item.path"
    >
      <el-link
        v-if="index > 0 && index < routeList.length - 1"
        @click="handleJump(item)"
      >
        {{ item.meta.title }}
      </el-link>
      <span v-else>{{ item.meta.title }}</span>
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script lang="ts" setup>
import { ArrowRight } from '@element-plus/icons-vue'
import { computed } from 'vue'
import type { RouteLocationMatched } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'

defineOptions({
  name: 'LayoutBreadcrumb',
})
const route = useRoute()
const router = useRouter()
const routeList = computed(() => {
  return route.matched.filter(item => !!item.meta.title)
})
function handleJump(match: RouteLocationMatched) {
  router.push({ name: match.children[0].name })
}
</script>

<style lang="scss" scoped>
.breadcrumb-container {
  display: flex;
  align-items: center;
  padding-left: calc(var(--layout-inner-padding) + var(--layout-outer-padding));
  height: var(--breadcrumb-height);
}
</style>
