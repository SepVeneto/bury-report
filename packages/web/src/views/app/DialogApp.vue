<template>
  <ElForm
    ref="formRef"
    :model="formData"
    label-width="100px"
  >
    <ElFormItem
      label="名称"
      prop="name"
    >
      <BcInput v-model="formData.name" />
    </ElFormItem>
    <ElFormItem label="主题色">
      <ElColorPicker
        v-model="formData.icon"
        color-format="rgb"
      />
    </ElFormItem>
  </ElForm>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { getApp } from '@/apis'

const props = defineProps({
  recordId: {
    type: String,
    default: undefined,
  },
})
const formData = ref<{ name: string, icon?: string}>({
  name: '',
})
const formRef = ref()

props.recordId && getApp(props.recordId).then(res => {
  formData.value = res
})

async function getFormData() {
  await formRef.value.validate()
  return formData.value
}

defineExpose({
  getFormData,
})
</script>
