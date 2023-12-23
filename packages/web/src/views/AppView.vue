<template>
  <div
    v-if="loading"
    v-loading="loading"
    style="flex: 1;"
  />
  <micro-app
    :name="route.name"
    :url="url"
    :data="{ modId }"
    iframe
    :default-page="defaultPath"
    @created="onCreated"
    @mounted="onMounted"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

defineProps({
  url: {
    type: String,
    required: true,
  },
  modId: {
    type: [Number, String],
    required: true,
  },
  defaultPath: {
    type: String,
    default: undefined,
  },
})
const loading = ref(true)
function onCreated() {
  console.log('created')
}
function onMounted() {
  loading.value = false
  console.log('mounted')
}
</script>
