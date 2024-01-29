<template>
  <div class="scoped-class">
    test
  </div>
  <PanelView />
  <computedPanelView />
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
import { computed, h } from 'vue'
import { useApp } from '@/store'
const store = useApp()
const PanelView = computed(() => {
  return panelView
})
const panelView = () => h('div', { class: 'h-class' }, [
  h('div', { class: 'child-class' }, 'child-test'),
])
const computedPanelView = computed(() => {
  return h('div', { class: 'h-class' }, [
    h('div', { class: 'child-class' }, 'child-test'),
  ])
})
</script>

<style lang="scss" scoped>
.scoped-class {
  color: crimson;
  margin-left: 100px;
}
.h-class {
  // color: aqua;
  // margin-left: 200px;
}
.child-class {
  color: yellow;
  margin-left: 300px;
}
</style>
