<template>
  <JsonViewer
    :value="json"
    sort
    copyable
  />
</template>

<script lang="ts" setup>
import 'vue3-json-viewer/dist/index.css'
import { JsonViewer } from 'vue3-json-viewer'
import { computed } from 'vue'

const props = defineProps({
  value: {
    type: [Object, String],
    required: true,
  },
})

const json = computed(() => {
  if (typeof props.value === 'string') {
    try {
      return JSON.parse(props.value)
    } catch (e) {
      return { error: e }
    }
  } else {
    return props.value
  }
})
</script>
