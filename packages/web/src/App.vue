<template>
  <bc-config-provider
    :search="{ export: false }"
    :table="{
      arrayName: 'list',
    }"
    :pagination="{
      pageName: 'page',
      pageSizeName: 'size',
    }"
  >
    <router-view
      v-if="!store.isMicroApp()"
      name="topbar"
    />
    <router-view />
  </bc-config-provider>
</template>

<script setup lang="ts">
import { useApp } from '@/store'
const store = useApp()
</script>
