<template>
  <div style="display: flex;">
    <BcSelect
      v-model="type"
      :options="typeOptions"
      :clearable="false"
      style="width: 120px;"
    />
    <QuickSearch
      v-model="value"
      @select="handleIndexSelect"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import QuickSearch from './QuickSearch.vue'

const model = defineModel<Record<string, any>>()

const typeOptions = [
  {
    label: '会话ID',
    value: 'session',
  },
  {
    label: '设备ID',
    value: 'uuid',
  },
]
const TYPE_STORAGE_KEY = '__BR_UNION_SEARCH_TYPE__'
const storedType = readStoredType()
const type = ref<'session' | 'uuid'>(storedType)
const value = ref(model.value?.[storedType] || '')

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

watch(type, value => writeStoredType(value), { immediate: true })

function handleIndexSelect(payload: { value: string, type: 'uuid' | 'session' }) {
  type.value = payload.type
  value.value = payload.value
}

function readStoredType(): 'session' | 'uuid' {
  try {
    return localStorage.getItem(TYPE_STORAGE_KEY) === 'uuid' ? 'uuid' : 'session'
  } catch {
    return 'session'
  }
}

function writeStoredType(value: 'session' | 'uuid') {
  try {
    localStorage.setItem(TYPE_STORAGE_KEY, value)
  } catch {
    // 本地存储不可用时保持当前会话内状态
  }
}
</script>
