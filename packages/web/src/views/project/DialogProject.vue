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
    <ElFormItem
      label="关联应用"
      prop="apps"
    >
      <BcSelect
        v-model="formData.apps"
        multiple
        :api="getOptions"
      />
    </ElFormItem>
  </ElForm>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { getApps, getProject } from '@/apis'

const props = defineProps({
  recordId: {
    type: String,
    default: undefined,
  },
})
const formData = ref<{ name: string, apps: string[] }>({
  name: '',
  apps: [],
})
const formRef = ref()

props.recordId && getProject(props.recordId).then(res => {
  formData.value = {
    ...res,
    apps: res.apps.map(item => item.id),
  }
})

function getOptions() {
  return getApps()
}
async function getFormData() {
  await formRef.value.validate()
  return formData.value
}

defineExpose({
  getFormData,
})
</script>
