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
import { getAccountProfile } from '@/apis'

const store = useApp()

if (localStorage.getItem('token')) {
  getAccountProfile()
    .then(account => store.setAccount(account))
    .catch(() => {
      // 请求拦截器会处理失效登录态
    })
}
</script>
