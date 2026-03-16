<template>
  <div style="display: flex;">
    <BcSelect
      v-model="type"
      :options="typeOptions"
      :clearable="false"
      style="width: 120px;"
    />
    <QuickSearch v-model="value" />
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import QuickSearch from './QuickSearch.vue'

const model = defineModel<Record<string, any>>()

const typeOptions = [
  {
    label: '设备ID',
    value: 'uuid',
  },
  {
    label: '会话ID',
    value: 'session',
  },
]
const type = ref('uuid')
const value = ref('')

watch([type, value], () => {
  typeOptions.forEach(({ value: key }) => {
    if (!model.value) return

    if (key === type.value) {
      model.value[key] = value.value
    } else {
      delete model.value[key]
    }
  })
})
</script>
