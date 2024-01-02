<template>
  <ElPageHeader
    title="返回"
    :content="header || String($route.meta.title)"
    @back="$router.back()"
  >
    <slot />
  </ElPageHeader>
</template>

<script lang="ts" setup>
defineProps<{ header?: string }>()
</script>
