<template>
  <ElForm
    ref="formRef"
    label-width="100px"
    :model="formData"
    :rules="rules"
  >
    <ElFormItem
      label="名称"
      prop="name"
    >
      <BcInput v-model="formData.name" />
    </ElFormItem>
    <ElFormItem
      label="webhook"
      prop="webhook"
    >
      <BcInput v-model="formData.webhook" />
    </ElFormItem>
  </ElForm>
</template>

<script lang="ts" setup>
import type { Trigger } from '@/apis'
import { required } from '@/util/rules'
import type { FormInstance } from 'element-plus'
import type { PropType } from 'vue'
import { ref } from 'vue'

const props = defineProps({
  data: {
    type: Object as PropType<Trigger>,
    default: () => ({}),
  },
})

const formData = ref(props.data)
const rules = {
  name: required('触发器名称'),
  webhook: required('触发器地址'),
}
const formRef = ref<FormInstance>()

defineExpose({
  async getFormData() {
    await formRef.value?.validate()
    return formData.value
  },
})
</script>
