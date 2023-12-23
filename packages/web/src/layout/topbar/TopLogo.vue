<template>
  <div class="logo">
    <el-image
      style="width: 32px; height: 32px; margin-right: 20px;"
      src="/favicon.png"
    />
    <span>{{ title }}</span>
  </div>
</template>

<script lang="ts" setup>
defineProps({
  title: {
    type: String,
    default: 'rx-templte',
  },
})
</script>

<style scoped>
.logo {
  display: flex;
  justify-content: center;
  align-items: center;
  color: #fff;
  width: 240px;
  flex-shrink: 0;
}
</style>
