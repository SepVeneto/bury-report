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
  </ElForm>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { getProject } from '@/apis'

const props = defineProps({
  recordId: {
    type: String,
    default: undefined,
  },
})
const formData = ref<{ name: string }>({
  name: '',
})
const formRef = ref()

props.recordId && getProject(props.recordId).then(res => {
  formData.value = {
    ...res,
  }
})

async function getFormData() {
  await formRef.value.validate()
  return formData.value
}

defineExpose({
  getFormData,
})
</script>
