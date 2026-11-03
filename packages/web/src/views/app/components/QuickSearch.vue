<template>
  <BcInput
    v-model="model"
    :placeholder="placeholder"
    clearable
  >
    <template #append>
      <ElButton
        type="primary"
        @click="handleIndex"
      >
        索引查询
      </ElButton>
    </template>
  </BcInput>
</template>

<script lang="ts" setup>
import { createDialog } from '@sepveneto/basic-comp'
import QuickSearchIndex from './QuickSearch.index.vue'

const model = defineModel<string>()
const emit = defineEmits<{
  select: [payload: { value: string, type: 'uuid' | 'session' }]
}>()
withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: '支持自定义ID索引',
})

function handleIndex() {
  const { open, close } = createDialog(QuickSearchIndex, {
    closeFn: (content: string, type: 'uuid' | 'session') => {
      model.value = content
      emit('select', { value: content, type })
      close()
    },
  })
  open({ width: '550px', title: '自定义ID索引', noFooter: true })
}
</script>
